/**
 * Integration tests — /api/routines/:id/steps and /api/routines/:id/steps/:stepId
 *
 *   GET    /api/routines/:id/steps?weekday=N
 *   POST   /api/routines/:id/steps
 *   PATCH  /api/routines/:id/steps/:stepId   (title / weekday / position)
 *   DELETE /api/routines/:id/steps/:stepId   (delete + compact)
 *
 * Critical: cross-weekday move compacts source & shifts target without
 * violating the unique (routine, weekday, position) index.
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

import {
  GET as stepsListGET,
  POST as stepsCreatePOST,
} from '@/app/api/routines/[id]/steps/route';
import {
  PATCH as stepPATCH,
  DELETE as stepDELETE,
} from '@/app/api/routines/[id]/steps/[stepId]/route';
import {
  resetDb,
  makeUser,
  makeRoutine,
  makeStep,
  findStepsByRoutineWeekday,
} from '@/__tests__/helpers/db';
import { jsonRequest, getRequest } from '@/__tests__/helpers/request';

const VALID_TOKEN = 'test-owner-token-must-be-at-least-sixteen-chars';
const OWNER_EMAIL = 'owner@example.com';

function stepsUrl(routineId: string, q?: string) {
  return `http://localhost:3000/api/routines/${routineId}/steps${q ?? ''}`;
}
function stepUrl(routineId: string, stepId: string) {
  return `http://localhost:3000/api/routines/${routineId}/steps/${stepId}`;
}

let userId: string;
let otherId: string;
let routineId: string;

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
  const r = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
  routineId = r.id;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// GET /api/routines/:id/steps?weekday=N
// ---------------------------------------------------------------------------

describe('GET /api/routines/:id/steps', () => {
  it('returns steps for the requested weekday ordered by position', async () => {
    const s1 = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const s2 = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });
    await makeStep({ routineId, weekday: 3, position: 0, title: 'C' });

    const res = await stepsListGET(
      getRequest({ url: stepsUrl(routineId, '?weekday=0') }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.steps).toHaveLength(2);
    expect(body.steps.map((s: { id: string }) => s.id)).toEqual([s1.id, s2.id]);
  });

  it('returns empty array for a weekday with no steps', async () => {
    const res = await stepsListGET(
      getRequest({ url: stepsUrl(routineId, '?weekday=5') }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.steps).toEqual([]);
  });

  it('returns 400 validation_error when weekday is missing', async () => {
    const res = await stepsListGET(
      getRequest({ url: stepsUrl(routineId) }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 validation_error when weekday is out of range', async () => {
    const res = await stepsListGET(
      getRequest({ url: stepsUrl(routineId, '?weekday=9') }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
  });

  it('returns 404 when the routine is owned by another user', async () => {
    const r = await makeRoutine({ ownerUserId: otherId });
    const res = await stepsListGET(
      getRequest({ url: stepsUrl(r.id, '?weekday=0') }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/routines/:id/steps
// ---------------------------------------------------------------------------

describe('POST /api/routines/:id/steps', () => {
  it('appends a step when position is omitted', async () => {
    await makeStep({ routineId, weekday: 0, position: 0, title: 'First' });

    const res = await stepsCreatePOST(
      jsonRequest({
        url: stepsUrl(routineId),
        body: { weekday: 0, title: 'Second' },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.step.position).toBe(1);
    expect(body.step.title).toBe('Second');
  });

  it('inserts at a specified position, shifting later positions up', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });

    const res = await stepsCreatePOST(
      jsonRequest({
        url: stepsUrl(routineId),
        body: { weekday: 0, title: 'X', position: 1 },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.step.position).toBe(1);

    const rows = await findStepsByRoutineWeekday(routineId, 0);
    expect(rows.map((r) => r.title)).toEqual(['A', 'X', 'B']);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(rows.find((r) => r.id === a.id)?.position).toBe(0);
    expect(rows.find((r) => r.id === b.id)?.position).toBe(2);
  });

  it('clamps a position >= count to append', async () => {
    await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });

    const res = await stepsCreatePOST(
      jsonRequest({
        url: stepsUrl(routineId),
        body: { weekday: 0, title: 'X', position: 999 },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    const body = await res.json();
    expect(body.step.position).toBe(1);
  });

  it('returns 400 for missing title', async () => {
    const res = await stepsCreatePOST(
      jsonRequest({
        url: stepsUrl(routineId),
        body: { weekday: 0 },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
  });

  it('returns 404 when routine is owned by another user', async () => {
    const r = await makeRoutine({ ownerUserId: otherId });

    const res = await stepsCreatePOST(
      jsonRequest({
        url: stepsUrl(r.id),
        body: { weekday: 0, title: 'Sneaky' },
      }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 invalid_json for non-JSON body', async () => {
    const res = await stepsCreatePOST(
      jsonRequest({ url: stepsUrl(routineId), body: 'nope' }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/routines/:id/steps/:stepId — title / weekday / position
// ---------------------------------------------------------------------------

describe('PATCH /api/routines/:id/steps/:stepId', () => {
  it('updates only the title (no move)', async () => {
    const s = await makeStep({ routineId, weekday: 0, position: 0, title: 'Old' });

    const res = await stepPATCH(
      jsonRequest({
        url: stepUrl(routineId, s.id),
        body: { title: 'New' },
      }),
      { params: Promise.resolve({ id: routineId, stepId: s.id }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.step.title).toBe('New');
    expect(body.step.weekday).toBe(0);
    expect(body.step.position).toBe(0);
  });

  it('moves a step within the same weekday (reposition)', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });
    const c = await makeStep({ routineId, weekday: 0, position: 2, title: 'C' });

    // Move C to position 0.
    const res = await stepPATCH(
      jsonRequest({
        url: stepUrl(routineId, c.id),
        body: { position: 0 },
      }),
      { params: Promise.resolve({ id: routineId, stepId: c.id }) },
    );

    expect(res.status).toBe(200);
    const rows = await findStepsByRoutineWeekday(routineId, 0);
    expect(rows.map((r) => r.title)).toEqual(['C', 'A', 'B']);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    // Sanity on ids.
    expect(rows[0]?.id).toBe(c.id);
    expect(rows[1]?.id).toBe(a.id);
    expect(rows[2]?.id).toBe(b.id);
  });

  it('moves a step across weekdays — source compacts, target shifts', async () => {
    // Source Monday: A, B, C
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });
    const c = await makeStep({ routineId, weekday: 0, position: 2, title: 'C' });
    // Target Tuesday: T1, T2
    const t1 = await makeStep({ routineId, weekday: 1, position: 0, title: 'T1' });
    const t2 = await makeStep({ routineId, weekday: 1, position: 1, title: 'T2' });

    // Move B from Mon pos 1 to Tue pos 0.
    const res = await stepPATCH(
      jsonRequest({
        url: stepUrl(routineId, b.id),
        body: { weekday: 1, position: 0 },
      }),
      { params: Promise.resolve({ id: routineId, stepId: b.id }) },
    );

    expect(res.status).toBe(200);

    const monRows = await findStepsByRoutineWeekday(routineId, 0);
    const tueRows = await findStepsByRoutineWeekday(routineId, 1);

    // Mon compacted: A@0, C@1.
    expect(monRows).toHaveLength(2);
    expect(monRows.map((r) => r.id)).toEqual([a.id, c.id]);
    expect(monRows.map((r) => r.position)).toEqual([0, 1]);

    // Tue shifted: B@0, T1@1, T2@2.
    expect(tueRows).toHaveLength(3);
    expect(tueRows.map((r) => r.id)).toEqual([b.id, t1.id, t2.id]);
    expect(tueRows.map((r) => r.position)).toEqual([0, 1, 2]);
  });

  it('cross-weekday move appends when position omitted', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    await makeStep({ routineId, weekday: 1, position: 0, title: 'T1' });

    const res = await stepPATCH(
      jsonRequest({
        url: stepUrl(routineId, a.id),
        body: { weekday: 1 },
      }),
      { params: Promise.resolve({ id: routineId, stepId: a.id }) },
    );

    expect(res.status).toBe(200);
    const tueRows = await findStepsByRoutineWeekday(routineId, 1);
    // Appended at end.
    expect(tueRows.find((r) => r.id === a.id)?.position).toBe(1);
  });

  it('returns 404 for a step in another user routine', async () => {
    const r = await makeRoutine({ ownerUserId: otherId });
    const s = await makeStep({ routineId: r.id, weekday: 0, position: 0 });

    const res = await stepPATCH(
      jsonRequest({
        url: stepUrl(r.id, s.id),
        body: { title: 'Hacked' },
      }),
      { params: Promise.resolve({ id: r.id, stepId: s.id }) },
    );

    expect(res.status).toBe(404);
  });

  it('returns 404 for a step that does not exist', async () => {
    const fake = '00000000-0000-0000-0000-000000000099';
    const res = await stepPATCH(
      jsonRequest({
        url: stepUrl(routineId, fake),
        body: { title: 'X' },
      }),
      { params: Promise.resolve({ id: routineId, stepId: fake }) },
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 validation_error when body is empty', async () => {
    const s = await makeStep({ routineId, weekday: 0, position: 0 });

    const res = await stepPATCH(
      jsonRequest({ url: stepUrl(routineId, s.id), body: {} }),
      { params: Promise.resolve({ id: routineId, stepId: s.id }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 invalid_json for non-JSON body', async () => {
    const s = await makeStep({ routineId, weekday: 0, position: 0 });

    const res = await stepPATCH(
      jsonRequest({ url: stepUrl(routineId, s.id), body: 'nope' }),
      { params: Promise.resolve({ id: routineId, stepId: s.id }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/routines/:id/steps/:stepId — delete + compact
// ---------------------------------------------------------------------------

describe('DELETE /api/routines/:id/steps/:stepId', () => {
  it('deletes a step and compacts subsequent positions', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });
    const c = await makeStep({ routineId, weekday: 0, position: 2, title: 'C' });

    const res = await stepDELETE(
      jsonRequest({ url: stepUrl(routineId, b.id) }),
      { params: Promise.resolve({ id: routineId, stepId: b.id }) },
    );

    expect(res.status).toBe(200);

    const rows = await findStepsByRoutineWeekday(routineId, 0);
    expect(rows.map((r) => r.id)).toEqual([a.id, c.id]);
    expect(rows.map((r) => r.position)).toEqual([0, 1]);
  });

  it('deletes the only/last step', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });

    const res = await stepDELETE(
      jsonRequest({ url: stepUrl(routineId, b.id) }),
      { params: Promise.resolve({ id: routineId, stepId: b.id }) },
    );

    expect(res.status).toBe(200);

    const rows = await findStepsByRoutineWeekday(routineId, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(a.id);
  });

  it('returns 404 for a step in another user routine', async () => {
    const r = await makeRoutine({ ownerUserId: otherId });
    const s = await makeStep({ routineId: r.id, weekday: 0, position: 0 });

    const res = await stepDELETE(
      jsonRequest({ url: stepUrl(r.id, s.id) }),
      { params: Promise.resolve({ id: r.id, stepId: s.id }) },
    );

    expect(res.status).toBe(404);
  });

  it('returns 404 for a step that does not exist', async () => {
    const fake = '00000000-0000-0000-0000-000000000099';
    const res = await stepDELETE(
      jsonRequest({ url: stepUrl(routineId, fake) }),
      { params: Promise.resolve({ id: routineId, stepId: fake }) },
    );

    expect(res.status).toBe(404);
  });
});
