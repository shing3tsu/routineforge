/**
 * Integration tests — POST /api/habits/:id/duplicate
 *
 * Covers:
 *   - 401 unauthenticated
 *   - 404 missing habit
 *   - 404 foreign (other-user) habit — id probing protection
 *   - 404 archived habit
 *   - successful clone (each cadence variant: daily, weekly_count, specific_weekdays)
 *   - completions are NOT cloned (streaks reset on the new row)
 *   - name truncation at the 100-char column cap
 *   - response shape mirrors POST /api/habits
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

import { POST as duplicatePOST } from '@/app/api/habits/[id]/duplicate/route';
import {
  resetDb,
  makeUser,
  makeHabit,
  makeHabitCompletion,
  countHabits,
  countHabitCompletions,
} from '@/__tests__/helpers/db';
import { jsonRequest } from '@/__tests__/helpers/request';
import { db } from '@/__tests__/helpers/db';
import { habits } from '@/db/schema';
import { eq } from 'drizzle-orm';

const VALID_TOKEN = 'test-owner-token-must-be-at-least-sixteen-chars';
const OWNER_EMAIL = 'owner@example.com';

function url(id: string) {
  return `http://localhost:3000/api/habits/${id}/duplicate`;
}

let userId: string;
let otherId: string;

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  authMock.mockResolvedValue(null);
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

describe('POST /api/habits/:id/duplicate — auth', () => {
  it('returns 401 unauthenticated when no session and no Authorization header', async () => {
    const h = await makeHabit({ ownerUserId: userId, name: 'Read' });
    const res = await duplicatePOST(jsonRequest({ url: url(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthenticated');
  });
});

describe('POST /api/habits/:id/duplicate — not-found cases', () => {
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

  it('returns 404 (NOT 403) for a habit owned by another user', async () => {
    const h = await makeHabit({ ownerUserId: otherId, name: 'Bobs' });
    const res = await duplicatePOST(jsonRequest({ url: url(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for an archived habit', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      name: 'Old',
      archivedAt: new Date(),
    });
    const res = await duplicatePOST(jsonRequest({ url: url(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/habits/:id/duplicate — successful clone', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: userId } });
  });

  it('clones a daily habit with all fields preserved', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      name: 'Meditate',
      description: 'Daily morning meditation',
      timezone: 'America/Los_Angeles',
      cadence: { kind: 'daily' },
      category: 'Wellness',
      location: 'home',
    });

    const res = await duplicatePOST(jsonRequest({ url: url(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(body.habit.id).not.toBe(h.id);
    expect(body.habit.ownerUserId).toBe(userId);
    expect(body.habit.name).toBe('Meditate (copy)');
    expect(body.habit.description).toBe('Daily morning meditation');
    expect(body.habit.timezone).toBe('America/Los_Angeles');
    expect(body.habit.cadence).toEqual({ kind: 'daily' });
    expect(body.habit.category).toBe('Wellness');
    expect(body.habit.location).toBe('home');
    expect(body.habit.archivedAt).toBeNull();

    // Streak fields all zero / null on a fresh clone.
    expect(body.habit.currentStreak).toBe(0);
    expect(body.habit.longestStreak).toBe(0);
    expect(body.habit.totalCompletions).toBe(0);
    expect(body.habit.lastCompletedDate).toBeNull();

    // Two habits in DB now (original + clone).
    expect(await countHabits()).toBe(2);
  });

  it('clones a weekly_count habit preserving perWeek + weekStart', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      name: 'Gym',
      cadence: { kind: 'weekly_count', perWeek: 3, weekStart: 0 },
    });

    const res = await duplicatePOST(jsonRequest({ url: url(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.habit.cadence).toEqual({
      kind: 'weekly_count',
      perWeek: 3,
      weekStart: 0,
    });
    expect(body.habit.name).toBe('Gym (copy)');
  });

  it('clones a specific_weekdays habit preserving the weekdays array', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      name: 'Climb',
      cadence: { kind: 'specific_weekdays', weekdays: [0, 2, 4] },
    });

    const res = await duplicatePOST(jsonRequest({ url: url(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.habit.cadence).toEqual({
      kind: 'specific_weekdays',
      weekdays: [0, 2, 4],
    });
  });

  it('does NOT clone habit completions — streaks start fresh', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      name: 'Read',
      cadence: { kind: 'daily' },
    });
    // Seed a couple of completions on the original.
    await makeHabitCompletion({ habitId: h.id, userId, date: '2026-05-17' });
    await makeHabitCompletion({ habitId: h.id, userId, date: '2026-05-18' });
    expect(await countHabitCompletions()).toBe(2);

    const res = await duplicatePOST(jsonRequest({ url: url(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();

    // Still just the 2 original completions; the clone has none.
    expect(await countHabitCompletions()).toBe(2);
    expect(body.habit.totalCompletions).toBe(0);
    expect(body.habit.lastCompletedDate).toBeNull();
    expect(body.habit.currentStreak).toBe(0);
    expect(body.habit.longestStreak).toBe(0);
  });

  it('preserves null description / category / location on clone', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      name: 'Bare',
      description: null,
      category: null,
      location: null,
    });
    const res = await duplicatePOST(jsonRequest({ url: url(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });
    const body = await res.json();
    expect(body.habit.description).toBeNull();
    expect(body.habit.category).toBeNull();
    expect(body.habit.location).toBeNull();
  });

  it('truncates the cloned name when the original is at the 100-char boundary', async () => {
    const original = 'A'.repeat(100);
    const h = await makeHabit({ ownerUserId: userId, name: original });

    const res = await duplicatePOST(jsonRequest({ url: url(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.habit.name.length).toBe(100);
    expect(body.habit.name.endsWith(' (copy)')).toBe(true);
    expect(body.habit.name).toBe('A'.repeat(93) + ' (copy)');
  });

  it('does NOT truncate when the resulting name fits exactly (93 + suffix = 100)', async () => {
    const original = 'C'.repeat(93);
    const h = await makeHabit({ ownerUserId: userId, name: original });

    const res = await duplicatePOST(jsonRequest({ url: url(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });
    const body = await res.json();
    expect(body.habit.name.length).toBe(100);
    expect(body.habit.name).toBe('C'.repeat(93) + ' (copy)');
  });

  it('persists the new row (visible in the habits table)', async () => {
    const h = await makeHabit({ ownerUserId: userId, name: 'X' });
    const res = await duplicatePOST(jsonRequest({ url: url(h.id) }), {
      params: Promise.resolve({ id: h.id }),
    });
    const body = await res.json();
    const newId = body.habit.id as string;

    const [persisted] = await db
      .select()
      .from(habits)
      .where(eq(habits.id, newId))
      .limit(1);
    expect(persisted).toBeDefined();
    expect(persisted!.name).toBe('X (copy)');
    expect(persisted!.archivedAt).toBeNull();
  });
});

describe('POST /api/habits/:id/duplicate — owner-token auth', () => {
  it('allows owner-token to duplicate a habit owned by the owner user', async () => {
    const owner = await makeUser({ email: OWNER_EMAIL, verified: true });
    const h = await makeHabit({
      ownerUserId: owner.id,
      name: 'OwnerHabit',
      cadence: { kind: 'daily' },
    });

    const res = await duplicatePOST(
      jsonRequest({
        url: url(h.id),
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      }),
      { params: Promise.resolve({ id: h.id }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.habit.name).toBe('OwnerHabit (copy)');
    expect(body.habit.ownerUserId).toBe(owner.id);
  });
});
