/**
 * Integration tests — GET /api/auth/verify
 *
 * Asserts:
 *   - Happy path: 302 to /login?verified=1, user.emailVerified set, token gone.
 *   - Wrong token: 302 to /login?verified=0&reason=invalid_token, no side
 *     effects on the user.
 *   - Expired token: 302 to /login?verified=0&reason=expired, token cleaned up.
 *   - Bad-request query (missing/invalid params): 302 reason=bad_request.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

import { GET } from '@/app/api/auth/verify/route';
import { __resetRateLimitForTests } from '@/lib/rate-limit';
import {
  resetDb,
  makeUser,
  makeVerificationToken,
  findUserByEmail,
  findTokensForEmail,
} from '@/__tests__/helpers/db';
import { getRequest } from '@/__tests__/helpers/request';

const BASE = 'http://localhost:3000';

function verifyUrl(token: string, email: string): string {
  return `${BASE}/api/auth/verify?token=${token}&email=${encodeURIComponent(email)}`;
}

beforeEach(async () => {
  await resetDb();
  __resetRateLimitForTests();
});

describe('GET /api/auth/verify — happy path', () => {
  it('marks the user verified, deletes the token, and redirects to /login?verified=1', async () => {
    await makeUser({ email: 'alice@example.com', verified: false });
    const { token } = await makeVerificationToken({ email: 'alice@example.com' });

    const req = getRequest({ url: verifyUrl(token, 'alice@example.com') });
    const res = await GET(req);

    expect(res.status).toBe(307); // NextResponse.redirect uses 307 by default
    const location = res.headers.get('location') ?? '';
    expect(location).toBe(`${BASE}/login?verified=1`);

    const user = await findUserByEmail('alice@example.com');
    expect(user!.emailVerified).toBeInstanceOf(Date);

    const tokens = await findTokensForEmail('alice@example.com');
    expect(tokens).toHaveLength(0);
  });

  it('lowercases the email param before lookup', async () => {
    await makeUser({ email: 'alice@example.com', verified: false });
    const { token } = await makeVerificationToken({ email: 'alice@example.com' });

    // Pass mixed case in the URL; route trims+lowercases.
    const req = getRequest({
      url: verifyUrl(token, 'ALICE@Example.COM'),
    });
    const res = await GET(req);

    // The lookup is by lowercased email, which matches the stored row.
    expect(res.headers.get('location')).toBe(`${BASE}/login?verified=1`);
    const user = await findUserByEmail('alice@example.com');
    expect(user!.emailVerified).toBeInstanceOf(Date);
  });
});

describe('GET /api/auth/verify — invalid token', () => {
  it('redirects to /login?verified=0&reason=invalid_token when token is not in DB', async () => {
    await makeUser({ email: 'bob@example.com', verified: false });
    const fakeToken = 'b'.repeat(64);

    const req = getRequest({ url: verifyUrl(fakeToken, 'bob@example.com') });
    const res = await GET(req);

    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/login?verified=0');
    expect(location).toContain('reason=invalid_token');

    // User is unchanged.
    const user = await findUserByEmail('bob@example.com');
    expect(user!.emailVerified).toBeNull();
  });

  it('redirects to invalid_token when token exists for a DIFFERENT email', async () => {
    await makeUser({ email: 'alice@example.com', verified: false });
    await makeUser({ email: 'bob@example.com', verified: false });
    const { token } = await makeVerificationToken({ email: 'alice@example.com' });

    // Hit the verify endpoint with bob's email but alice's token.
    const req = getRequest({ url: verifyUrl(token, 'bob@example.com') });
    const res = await GET(req);

    expect(res.headers.get('location')).toContain('reason=invalid_token');

    // Alice's token still exists (was not consumed).
    const aliceTokens = await findTokensForEmail('alice@example.com');
    expect(aliceTokens).toHaveLength(1);

    // Bob is still unverified.
    const bob = await findUserByEmail('bob@example.com');
    expect(bob!.emailVerified).toBeNull();
  });
});

describe('GET /api/auth/verify — expired token', () => {
  it('redirects to /login?verified=0&reason=expired and deletes the expired token', async () => {
    await makeUser({ email: 'carol@example.com', verified: false });
    // Issue a token that expired one hour ago.
    const { token } = await makeVerificationToken({
      email: 'carol@example.com',
      expiresInMs: -60 * 60 * 1000,
    });

    const req = getRequest({ url: verifyUrl(token, 'carol@example.com') });
    const res = await GET(req);

    const location = res.headers.get('location') ?? '';
    expect(location).toContain('reason=expired');

    // Expired token cleaned up.
    const tokens = await findTokensForEmail('carol@example.com');
    expect(tokens).toHaveLength(0);

    // User still unverified.
    const carol = await findUserByEmail('carol@example.com');
    expect(carol!.emailVerified).toBeNull();
  });
});

describe('GET /api/auth/verify — bad request', () => {
  it('redirects with reason=bad_request when token is too short', async () => {
    const req = getRequest({
      url: `${BASE}/api/auth/verify?token=short&email=a@b.com`,
    });
    const res = await GET(req);

    const location = res.headers.get('location') ?? '';
    expect(location).toContain('reason=bad_request');
  });

  it('redirects with reason=bad_request when email is invalid', async () => {
    const tok = 'a'.repeat(64);
    const req = getRequest({
      url: `${BASE}/api/auth/verify?token=${tok}&email=not-an-email`,
    });
    const res = await GET(req);

    expect(res.headers.get('location')).toContain('reason=bad_request');
  });

  it('redirects with reason=bad_request when both params are missing', async () => {
    const req = getRequest({ url: `${BASE}/api/auth/verify` });
    const res = await GET(req);

    expect(res.headers.get('location')).toContain('reason=bad_request');
  });

  it('redirects with reason=bad_request when token is too long', async () => {
    const tok = 'a'.repeat(129);
    const req = getRequest({
      url: `${BASE}/api/auth/verify?token=${tok}&email=a@b.com`,
    });
    const res = await GET(req);

    expect(res.headers.get('location')).toContain('reason=bad_request');
  });
});

describe('GET /api/auth/verify — rate limiting', () => {
  it('redirects to /login?verified=0&reason=rate_limited after 11 rapid attempts from the same IP', async () => {
    const ip = '203.0.113.55';
    const tok = 'a'.repeat(64);
    let lastRes: Response | undefined;
    for (let i = 0; i < 11; i++) {
      const req = getRequest({
        url: verifyUrl(tok, 'doesnt@matter.com'),
        headers: { 'x-forwarded-for': ip },
      });
      lastRes = await GET(req);
    }

    expect(lastRes).toBeDefined();
    const location = lastRes!.headers.get('location') ?? '';
    expect(location).toContain('reason=rate_limited');
    expect(location).toContain('verified=0');
  });

  it('isolates rate limits per IP for verify', async () => {
    const banned = '198.51.100.111';
    const tok = 'a'.repeat(64);

    // Drain banned IP's bucket (capacity=10).
    for (let i = 0; i < 10; i++) {
      await GET(
        getRequest({
          url: verifyUrl(tok, 'x@y.com'),
          headers: { 'x-forwarded-for': banned },
        }),
      );
    }
    const blocked = await GET(
      getRequest({
        url: verifyUrl(tok, 'x@y.com'),
        headers: { 'x-forwarded-for': banned },
      }),
    );
    expect(blocked.headers.get('location') ?? '').toContain('reason=rate_limited');

    // Different IP — still allowed (will redirect with invalid_token since the
    // token doesn't exist, but crucially NOT rate_limited).
    const other = await GET(
      getRequest({
        url: verifyUrl(tok, 'x@y.com'),
        headers: { 'x-forwarded-for': '203.0.113.222' },
      }),
    );
    const otherLoc = other.headers.get('location') ?? '';
    expect(otherLoc).not.toContain('reason=rate_limited');
  });
});
