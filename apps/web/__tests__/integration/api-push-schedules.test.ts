/**
 * Integration tests — /api/push/schedules + /api/push/schedules/:id
 *
 *   GET    /api/push/schedules               (list, optionally filtered)
 *   POST   /api/push/schedules               (create; ownership-checked)
 *   PATCH  /api/push/schedules/:id           (partial update)
 *   DELETE /api/push/schedules/:id           (idempotent 204)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

const authMock = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => authMock(),
}));

import {
  GET as listGET,
  POST as createPOST,
} from '@/app/api/push/schedules/route';
import {
  PATCH as updatePATCH,
  DELETE as deleteDELETE,
} from '@/app/api/push/schedules/[id]/route';
import {
  resetDb,
  makeUser,
  makeRoutine,
  makeHabit,
  makeNotificationSchedule,
  countNotificationSchedules,
} from '@/__tests__/helpers/db';
import { jsonRequest, getRequest } from '@/__tests__/helpers/request';

const LIST_URL = 'http://localhost:3000/api/push/schedules';
const showUrl = (id: string) =>
  `http://localhost:3000/api/push/schedules/${id}`;

const EMPTY_CTX = { params: Promise.resolve({}) };
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

let userId: string;
let otherId: string;

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  vi.stubEnv('OWNER_API_TOKEN', 'test-owner-token-must-be-at-least-sixteen-chars');
  vi.stubEnv('OWNER_EMAIL', 'owner@example.com');
  const u = await makeUser({ email: 'alice@example.com', verified: true });
  const o = await makeUser({ email: 'bob@example.com', verified: true });
  userId = u.id;
  otherId = o.id;
  authMock.mockResolvedValue({ user: { id: userId } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('schedules — auth', () => {
  it('returns 401 unauthenticated for GET when not signed in', async () => {
    authMock.mockResolvedValue(null);
    const res = await listGET(getRequest({ url: LIST_URL }), EMPTY_CTX);
    expect(res.status).toBe(401);
  });

  it('returns 401 unauthenticated for POST when not signed in', async () => {
    authMock.mockResolvedValue(null);
    const res = await createPOST(jsonRequest({ url: LIST_URL, body: {} }), EMPTY_CTX);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/push/schedules', () => {
  it('returns an empty list when the user has no schedules', async () => {
    const res = await listGET(getRequest({ url: LIST_URL }), EMPTY_CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.schedules).toEqual([]);
  });

  it('returns all schedules for the current user when no filter is given', async () => {
    const r1 = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const r2 = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const h1 = await makeHabit({ ownerUserId: userId, timezone: 'UTC' });
    await makeNotificationSchedule({ userId, routineId: r1.id });
    await makeNotificationSchedule({ userId, routineId: r2.id });
    await makeNotificationSchedule({ userId, habitId: h1.id });

    const res = await listGET(getRequest({ url: LIST_URL }), EMPTY_CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schedules).toHaveLength(3);
  });

  it('returns only schedules for the requested routine when filtered', async () => {
    const r1 = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const r2 = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    await makeNotificationSchedule({ userId, routineId: r1.id });
    await makeNotificationSchedule({ userId, routineId: r1.id });
    await makeNotificationSchedule({ userId, routineId: r2.id });

    const res = await listGET(
      getRequest({
        url: `${LIST_URL}?subjectType=routine&subjectId=${r1.id}`,
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schedules).toHaveLength(2);
    body.schedules.forEach((s: { routineId: string }) =>
      expect(s.routineId).toBe(r1.id),
    );
  });

  it('returns only schedules for the requested habit when filtered', async () => {
    const h1 = await makeHabit({ ownerUserId: userId, timezone: 'UTC' });
    const h2 = await makeHabit({ ownerUserId: userId, timezone: 'UTC' });
    await makeNotificationSchedule({ userId, habitId: h1.id });
    await makeNotificationSchedule({ userId, habitId: h2.id });
    await makeNotificationSchedule({ userId, habitId: h2.id });

    const res = await listGET(
      getRequest({
        url: `${LIST_URL}?subjectType=habit&subjectId=${h2.id}`,
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schedules).toHaveLength(2);
  });

  it('does not include other users\' schedules', async () => {
    const myR = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const theirR = await makeRoutine({ ownerUserId: otherId, timezone: 'UTC' });
    await makeNotificationSchedule({ userId, routineId: myR.id });
    await makeNotificationSchedule({ userId: otherId, routineId: theirR.id });

    const res = await listGET(getRequest({ url: LIST_URL }), EMPTY_CTX);
    const body = await res.json();
    expect(body.schedules).toHaveLength(1);
    expect(body.schedules[0].routineId).toBe(myR.id);
  });

  it('returns 404 when filtering by a routine owned by another user', async () => {
    const theirR = await makeRoutine({ ownerUserId: otherId, timezone: 'UTC' });
    const res = await listGET(
      getRequest({
        url: `${LIST_URL}?subjectType=routine&subjectId=${theirR.id}`,
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when filtering by an archived routine (ownership check excludes archived)', async () => {
    const archived = await makeRoutine({
      ownerUserId: userId,
      timezone: 'UTC',
      archivedAt: new Date(),
    });
    const res = await listGET(
      getRequest({
        url: `${LIST_URL}?subjectType=routine&subjectId=${archived.id}`,
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 validation_error when only subjectType is given', async () => {
    const res = await listGET(
      getRequest({ url: `${LIST_URL}?subjectType=routine` }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 validation_error when only subjectId is given', async () => {
    const res = await listGET(
      getRequest({
        url: `${LIST_URL}?subjectId=00000000-0000-0000-0000-000000000099`,
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 validation_error for invalid subjectType', async () => {
    const res = await listGET(
      getRequest({
        url: `${LIST_URL}?subjectType=unknown&subjectId=00000000-0000-0000-0000-000000000099`,
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(400);
  });

  it('returns schedules ordered by createdAt ascending', async () => {
    const r = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const s1 = await makeNotificationSchedule({
      userId,
      routineId: r.id,
      time: '08:00',
    });
    const s2 = await makeNotificationSchedule({
      userId,
      routineId: r.id,
      time: '09:00',
    });
    const res = await listGET(getRequest({ url: LIST_URL }), EMPTY_CTX);
    const body = await res.json();
    const ids = body.schedules.map((s: { id: string }) => s.id);
    expect(ids).toEqual([s1.id, s2.id]);
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe('POST /api/push/schedules', () => {
  it('creates a routine schedule with default enabled=true', async () => {
    const routine = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          subjectType: 'routine',
          subjectId: routine.id,
          time: '08:00',
          weekdays: [0, 2, 4],
        },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.schedule.routineId).toBe(routine.id);
    expect(body.schedule.habitId).toBeNull();
    expect(body.schedule.time).toBe('08:00');
    expect(body.schedule.weekdays).toEqual([0, 2, 4]);
    expect(body.schedule.enabled).toBe(true);
    expect(body.schedule.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.schedule.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(await countNotificationSchedules()).toBe(1);
  });

  it('creates a habit schedule', async () => {
    const habit = await makeHabit({ ownerUserId: userId, timezone: 'UTC' });
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          subjectType: 'habit',
          subjectId: habit.id,
          time: '07:30',
          weekdays: [6],
        },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.schedule.routineId).toBeNull();
    expect(body.schedule.habitId).toBe(habit.id);
  });

  it('respects explicit enabled: false', async () => {
    const routine = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          subjectType: 'routine',
          subjectId: routine.id,
          time: '08:00',
          weekdays: [0],
          enabled: false,
        },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.schedule.enabled).toBe(false);
  });

  it('dedupes and sorts weekdays in the response', async () => {
    const routine = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          subjectType: 'routine',
          subjectId: routine.id,
          time: '08:00',
          weekdays: [4, 0, 4, 2, 0],
        },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.schedule.weekdays).toEqual([0, 2, 4]);
  });

  it('returns 404 not_found when the routine subject belongs to another user', async () => {
    const r = await makeRoutine({ ownerUserId: otherId, timezone: 'UTC' });
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          subjectType: 'routine',
          subjectId: r.id,
          time: '08:00',
          weekdays: [0],
        },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
    expect(await countNotificationSchedules()).toBe(0);
  });

  it('returns 404 not_found when the habit subject belongs to another user', async () => {
    const h = await makeHabit({ ownerUserId: otherId, timezone: 'UTC' });
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          subjectType: 'habit',
          subjectId: h.id,
          time: '08:00',
          weekdays: [0],
        },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 not_found for an archived routine', async () => {
    const r = await makeRoutine({
      ownerUserId: userId,
      timezone: 'UTC',
      archivedAt: new Date(),
    });
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          subjectType: 'routine',
          subjectId: r.id,
          time: '08:00',
          weekdays: [0],
        },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 not_found for a non-existent subject', async () => {
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          subjectType: 'routine',
          subjectId: '00000000-0000-0000-0000-000000000099',
          time: '08:00',
          weekdays: [0],
        },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 invalid_json for non-JSON body', async () => {
    const res = await createPOST(
      jsonRequest({ url: LIST_URL, body: 'not json' }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });

  it('returns 400 validation_error for invalid time', async () => {
    const routine = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          subjectType: 'routine',
          subjectId: routine.id,
          time: '24:00',
          weekdays: [0],
        },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 validation_error for empty weekdays', async () => {
    const routine = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: {
          subjectType: 'routine',
          subjectId: routine.id,
          time: '08:00',
          weekdays: [],
        },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 validation_error for missing time/weekdays', async () => {
    const routine = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const res = await createPOST(
      jsonRequest({
        url: LIST_URL,
        body: { subjectType: 'routine', subjectId: routine.id },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

describe('PATCH /api/push/schedules/:id', () => {
  it('updates time only', async () => {
    const r = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const s = await makeNotificationSchedule({
      userId,
      routineId: r.id,
      time: '08:00',
    });

    const res = await updatePATCH(
      jsonRequest({ url: showUrl(s.id), body: { time: '09:30' } }),
      idCtx(s.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schedule.time).toBe('09:30');
    expect(body.schedule.weekdays).toEqual(s.weekdays);
    expect(body.schedule.enabled).toBe(s.enabled);
  });

  it('updates weekdays only', async () => {
    const r = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const s = await makeNotificationSchedule({
      userId,
      routineId: r.id,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    });
    const res = await updatePATCH(
      jsonRequest({ url: showUrl(s.id), body: { weekdays: [4, 0] } }),
      idCtx(s.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schedule.weekdays).toEqual([0, 4]);
  });

  it('updates enabled only', async () => {
    const r = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const s = await makeNotificationSchedule({
      userId,
      routineId: r.id,
      enabled: true,
    });
    const res = await updatePATCH(
      jsonRequest({ url: showUrl(s.id), body: { enabled: false } }),
      idCtx(s.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schedule.enabled).toBe(false);
  });

  it('updates multiple fields at once', async () => {
    const r = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const s = await makeNotificationSchedule({
      userId,
      routineId: r.id,
      time: '08:00',
      weekdays: [0, 2, 4],
      enabled: true,
    });
    const res = await updatePATCH(
      jsonRequest({
        url: showUrl(s.id),
        body: { time: '20:00', weekdays: [6], enabled: false },
      }),
      idCtx(s.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schedule.time).toBe('20:00');
    expect(body.schedule.weekdays).toEqual([6]);
    expect(body.schedule.enabled).toBe(false);
  });

  it('returns 404 not_found when the schedule belongs to another user', async () => {
    const r = await makeRoutine({ ownerUserId: otherId, timezone: 'UTC' });
    const s = await makeNotificationSchedule({
      userId: otherId,
      routineId: r.id,
    });
    const res = await updatePATCH(
      jsonRequest({ url: showUrl(s.id), body: { enabled: false } }),
      idCtx(s.id),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 not_found for a non-existent id', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000099';
    const res = await updatePATCH(
      jsonRequest({ url: showUrl(fakeId), body: { enabled: false } }),
      idCtx(fakeId),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 invalid_json for non-JSON body', async () => {
    const r = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const s = await makeNotificationSchedule({ userId, routineId: r.id });
    const res = await updatePATCH(
      jsonRequest({ url: showUrl(s.id), body: 'nope' }),
      idCtx(s.id),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });

  it('returns 400 validation_error for empty body', async () => {
    const r = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const s = await makeNotificationSchedule({ userId, routineId: r.id });
    const res = await updatePATCH(
      jsonRequest({ url: showUrl(s.id), body: {} }),
      idCtx(s.id),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 validation_error for malformed time', async () => {
    const r = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const s = await makeNotificationSchedule({ userId, routineId: r.id });
    const res = await updatePATCH(
      jsonRequest({ url: showUrl(s.id), body: { time: '9:00' } }),
      idCtx(s.id),
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/push/schedules/:id', () => {
  it('returns 204 and removes the schedule', async () => {
    const r = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
    const s = await makeNotificationSchedule({ userId, routineId: r.id });
    expect(await countNotificationSchedules()).toBe(1);

    const res = await deleteDELETE(
      jsonRequest({ url: showUrl(s.id) }),
      idCtx(s.id),
    );
    expect(res.status).toBe(204);
    expect(await countNotificationSchedules()).toBe(0);
  });

  it('returns 204 for a non-existent id (idempotent)', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000099';
    const res = await deleteDELETE(
      jsonRequest({ url: showUrl(fakeId) }),
      idCtx(fakeId),
    );
    expect(res.status).toBe(204);
  });

  it('returns 204 but does NOT delete schedules owned by another user', async () => {
    const r = await makeRoutine({ ownerUserId: otherId, timezone: 'UTC' });
    const s = await makeNotificationSchedule({
      userId: otherId,
      routineId: r.id,
    });
    const res = await deleteDELETE(
      jsonRequest({ url: showUrl(s.id) }),
      idCtx(s.id),
    );
    expect(res.status).toBe(204);
    expect(await countNotificationSchedules()).toBe(1);
  });
});
