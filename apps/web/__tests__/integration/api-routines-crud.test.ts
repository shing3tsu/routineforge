/**
 * Integration tests — /api/routines and /api/routines/:id
 *
 *   GET    /api/routines        (list)
 *   POST   /api/routines        (create)
 *   GET    /api/routines/:id    (show)
 *   PATCH  /api/routines/:id    (partial update)
 *   DELETE /api/routines/:id    (soft delete)
 *
 * Critical: 404 ambiguity — a routine owned by another user is 404, not 403.
 * Critical: scheduleWeekdays derivation in list/show is correct.
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

import { GET as listGET, POST as createPOST } from '@/app/api/routines/route';
import {
  GET as showGET,
  PATCH as updatePATCH,
  DELETE as deleteDELETE,
} from '@/app/api/routines/[id]/route';
import {
  resetDb,
  makeUser,
  makeRoutine,
  makeStep,
} from '@/__tests__/helpers/db';
import { jsonRequest, getRequest } from '@/__tests__/helpers/request';

const VALID_TOKEN = 'test-owner-token-must-be-at-least-sixteen-chars';
const OWNER_EMAIL = 'owner@example.com';
const LIST_URL = 'http://localhost:3000/api/routines';

function showUrl(id: string) {
  return `http://localhost:3000/api/routines/${id}`;
}

let userId: string;
let otherId: string;

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  vi.stubEnv('OWNER_API_TOKEN', VALID_TOKEN);
  vi.stubEnv('OWNER_EMAIL', OWNER_EMAIL);
  const user = await makeUser({ email: 'alice@example.com', verified: true });
  const other = await makeUser({ email: 'bob@example.com', verified: true });
  userId = user.id;
  otherId = other.id;
  authMock.mockResolvedValue({ user: { id: userId } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// GET /api/routines — list
// ---------------------------------------------------------------------------

describe('GET /api/routines', () => {
  it('returns empty list when user has no routines', async () => {
    const res = await listGET(getRequest({ url: LIST_URL }), {
      params: Promise.resolve({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, routines: [] });
  });

  it('returns the user-owned routines ordered by name', async () => {
    await makeRoutine({ ownerUserId: userId, name: 'Zeta' });
    await makeRoutine({ ownerUserId: userId, name: 'Alpha' });
    await makeRoutine({ ownerUserId: userId, name: 'Mu' });

    const res = await listGET(getRequest({ url: LIST_URL }), {
      params: Promise.resolve({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.routines.map((r: { name: string }) => r.name)).toEqual([
      'Alpha',
      'Mu',
      'Zeta',
    ]);
  });

  it('does not return routines owned by other users', async () => {
    await makeRoutine({ ownerUserId: otherId, name: 'Bobs' });
    await makeRoutine({ ownerUserId: userId, name: 'Alices' });

    const res = await listGET(getRequest({ url: LIST_URL }), {
      params: Promise.resolve({}),
    });

    const body = await res.json();
    expect(body.routines).toHaveLength(1);
    expect(body.routines[0].name).toBe('Alices');
  });

  it('does not return archived routines', async () => {
    await makeRoutine({ ownerUserId: userId, name: 'Active' });
    await makeRoutine({
      ownerUserId: userId,
      name: 'Archived',
      archivedAt: new Date(),
    });

    const res = await listGET(getRequest({ url: LIST_URL }), {
      params: Promise.resolve({}),
    });

    const body = await res.json();
    expect(body.routines.map((r: { name: string }) => r.name)).toEqual(['Active']);
  });

  it('derives scheduleWeekdays from the set of weekdays with >=1 step', async () => {
    const r = await makeRoutine({ ownerUserId: userId, name: 'R' });
    await makeStep({ routineId: r.id, weekday: 1 });
    await makeStep({ routineId: r.id, weekday: 1 });
    await makeStep({ routineId: r.id, weekday: 4 });
    await makeStep({ routineId: r.id, weekday: 6 });

    const res = await listGET(getRequest({ url: LIST_URL }), {
      params: Promise.resolve({}),
    });
    const body = await res.json();
    expect(body.routines[0].scheduleWeekdays).toEqual([1, 4, 6]);
  });

  it('returns empty scheduleWeekdays when a routine has no steps', async () => {
    await makeRoutine({ ownerUserId: userId, name: 'Bare' });

    const res = await listGET(getRequest({ url: LIST_URL }), {
      params: Promise.resolve({}),
    });
    const body = await res.json();
    expect(body.routines[0].scheduleWeekdays).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/routines — create
// ---------------------------------------------------------------------------

describe('POST /api/routines', () => {
  it('creates a routine with empty scheduleWeekdays', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: { name: 'New', timezone: 'America/Los_Angeles' },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.routine.name).toBe('New');
    expect(body.routine.timezone).toBe('America/Los_Angeles');
    expect(body.routine.ownerUserId).toBe(userId);
    expect(body.routine.scheduleWeekdays).toEqual([]);
    expect(body.routine.archivedAt).toBeNull();
  });

  it('accepts description (optional)', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: { name: 'X', description: 'desc here', timezone: 'UTC' },
      }),
      { params: Promise.resolve({}) },
    );

    const body = await res.json();
    expect(body.routine.description).toBe('desc here');
  });

  it('treats empty-string description as null', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: { name: 'X', description: '', timezone: 'UTC' },
      }),
      { params: Promise.resolve({}) },
    );

    const body = await res.json();
    expect(body.routine.description).toBeNull();
  });

  it('returns 400 invalid_json for non-JSON body', async () => {
    const res = await createPOST(
      jsonRequest({ url: LIST_URL, body: 'not json' }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });

  it('returns 400 validation_error for invalid timezone', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: { name: 'X', timezone: 'Mars/Olympus' },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
    expect(body.issues).toBeDefined();
  });

  it('returns 400 validation_error for missing name', async () => {
    const res = await createPOST(
      jsonRequest({ url: LIST_URL, body: { timezone: 'UTC' } }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('creates a routine with category + location and round-trips them', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          name: 'Tagged',
          timezone: 'UTC',
          category: 'Wellness',
          location: 'home',
        },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.routine.category).toBe('Wellness');
    expect(body.routine.location).toBe('home');

    // And the list response also surfaces the new fields.
    const listRes = await listGET(getRequest({ url: LIST_URL }), {
      params: Promise.resolve({}),
    });
    const listBody = await listRes.json();
    expect(listBody.routines[0].category).toBe('Wellness');
    expect(listBody.routines[0].location).toBe('home');
  });

  it('treats empty-string category/location as null on create', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: { name: 'X', timezone: 'UTC', category: '', location: '' },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.routine.category).toBeNull();
    expect(body.routine.location).toBeNull();
  });

  it('returns 400 when category > 50 chars', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: { name: 'X', timezone: 'UTC', category: 'A'.repeat(51) },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });
});

// ---------------------------------------------------------------------------
// GET /api/routines/:id — show
// ---------------------------------------------------------------------------

describe('GET /api/routines/:id', () => {
  it('returns the routine with stepsByWeekday + scheduleWeekdays', async () => {
    const r = await makeRoutine({ ownerUserId: userId, name: 'R' });
    const s1 = await makeStep({ routineId: r.id, weekday: 0, position: 0, title: 'A' });
    const s2 = await makeStep({ routineId: r.id, weekday: 0, position: 1, title: 'B' });
    await makeStep({ routineId: r.id, weekday: 3, position: 0, title: 'C' });

    const res = await showGET(getRequest({ url: showUrl(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.routine.id).toBe(r.id);
    expect(body.routine.stepsByWeekday['0']).toHaveLength(2);
    expect(body.routine.stepsByWeekday['0'].map((s: { id: string }) => s.id)).toEqual([
      s1.id,
      s2.id,
    ]);
    expect(body.routine.stepsByWeekday['3']).toHaveLength(1);
    expect(body.routine.stepsByWeekday['1']).toEqual([]);
    expect(body.routine.scheduleWeekdays).toEqual([0, 3]);
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await showGET(
      getRequest({ url: showUrl('00000000-0000-0000-0000-000000000099') }),
      { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000099' }) },
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
  });

  it('returns 404 (NOT 403) for a routine owned by another user — prevents id probing', async () => {
    const r = await makeRoutine({ ownerUserId: otherId, name: 'Bobs' });

    const res = await showGET(getRequest({ url: showUrl(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
  });

  it('returns 404 for an archived routine', async () => {
    const r = await makeRoutine({
      ownerUserId: userId,
      archivedAt: new Date(),
    });

    const res = await showGET(getRequest({ url: showUrl(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });

    expect(res.status).toBe(404);
  });

  it('includes category + location in the detail response', async () => {
    const r = await makeRoutine({
      ownerUserId: userId,
      category: 'Wellness',
      location: 'home',
    });

    const res = await showGET(getRequest({ url: showUrl(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.routine.category).toBe('Wellness');
    expect(body.routine.location).toBe('home');
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/routines/:id — update
// ---------------------------------------------------------------------------

describe('PATCH /api/routines/:id', () => {
  it('updates a routine name', async () => {
    const r = await makeRoutine({ ownerUserId: userId, name: 'Old' });

    const res = await updatePATCH(
      jsonRequest({ url: showUrl(r.id), body: { name: 'New' } }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.routine.name).toBe('New');
  });

  it('updates description to null', async () => {
    const r = await makeRoutine({
      ownerUserId: userId,
      description: 'before',
    });

    const res = await updatePATCH(
      jsonRequest({ url: showUrl(r.id), body: { description: null } }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.routine.description).toBeNull();
  });

  it('returns 404 for routines owned by another user', async () => {
    const r = await makeRoutine({ ownerUserId: otherId, name: 'Bobs' });

    const res = await updatePATCH(
      jsonRequest({ url: showUrl(r.id), body: { name: 'Hacked' } }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 for an empty body', async () => {
    const r = await makeRoutine({ ownerUserId: userId });

    const res = await updatePATCH(
      jsonRequest({ url: showUrl(r.id), body: {} }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 invalid_json for non-JSON', async () => {
    const r = await makeRoutine({ ownerUserId: userId });

    const res = await updatePATCH(
      jsonRequest({ url: showUrl(r.id), body: 'nope' }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });

  it('adds category + location to a routine that lacks them', async () => {
    const r = await makeRoutine({ ownerUserId: userId });

    const res = await updatePATCH(
      jsonRequest({
        url: showUrl(r.id),
        body: { category: 'Fitness', location: 'gym' },
      }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.routine.category).toBe('Fitness');
    expect(body.routine.location).toBe('gym');
  });

  it('clears category/location by setting them to null', async () => {
    const r = await makeRoutine({
      ownerUserId: userId,
      category: 'Fitness',
      location: 'gym',
    });

    const res = await updatePATCH(
      jsonRequest({
        url: showUrl(r.id),
        body: { category: null, location: null },
      }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.routine.category).toBeNull();
    expect(body.routine.location).toBeNull();
  });

  it('treats empty-string category/location as a null-clear on update', async () => {
    const r = await makeRoutine({
      ownerUserId: userId,
      category: 'Fitness',
      location: 'gym',
    });

    const res = await updatePATCH(
      jsonRequest({
        url: showUrl(r.id),
        body: { category: '', location: '' },
      }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.routine.category).toBeNull();
    expect(body.routine.location).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/routines/:id — soft delete
// ---------------------------------------------------------------------------

describe('DELETE /api/routines/:id', () => {
  it('soft-deletes (sets archivedAt) and routine vanishes from list', async () => {
    const r = await makeRoutine({ ownerUserId: userId, name: 'Doomed' });

    const delRes = await deleteDELETE(
      jsonRequest({ url: showUrl(r.id) }),
      { params: Promise.resolve({ id: r.id }) },
    );
    expect(delRes.status).toBe(200);

    // No longer listed.
    const listRes = await listGET(getRequest({ url: LIST_URL }), {
      params: Promise.resolve({}),
    });
    const listBody = await listRes.json();
    expect(listBody.routines).toHaveLength(0);

    // 404 on show too.
    const showRes = await showGET(getRequest({ url: showUrl(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });
    expect(showRes.status).toBe(404);
  });

  it('returns 404 for routines owned by another user', async () => {
    const r = await makeRoutine({ ownerUserId: otherId, name: 'Bobs' });

    const res = await deleteDELETE(jsonRequest({ url: showUrl(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });

    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-existent id', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000099';
    const res = await deleteDELETE(jsonRequest({ url: showUrl(fakeId) }), {
      params: Promise.resolve({ id: fakeId }),
    });

    expect(res.status).toBe(404);
  });
});
