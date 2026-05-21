/**
 * Integration tests — POST /api/owner/export
 *
 * Exercise the HTTP wrapper around `exportOwnerData`:
 *   - 401 without owner token
 *   - 200 with valid token + correct payload shape
 *   - 400 on unknown scope
 *
 * The deeper data-shape assertions live in `unit/lib-export.test.ts`; this
 * file owns the route-handler-level behaviour (auth, status codes, body
 * parsing). Keeping that split avoids duplicating coverage and keeps each
 * file small enough to read in one sitting.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

import { POST } from '@/app/api/owner/export/route';
import {
  resetDb,
  makeUser,
  makeRoutine,
  makeHabit,
} from '@/__tests__/helpers/db';
import { NextRequest } from 'next/server';

const URL = 'http://localhost:3000/api/owner/export';
const VALID_TOKEN = 'test-owner-token-must-be-at-least-sixteen-chars';
const OWNER_EMAIL = 'owner@example.com';

function makeRequest(opts: {
  token?: string;
  body?: unknown;
}): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (opts.token !== undefined) headers.authorization = `Bearer ${opts.token}`;
  return new NextRequest(URL, {
    method: 'POST',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

beforeEach(async () => {
  await resetDb();
  vi.stubEnv('OWNER_API_TOKEN', VALID_TOKEN);
  vi.stubEnv('OWNER_EMAIL', OWNER_EMAIL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/owner/export', () => {
  it('returns 401 when there is no Authorization header', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('missing_token');
  });

  it('returns 401 when the token is wrong', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });

    const res = await POST(
      makeRequest({ token: 'not-the-right-token-at-all-but-long-enough' }),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('invalid_token');
  });

  it('returns 200 + correctly-shaped payload with a valid owner token', async () => {
    const owner = await makeUser({ email: OWNER_EMAIL, verified: true });
    await makeRoutine({ ownerUserId: owner.id, name: 'Test routine' });
    await makeHabit({
      ownerUserId: owner.id,
      name: 'Test habit',
      cadence: { kind: 'daily' },
    });

    const res = await POST(makeRequest({ token: VALID_TOKEN }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(1);
    expect(body.scope).toBe('mine');
    expect(typeof body.exportedAt).toBe('string');
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users).toHaveLength(1);
    expect(body.users[0].id).toBe(owner.id);
    expect(body.routines).toHaveLength(1);
    expect(body.routines[0].name).toBe('Test routine');
    expect(body.habits).toHaveLength(1);
    expect(body.habits[0].name).toBe('Test habit');
    // Security-required emptiness.
    expect(body.verificationTokens).toEqual([]);
    expect(body.sessions).toEqual([]);
    expect(body.pushSubscriptions).toEqual([]);
  });

  it('accepts an empty body (POST with no payload)', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });

    const res = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scope).toBe('mine');
  });

  it('returns 400 on a non-JSON body', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });

    const res = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${VALID_TOKEN}`,
          'content-type': 'application/json',
        },
        body: 'not json',
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });

  it('returns 400 on an invalid scope', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });

    const res = await POST(
      makeRequest({ token: VALID_TOKEN, body: { scope: 'nonsense' } }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 when scope="all" (not yet supported)', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });

    const res = await POST(
      makeRequest({ token: VALID_TOKEN, body: { scope: 'all' } }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('export_failed');
  });
});
