/**
 * Outbound email — verification flow.
 *
 * Two providers are supported, resolved at call time from env:
 *
 *   - `'console'` (the default for dev) — prints the verification URL to the
 *     server console in a byte-identical format to the historic dev log.
 *     The Playwright `verification.ts` fixture greps for this line, so the
 *     format MUST NOT change: `[signup] verification link for <email>: <url>`.
 *
 *   - `'resend'` — sends a real email via Resend (https://resend.com). Activated
 *     when `RESEND_API_KEY` is set AND `EMAIL_PROVIDER !== 'console'`. Requires
 *     `RESEND_FROM_EMAIL` to be set to a verified-domain sender. Failures are
 *     captured and returned as `{ sent: false, ... }` — callers should NOT
 *     throw the user out of the signup flow if email send fails (we still
 *     create the account and the user can request a resend).
 *
 * The Resend client is constructed lazily on first use and re-created when
 * the API key changes (test scenarios + key rotation). The `resend` package
 * is dynamically imported the first time `sendVerificationEmail` resolves to
 * the Resend provider — this keeps the cold-start cost off the console-only
 * path that dev uses.
 */

import 'server-only';
import {
  renderVerificationEmail,
  type VerificationTemplate,
} from './templates/verification';

export type EmailProvider = 'console' | 'resend';

export interface SendVerificationEmailArgs {
  to: string;
  verificationUrl: string;
  name?: string | null;
}

export interface SendVerificationEmailResult {
  sent: boolean;
  provider: EmailProvider;
  /** When `sent` is false this surfaces the underlying error message. */
  error?: string;
}

/**
 * Decide which provider to use based on env vars.
 *
 * Resolution order (per the dispatch spec):
 *  1. If `EMAIL_PROVIDER === 'console'` — force the console path (escape
 *     hatch to silence emails in a misconfigured prod).
 *  2. Else if `RESEND_API_KEY` is set (non-empty after trim) — use Resend.
 *  3. Else — fall back to console.
 */
export function resolveEmailProvider(): EmailProvider {
  const explicit = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (explicit === 'console') return 'console';
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey && apiKey.length > 0) return 'resend';
  return 'console';
}

/**
 * Console fallback. Format is load-bearing: the Playwright verification
 * fixture greps for `[signup] verification link for <email>: <url>` — do
 * NOT change this string without coordinating with `e2e/fixtures/verification.ts`.
 */
function logVerificationLink(to: string, verificationUrl: string): void {
  console.log(`[signup] verification link for ${to}: ${verificationUrl}`);
}

// ---- Resend client (lazy) -------------------------------------------------

type ResendLike = {
  emails: {
    send: (payload: {
      from: string;
      to: string | string[];
      subject: string;
      html: string;
      text: string;
    }) => Promise<{
      data: { id: string } | null;
      error: { message: string; name?: string; statusCode?: number | null } | null;
    }>;
  };
};

let resendClient: ResendLike | null = null;
let resendClientKey: string | null = null;

/**
 * Test-only: drop the cached Resend client so the next send re-reads env.
 * Exported for the unit tests that swap `RESEND_API_KEY` between scenarios.
 */
export function _resetEmailClientForTests(): void {
  resendClient = null;
  resendClientKey = null;
}

async function getResendClient(apiKey: string): Promise<ResendLike> {
  if (resendClient && resendClientKey === apiKey) return resendClient;
  // Dynamic import so the dep is only loaded when actually sending real email.
  // Keeps the dev / console path zero-cost.
  const mod: { Resend: new (key: string) => ResendLike } = await import('resend');
  resendClient = new mod.Resend(apiKey);
  resendClientKey = apiKey;
  return resendClient;
}

// ---- Public API -----------------------------------------------------------

/**
 * Send the verification email. Never throws — the caller (signup) deliberately
 * swallows failures so users aren't blocked from creating an account by an
 * email outage.
 */
export async function sendVerificationEmail(
  args: SendVerificationEmailArgs,
): Promise<SendVerificationEmailResult> {
  const provider = resolveEmailProvider();
  const template: VerificationTemplate = renderVerificationEmail({
    verificationUrl: args.verificationUrl,
    name: args.name ?? null,
  });

  if (provider === 'console') {
    logVerificationLink(args.to, args.verificationUrl);
    return { sent: true, provider: 'console' };
  }

  // provider === 'resend'
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey) {
    // Resolver said 'resend' but env is missing — defensive guard. Surface as
    // a non-throwing failure so signup still returns ok.
    return {
      sent: false,
      provider: 'resend',
      error: 'RESEND_API_KEY is not set',
    };
  }
  if (!from) {
    return {
      sent: false,
      provider: 'resend',
      error: 'RESEND_FROM_EMAIL is not set',
    };
  }

  try {
    const client = await getResendClient(apiKey);
    const res = await client.emails.send({
      from,
      to: args.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
    if (res.error) {
      return {
        sent: false,
        provider: 'resend',
        error: res.error.message,
      };
    }
    return { sent: true, provider: 'resend' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      sent: false,
      provider: 'resend',
      error: message,
    };
  }
}

// Re-export the template renderer so tests / future callers (resend route) can
// inspect the produced HTML / text without going through the send path.
export { renderVerificationEmail } from './templates/verification';
export type { VerificationTemplate, VerificationTemplateArgs } from './templates/verification';
