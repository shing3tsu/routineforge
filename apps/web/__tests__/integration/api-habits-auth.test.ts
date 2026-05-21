/**
 * Integration tests — dual-auth on the habits endpoints.
 *
 * Uses POST /api/habits as the representative endpoint (same withUser wrapper
 * is used by every habits route — testing once here covers them all).
 *
 *   - unauthenticated → 401 unauthenticated
 *   - session         → 201 habit
 *   - owner-token     → 201 habit (owned by OWNER_EMAIL user)
 *   - wrong owner-token → 401 invalid_token
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

const authMock = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => authMock(),
}));

import { POST } from '@/app/api/habits/route';
import { resetDb, makeUser } from '@/__tests__/helpers/db';
import { jsonRequest } from '@/__tests__/helpers/request';

const URL = 'http://localhost:3000/api/habits';
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

const EMPTY_CTX = { params: Promise.resolve({}) };

describe('POST /api/habits — dual-auth', () => {
  it('returns 401 unauthenticated when no session and no Authorization header', async () => {
    const res = await POST(
      jsonRequest({
        url: URL,
        body: { name: 'X', timezone: 'UTC', cadence: { kind: 'daily' } },
      }),
      EMPTY_CTX,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthenticated');
  });

  it('returns 201 when authed via session', async () => {
    const user = await makeUser({ email: 'alice@example.com', verified: true });
    authMock.mockResolvedValue({ user: { id: user.id } });

    const res = await POST(
      jsonRequest({
        url: URL,
        body: {
          name: 'Read',
          timezone: 'UTC',
          cadence: { kind: 'daily' },
        },
      }),
      EMPTY_CTX,
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.habit.name).toBe('Read');
    expect(body.habit.ownerUserId).toBe(user.id);
  });

  it('returns 201 when authed via owner token', async () => {
    const owner = await makeUser({ email: OWNER_EMAIL, verified: true });

    const res = await POST(
      jsonRequest({
        url: URL,
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        body: {
          name: 'Owner habit',
          timezone: 'UTC',
          cadence: { kind: 'daily' },
        },
      }),
      EMPTY_CTX,
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.habit.ownerUserId).toBe(owner.id);
  });

  it('returns 401 invalid_token when Bearer is wrong', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });

    const res = await POST(
      jsonRequest({
        url: URL,
        headers: { authorization: 'Bearer wrong-token-but-long-enough-to-clear' },
        body: {
          name: 'X',
          timezone: 'UTC',
          cadence: { kind: 'daily' },
        },
      }),
      EMPTY_CTX,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('invalid_token');
  });
});
