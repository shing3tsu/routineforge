/**
 * Unit tests for lib/email.
 *
 * Covers:
 *   - Provider resolution based on EMAIL_PROVIDER / RESEND_API_KEY env vars.
 *   - Console fallback: log format MUST stay byte-identical to
 *     `[signup] verification link for <email>: <url>` (the Playwright
 *     verification fixture greps for that exact prefix).
 *   - Resend success path: client is constructed with the api key and called
 *     with the right { from, to, subject, html, text } payload.
 *   - Resend rejection path: { sent: false, provider: 'resend', error } and
 *     NO exception leaks to the caller.
 *   - Resend thrown error path: same — never throws.
 *   - Template renderer produces both HTML and plaintext alternates with the
 *     expected subject + URL + greeting fallbacks.
 *
 * Why we mock `resend` at the module boundary rather than stub fetch: the
 * production code dynamic-imports `resend` so the dep cost is paid only on
 * the Resend path. `vi.mock('resend', ...)` intercepts that import, lets us
 * spy on the constructor + `emails.send`, and avoids any real HTTP.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---- Mock the `resend` package --------------------------------------------
//
// The shape mirrors what we use: `new Resend(apiKey)` returns an object with
// `emails.send(payload)`. The send function is a spy we reassign per test so
// each scenario can return a different value (success / error / throw).

const emailsSendMock = vi.fn();
const resendCtorMock = vi.fn(function (this: { emails: { send: typeof emailsSendMock } }) {
  this.emails = { send: emailsSendMock };
});

vi.mock('resend', () => ({
  Resend: resendCtorMock,
}));

import {
  sendVerificationEmail,
  resolveEmailProvider,
  renderVerificationEmail,
  _resetEmailClientForTests,
} from '@/lib/email';

let consoleLogSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Reset all env vars used by the resolver.
  vi.stubEnv('EMAIL_PROVIDER', '');
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('RESEND_FROM_EMAIL', '');

  emailsSendMock.mockReset();
  resendCtorMock.mockClear();
  _resetEmailClientForTests();

  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// resolveEmailProvider
// ---------------------------------------------------------------------------

describe('resolveEmailProvider', () => {
  it('returns console when no env vars set', () => {
    expect(resolveEmailProvider()).toBe('console');
  });

  it('returns resend when RESEND_API_KEY is set and EMAIL_PROVIDER is unset', () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    expect(resolveEmailProvider()).toBe('resend');
  });

  it('returns console when EMAIL_PROVIDER=console even with RESEND_API_KEY set', () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('EMAIL_PROVIDER', 'console');
    expect(resolveEmailProvider()).toBe('console');
  });

  it('returns resend when EMAIL_PROVIDER=resend and RESEND_API_KEY set', () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    expect(resolveEmailProvider()).toBe('resend');
  });

  it('treats whitespace-only RESEND_API_KEY as unset', () => {
    vi.stubEnv('RESEND_API_KEY', '   ');
    expect(resolveEmailProvider()).toBe('console');
  });

  it('is case-insensitive for EMAIL_PROVIDER=console', () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('EMAIL_PROVIDER', 'CONSOLE');
    expect(resolveEmailProvider()).toBe('console');
  });
});

// ---------------------------------------------------------------------------
// sendVerificationEmail — console provider
// ---------------------------------------------------------------------------

describe('sendVerificationEmail (console)', () => {
  it('logs the verification link in the Playwright-fixture format and returns sent=true', async () => {
    const result = await sendVerificationEmail({
      to: 'alice@example.com',
      verificationUrl: 'http://localhost:3000/api/auth/verify?token=abc&email=alice%40example.com',
    });

    expect(result).toEqual({ sent: true, provider: 'console' });
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);

    // EXACT format the Playwright fixture greps for:
    //   `[signup] verification link for <email>: <url>`
    const loggedLine = consoleLogSpy.mock.calls[0]?.[0] as string;
    expect(loggedLine).toBe(
      '[signup] verification link for alice@example.com: http://localhost:3000/api/auth/verify?token=abc&email=alice%40example.com',
    );
  });

  it('does NOT call the Resend client on the console path', async () => {
    await sendVerificationEmail({
      to: 'alice@example.com',
      verificationUrl: 'http://localhost:3000/v',
    });
    expect(resendCtorMock).not.toHaveBeenCalled();
    expect(emailsSendMock).not.toHaveBeenCalled();
  });

  it('matches the Playwright verification regex shape', async () => {
    // The Playwright fixture greps via a regex like /\[signup\] verification
    // link for ([^:]+): (\S+)/. Assert directly against that shape.
    await sendVerificationEmail({
      to: 'bob@example.com',
      verificationUrl: 'http://localhost:3000/api/auth/verify?token=xyz',
    });
    const loggedLine = consoleLogSpy.mock.calls[0]?.[0] as string;
    const match = /\[signup\] verification link for ([^:]+): (\S+)/.exec(loggedLine);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('bob@example.com');
    expect(match![2]).toBe('http://localhost:3000/api/auth/verify?token=xyz');
  });
});

// ---------------------------------------------------------------------------
// sendVerificationEmail — resend provider
// ---------------------------------------------------------------------------

describe('sendVerificationEmail (resend)', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key_abc');
    vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@routineforge.app');
  });

  it('constructs the Resend client with the API key and calls emails.send with the right payload', async () => {
    emailsSendMock.mockResolvedValueOnce({ data: { id: 'em_123' }, error: null });

    const result = await sendVerificationEmail({
      to: 'carol@example.com',
      verificationUrl: 'https://routineforge.app/api/auth/verify?token=tok',
      name: 'Carol',
    });

    expect(result).toEqual({ sent: true, provider: 'resend' });
    expect(resendCtorMock).toHaveBeenCalledTimes(1);
    expect(resendCtorMock).toHaveBeenCalledWith('re_test_key_abc');
    expect(emailsSendMock).toHaveBeenCalledTimes(1);

    const payload = emailsSendMock.mock.calls[0]?.[0] as {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(payload.from).toBe('noreply@routineforge.app');
    expect(payload.to).toBe('carol@example.com');
    expect(payload.subject).toBe('Verify your RoutineForge account');
    // Both alternates must be present.
    expect(payload.html).toContain('Verify your email');
    expect(payload.html).toContain('Carol');
    expect(payload.html).toContain('https://routineforge.app/api/auth/verify?token=tok');
    expect(payload.text).toContain('Hi Carol,');
    expect(payload.text).toContain('https://routineforge.app/api/auth/verify?token=tok');

    // Console fallback must NOT fire when we're using Resend.
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('returns sent=false (NOT throws) when Resend responds with an error', async () => {
    emailsSendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Sender domain not verified', name: 'invalid_from_address', statusCode: 403 },
    });

    const result = await sendVerificationEmail({
      to: 'dave@example.com',
      verificationUrl: 'https://routineforge.app/v',
    });

    expect(result).toEqual({
      sent: false,
      provider: 'resend',
      error: 'Sender domain not verified',
    });
    // No exception escaped.
  });

  it('returns sent=false (NOT throws) when the Resend send call throws', async () => {
    emailsSendMock.mockRejectedValueOnce(new Error('Network unreachable'));

    const result = await sendVerificationEmail({
      to: 'eve@example.com',
      verificationUrl: 'https://routineforge.app/v',
    });

    expect(result.sent).toBe(false);
    expect(result.provider).toBe('resend');
    expect(result.error).toBe('Network unreachable');
  });

  it('handles non-Error thrown values', async () => {
    emailsSendMock.mockRejectedValueOnce('something bad');

    const result = await sendVerificationEmail({
      to: 'frank@example.com',
      verificationUrl: 'https://routineforge.app/v',
    });

    expect(result.sent).toBe(false);
    expect(result.error).toBe('something bad');
  });

  it('returns sent=false when RESEND_FROM_EMAIL is missing', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', '');

    const result = await sendVerificationEmail({
      to: 'gina@example.com',
      verificationUrl: 'https://routineforge.app/v',
    });

    expect(result).toEqual({
      sent: false,
      provider: 'resend',
      error: 'RESEND_FROM_EMAIL is not set',
    });
    // Never instantiated the client — bailed early.
    expect(resendCtorMock).not.toHaveBeenCalled();
    expect(emailsSendMock).not.toHaveBeenCalled();
  });

  it('reuses the Resend client across calls with the same API key', async () => {
    emailsSendMock.mockResolvedValue({ data: { id: 'em_1' }, error: null });

    await sendVerificationEmail({
      to: 'a@example.com',
      verificationUrl: 'https://x/1',
    });
    await sendVerificationEmail({
      to: 'b@example.com',
      verificationUrl: 'https://x/2',
    });

    expect(resendCtorMock).toHaveBeenCalledTimes(1);
    expect(emailsSendMock).toHaveBeenCalledTimes(2);
  });

  it('re-constructs the client when RESEND_API_KEY changes (key rotation)', async () => {
    emailsSendMock.mockResolvedValue({ data: { id: 'em_1' }, error: null });

    await sendVerificationEmail({
      to: 'a@example.com',
      verificationUrl: 'https://x/1',
    });
    expect(resendCtorMock).toHaveBeenCalledTimes(1);
    expect(resendCtorMock).toHaveBeenLastCalledWith('re_test_key_abc');

    // Rotate.
    vi.stubEnv('RESEND_API_KEY', 're_rotated_key');
    await sendVerificationEmail({
      to: 'b@example.com',
      verificationUrl: 'https://x/2',
    });
    expect(resendCtorMock).toHaveBeenCalledTimes(2);
    expect(resendCtorMock).toHaveBeenLastCalledWith('re_rotated_key');
  });
});

// ---------------------------------------------------------------------------
// renderVerificationEmail (template)
// ---------------------------------------------------------------------------

describe('renderVerificationEmail', () => {
  it('produces subject, HTML, and plaintext alternates', () => {
    const t = renderVerificationEmail({
      verificationUrl: 'https://routineforge.app/api/auth/verify?token=abc',
      name: 'Dana',
    });

    expect(t.subject).toBe('Verify your RoutineForge account');
    expect(t.html.length).toBeGreaterThan(0);
    expect(t.text.length).toBeGreaterThan(0);
  });

  it('uses the name in the greeting when provided', () => {
    const t = renderVerificationEmail({
      verificationUrl: 'https://example.com/v',
      name: 'Dana',
    });
    expect(t.html).toContain('Hi Dana,');
    expect(t.text).toContain('Hi Dana,');
  });

  it('falls back to a generic greeting when name is null', () => {
    const t = renderVerificationEmail({
      verificationUrl: 'https://example.com/v',
      name: null,
    });
    expect(t.html).toContain('Hi,');
    expect(t.text).toContain('Hi,');
    expect(t.html).not.toContain('Hi null');
    expect(t.html).not.toContain('Hi undefined');
  });

  it('falls back to a generic greeting when name is omitted', () => {
    const t = renderVerificationEmail({
      verificationUrl: 'https://example.com/v',
    });
    expect(t.html).toContain('Hi,');
    expect(t.text).toContain('Hi,');
  });

  it('falls back when name is whitespace-only', () => {
    const t = renderVerificationEmail({
      verificationUrl: 'https://example.com/v',
      name: '   ',
    });
    expect(t.html).toContain('Hi,');
  });

  it('includes the URL as both a clickable link and visible plaintext (HTML)', () => {
    const url = 'https://routineforge.app/api/auth/verify?token=xyz';
    const t = renderVerificationEmail({ verificationUrl: url, name: 'Sam' });
    // Anchor href attribute.
    expect(t.html).toContain(`href="${url}"`);
    // ...AND the URL rendered as visible text (twice in the HTML — once as
    // href, once as the fallback paragraph).
    const occurrences = t.html.split(url).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('includes the URL in the plaintext alternate', () => {
    const url = 'https://routineforge.app/v?t=1';
    const t = renderVerificationEmail({ verificationUrl: url });
    expect(t.text).toContain(url);
  });

  it('includes the "if you didn\'t sign up" footer in both alternates', () => {
    const t = renderVerificationEmail({ verificationUrl: 'https://x/v' });
    expect(t.html).toContain("didn't sign up");
    expect(t.text).toContain("didn't sign up");
  });

  it('uses the brand color (#7C3AED) for the verification link only', () => {
    const t = renderVerificationEmail({ verificationUrl: 'https://x/v' });
    // Brand color appears in the link style attribute.
    expect(t.html.toLowerCase()).toContain('#7c3aed');
  });

  it('escapes HTML special characters in the name to prevent injection', () => {
    const t = renderVerificationEmail({
      verificationUrl: 'https://example.com/v',
      name: '<script>alert(1)</script>',
    });
    // The raw tag MUST NOT appear unescaped.
    expect(t.html).not.toContain('<script>alert(1)</script>');
    // Escaped form should appear.
    expect(t.html).toContain('&lt;script&gt;');
  });
});
