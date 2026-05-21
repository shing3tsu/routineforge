/**
 * Integration tests — POST /api/routines/:id/steps/reorder
 *
 * Critical: mismatched id sets (extra or missing) → 400.
 * Critical: duplicates → 400.
 * Critical: ordering swap preserves no-gap, no-duplicate positions.
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

import { POST as reorderPOST } from '@/app/api/routines/[id]/steps/reorder/route';
import {
  resetDb,
  makeUser,
  makeRoutine,
  makeStep,
  findStepsByRoutineWeekday,
} from '@/__tests__/helpers/db';
import { jsonRequest } from '@/__tests__/helpers/request';

const VALID_TOKEN = 'test-owner-token-must-be-at-least-sixteen-chars';
const OWNER_EMAIL = 'owner@example.com';

function url(routineId: string) {
  return `http://localhost:3000/api/routines/${routineId}/steps/reorder`;
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

describe('POST /api/routines/:id/steps/reorder', () => {
  it('reorders steps to the supplied ordering', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });
    const c = await makeStep({ routineId, weekday: 0, position: 2, title: 'C' });

    const res = await reorderPOST(
      jsonRequest({
        url: url(routineId),
        body: { weekday: 0, stepIds: [c.id, a.id, b.id] },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(200);

    const rows = await findStepsByRoutineWeekday(routineId, 0);
    expect(rows.map((r) => r.id)).toEqual([c.id, a.id, b.id]);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
  });

  it('returns 400 mismatched_step_ids when an id is missing (subset)', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });
    await makeStep({ routineId, weekday: 0, position: 2, title: 'C' });

    const res = await reorderPOST(
      jsonRequest({
        url: url(routineId),
        body: { weekday: 0, stepIds: [a.id, b.id] }, // C missing
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('mismatched_step_ids');
  });

  it('returns 400 mismatched_step_ids when an extra id is included', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });

    const res = await reorderPOST(
      jsonRequest({
        url: url(routineId),
        body: {
          weekday: 0,
          stepIds: [a.id, b.id, '00000000-0000-0000-0000-000000000099'],
        },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('mismatched_step_ids');
  });

  it('returns 400 duplicate_step_ids when stepIds contains duplicates', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });

    const res = await reorderPOST(
      jsonRequest({
        url: url(routineId),
        body: { weekday: 0, stepIds: [a.id, b.id, a.id] },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('duplicate_step_ids');
  });

  it('returns 400 mismatched_step_ids when targeting wrong weekday', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });

    const res = await reorderPOST(
      jsonRequest({
        url: url(routineId),
        body: { weekday: 1, stepIds: [a.id, b.id] }, // Tue has no steps
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('mismatched_step_ids');
  });

  it('returns 404 when routine is owned by another user', async () => {
    const r = await makeRoutine({ ownerUserId: otherId });
    const s = await makeStep({ routineId: r.id, weekday: 0, position: 0 });

    const res = await reorderPOST(
      jsonRequest({
        url: url(r.id),
        body: { weekday: 0, stepIds: [s.id] },
      }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 validation_error when stepIds is empty', async () => {
    const res = await reorderPOST(
      jsonRequest({
        url: url(routineId),
        body: { weekday: 0, stepIds: [] },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 invalid_json for non-JSON body', async () => {
    const res = await reorderPOST(
      jsonRequest({ url: url(routineId), body: 'nope' }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });
});
