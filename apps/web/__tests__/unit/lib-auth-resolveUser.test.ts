/**
 * Unit tests for lib/auth/resolveUser.ts.
 *
 * Covers the dual-auth wrapper: session (mocked `auth()` from @/auth) and
 * owner-token fallback (real `authenticateOwner` against the pglite DB).
 *
 *   - Session present + valid → returns user via session
 *   - Session id but vanished user → falls through to owner-token
 *   - No cookies + no Authorization header → 401 unauthenticated
 *   - No cookies + Bearer + wrong token → 401 invalid_token
 *   - No cookies + Bearer + right token, owner exists → returns owner via owner-token
 *   - No cookies + Bearer + right token, OWNER_EMAIL user missing → 400 no_owner_user
 *   - withUser: success passes user/params; failure returns Response without throwing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextResponse } from 'next/server';

// Mock @/db -> pglite-backed test client.
vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

// Mock @/auth so we can control what `auth()` returns per test.
const authMock = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => authMock(),
}));

import { resolveUser, withUser } from '@/lib/auth/resolveUser';
import { resetDb, makeUser } from '@/__tests__/helpers/db';
import { bearerRequest, unauthedRequest } from '@/__tests__/helpers/request';

const URL = 'http://localhost:3000/api/routines';
const VALID_TOKEN = 'test-owner-token-must-be-at-least-sixteen-chars';
const OWNER_EMAIL = 'owner@example.com';

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  authMock.mockResolvedValue(null);
  vi.stubEnv('OWNER_API_TOKEN', VALID_TOKEN);
  vi.stubEnv('OWNER_EMAIL', OWNER_EMAIL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveUser — session path', () => {
  it('returns the user from the session when session is present and user exists', async () => {
    const user = await makeUser({ email: 'alice@example.com', verified: true });
    authMock.mockResolvedValue({ user: { id: user.id } });

    const result = await resolveUser(unauthedRequest(URL));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.via).toBe('session');
    expect(result.user.id).toBe(user.id);
    expect(result.user.email).toBe('alice@example.com');
  });

  it('falls through to owner-token when session id refers to a vanished user', async () => {
    // Session has an id, but no user row exists for that id.
    authMock.mockResolvedValue({
      user: { id: '00000000-0000-0000-0000-000000000099' },
    });
    // Owner exists; CLI bearer should still succeed.
    const owner = await makeUser({ email: OWNER_EMAIL, verified: true });

    const result = await resolveUser(bearerRequest(URL, VALID_TOKEN));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.via).toBe('owner-token');
    expect(result.user.id).toBe(owner.id);
  });
});

describe('resolveUser — no auth at all', () => {
  it('returns 401 unauthenticated (NOT missing_token) when cookies absent and no Authorization header', async () => {
    // No session.
    authMock.mockResolvedValue(null);

    const result = await resolveUser(unauthedRequest(URL));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    const body = await result.response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('unauthenticated');
    expect(body.error).not.toBe('missing_token');
  });
});

describe('resolveUser — owner-token path', () => {
  it('returns 401 invalid_token when the Bearer token is wrong', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });
    authMock.mockResolvedValue(null);

    const result = await resolveUser(
      bearerRequest(URL, 'definitely-wrong-token-but-long-enough-to-pass-length'),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    const body = await result.response.json();
    expect(body.error).toBe('invalid_token');
  });

  it('returns the owner user when Bearer is right and OWNER_EMAIL user exists', async () => {
    const owner = await makeUser({ email: OWNER_EMAIL, verified: true });
    authMock.mockResolvedValue(null);

    const result = await resolveUser(bearerRequest(URL, VALID_TOKEN));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.via).toBe('owner-token');
    expect(result.user.id).toBe(owner.id);
    expect(result.user.email).toBe(OWNER_EMAIL);
  });

  it('returns 400 no_owner_user when Bearer is right but OWNER_EMAIL user is missing', async () => {
    // No user inserted.
    authMock.mockResolvedValue(null);

    const result = await resolveUser(bearerRequest(URL, VALID_TOKEN));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    const body = await result.response.json();
    expect(body.error).toBe('no_owner_user');
  });

  it('preserves session priority over owner-token when both are present and valid', async () => {
    const sessionUser = await makeUser({ email: 'alice@example.com', verified: true });
    await makeUser({ email: OWNER_EMAIL, verified: true });
    authMock.mockResolvedValue({ user: { id: sessionUser.id } });

    const result = await resolveUser(bearerRequest(URL, VALID_TOKEN));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.via).toBe('session');
    expect(result.user.id).toBe(sessionUser.id);
  });

  it('returns 500 misconfigured when owner env is broken and a Bearer is presented', async () => {
    vi.stubEnv('OWNER_API_TOKEN', '');
    authMock.mockResolvedValue(null);

    const result = await resolveUser(bearerRequest(URL, 'anything'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(500);
    const body = await result.response.json();
    expect(body.error).toBe('misconfigured');
  });
});

describe('withUser wrapper', () => {
  it('passes the resolved user to the handler on success', async () => {
    const user = await makeUser({ email: 'alice@example.com', verified: true });
    authMock.mockResolvedValue({ user: { id: user.id } });
    const handler = vi.fn(async (_req, ctx) =>
      NextResponse.json({ ok: true, userId: ctx.user.id, via: ctx.via }),
    );
    const wrapped = withUser(handler);

    const res = await wrapped(unauthedRequest(URL), { params: Promise.resolve({}) });

    expect(handler).toHaveBeenCalledTimes(1);
    const ctx = handler.mock.calls[0]?.[1];
    expect(ctx.user.id).toBe(user.id);
    expect(ctx.via).toBe('session');
    expect(res.status).toBe(200);
  });

  it('forwards dynamic params to the handler', async () => {
    const user = await makeUser({ email: 'alice@example.com', verified: true });
    authMock.mockResolvedValue({ user: { id: user.id } });
    const handler = vi.fn(async (_req, ctx) =>
      NextResponse.json({ id: ctx.params.id, stepId: ctx.params.stepId }),
    );
    const wrapped = withUser<{ id: string; stepId: string }>(handler);

    const res = await wrapped(unauthedRequest(URL), {
      params: Promise.resolve({ id: 'r-1', stepId: 's-2' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: 'r-1', stepId: 's-2' });
  });

  it('returns a 401 Response (not throw) when no auth is present', async () => {
    authMock.mockResolvedValue(null);
    const handler = vi.fn();
    const wrapped = withUser(handler);

    const res = await wrapped(unauthedRequest(URL), { params: Promise.resolve({}) });

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthenticated');
  });

  it('returns a 401 Response when bearer token is invalid', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });
    authMock.mockResolvedValue(null);
    const handler = vi.fn();
    const wrapped = withUser(handler);

    const res = await wrapped(
      bearerRequest(URL, 'wrong-token-but-long-enough-to-clear-length'),
      { params: Promise.resolve({}) },
    );

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('invalid_token');
  });
});
