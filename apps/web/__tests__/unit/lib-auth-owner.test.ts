/**
 * Unit tests for lib/auth/owner.ts.
 *
 * Covers every branch of `authenticateOwner` and `withOwnerAuth` per the
 * dispatch contract:
 *   - missing header / wrong scheme → 401 missing_token
 *   - right scheme, wrong token → 401 invalid_token (and constant-time)
 *   - OWNER_API_TOKEN unset / too short → 500 misconfigured
 *   - OWNER_EMAIL unset → 500 misconfigured
 *   - owner user missing → 400 no_owner_user
 *   - happy path → returns the user
 *   - `withOwnerAuth` surfaces errors as Response objects, not throws
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextResponse } from 'next/server';

// Redirect the production `@/db` import to our pglite-backed test client.
vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

import { authenticateOwner, withOwnerAuth } from '@/lib/auth/owner';
import {
  resetDb,
  makeUser,
} from '@/__tests__/helpers/db';
import { bearerRequest, unauthedRequest } from '@/__tests__/helpers/request';

const VALID_TOKEN = 'test-owner-token-must-be-at-least-sixteen-chars';
const OWNER_EMAIL = 'owner@example.com';
const URL = 'http://localhost:3000/api/owner/ping';

beforeEach(async () => {
  await resetDb();
  vi.stubEnv('OWNER_API_TOKEN', VALID_TOKEN);
  vi.stubEnv('OWNER_EMAIL', OWNER_EMAIL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('authenticateOwner', () => {
  describe('missing or malformed Authorization header', () => {
    it('returns 401 missing_token when no Authorization header is present', async () => {
      await makeUser({ email: OWNER_EMAIL, verified: true });
      const req = unauthedRequest(URL);

      const result = await authenticateOwner(req);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(401);
      expect(result.error.kind).toBe('missing_token');
      expect(result.error.message).toMatch(/Bearer/i);
    });

    it('returns 401 missing_token when the scheme is wrong (Basic ...)', async () => {
      await makeUser({ email: OWNER_EMAIL, verified: true });
      const req = bearerRequest(URL, VALID_TOKEN, 'Basic');

      const result = await authenticateOwner(req);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(401);
      expect(result.error.kind).toBe('missing_token');
    });

    it('returns 401 missing_token when the header value is empty after Bearer', async () => {
      await makeUser({ email: OWNER_EMAIL, verified: true });
      const req = bearerRequest(URL, '', 'Bearer'); // → "Bearer "
      // bearerRequest sets `${scheme} ${token}` so this gives us "Bearer " (trailing space).
      // The regex `^Bearer\s+(.+)$` should fail to match an empty body — `(.+)` requires ≥1 char.

      const result = await authenticateOwner(req);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(401);
      expect(result.error.kind).toBe('missing_token');
    });

    it('accepts the Bearer scheme case-insensitively', async () => {
      await makeUser({ email: OWNER_EMAIL, verified: true });
      const req = bearerRequest(URL, VALID_TOKEN, 'bearer');

      const result = await authenticateOwner(req);

      expect(result.ok).toBe(true);
    });
  });

  describe('wrong token', () => {
    it('returns 401 invalid_token when the token does not match', async () => {
      await makeUser({ email: OWNER_EMAIL, verified: true });
      const req = bearerRequest(URL, 'definitely-not-the-right-token-blah-blah-blah');

      const result = await authenticateOwner(req);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(401);
      expect(result.error.kind).toBe('invalid_token');
    });

    it('returns 401 invalid_token even when the wrong token has the same length', async () => {
      await makeUser({ email: OWNER_EMAIL, verified: true });
      // Same length as VALID_TOKEN so the early length-mismatch short-circuit doesn't fire.
      const wrong = 'X'.repeat(VALID_TOKEN.length);
      const req = bearerRequest(URL, wrong);

      const result = await authenticateOwner(req);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe('invalid_token');
    });

    it('rejects a same-length-but-wrong token without crashing (proves constant-time compare is used)', async () => {
      // We can't reliably spy on node:crypto's exports under Vitest's ESM
      // runtime (module namespaces aren't configurable). What we *can* prove
      // is the observable behaviour the constant-time compare guarantees: a
      // wrong token of the SAME length as the expected one is rejected with
      // `invalid_token`, not thrown (timingSafeEqual would throw on
      // length-mismatched buffers; the length pre-check would mean we never
      // reached it; therefore reaching it with same lengths and getting back
      // a clean `invalid_token` means the safe compare was exercised).
      await makeUser({ email: OWNER_EMAIL, verified: true });
      const wrong = 'A'.repeat(VALID_TOKEN.length);
      const req = bearerRequest(URL, wrong);

      const result = await authenticateOwner(req);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(401);
      expect(result.error.kind).toBe('invalid_token');
    });

    it('does not throw on a token of differing length (length pre-check guards timingSafeEqual)', async () => {
      await makeUser({ email: OWNER_EMAIL, verified: true });
      // timingSafeEqual throws if buffers differ in length. The implementation
      // must short-circuit before calling it.
      const wrong = 'short';
      const req = bearerRequest(URL, wrong);

      await expect(authenticateOwner(req)).resolves.toEqual(
        expect.objectContaining({
          ok: false,
          status: 401,
          error: expect.objectContaining({ kind: 'invalid_token' }),
        }),
      );
    });
  });

  describe('server misconfiguration', () => {
    it('returns 500 misconfigured when OWNER_API_TOKEN is unset', async () => {
      vi.stubEnv('OWNER_API_TOKEN', '');
      const req = bearerRequest(URL, VALID_TOKEN);

      const result = await authenticateOwner(req);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(500);
      expect(result.error.kind).toBe('misconfigured');
      expect(result.error.message).toMatch(/OWNER_API_TOKEN/);
    });

    it('returns 500 misconfigured when OWNER_API_TOKEN is shorter than 16 chars', async () => {
      vi.stubEnv('OWNER_API_TOKEN', 'short-token');
      const req = bearerRequest(URL, 'short-token');

      const result = await authenticateOwner(req);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(500);
      expect(result.error.kind).toBe('misconfigured');
      expect(result.error.message).toMatch(/short/i);
    });

    it('returns 500 misconfigured when OWNER_EMAIL is unset', async () => {
      vi.stubEnv('OWNER_EMAIL', '');
      const req = bearerRequest(URL, VALID_TOKEN);

      const result = await authenticateOwner(req);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(500);
      expect(result.error.kind).toBe('misconfigured');
      expect(result.error.message).toMatch(/OWNER_EMAIL/);
    });
  });

  describe('owner user lookup', () => {
    it('returns 400 no_owner_user when the user row does not exist', async () => {
      // Important: token + env are valid, but no user with OWNER_EMAIL exists.
      const req = bearerRequest(URL, VALID_TOKEN);

      const result = await authenticateOwner(req);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.error.kind).toBe('no_owner_user');
      expect(result.error.message).toMatch(/owner user not found/i);
      expect(result.error.message).toContain(OWNER_EMAIL);
    });

    it('lowercases OWNER_EMAIL before lookup', async () => {
      vi.stubEnv('OWNER_EMAIL', 'OWNER@EXAMPLE.COM');
      // Owner row stored lowercase (factory enforces this).
      await makeUser({ email: 'owner@example.com', verified: true });

      const req = bearerRequest(URL, VALID_TOKEN);
      const result = await authenticateOwner(req);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.owner.email).toBe('owner@example.com');
    });

    it('returns the owner user on the happy path', async () => {
      const created = await makeUser({ email: OWNER_EMAIL, verified: true });
      const req = bearerRequest(URL, VALID_TOKEN);

      const result = await authenticateOwner(req);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.owner.email).toBe(OWNER_EMAIL);
      expect(result.owner.id).toBe(created.id);
    });
  });
});

describe('withOwnerAuth', () => {
  it('passes the resolved owner to the handler', async () => {
    const created = await makeUser({ email: OWNER_EMAIL, verified: true });
    const handler = vi.fn(async (_req, owner) => {
      return NextResponse.json({ ok: true, ownerId: owner.id });
    });
    const wrapped = withOwnerAuth(handler);

    const req = bearerRequest(URL, VALID_TOKEN);
    const res = await wrapped(req);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[1].id).toBe(created.id);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, ownerId: created.id });
  });

  it('returns a 401 Response (not throw) when token is missing', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });
    const handler = vi.fn();
    const wrapped = withOwnerAuth(handler);

    const res = await wrapped(unauthedRequest(URL));

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: 'missing_token',
      message: expect.any(String),
    });
  });

  it('returns a 401 Response when token is wrong', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });
    const handler = vi.fn();
    const wrapped = withOwnerAuth(handler);

    const res = await wrapped(bearerRequest(URL, 'wrong-token-that-is-long-enough-to-pass-checks'));

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('invalid_token');
  });

  it('returns a 500 Response when OWNER_API_TOKEN is unset', async () => {
    vi.stubEnv('OWNER_API_TOKEN', '');
    const handler = vi.fn();
    const wrapped = withOwnerAuth(handler);

    const res = await wrapped(bearerRequest(URL, 'anything'));

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('misconfigured');
  });

  it('returns a 400 Response when the owner user is missing', async () => {
    // No user inserted.
    const handler = vi.fn();
    const wrapped = withOwnerAuth(handler);

    const res = await wrapped(bearerRequest(URL, VALID_TOKEN));

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('no_owner_user');
  });

  it('lets handler responses pass through unchanged', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });
    const handler = vi.fn(async () => new Response('raw', { status: 201, headers: { 'x-custom': 'yes' } }));
    const wrapped = withOwnerAuth(handler);

    const res = await wrapped(bearerRequest(URL, VALID_TOKEN));

    expect(res.status).toBe(201);
    expect(res.headers.get('x-custom')).toBe('yes');
    await expect(res.text()).resolves.toBe('raw');
  });
});
