/**
 * Verification email template.
 *
 * Renders the subject + HTML + plaintext bodies for the signup verification
 * email. The HTML version is intentionally minimal — no images, no tracking
 * pixels, no remote resources. The plaintext version is the same content
 * stripped of markup, included as the `text` alternate so email clients that
 * default to plaintext (or that strip HTML for security) still render a
 * usable message.
 *
 * Brand color (`#7C3AED` — graphite plum) is used ONLY for the link, to keep
 * the email aesthetic restrained. Body text is black on white. The HTML is
 * inline-styled because most email clients ignore <style> blocks.
 */

import 'server-only';

export interface VerificationTemplateArgs {
  /** The link the user clicks to verify their email. */
  verificationUrl: string;
  /** Optional display name. Used in the greeting when present. */
  name?: string | null;
}

export interface VerificationTemplate {
  subject: string;
  html: string;
  text: string;
}

const SUBJECT = 'Verify your RoutineForge account';
const BRAND_COLOR = '#7C3AED';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build the verification email body.
 *
 * The HTML is single-column, max-width 480px, system font stack. The
 * verification URL is rendered TWICE: once as a clickable anchor, and once as
 * visible plaintext below — some email clients strip <a> tags or rewrite
 * them, and we want users to always be able to copy the URL manually.
 */
export function renderVerificationEmail(
  args: VerificationTemplateArgs,
): VerificationTemplate {
  const greeting = args.name && args.name.trim().length > 0
    ? `Hi ${args.name.trim()},`
    : 'Hi,';

  const safeGreeting = escapeHtml(greeting);
  const safeUrl = escapeHtml(args.verificationUrl);

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${SUBJECT}</title>`,
    '</head>',
    '<body style="margin:0;padding:0;background-color:#ffffff;color:#000000;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;">',
    '<tr>',
    '<td align="center" style="padding:32px 16px;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;">',
    '<tr>',
    '<td style="font-size:16px;line-height:1.6;color:#000000;">',
    `<p style="margin:0 0 16px 0;">${safeGreeting}</p>`,
    '<p style="margin:0 0 16px 0;">Welcome to RoutineForge. Please verify your email address to finish setting up your account.</p>',
    '<p style="margin:0 0 24px 0;">',
    `<a href="${safeUrl}" style="color:${BRAND_COLOR};text-decoration:underline;font-weight:600;">Verify your email</a>`,
    '</p>',
    '<p style="margin:0 0 8px 0;font-size:14px;color:#333333;">If the link doesn\'t work, copy and paste this URL into your browser:</p>',
    `<p style="margin:0 0 24px 0;font-size:14px;word-break:break-all;color:#333333;">${safeUrl}</p>`,
    '<p style="margin:0;font-size:12px;color:#666666;">If you didn\'t sign up for RoutineForge, you can safely ignore this email.</p>',
    '</td>',
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('');

  const text = [
    greeting,
    '',
    'Welcome to RoutineForge. Please verify your email address to finish setting up your account.',
    '',
    'Verify your email:',
    args.verificationUrl,
    '',
    'If you didn\'t sign up for RoutineForge, you can safely ignore this email.',
  ].join('\n');

  return { subject: SUBJECT, html, text };
}
