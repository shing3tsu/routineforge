/**
 * Integration tests — /api/routines/:id/completions
 *
 *   GET    ?date=YYYY-MM-DD  → list completions for that user/date
 *   POST   { stepId, date }  → idempotent insert
 *   DELETE { stepId, date }  → always 204
 *
 * Priority cases:
 *   - POST twice for same (stepId, date) → both return ok, only one row
 *   - DELETE for non-existent (stepId, date) → 204
 *   - Cascade: deleting a step removes its completions
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
  GET as completionsGET,
  POST as completionsPOST,
  DELETE as completionsDELETE,
} from '@/app/api/routines/[id]/completions/route';
import { DELETE as stepDELETE } from '@/app/api/routines/[id]/steps/[stepId]/route';
import {
  resetDb,
  makeUser,
  makeRoutine,
  makeStep,
  countCompletions,
} from '@/__tests__/helpers/db';
import { jsonRequest, getRequest } from '@/__tests__/helpers/request';

const VALID_TOKEN = 'test-owner-token-must-be-at-least-sixteen-chars';
const OWNER_EMAIL = 'owner@example.com';

function compUrl(routineId: string, q?: string) {
  return `http://localhost:3000/api/routines/${routineId}/completions${q ?? ''}`;
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
  const r = await makeRoutine({
    ownerUserId: userId,
    timezone: 'America/Los_Angeles',
  });
  routineId = r.id;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// GET /api/routines/:id/completions
// ---------------------------------------------------------------------------

describe('GET /api/routines/:id/completions', () => {
  it('returns an empty list when no completions exist', async () => {
    const res = await completionsGET(
      getRequest({ url: compUrl(routineId, '?date=2026-05-17') }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, completions: [] });
  });

  it('returns completions for the requested date only (date scoping)', async () => {
    const s = await makeStep({ routineId, weekday: 0 });

    // Mark complete on two dates.
    await completionsPOST(
      jsonRequest({
        url: compUrl(routineId),
        body: { stepId: s.id, date: '2026-05-17' },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );
    await completionsPOST(
      jsonRequest({
        url: compUrl(routineId),
        body: { stepId: s.id, date: '2026-05-18' },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    const res = await completionsGET(
      getRequest({ url: compUrl(routineId, '?date=2026-05-17') }),
      { params: Promise.resolve({ id: routineId }) },
    );

    const body = await res.json();
    expect(body.completions).toHaveLength(1);
    expect(body.completions[0].stepId).toBe(s.id);
  });

  it('returns completions only for the resolved user (user scoping)', async () => {
    const s = await makeStep({ routineId, weekday: 0 });

    // Insert a completion for the OTHER user directly (no route call).
    const { makeCompletion } = await import('@/__tests__/helpers/db');
    await makeCompletion({
      stepId: s.id,
      userId: otherId,
      date: '2026-05-17',
      routineId,
    });

    const res = await completionsGET(
      getRequest({ url: compUrl(routineId, '?date=2026-05-17') }),
      { params: Promise.resolve({ id: routineId }) },
    );

    const body = await res.json();
    expect(body.completions).toEqual([]);
  });

  it('returns 400 validation_error for missing date', async () => {
    const res = await completionsGET(
      getRequest({ url: compUrl(routineId) }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 validation_error for unreal date', async () => {
    const res = await completionsGET(
      getRequest({ url: compUrl(routineId, '?date=2026-02-30') }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
  });

  it('returns 404 when routine is owned by another user', async () => {
    const r = await makeRoutine({ ownerUserId: otherId });
    const res = await completionsGET(
      getRequest({ url: compUrl(r.id, '?date=2026-05-17') }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/routines/:id/completions — idempotent
// ---------------------------------------------------------------------------

describe('POST /api/routines/:id/completions', () => {
  it('marks a step done and returns 201 with the completion row', async () => {
    const s = await makeStep({ routineId, weekday: 0 });

    const res = await completionsPOST(
      jsonRequest({
        url: compUrl(routineId),
        body: { stepId: s.id, date: '2026-05-17' },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.completion.stepId).toBe(s.id);
    expect(body.completion.userId).toBe(userId);
    expect(body.completion.date).toBe('2026-05-17');
    expect(await countCompletions()).toBe(1);
  });

  it('is idempotent — second POST with same (stepId, date) returns 201 and only one row', async () => {
    const s = await makeStep({ routineId, weekday: 0 });

    const r1 = await completionsPOST(
      jsonRequest({
        url: compUrl(routineId),
        body: { stepId: s.id, date: '2026-05-17' },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );
    expect(r1.status).toBe(201);

    const r2 = await completionsPOST(
      jsonRequest({
        url: compUrl(routineId),
        body: { stepId: s.id, date: '2026-05-17' },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );
    expect(r2.status).toBe(201);

    // Only one row total.
    expect(await countCompletions()).toBe(1);

    // The second response should return the original completion's completedAt.
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b2.completion.completedAt).toBe(b1.completion.completedAt);
  });

  it('returns 400 step_not_in_routine when stepId belongs to a different routine', async () => {
    const otherRoutine = await makeRoutine({ ownerUserId: userId });
    const otherStep = await makeStep({ routineId: otherRoutine.id, weekday: 0 });

    const res = await completionsPOST(
      jsonRequest({
        url: compUrl(routineId),
        body: { stepId: otherStep.id, date: '2026-05-17' },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('step_not_in_routine');
  });

  it('accepts a completion date that does not match the step weekday', async () => {
    // Step is for Monday (weekday 0); we mark complete on a Saturday date.
    const s = await makeStep({ routineId, weekday: 0 });

    const res = await completionsPOST(
      jsonRequest({
        url: compUrl(routineId),
        body: { stepId: s.id, date: '2026-05-16' }, // a Saturday
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    // Per spec the route does not constrain dates by weekday — open question
    // documented in backend log. Test locks in current behavior.
    expect(res.status).toBe(201);
  });

  it('returns 400 validation_error for malformed date', async () => {
    const s = await makeStep({ routineId, weekday: 0 });

    const res = await completionsPOST(
      jsonRequest({
        url: compUrl(routineId),
        body: { stepId: s.id, date: 'today' },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 invalid_json for non-JSON body', async () => {
    const res = await completionsPOST(
      jsonRequest({ url: compUrl(routineId), body: 'nope' }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });

  it('returns 404 when routine is owned by another user', async () => {
    const r = await makeRoutine({ ownerUserId: otherId });
    const s = await makeStep({ routineId: r.id, weekday: 0 });

    const res = await completionsPOST(
      jsonRequest({
        url: compUrl(r.id),
        body: { stepId: s.id, date: '2026-05-17' },
      }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/routines/:id/completions — always 204
// ---------------------------------------------------------------------------

describe('DELETE /api/routines/:id/completions', () => {
  it('returns 204 and removes the completion row', async () => {
    const s = await makeStep({ routineId, weekday: 0 });

    await completionsPOST(
      jsonRequest({
        url: compUrl(routineId),
        body: { stepId: s.id, date: '2026-05-17' },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );
    expect(await countCompletions()).toBe(1);

    const res = await completionsDELETE(
      jsonRequest({
        url: compUrl(routineId),
        body: { stepId: s.id, date: '2026-05-17' },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(204);
    expect(await countCompletions()).toBe(0);
  });

  it('returns 204 even when no completion exists for (stepId, date) — idempotent', async () => {
    const s = await makeStep({ routineId, weekday: 0 });

    const res = await completionsDELETE(
      jsonRequest({
        url: compUrl(routineId),
        body: { stepId: s.id, date: '2026-05-17' },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(204);
    expect(await countCompletions()).toBe(0);
  });

  it('returns 400 validation_error for malformed date', async () => {
    const s = await makeStep({ routineId, weekday: 0 });

    const res = await completionsDELETE(
      jsonRequest({
        url: compUrl(routineId),
        body: { stepId: s.id, date: 'broken' },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 invalid_json for non-JSON body', async () => {
    const res = await completionsDELETE(
      jsonRequest({ url: compUrl(routineId), body: 'nope' }),
      { params: Promise.resolve({ id: routineId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });

  it('returns 404 when routine is owned by another user', async () => {
    const r = await makeRoutine({ ownerUserId: otherId });
    const s = await makeStep({ routineId: r.id, weekday: 0 });

    const res = await completionsDELETE(
      jsonRequest({
        url: compUrl(r.id),
        body: { stepId: s.id, date: '2026-05-17' },
      }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Cascade behavior
// ---------------------------------------------------------------------------

describe('cascade: deleting a step removes its completions', () => {
  it('removes completion rows when their step is deleted', async () => {
    const s = await makeStep({ routineId, weekday: 0 });

    await completionsPOST(
      jsonRequest({
        url: compUrl(routineId),
        body: { stepId: s.id, date: '2026-05-17' },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );
    await completionsPOST(
      jsonRequest({
        url: compUrl(routineId),
        body: { stepId: s.id, date: '2026-05-18' },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );
    expect(await countCompletions()).toBe(2);

    const stepUrl = `http://localhost:3000/api/routines/${routineId}/steps/${s.id}`;
    const delRes = await stepDELETE(
      jsonRequest({ url: stepUrl }),
      { params: Promise.resolve({ id: routineId, stepId: s.id }) },
    );
    expect(delRes.status).toBe(200);

    // Completions cascade-deleted.
    expect(await countCompletions()).toBe(0);
  });

  it('verifies cascade ON DELETE works at the DB level (delete via raw SQL — bypasses bug)', async () => {
    // Bypasses the step DELETE route to avoid the compactPositions bug. We
    // delete the step row directly and verify that the cascade FK still
    // removes the completion. This proves the SCHEMA cascade works even
    // though the route handler is broken.
    const s = await makeStep({ routineId, weekday: 0 });

    await completionsPOST(
      jsonRequest({
        url: compUrl(routineId),
        body: { stepId: s.id, date: '2026-05-17' },
      }),
      { params: Promise.resolve({ id: routineId }) },
    );
    expect(await countCompletions()).toBe(1);

    const { db } = await import('@/__tests__/helpers/db');
    const { routineDaySteps } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    await db.delete(routineDaySteps).where(eq(routineDaySteps.id, s.id));

    expect(await countCompletions()).toBe(0);
  });
});
