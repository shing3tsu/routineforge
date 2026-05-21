/**
 * Integration tests — POST /api/owner/import
 *
 * Exercise the HTTP wrapper around `importOwnerData`:
 *   - 401 without owner token
 *   - 400 on schema-invalid payload
 *   - 400 on version mismatch
 *   - 400 on user-id mismatch
 *   - 200 dry-run reports counts, no writes
 *   - 200 replace deletes + inserts atomically
 *
 * Owner-mismatch + dry-run library logic is also tested at the unit layer;
 * this file exercises the full HTTP path including JSON parsing + zod-error
 * shaping. Without this coverage the route handler would have a long tail of
 * "did I forget to plumb the error response?" regressions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

import { POST } from '@/app/api/owner/import/route';
import { db } from '@/db';
import { routines, habits } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  resetDb,
  makeUser,
  makeRoutine,
} from '@/__tests__/helpers/db';
import { NextRequest } from 'next/server';
import { EXPORT_VERSION } from '@/lib/export';

const URL = 'http://localhost:3000/api/owner/import';
const VALID_TOKEN = 'test-owner-token-must-be-at-least-sixteen-chars';
const OWNER_EMAIL = 'owner@example.com';

function makeRequest(opts: { token?: string; body: unknown }): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (opts.token !== undefined) headers.authorization = `Bearer ${opts.token}`;
  return new NextRequest(URL, {
    method: 'POST',
    headers,
    body: typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
  });
}

/** A minimal valid payload. Caller fills in routines/habits to taste. */
function minimalPayload(sourceUserId: string): Record<string, unknown> {
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    scope: 'mine',
    users: [
      {
        id: sourceUserId,
        email: 'whoever@example.com',
        name: null,
        image: null,
        emailVerified: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    accounts: [],
    verificationTokens: [],
    sessions: [],
    routines: [],
    routineDaySteps: [],
    routineStepCompletions: [],
    habits: [],
    habitCompletions: [],
    pushSubscriptions: [],
    notificationSchedules: [],
  };
}

beforeEach(async () => {
  await resetDb();
  vi.stubEnv('OWNER_API_TOKEN', VALID_TOKEN);
  vi.stubEnv('OWNER_EMAIL', OWNER_EMAIL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/owner/import', () => {
  it('returns 401 without an Authorization header', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });
    const payload = minimalPayload('11111111-1111-1111-1111-111111111111');

    const res = await POST(makeRequest({ body: payload }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('missing_token');
  });

  it('returns 400 on non-JSON body', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });

    const res = await POST(makeRequest({ token: VALID_TOKEN, body: 'not json' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });

  it('returns 400 on schema-invalid payload (missing fields)', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });
    // Has version: 1 so we skip version_mismatch and hit zod validation.
    const bad = { version: EXPORT_VERSION };

    const res = await POST(makeRequest({ token: VALID_TOKEN, body: bad }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
    expect(body.issues).toBeDefined();
  });

  it('returns 400 on version mismatch', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });
    const payload = minimalPayload('11111111-1111-1111-1111-111111111111');
    payload.version = 99;

    const res = await POST(makeRequest({ token: VALID_TOKEN, body: payload }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('version_mismatch');
  });

  it('returns 400 on owner-id mismatch (payload references a different user)', async () => {
    await makeUser({ email: OWNER_EMAIL, verified: true });
    const sourceUserId = '11111111-1111-1111-1111-111111111111';
    const otherUserId = '22222222-2222-2222-2222-222222222222';
    const payload = minimalPayload(sourceUserId);
    (payload.routines as Array<Record<string, unknown>>).push({
      id: '33333333-3333-3333-3333-333333333333',
      ownerUserId: otherUserId, // ← different from the single user in payload.users
      name: 'Sneaky',
      description: null,
      timezone: 'UTC',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    });

    const res = await POST(makeRequest({ token: VALID_TOKEN, body: payload }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('owner_mismatch');
  });

  it('dry-run reports counts and writes nothing', async () => {
    const owner = await makeUser({ email: OWNER_EMAIL, verified: true });
    const sourceUserId = '11111111-1111-1111-1111-111111111111';
    const payload = minimalPayload(sourceUserId);
    (payload.routines as Array<Record<string, unknown>>).push({
      id: '33333333-3333-3333-3333-333333333333',
      ownerUserId: sourceUserId,
      name: 'Dry routine',
      description: null,
      timezone: 'UTC',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    });
    payload.dryRun = true;
    payload.mode = 'replace';

    const res = await POST(makeRequest({ token: VALID_TOKEN, body: payload }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(body.counts.routines).toBe(1);

    // No rows should exist.
    const rows = await db
      .select()
      .from(routines)
      .where(eq(routines.ownerUserId, owner.id));
    expect(rows).toHaveLength(0);
  });

  it('replace mode: deletes existing owner data + inserts payload atomically', async () => {
    const owner = await makeUser({ email: OWNER_EMAIL, verified: true });
    // Pre-existing data that REPLACE should wipe.
    await makeRoutine({ ownerUserId: owner.id, name: 'OLD' });

    const sourceUserId = '11111111-1111-1111-1111-111111111111';
    const payload = minimalPayload(sourceUserId);
    (payload.routines as Array<Record<string, unknown>>).push({
      id: '33333333-3333-3333-3333-333333333333',
      ownerUserId: sourceUserId,
      name: 'NEW',
      description: null,
      timezone: 'UTC',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    });
    (payload.habits as Array<Record<string, unknown>>).push({
      id: '44444444-4444-4444-4444-444444444444',
      ownerUserId: sourceUserId,
      name: 'Imported habit',
      description: null,
      timezone: 'UTC',
      cadence: { kind: 'daily' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    });
    payload.mode = 'replace';

    const res = await POST(makeRequest({ token: VALID_TOKEN, body: payload }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('replace');
    expect(body.dryRun).toBe(false);

    const routineRows = await db
      .select()
      .from(routines)
      .where(eq(routines.ownerUserId, owner.id));
    expect(routineRows).toHaveLength(1);
    expect(routineRows[0]!.name).toBe('NEW');

    const habitRows = await db
      .select()
      .from(habits)
      .where(eq(habits.ownerUserId, owner.id));
    expect(habitRows).toHaveLength(1);
    expect(habitRows[0]!.name).toBe('Imported habit');
  });

  it('mode/dryRun can be passed via query string', async () => {
    const owner = await makeUser({ email: OWNER_EMAIL, verified: true });
    await makeRoutine({ ownerUserId: owner.id, name: 'OLD' });
    const payload = minimalPayload('11111111-1111-1111-1111-111111111111');

    const req = new NextRequest(`${URL}?mode=merge&dryRun=1`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('merge');
    expect(body.dryRun).toBe(true);

    // Dry-run + merge → no rows changed, OLD routine still here.
    const rows = await db
      .select()
      .from(routines)
      .where(eq(routines.ownerUserId, owner.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('OLD');
  });
});
