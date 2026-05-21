/**
 * Integration tests — GET /api/owner/ping
 *
 * The route is `withOwnerAuth`-wrapped so the unit-test file
 * (`lib-auth-owner.test.ts`) already covers the guard's branches. These tests
 * exercise the full route end-to-end including the JSON payload shape.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

import { GET } from '@/app/api/owner/ping/route';
import { resetDb, makeUser } from '@/__tests__/helpers/db';
import { bearerRequest, unauthedRequest } from '@/__tests__/helpers/request';

const URL = 'http://localhost:3000/api/owner/ping';
const VALID_TOKEN = 'test-owner-token-must-be-at-least-sixteen-chars';
const OWNER_EMAIL = 'owner@example.com';

beforeEach(async () => {
  await resetDb();
  vi.stubEnv('OWNER_API_TOKEN', VALID_TOKEN);
  vi.stubEnv('OWNER_EMAIL', OWNER_EMAIL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/owner/ping', () => {
  it('returns 401 when there is no Authorization header', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });

    const res = await GET(unauthedRequest(URL));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('missing_token');
  });

  it('returns 401 when the token is wrong', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });

    const wrong = 'not-the-right-token-at-all-but-long-enough';
    const res = await GET(bearerRequest(URL, wrong));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('invalid_token');
  });

  it('returns 200 { ok, owner, ts } when token is correct and the owner user exists', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });

    const res = await GET(bearerRequest(URL, VALID_TOKEN));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.owner).toBe(OWNER_EMAIL);
    // ISO 8601 timestamp.
    expect(body.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // Sanity: the timestamp is roughly now.
    const ts = new Date(body.ts).getTime();
    expect(Math.abs(ts - Date.now())).toBeLessThan(5_000);
  });

  it('returns 400 when the owner user is missing from the DB', async () => {
    // Token + env are valid but no user inserted.
    const res = await GET(bearerRequest(URL, VALID_TOKEN));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('no_owner_user');
  });

  it('returns 500 when OWNER_API_TOKEN is unset on the server', async () => {
    vi.stubEnv('OWNER_API_TOKEN', '');
    await makeUser({ email: OWNER_EMAIL, verified: true });

    const res = await GET(bearerRequest(URL, 'anything'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('misconfigured');
  });

  it('returns 500 when OWNER_EMAIL is unset on the server', async () => {
    vi.stubEnv('OWNER_EMAIL', '');

    const res = await GET(bearerRequest(URL, VALID_TOKEN));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('misconfigured');
  });
});
