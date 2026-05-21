/**
 * Integration tests — POST /api/auth/signup
 *
 * Boots a pglite-backed Drizzle client via the `@/db` mock, then invokes the
 * route handler directly with constructed Requests. Asserts both the HTTP
 * response and the side effects (user row inserted, password hashed,
 * verification token issued).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';

vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

// Mock `@/lib/email` so the email-send-failure scenario at the bottom of this
// file can swap in a `sent: false` response without actually wiring Resend.
// Default behavior (when `mockResolvedValueOnce` hasn't been queued) returns
// the same `{ sent: true, provider: 'console' }` shape the real console
// fallback produces — keeping the happy-path test assertions unchanged.
//
// `vi.hoisted` is necessary because `vi.mock` is hoisted above all imports —
// referring to a regular const inside the factory would error with "Cannot
// access X before initialization".
type EmailSendResult = {
  sent: boolean;
  provider: 'console' | 'resend';
  error?: string;
};
type EmailSendArgs = { to: string; verificationUrl: string; name?: string | null };
const { sendVerificationEmailMock } = vi.hoisted(() => ({
  sendVerificationEmailMock: vi.fn<(args: EmailSendArgs) => Promise<EmailSendResult>>(
    async (args) => {
      // Mirror the byte-identical console log the real implementation emits,
      // so the existing "Verification link was logged" assertion still passes.
      console.log(`[signup] verification link for ${args.to}: ${args.verificationUrl}`);
      return { sent: true, provider: 'console' };
    },
  ),
}));

vi.mock('@/lib/email', () => ({
  sendVerificationEmail: sendVerificationEmailMock,
  _resetEmailClientForTests: () => {},
}));

import { POST } from '@/app/api/auth/signup/route';
import { __resetRateLimitForTests } from '@/lib/rate-limit';
import {
  resetDb,
  makeUser,
  findUserByEmail,
  findTokensForEmail,
  countUsers,
} from '@/__tests__/helpers/db';
import { jsonRequest } from '@/__tests__/helpers/request';

const URL = 'http://localhost:3000/api/auth/signup';

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await resetDb();
  __resetRateLimitForTests();
  // Reset the mock back to its default ({ sent: true, provider: 'console' })
  // and clear call history so each test starts clean.
  sendVerificationEmailMock.mockClear();
  sendVerificationEmailMock.mockImplementation(async (args) => {
    console.log(`[signup] verification link for ${args.to}: ${args.verificationUrl}`);
    return { sent: true, provider: 'console' };
  });
  consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/auth/signup — happy path', () => {
  it('creates a new user, hashes the password, issues a verification token', async () => {
    const req = jsonRequest({
      url: URL,
      body: {
        email: 'newuser@example.com',
        password: 'correct horse battery',
        name: 'New User',
      },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    // User row exists.
    const user = await findUserByEmail('newuser@example.com');
    expect(user).toBeDefined();
    expect(user!.email).toBe('newuser@example.com');
    expect(user!.name).toBe('New User');
    expect(user!.emailVerified).toBeNull();

    // Password is hashed, NOT plaintext.
    expect(user!.passwordHash).toBeDefined();
    expect(user!.passwordHash).not.toBe('correct horse battery');
    expect(user!.passwordHash).toMatch(/^\$2[abxy]\$/); // bcrypt prefix
    const matches = await bcrypt.compare('correct horse battery', user!.passwordHash!);
    expect(matches).toBe(true);

    // Verification token row exists.
    const tokens = await findTokensForEmail('newuser@example.com');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.token.length).toBeGreaterThanOrEqual(32);
    expect(tokens[0]!.expires.getTime()).toBeGreaterThan(Date.now());

    // Verification link was logged.
    expect(consoleSpy).toHaveBeenCalled();
    const logged = consoleSpy.mock.calls
      .map((c: unknown[]) => (typeof c[0] === 'string' ? c[0] : ''))
      .find((line: string) => line.includes('[signup]'));
    expect(logged).toBeDefined();
    expect(logged).toContain('newuser@example.com');
  });

  it('lowercases the email before storing', async () => {
    const req = jsonRequest({
      url: URL,
      body: { email: 'MiXeDcAsE@Example.COM', password: 'longenough' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const user = await findUserByEmail('mixedcase@example.com');
    expect(user).toBeDefined();
    expect(user!.email).toBe('mixedcase@example.com');
  });

  it('stores name as null when omitted', async () => {
    const req = jsonRequest({
      url: URL,
      body: { email: 'noname@example.com', password: 'longenough' },
    });

    await POST(req);

    const user = await findUserByEmail('noname@example.com');
    expect(user!.name).toBeNull();
  });
});

describe('POST /api/auth/signup — invalid body', () => {
  it('returns 400 invalid_json when the body is not JSON', async () => {
    const req = jsonRequest({ url: URL, body: 'this is not json' });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_json');
    expect(await countUsers()).toBe(0);
  });

  it('returns 400 validation_error when email is invalid', async () => {
    const req = jsonRequest({
      url: URL,
      body: { email: 'not-an-email', password: 'longenough' },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('validation_error');
    expect(body.issues).toBeDefined();
    expect(body.issues.fieldErrors.email).toBeDefined();
    expect(await countUsers()).toBe(0);
  });

  it('returns 400 validation_error when password is too short', async () => {
    const req = jsonRequest({
      url: URL,
      body: { email: 'a@b.com', password: '1234567' },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
    expect(body.issues.fieldErrors.password).toBeDefined();
    expect(await countUsers()).toBe(0);
  });

  it('returns 400 validation_error when name is too long', async () => {
    const req = jsonRequest({
      url: URL,
      body: { email: 'a@b.com', password: 'longenough', name: 'X'.repeat(121) },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
    expect(body.issues.fieldErrors.name).toBeDefined();
    expect(await countUsers()).toBe(0);
  });

  it('returns 400 validation_error when email is missing', async () => {
    const req = jsonRequest({
      url: URL,
      body: { password: 'longenough' },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 validation_error when password is missing', async () => {
    const req = jsonRequest({
      url: URL,
      body: { email: 'a@b.com' },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });
});

describe('POST /api/auth/signup — enumeration resistance', () => {
  it('returns 200 ok even when the email is already verified, no duplicate user', async () => {
    await makeUser({ email: 'existing@example.com', verified: true });
    expect(await countUsers()).toBe(1);

    const req = jsonRequest({
      url: URL,
      body: { email: 'existing@example.com', password: 'longenough' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    // No new user created.
    expect(await countUsers()).toBe(1);
    // No verification token created (already verified).
    const tokens = await findTokensForEmail('existing@example.com');
    expect(tokens).toHaveLength(0);
  });

  it('returns 200 ok when the email exists but is unverified, and issues a fresh token', async () => {
    await makeUser({ email: 'unverified@example.com', verified: false });
    expect(await countUsers()).toBe(1);

    const req = jsonRequest({
      url: URL,
      body: { email: 'unverified@example.com', password: 'longenough' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    // No new user created.
    expect(await countUsers()).toBe(1);

    // A verification token WAS issued.
    const tokens = await findTokensForEmail('unverified@example.com');
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(tokens[0]!.token.length).toBeGreaterThanOrEqual(32);
  });
});

describe('POST /api/auth/signup — rate limiting', () => {
  it('rejects the 6th rapid signup from the same IP with 429 + Retry-After', async () => {
    // capacity=5 for signup, so 6th from the same IP should be blocked.
    const ip = '203.0.113.7'; // RFC 5737 documentation IP

    let lastRes: Response | undefined;
    for (let i = 0; i < 6; i++) {
      const req = jsonRequest({
        url: URL,
        headers: { 'x-forwarded-for': ip },
        body: { email: `bot-${i}@example.com`, password: 'longenough' },
      });
      lastRes = await POST(req);
    }

    expect(lastRes).toBeDefined();
    expect(lastRes!.status).toBe(429);
    const body = await lastRes!.json();
    expect(body).toEqual({ ok: false, error: 'rate_limited' });
    const retryAfter = lastRes!.headers.get('Retry-After');
    expect(retryAfter).toBeDefined();
    expect(Number(retryAfter)).toBeGreaterThan(0);

    // No user was created for the 6th attempt — the limit short-circuits before
    // the bcrypt + insert path. (5 succeeded earlier in the burst.)
    expect(await countUsers()).toBe(5);
  });

  it('does not block legitimate single signups (no regression)', async () => {
    const req = jsonRequest({
      url: URL,
      headers: { 'x-forwarded-for': '198.51.100.42' },
      body: { email: 'legit@example.com', password: 'longenough' },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    const user = await findUserByEmail('legit@example.com');
    expect(user).toBeDefined();
  });

  it('isolates rate limits per IP — one banned IP does not lock out others', async () => {
    const banned = '198.51.100.99';
    // Drain the banned IP's bucket.
    for (let i = 0; i < 5; i++) {
      await POST(
        jsonRequest({
          url: URL,
          headers: { 'x-forwarded-for': banned },
          body: { email: `drain-${i}@example.com`, password: 'longenough' },
        }),
      );
    }
    // 6th from banned IP → 429.
    const blocked = await POST(
      jsonRequest({
        url: URL,
        headers: { 'x-forwarded-for': banned },
        body: { email: 'blocked@example.com', password: 'longenough' },
      }),
    );
    expect(blocked.status).toBe(429);

    // Different IP — still allowed.
    const other = await POST(
      jsonRequest({
        url: URL,
        headers: { 'x-forwarded-for': '203.0.113.200' },
        body: { email: 'other-ip@example.com', password: 'longenough' },
      }),
    );
    expect(other.status).toBe(200);
  });
});

describe('POST /api/auth/signup — email-send failure does not break signup', () => {
  it('still creates the user and returns 200 when sendVerificationEmail reports failure', async () => {
    // Simulate a Resend outage: the mock returns { sent: false, ... } once.
    // The route handler must NOT propagate the failure — signup must still
    // return ok and the user row must still be persisted.
    sendVerificationEmailMock.mockImplementationOnce(async () => ({
      sent: false,
      provider: 'resend',
      error: 'Simulated Resend outage',
    }));

    // Capture the route's failure-path console.error for ops visibility
    // assertion.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = jsonRequest({
      url: URL,
      body: {
        email: 'fail-mail@example.com',
        password: 'longenough',
        name: 'Fail Mail',
      },
    });

    const res = await POST(req);

    // Response is still 200 ok — email failures must NOT affect signup.
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    // User was still created.
    const user = await findUserByEmail('fail-mail@example.com');
    expect(user).toBeDefined();
    expect(user!.email).toBe('fail-mail@example.com');

    // Verification token was still issued (the user can re-request the email).
    const tokens = await findTokensForEmail('fail-mail@example.com');
    expect(tokens).toHaveLength(1);

    // sendVerificationEmail was invoked with the right args.
    expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
    const callArg = sendVerificationEmailMock.mock.calls[0]?.[0];
    expect(callArg?.to).toBe('fail-mail@example.com');
    expect(callArg?.name).toBe('Fail Mail');
    expect(callArg?.verificationUrl).toContain('/api/auth/verify?token=');
    expect(callArg?.verificationUrl).toContain('email=fail-mail%40example.com');

    // The route logged the failure to console.error for ops visibility.
    expect(errorSpy).toHaveBeenCalled();
    const errLine = errorSpy.mock.calls
      .map((c: unknown[]) => (typeof c[0] === 'string' ? c[0] : ''))
      .find((line: string) => line.includes('verification email FAILED'));
    expect(errLine).toBeDefined();
    expect(errLine).toContain('fail-mail@example.com');
    expect(errLine).toContain('Simulated Resend outage');
  });

  it('still issues a fresh token and returns ok for an unverified existing user when email send fails', async () => {
    // Existing unverified user — the route takes the re-issue branch.
    await makeUser({ email: 'unverified-fail@example.com', verified: false });

    sendVerificationEmailMock.mockImplementationOnce(async () => ({
      sent: false,
      provider: 'resend',
      error: 'rate_limit_exceeded',
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(
      jsonRequest({
        url: URL,
        body: { email: 'unverified-fail@example.com', password: 'longenough' },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    // A token was still issued (so the user can retry verification later).
    const tokens = await findTokensForEmail('unverified-fail@example.com');
    expect(tokens.length).toBeGreaterThanOrEqual(1);
  });
});
