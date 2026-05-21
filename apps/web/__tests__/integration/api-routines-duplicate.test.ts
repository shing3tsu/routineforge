/**
 * Integration tests — POST /api/routines/:id/duplicate
 *
 * Covers:
 *   - 401 unauthenticated
 *   - 404 missing routine
 *   - 404 foreign (other-user) routine — id probing protection
 *   - 404 archived routine (clone of soft-deleted is rejected, matches GET)
 *   - successful clone with steps preserved (titles, weekdays, positions)
 *   - name truncation at the 100-char column cap
 *   - edge: clone of a routine with 0 steps
 *   - clone does NOT copy completions
 *   - clone is owned by the caller even when the route is hit via owner token
 *     against a routine the OWNER user owns
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

import { POST as duplicatePOST } from '@/app/api/routines/[id]/duplicate/route';
import {
  resetDb,
  makeUser,
  makeRoutine,
  makeStep,
  makeCompletion,
  findStepsByRoutineWeekday,
  countCompletions,
} from '@/__tests__/helpers/db';
import { jsonRequest } from '@/__tests__/helpers/request';
import { db } from '@/__tests__/helpers/db';
import { routines } from '@/db/schema';
import { eq } from 'drizzle-orm';

const VALID_TOKEN = 'test-owner-token-must-be-at-least-sixteen-chars';
const OWNER_EMAIL = 'owner@example.com';

function url(id: string) {
  return `http://localhost:3000/api/routines/${id}/duplicate`;
}

let userId: string;
let otherId: string;

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  authMock.mockResolvedValue(null); // default to unauthed; tests opt in
  vi.stubEnv('OWNER_API_TOKEN', VALID_TOKEN);
  vi.stubEnv('OWNER_EMAIL', OWNER_EMAIL);
  const user = await makeUser({ email: 'alice@example.com', verified: true });
  const other = await makeUser({ email: 'bob@example.com', verified: true });
  userId = user.id;
  otherId = other.id;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/routines/:id/duplicate — auth', () => {
  it('returns 401 unauthenticated when no session and no Authorization header', async () => {
    const r = await makeRoutine({ ownerUserId: userId, name: 'Morning' });
    const res = await duplicatePOST(jsonRequest({ url: url(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthenticated');
  });
});

describe('POST /api/routines/:id/duplicate — not-found cases', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: userId } });
  });

  it('returns 404 for a non-existent id', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000099';
    const res = await duplicatePOST(jsonRequest({ url: url(fakeId) }), {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
  });

  it('returns 404 (NOT 403) for a routine owned by another user', async () => {
    const r = await makeRoutine({ ownerUserId: otherId, name: 'Bobs' });
    const res = await duplicatePOST(jsonRequest({ url: url(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
  });

  it('returns 404 for an archived routine (mirrors GET)', async () => {
    const r = await makeRoutine({
      ownerUserId: userId,
      name: 'Old',
      archivedAt: new Date(),
    });
    const res = await duplicatePOST(jsonRequest({ url: url(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/routines/:id/duplicate — successful clone', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: userId } });
  });

  it('clones core fields with a " (copy)" suffix on the name', async () => {
    const r = await makeRoutine({
      ownerUserId: userId,
      name: 'Morning',
      description: 'Wake-up routine',
      timezone: 'America/Los_Angeles',
      category: 'Wellness',
      location: 'home',
    });

    const res = await duplicatePOST(jsonRequest({ url: url(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // New row, new id.
    expect(body.routine.id).not.toBe(r.id);
    expect(body.routine.ownerUserId).toBe(userId);
    // Name suffixed.
    expect(body.routine.name).toBe('Morning (copy)');
    // Other fields preserved.
    expect(body.routine.description).toBe('Wake-up routine');
    expect(body.routine.timezone).toBe('America/Los_Angeles');
    expect(body.routine.category).toBe('Wellness');
    expect(body.routine.location).toBe('home');
    // Soft-delete tombstone empty.
    expect(body.routine.archivedAt).toBeNull();
  });

  it('preserves null description / category / location on clone', async () => {
    const r = await makeRoutine({
      ownerUserId: userId,
      name: 'Bare',
      description: null,
      category: null,
      location: null,
    });

    const res = await duplicatePOST(jsonRequest({ url: url(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.routine.description).toBeNull();
    expect(body.routine.category).toBeNull();
    expect(body.routine.location).toBeNull();
  });

  it('clones all steps preserving weekday / position / title', async () => {
    const r = await makeRoutine({ ownerUserId: userId, name: 'R' });
    // Monday: 2 steps
    await makeStep({ routineId: r.id, weekday: 0, position: 0, title: 'Mon-A' });
    await makeStep({ routineId: r.id, weekday: 0, position: 1, title: 'Mon-B' });
    // Thursday: 1 step
    await makeStep({ routineId: r.id, weekday: 3, position: 0, title: 'Thu-A' });
    // Sunday: 1 step
    await makeStep({ routineId: r.id, weekday: 6, position: 0, title: 'Sun-A' });

    const res = await duplicatePOST(jsonRequest({ url: url(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();

    // scheduleWeekdays surfaces the cloned weekdays, sorted.
    expect(body.routine.scheduleWeekdays).toEqual([0, 3, 6]);

    // The new routine's step rows mirror the source.
    const newId = body.routine.id as string;
    const monSteps = await findStepsByRoutineWeekday(newId, 0);
    expect(monSteps.map((s) => s.title)).toEqual(['Mon-A', 'Mon-B']);
    expect(monSteps.map((s) => s.position)).toEqual([0, 1]);

    const thuSteps = await findStepsByRoutineWeekday(newId, 3);
    expect(thuSteps.map((s) => s.title)).toEqual(['Thu-A']);

    const sunSteps = await findStepsByRoutineWeekday(newId, 6);
    expect(sunSteps.map((s) => s.title)).toEqual(['Sun-A']);

    // Empty weekdays really are empty (no row carried over).
    const wedSteps = await findStepsByRoutineWeekday(newId, 2);
    expect(wedSteps).toHaveLength(0);
  });

  it('does NOT clone routine_step_completions', async () => {
    const r = await makeRoutine({ ownerUserId: userId, name: 'R' });
    const step = await makeStep({
      routineId: r.id,
      weekday: 0,
      position: 0,
      title: 'Step',
    });
    await makeCompletion({ stepId: step.id, userId, date: '2026-05-17' });
    expect(await countCompletions()).toBe(1);

    const res = await duplicatePOST(jsonRequest({ url: url(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });
    expect(res.status).toBe(201);

    // Still just the one completion on the original — none cloned for the new
    // routine. (The unique constraint includes step_id, so a clone-with-completions
    // would have to make new completion rows for the cloned step ids.)
    expect(await countCompletions()).toBe(1);
  });

  it('handles a routine with zero steps (edge case)', async () => {
    const r = await makeRoutine({ ownerUserId: userId, name: 'Empty' });

    const res = await duplicatePOST(jsonRequest({ url: url(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.routine.name).toBe('Empty (copy)');
    expect(body.routine.scheduleWeekdays).toEqual([]);

    // And no step rows leaked in.
    const newId = body.routine.id as string;
    for (let w = 0; w < 7; w++) {
      expect(await findStepsByRoutineWeekday(newId, w)).toHaveLength(0);
    }
  });

  it('truncates the cloned name when the original is at the 100-char boundary', async () => {
    // Original name exactly at the column cap (100 chars).
    const original = 'A'.repeat(100);
    const r = await makeRoutine({ ownerUserId: userId, name: original });

    const res = await duplicatePOST(jsonRequest({ url: url(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();

    // The " (copy)" suffix is 7 chars. Total must remain <= 100.
    expect(body.routine.name.length).toBe(100);
    expect(body.routine.name.endsWith(' (copy)')).toBe(true);
    // First 93 chars are the truncated original (all 'A's).
    expect(body.routine.name).toBe('A'.repeat(93) + ' (copy)');
  });

  it('truncates names just past the headroom (94 chars + suffix)', async () => {
    // 94 + 7 = 101: 1 char must be shaved.
    const original = 'B'.repeat(94);
    const r = await makeRoutine({ ownerUserId: userId, name: original });

    const res = await duplicatePOST(jsonRequest({ url: url(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });
    const body = await res.json();
    expect(body.routine.name.length).toBe(100);
    expect(body.routine.name).toBe('B'.repeat(93) + ' (copy)');
  });

  it('does NOT truncate when the resulting name fits exactly', async () => {
    // 93 + 7 = 100: fits exactly, no shaving.
    const original = 'C'.repeat(93);
    const r = await makeRoutine({ ownerUserId: userId, name: original });

    const res = await duplicatePOST(jsonRequest({ url: url(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });
    const body = await res.json();
    expect(body.routine.name.length).toBe(100);
    expect(body.routine.name).toBe('C'.repeat(93) + ' (copy)');
  });

  it('persists the new row (visible in the routines table)', async () => {
    const r = await makeRoutine({ ownerUserId: userId, name: 'X' });
    const res = await duplicatePOST(jsonRequest({ url: url(r.id) }), {
      params: Promise.resolve({ id: r.id }),
    });
    const body = await res.json();
    const newId = body.routine.id as string;

    const [persisted] = await db
      .select()
      .from(routines)
      .where(eq(routines.id, newId))
      .limit(1);

    expect(persisted).toBeDefined();
    expect(persisted!.name).toBe('X (copy)');
    expect(persisted!.archivedAt).toBeNull();
  });
});

describe('POST /api/routines/:id/duplicate — owner-token auth', () => {
  it('allows owner-token to duplicate a routine owned by the owner user', async () => {
    const owner = await makeUser({ email: OWNER_EMAIL, verified: true });
    const r = await makeRoutine({ ownerUserId: owner.id, name: 'OwnerRoutine' });

    const res = await duplicatePOST(
      jsonRequest({
        url: url(r.id),
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.routine.name).toBe('OwnerRoutine (copy)');
    expect(body.routine.ownerUserId).toBe(owner.id);
  });
});
