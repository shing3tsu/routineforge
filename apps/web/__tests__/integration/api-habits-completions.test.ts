/**
 * Integration tests — /api/habits/:id/completions
 *
 *   POST   { date }  → 201 + idempotent on (habit, user, date)
 *   DELETE { date }  → 204 always
 *
 * Critical:
 *   - Idempotency: same date twice = one row, both return 201
 *   - DELETE always 204 even when no row to remove
 *   - Date validation matches the routines completion schema
 *   - 404 cross-user / cross-habit isolation
 *   - The stored date is what the client sent (route does NOT transform tz)
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
  POST as completionsPOST,
  DELETE as completionsDELETE,
} from '@/app/api/habits/[id]/completions/route';
import {
  resetDb,
  makeUser,
  makeHabit,
  countHabitCompletions,
} from '@/__tests__/helpers/db';
import { jsonRequest } from '@/__tests__/helpers/request';

const VALID_TOKEN = 'test-owner-token-must-be-at-least-sixteen-chars';
const OWNER_EMAIL = 'owner@example.com';

function compUrl(habitId: string) {
  return `http://localhost:3000/api/habits/${habitId}/completions`;
}

let userId: string;
let otherId: string;
let habitId: string;

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
  const h = await makeHabit({
    ownerUserId: userId,
    timezone: 'America/Los_Angeles',
  });
  habitId = h.id;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// POST /api/habits/:id/completions — idempotent
// ---------------------------------------------------------------------------

describe('POST /api/habits/:id/completions', () => {
  it('marks habit done and returns 201 with the completion row + streaks', async () => {
    const res = await completionsPOST(
      jsonRequest({ url: compUrl(habitId), body: { date: '2026-05-17' } }),
      { params: Promise.resolve({ id: habitId }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.completion.habitId).toBe(habitId);
    expect(body.completion.userId).toBe(userId);
    expect(body.completion.date).toBe('2026-05-17');
    expect(body.streaks).toBeDefined();
    expect(body.streaks).toHaveProperty('currentStreak');
    expect(body.streaks).toHaveProperty('longestStreak');
    expect(body.streaks).toHaveProperty('totalCompletions', 1);
    expect(body.streaks).toHaveProperty('lastCompletedDate', '2026-05-17');

    expect(await countHabitCompletions()).toBe(1);
  });

  it('is idempotent — second POST with same date returns 201, only one row exists', async () => {
    const r1 = await completionsPOST(
      jsonRequest({ url: compUrl(habitId), body: { date: '2026-05-17' } }),
      { params: Promise.resolve({ id: habitId }) },
    );
    expect(r1.status).toBe(201);

    const r2 = await completionsPOST(
      jsonRequest({ url: compUrl(habitId), body: { date: '2026-05-17' } }),
      { params: Promise.resolve({ id: habitId }) },
    );
    expect(r2.status).toBe(201);

    expect(await countHabitCompletions()).toBe(1);

    // Both responses should return the SAME row (since onConflictDoNothing means
    // the second insert is a no-op and we read back the original row).
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.completion.id).toBe(b2.completion.id);
    expect(b1.completion.completedAt).toBe(b2.completion.completedAt);
  });

  it('stores the date verbatim regardless of habit timezone (client is responsible for tz)', async () => {
    // The route does NOT do tz conversion. Whatever date YYYY-MM-DD the client
    // sends is what gets stored. (Per backend's notes, the CLI computes local
    // date server-side; the web client should do the same.)
    const res = await completionsPOST(
      jsonRequest({ url: compUrl(habitId), body: { date: '2026-12-31' } }),
      { params: Promise.resolve({ id: habitId }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.completion.date).toBe('2026-12-31');
  });

  it('returns 400 validation_error for malformed date', async () => {
    const res = await completionsPOST(
      jsonRequest({ url: compUrl(habitId), body: { date: 'today' } }),
      { params: Promise.resolve({ id: habitId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 validation_error for non-real calendar date', async () => {
    const res = await completionsPOST(
      jsonRequest({ url: compUrl(habitId), body: { date: '2026-02-30' } }),
      { params: Promise.resolve({ id: habitId }) },
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 invalid_json for non-JSON body', async () => {
    const res = await completionsPOST(
      jsonRequest({ url: compUrl(habitId), body: 'nope' }),
      { params: Promise.resolve({ id: habitId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });

  it('returns 400 validation_error when date is missing', async () => {
    const res = await completionsPOST(
      jsonRequest({ url: compUrl(habitId), body: {} }),
      { params: Promise.resolve({ id: habitId }) },
    );

    expect(res.status).toBe(400);
  });

  it('returns 404 when habit is owned by another user', async () => {
    const h = await makeHabit({ ownerUserId: otherId });
    const res = await completionsPOST(
      jsonRequest({ url: compUrl(h.id), body: { date: '2026-05-17' } }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(404);
  });

  it('returns 404 when habit is archived', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      archivedAt: new Date(),
    });
    const res = await completionsPOST(
      jsonRequest({ url: compUrl(h.id), body: { date: '2026-05-17' } }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-existent habit id', async () => {
    const fake = '00000000-0000-0000-0000-000000000099';
    const res = await completionsPOST(
      jsonRequest({ url: compUrl(fake), body: { date: '2026-05-17' } }),
      { params: Promise.resolve({ id: fake }) },
    );

    expect(res.status).toBe(404);
  });

  it('does not allow inserting a completion for another user — completion belongs to the resolved user', async () => {
    // Even if owner-token-authed, the completion is scoped to (habit, OWNER user id),
    // not the other user. Cross-user check happens via findOwnedHabit.
    const otherHabit = await makeHabit({ ownerUserId: otherId });

    const res = await completionsPOST(
      jsonRequest({
        url: compUrl(otherHabit.id),
        body: { date: '2026-05-17' },
      }),
      { params: Promise.resolve({ id: otherHabit.id }) },
    );

    expect(res.status).toBe(404);
    expect(await countHabitCompletions()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/habits/:id/completions — always 204
// ---------------------------------------------------------------------------

describe('DELETE /api/habits/:id/completions', () => {
  it('returns 204 and removes the completion', async () => {
    await completionsPOST(
      jsonRequest({ url: compUrl(habitId), body: { date: '2026-05-17' } }),
      { params: Promise.resolve({ id: habitId }) },
    );
    expect(await countHabitCompletions()).toBe(1);

    const res = await completionsDELETE(
      jsonRequest({ url: compUrl(habitId), body: { date: '2026-05-17' } }),
      { params: Promise.resolve({ id: habitId }) },
    );

    expect(res.status).toBe(204);
    expect(await countHabitCompletions()).toBe(0);
  });

  it('returns 204 even when no completion exists for the date — idempotent', async () => {
    const res = await completionsDELETE(
      jsonRequest({ url: compUrl(habitId), body: { date: '2026-05-17' } }),
      { params: Promise.resolve({ id: habitId }) },
    );

    expect(res.status).toBe(204);
    expect(await countHabitCompletions()).toBe(0);
  });

  it('only removes the completion for the matching date — leaves others alone', async () => {
    await completionsPOST(
      jsonRequest({ url: compUrl(habitId), body: { date: '2026-05-17' } }),
      { params: Promise.resolve({ id: habitId }) },
    );
    await completionsPOST(
      jsonRequest({ url: compUrl(habitId), body: { date: '2026-05-18' } }),
      { params: Promise.resolve({ id: habitId }) },
    );
    expect(await countHabitCompletions()).toBe(2);

    const res = await completionsDELETE(
      jsonRequest({ url: compUrl(habitId), body: { date: '2026-05-17' } }),
      { params: Promise.resolve({ id: habitId }) },
    );

    expect(res.status).toBe(204);
    expect(await countHabitCompletions()).toBe(1);
  });

  it('returns 400 validation_error for malformed date', async () => {
    const res = await completionsDELETE(
      jsonRequest({ url: compUrl(habitId), body: { date: 'broken' } }),
      { params: Promise.resolve({ id: habitId }) },
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 invalid_json for non-JSON body', async () => {
    const res = await completionsDELETE(
      jsonRequest({ url: compUrl(habitId), body: 'nope' }),
      { params: Promise.resolve({ id: habitId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });

  it('returns 404 when habit is owned by another user', async () => {
    const h = await makeHabit({ ownerUserId: otherId });

    const res = await completionsDELETE(
      jsonRequest({ url: compUrl(h.id), body: { date: '2026-05-17' } }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Cascade: deleting a habit removes its completions
// ---------------------------------------------------------------------------

describe('cascade: deleting a habit removes its completion rows', () => {
  it('CASCADE removes completions when the habit row is deleted (raw delete)', async () => {
    await completionsPOST(
      jsonRequest({ url: compUrl(habitId), body: { date: '2026-05-17' } }),
      { params: Promise.resolve({ id: habitId }) },
    );
    expect(await countHabitCompletions()).toBe(1);

    // Hard-delete the habit row directly to test the FK cascade.
    const { db } = await import('@/__tests__/helpers/db');
    const { habits } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    await db.delete(habits).where(eq(habits.id, habitId));

    expect(await countHabitCompletions()).toBe(0);
  });

  it('soft delete via DELETE /api/habits/:id leaves completions intact (only archivedAt is set)', async () => {
    await completionsPOST(
      jsonRequest({ url: compUrl(habitId), body: { date: '2026-05-17' } }),
      { params: Promise.resolve({ id: habitId }) },
    );
    expect(await countHabitCompletions()).toBe(1);

    // Soft-delete the habit (sets archivedAt).
    const { DELETE: deleteDELETE } = await import('@/app/api/habits/[id]/route');
    const res = await deleteDELETE(
      jsonRequest({ url: `http://localhost:3000/api/habits/${habitId}` }),
      { params: Promise.resolve({ id: habitId }) },
    );
    expect(res.status).toBe(200);

    // Completions are NOT deleted (soft delete preserves history).
    expect(await countHabitCompletions()).toBe(1);
  });
});
