/**
 * Integration tests — /api/habits and /api/habits/:id
 *
 *   GET    /api/habits        (list with streaks)
 *   POST   /api/habits        (create)
 *   GET    /api/habits/:id    (detail with 90-day window)
 *   PATCH  /api/habits/:id    (partial update)
 *   DELETE /api/habits/:id    (soft delete)
 *
 * 404 ambiguity: cross-user habits return 404 not 403 (matches routines).
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

import { GET as listGET, POST as createPOST } from '@/app/api/habits/route';
import {
  GET as showGET,
  PATCH as updatePATCH,
  DELETE as deleteDELETE,
} from '@/app/api/habits/[id]/route';
import {
  resetDb,
  makeUser,
  makeHabit,
  makeHabitCompletion,
  countHabits,
} from '@/__tests__/helpers/db';
import { jsonRequest, getRequest } from '@/__tests__/helpers/request';

const VALID_TOKEN = 'test-owner-token-must-be-at-least-sixteen-chars';
const OWNER_EMAIL = 'owner@example.com';
const LIST_URL = 'http://localhost:3000/api/habits';

function showUrl(id: string) {
  return `http://localhost:3000/api/habits/${id}`;
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
// GET /api/habits — list with streaks
// ---------------------------------------------------------------------------

describe('GET /api/habits', () => {
  it('returns empty list when user has no habits', async () => {
    const res = await listGET(getRequest({ url: LIST_URL }), {
      params: Promise.resolve({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, habits: [] });
  });

  it('returns user-owned habits ordered by name', async () => {
    await makeHabit({ ownerUserId: userId, name: 'Zeta' });
    await makeHabit({ ownerUserId: userId, name: 'Alpha' });
    await makeHabit({ ownerUserId: userId, name: 'Mu' });

    const res = await listGET(getRequest({ url: LIST_URL }), {
      params: Promise.resolve({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.habits.map((h: { name: string }) => h.name)).toEqual([
      'Alpha',
      'Mu',
      'Zeta',
    ]);
  });

  it('does not return habits owned by other users', async () => {
    await makeHabit({ ownerUserId: otherId, name: 'Bobs' });
    await makeHabit({ ownerUserId: userId, name: 'Alices' });

    const res = await listGET(getRequest({ url: LIST_URL }), {
      params: Promise.resolve({}),
    });

    const body = await res.json();
    expect(body.habits).toHaveLength(1);
    expect(body.habits[0].name).toBe('Alices');
  });

  it('does not return archived habits', async () => {
    await makeHabit({ ownerUserId: userId, name: 'Active' });
    await makeHabit({
      ownerUserId: userId,
      name: 'Archived',
      archivedAt: new Date(),
    });

    const res = await listGET(getRequest({ url: LIST_URL }), {
      params: Promise.resolve({}),
    });

    const body = await res.json();
    expect(body.habits.map((h: { name: string }) => h.name)).toEqual(['Active']);
  });

  it('includes computed streak fields per habit', async () => {
    await makeHabit({ ownerUserId: userId, name: 'X' });
    const res = await listGET(getRequest({ url: LIST_URL }), {
      params: Promise.resolve({}),
    });
    const body = await res.json();
    expect(body.habits[0]).toHaveProperty('currentStreak', 0);
    expect(body.habits[0]).toHaveProperty('longestStreak', 0);
    expect(body.habits[0]).toHaveProperty('totalCompletions', 0);
    expect(body.habits[0]).toHaveProperty('lastCompletedDate', null);
  });
});

// ---------------------------------------------------------------------------
// POST /api/habits — create
// ---------------------------------------------------------------------------

describe('POST /api/habits', () => {
  it('creates a daily habit with zero streaks', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          name: 'Read',
          timezone: 'America/Los_Angeles',
          cadence: { kind: 'daily' },
        },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.habit.name).toBe('Read');
    expect(body.habit.timezone).toBe('America/Los_Angeles');
    expect(body.habit.ownerUserId).toBe(userId);
    expect(body.habit.cadence).toEqual({ kind: 'daily' });
    expect(body.habit.currentStreak).toBe(0);
    expect(body.habit.longestStreak).toBe(0);
    expect(body.habit.totalCompletions).toBe(0);
    expect(body.habit.lastCompletedDate).toBeNull();
    expect(body.habit.archivedAt).toBeNull();

    expect(await countHabits()).toBe(1);
  });

  it('creates a weekly_count habit', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          name: 'Gym',
          timezone: 'UTC',
          cadence: { kind: 'weekly_count', perWeek: 3 },
        },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.habit.cadence).toEqual({
      kind: 'weekly_count',
      perWeek: 3,
      weekStart: 0, // defaulted
    });
  });

  it('creates a specific_weekdays habit (weekdays canonicalised)', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          name: 'Climb',
          timezone: 'UTC',
          cadence: { kind: 'specific_weekdays', weekdays: [4, 2, 0] },
        },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.habit.cadence).toEqual({
      kind: 'specific_weekdays',
      weekdays: [0, 2, 4],
    });
  });

  it('treats empty-string description as null', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          name: 'X',
          description: '',
          timezone: 'UTC',
          cadence: { kind: 'daily' },
        },
      }),
      { params: Promise.resolve({}) },
    );

    const body = await res.json();
    expect(body.habit.description).toBeNull();
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
        body: {
          name: 'X',
          timezone: 'Mars/Olympus',
          cadence: { kind: 'daily' },
        },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
    expect(body.issues).toBeDefined();
  });

  it('returns 400 validation_error for missing cadence', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: { name: 'X', timezone: 'UTC' },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 validation_error for empty-weekdays specific cadence', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          name: 'X',
          timezone: 'UTC',
          cadence: { kind: 'specific_weekdays', weekdays: [] },
        },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 validation_error for perWeek out of range', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          name: 'X',
          timezone: 'UTC',
          cadence: { kind: 'weekly_count', perWeek: 9 },
        },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(400);
  });

  it('creates a habit with category + location and round-trips them', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          name: 'Read',
          timezone: 'UTC',
          cadence: { kind: 'daily' },
          category: 'Wellness',
          location: 'home',
        },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.habit.category).toBe('Wellness');
    expect(body.habit.location).toBe('home');

    // List response surfaces the same fields.
    const listRes = await listGET(getRequest({ url: LIST_URL }), {
      params: Promise.resolve({}),
    });
    const listBody = await listRes.json();
    expect(listBody.habits[0].category).toBe('Wellness');
    expect(listBody.habits[0].location).toBe('home');
  });

  it('treats empty-string category/location as null on create', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          name: 'X',
          timezone: 'UTC',
          cadence: { kind: 'daily' },
          category: '',
          location: '',
        },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.habit.category).toBeNull();
    expect(body.habit.location).toBeNull();
  });

  it('returns 400 when category > 50 chars', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          name: 'X',
          timezone: 'UTC',
          cadence: { kind: 'daily' },
          category: 'A'.repeat(51),
        },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });
});

// ---------------------------------------------------------------------------
// GET /api/habits/:id — detail
// ---------------------------------------------------------------------------

describe('GET /api/habits/:id', () => {
  it('returns the habit + streaks + completionsLast90Days', async () => {
    const h = await makeHabit({ ownerUserId: userId, name: 'Read' });

    const res = await showGET(getRequest({ url: showUrl(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.habit.id).toBe(h.id);
    expect(body.habit.name).toBe('Read');
    expect(body.habit.completionsLast90Days).toEqual([]);
    expect(body.habit.currentStreak).toBe(0);
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

  it('returns 404 (not 403) for a habit owned by another user — prevents id probing', async () => {
    const h = await makeHabit({ ownerUserId: otherId });

    const res = await showGET(getRequest({ url: showUrl(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });

    expect(res.status).toBe(404);
  });

  it('returns 404 for an archived habit', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      archivedAt: new Date(),
    });

    const res = await showGET(getRequest({ url: showUrl(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });

    expect(res.status).toBe(404);
  });

  it('includes category + location in the detail response', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      category: 'Wellness',
      location: 'home',
    });

    const res = await showGET(getRequest({ url: showUrl(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.habit.category).toBe('Wellness');
    expect(body.habit.location).toBe('home');
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/habits/:id — update
// ---------------------------------------------------------------------------

describe('PATCH /api/habits/:id', () => {
  it('updates name', async () => {
    const h = await makeHabit({ ownerUserId: userId, name: 'Old' });

    const res = await updatePATCH(
      jsonRequest({ url: showUrl(h.id), body: { name: 'New' } }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.habit.name).toBe('New');
  });

  it('updates description to null', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      description: 'before',
    });

    const res = await updatePATCH(
      jsonRequest({ url: showUrl(h.id), body: { description: null } }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.habit.description).toBeNull();
  });

  it('updates timezone', async () => {
    const h = await makeHabit({ ownerUserId: userId, timezone: 'UTC' });
    const res = await updatePATCH(
      jsonRequest({
        url: showUrl(h.id),
        body: { timezone: 'America/Los_Angeles' },
      }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.habit.timezone).toBe('America/Los_Angeles');
  });

  it('updates cadence from daily to weekly_count', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      cadence: { kind: 'daily' },
    });

    const res = await updatePATCH(
      jsonRequest({
        url: showUrl(h.id),
        body: { cadence: { kind: 'weekly_count', perWeek: 3 } },
      }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.habit.cadence).toEqual({
      kind: 'weekly_count',
      perWeek: 3,
      weekStart: 0,
    });
  });

  it('returns 404 for habits owned by another user', async () => {
    const h = await makeHabit({ ownerUserId: otherId, name: 'Bobs' });

    const res = await updatePATCH(
      jsonRequest({ url: showUrl(h.id), body: { name: 'Hacked' } }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 for an empty body', async () => {
    const h = await makeHabit({ ownerUserId: userId });

    const res = await updatePATCH(
      jsonRequest({ url: showUrl(h.id), body: {} }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 invalid_json for non-JSON', async () => {
    const h = await makeHabit({ ownerUserId: userId });

    const res = await updatePATCH(
      jsonRequest({ url: showUrl(h.id), body: 'nope' }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });

  it('returns 400 validation_error for invalid cadence in update', async () => {
    const h = await makeHabit({ ownerUserId: userId });
    const res = await updatePATCH(
      jsonRequest({
        url: showUrl(h.id),
        body: { cadence: { kind: 'unknown' } },
      }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(400);
  });

  it('returns the recomputed habit detail (with streaks + 90-day window)', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      createdAt: new Date('2026-01-01T12:00:00Z'),
    });
    await makeHabitCompletion({ habitId: h.id, userId, date: '2026-05-17' });

    const res = await updatePATCH(
      jsonRequest({ url: showUrl(h.id), body: { name: 'Renamed' } }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.habit.name).toBe('Renamed');
    expect(body.habit.completionsLast90Days).toBeDefined();
    expect(body.habit.totalCompletions).toBe(1);
  });

  it('adds category + location to a habit that lacks them', async () => {
    const h = await makeHabit({ ownerUserId: userId });

    const res = await updatePATCH(
      jsonRequest({
        url: showUrl(h.id),
        body: { category: 'Fitness', location: 'gym' },
      }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.habit.category).toBe('Fitness');
    expect(body.habit.location).toBe('gym');
  });

  it('clears category/location by setting them to null', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      category: 'Fitness',
      location: 'gym',
    });

    const res = await updatePATCH(
      jsonRequest({
        url: showUrl(h.id),
        body: { category: null, location: null },
      }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.habit.category).toBeNull();
    expect(body.habit.location).toBeNull();
  });

  it('treats empty-string category/location as a null-clear on update', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      category: 'Fitness',
      location: 'gym',
    });

    const res = await updatePATCH(
      jsonRequest({
        url: showUrl(h.id),
        body: { category: '', location: '' },
      }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.habit.category).toBeNull();
    expect(body.habit.location).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/habits/:id — soft delete
// ---------------------------------------------------------------------------

describe('DELETE /api/habits/:id', () => {
  it('soft-deletes (sets archivedAt) and habit vanishes from list', async () => {
    const h = await makeHabit({ ownerUserId: userId, name: 'Doomed' });

    const delRes = await deleteDELETE(
      jsonRequest({ url: showUrl(h.id) }),
      { params: Promise.resolve({ id: h.id }) },
    );
    expect(delRes.status).toBe(200);

    // Still in DB (soft delete).
    expect(await countHabits()).toBe(1);

    // But not in list / not in GET.
    const listRes = await listGET(getRequest({ url: LIST_URL }), {
      params: Promise.resolve({}),
    });
    const listBody = await listRes.json();
    expect(listBody.habits).toHaveLength(0);

    const showRes = await showGET(getRequest({ url: showUrl(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });
    expect(showRes.status).toBe(404);
  });

  it('returns 404 for habits owned by another user', async () => {
    const h = await makeHabit({ ownerUserId: otherId, name: 'Bobs' });

    const res = await deleteDELETE(jsonRequest({ url: showUrl(h.id) }), {
      params: Promise.resolve({ id: h.id }),
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
