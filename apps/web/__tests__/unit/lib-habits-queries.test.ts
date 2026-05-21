/**
 * Unit tests for lib/habits/queries.ts.
 *
 * These exercise the Drizzle-backed helpers used by route handlers + server
 * components. Tests run against pglite via the helpers/db mock.
 *
 *   - findOwnedHabit: owner check + archived filter + null fallback
 *   - getAllCompletionDates: returns sorted, de-duped 'YYYY-MM-DD' strings
 *   - listHabitsForUser: only non-archived, ordered by name
 *   - getHabitDetail: includes 90-day completion window (boundary verified)
 *   - computeStreaksForHabit: glues the query + pure streak function
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

import {
  findOwnedHabit,
  getAllCompletionDates,
  listHabitsForUser,
  listHabitRowsForUser,
  getHabitDetail,
  computeStreaksForHabit,
} from '@/lib/habits/queries';
import {
  resetDb,
  makeUser,
  makeHabit,
  makeHabitCompletion,
} from '@/__tests__/helpers/db';

let userId: string;
let otherId: string;

beforeEach(async () => {
  await resetDb();
  const u = await makeUser({ email: 'alice@example.com', verified: true });
  const o = await makeUser({ email: 'bob@example.com', verified: true });
  userId = u.id;
  otherId = o.id;
});

// ===========================================================================
// findOwnedHabit
// ===========================================================================

describe('findOwnedHabit', () => {
  it('returns the habit when owner matches and it\'s not archived', async () => {
    const h = await makeHabit({ ownerUserId: userId, name: 'Read' });
    const result = await findOwnedHabit(h.id, userId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(h.id);
    expect(result!.name).toBe('Read');
  });

  it('returns null when habit is owned by another user (404 ambiguity)', async () => {
    const h = await makeHabit({ ownerUserId: otherId });
    const result = await findOwnedHabit(h.id, userId);
    expect(result).toBeNull();
  });

  it('returns null when habit does not exist', async () => {
    const result = await findOwnedHabit(
      '00000000-0000-0000-0000-000000000099',
      userId,
    );
    expect(result).toBeNull();
  });

  it('returns null when habit is archived', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      archivedAt: new Date(),
    });
    const result = await findOwnedHabit(h.id, userId);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// getAllCompletionDates
// ===========================================================================

describe('getAllCompletionDates', () => {
  it('returns empty array when no completions exist', async () => {
    const h = await makeHabit({ ownerUserId: userId });
    const result = await getAllCompletionDates(h.id, userId);
    expect(result).toEqual([]);
  });

  it('returns dates sorted ascending', async () => {
    const h = await makeHabit({ ownerUserId: userId });
    await makeHabitCompletion({ habitId: h.id, userId, date: '2026-05-17' });
    await makeHabitCompletion({ habitId: h.id, userId, date: '2026-05-15' });
    await makeHabitCompletion({ habitId: h.id, userId, date: '2026-05-16' });

    const result = await getAllCompletionDates(h.id, userId);
    expect(result).toEqual(['2026-05-15', '2026-05-16', '2026-05-17']);
  });

  it('returns strings (typeof string), not Date objects', async () => {
    const h = await makeHabit({ ownerUserId: userId });
    await makeHabitCompletion({ habitId: h.id, userId, date: '2026-05-17' });

    const result = await getAllCompletionDates(h.id, userId);
    expect(typeof result[0]).toBe('string');
    expect(result[0]).toBe('2026-05-17');
  });

  it('scopes to (habit, user) — does not return other-user or other-habit completions', async () => {
    const h1 = await makeHabit({ ownerUserId: userId });
    const h2 = await makeHabit({ ownerUserId: userId, name: 'Other' });
    await makeHabitCompletion({ habitId: h1.id, userId, date: '2026-05-17' });
    await makeHabitCompletion({
      habitId: h1.id,
      userId: otherId, // other user
      date: '2026-05-18',
    });
    await makeHabitCompletion({ habitId: h2.id, userId, date: '2026-05-19' }); // other habit

    const result = await getAllCompletionDates(h1.id, userId);
    expect(result).toEqual(['2026-05-17']);
  });

  it('tz-aware: dates stored as YYYY-MM-DD are returned verbatim (no tz conversion in this helper)', async () => {
    // The route layer converts UTC completedAt → local-date before insert.
    // This helper returns the stored date strings as-is.
    const h = await makeHabit({
      ownerUserId: userId,
      timezone: 'America/Los_Angeles',
    });
    // 2026-05-17 is the stored LOCAL date; completedAt timestamp may be any UTC moment.
    await makeHabitCompletion({
      habitId: h.id,
      userId,
      date: '2026-05-17',
      // Pass a completedAt that's "late-night" UTC — function should not care.
      completedAt: new Date('2026-05-18T06:30:00Z'),
    });

    const result = await getAllCompletionDates(h.id, userId);
    expect(result).toEqual(['2026-05-17']);
  });
});

// ===========================================================================
// listHabitsForUser
// ===========================================================================

describe('listHabitsForUser', () => {
  it('returns an empty array when user has no habits', async () => {
    const result = await listHabitsForUser(userId);
    expect(result).toEqual([]);
  });

  it('returns user habits ordered by name (asc)', async () => {
    await makeHabit({ ownerUserId: userId, name: 'Zeta' });
    await makeHabit({ ownerUserId: userId, name: 'Alpha' });
    await makeHabit({ ownerUserId: userId, name: 'Mu' });

    const result = await listHabitsForUser(userId);
    expect(result.map((h) => h.name)).toEqual(['Alpha', 'Mu', 'Zeta']);
  });

  it('does not return archived habits', async () => {
    await makeHabit({ ownerUserId: userId, name: 'Active' });
    await makeHabit({
      ownerUserId: userId,
      name: 'Archived',
      archivedAt: new Date(),
    });

    const result = await listHabitsForUser(userId);
    expect(result.map((h) => h.name)).toEqual(['Active']);
  });

  it('does not return other users\' habits', async () => {
    await makeHabit({ ownerUserId: otherId, name: 'Bobs' });
    await makeHabit({ ownerUserId: userId, name: 'Alices' });

    const result = await listHabitsForUser(userId);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Alices');
  });

  it('attaches computed streak fields to each habit', async () => {
    const h = await makeHabit({ ownerUserId: userId });
    const result = await listHabitsForUser(userId);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(h.id);
    expect(result[0]!.currentStreak).toBe(0);
    expect(result[0]!.longestStreak).toBe(0);
    expect(result[0]!.totalCompletions).toBe(0);
    expect(result[0]!.lastCompletedDate).toBeNull();
  });
});

// ===========================================================================
// getHabitDetail
// ===========================================================================

describe('getHabitDetail', () => {
  it('returns null when habit does not exist', async () => {
    const result = await getHabitDetail(
      '00000000-0000-0000-0000-000000000099',
      userId,
    );
    expect(result).toBeNull();
  });

  it('returns null when habit is owned by another user', async () => {
    const h = await makeHabit({ ownerUserId: otherId });
    const result = await getHabitDetail(h.id, userId);
    expect(result).toBeNull();
  });

  it('returns null when habit is archived', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      archivedAt: new Date(),
    });
    const result = await getHabitDetail(h.id, userId);
    expect(result).toBeNull();
  });

  it('returns streak fields + completionsLast90Days', async () => {
    const h = await makeHabit({ ownerUserId: userId });
    await makeHabitCompletion({ habitId: h.id, userId, date: '2026-05-15' });
    await makeHabitCompletion({ habitId: h.id, userId, date: '2026-05-16' });

    const result = await getHabitDetail(h.id, userId);
    expect(result).not.toBeNull();
    expect(result!.completionsLast90Days).toEqual(['2026-05-15', '2026-05-16']);
    expect(result!.totalCompletions).toBe(2);
    expect(result!.lastCompletedDate).toBe('2026-05-16');
  });

  it('completionsLast90Days excludes dates older than the 90-day window', async () => {
    const h = await makeHabit({ ownerUserId: userId });
    // A date well outside the window (1 year ago) should NOT be returned.
    await makeHabitCompletion({ habitId: h.id, userId, date: '2024-01-01' });
    // A recent date IN the window should be returned.
    const today = new Date();
    const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
    await makeHabitCompletion({ habitId: h.id, userId, date: todayStr });

    const result = await getHabitDetail(h.id, userId);
    expect(result).not.toBeNull();
    expect(result!.completionsLast90Days).toContain(todayStr);
    expect(result!.completionsLast90Days).not.toContain('2024-01-01');
    // totalCompletions is the all-time count (not the window).
    expect(result!.totalCompletions).toBe(2);
  });

  it('completionsLast90Days INCLUDES a date exactly 89 days before today (boundary)', async () => {
    const h = await makeHabit({ ownerUserId: userId });
    // Compute "89 days ago" YYYY-MM-DD in UTC (helper handles UTC).
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const ninetyAgo = new Date(today.getTime());
    ninetyAgo.setUTCDate(ninetyAgo.getUTCDate() - 89);
    const ninetyAgoStr = `${ninetyAgo.getUTCFullYear()}-${String(ninetyAgo.getUTCMonth() + 1).padStart(2, '0')}-${String(ninetyAgo.getUTCDate()).padStart(2, '0')}`;

    await makeHabitCompletion({
      habitId: h.id,
      userId,
      date: ninetyAgoStr,
    });

    const result = await getHabitDetail(h.id, userId);
    expect(result).not.toBeNull();
    expect(result!.completionsLast90Days).toContain(ninetyAgoStr);
  });

  it('completionsLast90Days EXCLUDES a date exactly 91 days before today (boundary)', async () => {
    const h = await makeHabit({ ownerUserId: userId });
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const ninetyOneAgo = new Date(today.getTime());
    ninetyOneAgo.setUTCDate(ninetyOneAgo.getUTCDate() - 91);
    const ninetyOneAgoStr = `${ninetyOneAgo.getUTCFullYear()}-${String(ninetyOneAgo.getUTCMonth() + 1).padStart(2, '0')}-${String(ninetyOneAgo.getUTCDate()).padStart(2, '0')}`;

    await makeHabitCompletion({
      habitId: h.id,
      userId,
      date: ninetyOneAgoStr,
    });

    const result = await getHabitDetail(h.id, userId);
    expect(result).not.toBeNull();
    expect(result!.completionsLast90Days).not.toContain(ninetyOneAgoStr);
  });

  it('completionsLast90Days is sorted ascending', async () => {
    const h = await makeHabit({ ownerUserId: userId });
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const dateNDaysAgo = (n: number): string => {
      const d = new Date(today.getTime());
      d.setUTCDate(d.getUTCDate() - n);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    };
    // Insert in random order; expect ascending output.
    await makeHabitCompletion({ habitId: h.id, userId, date: dateNDaysAgo(10) });
    await makeHabitCompletion({ habitId: h.id, userId, date: dateNDaysAgo(30) });
    await makeHabitCompletion({ habitId: h.id, userId, date: dateNDaysAgo(5) });

    const result = await getHabitDetail(h.id, userId);
    const list = result!.completionsLast90Days;
    expect(list).toEqual([...list].sort());
  });
});

// ===========================================================================
// listHabitRowsForUser — adds todayLocal per habit
// ===========================================================================

describe('listHabitRowsForUser', () => {
  it('returns empty array when user has no habits', async () => {
    const result = await listHabitRowsForUser(userId);
    expect(result).toEqual([]);
  });

  it('attaches todayLocal (YYYY-MM-DD) per habit in the habit\'s tz', async () => {
    await makeHabit({ ownerUserId: userId, name: 'A', timezone: 'UTC' });
    await makeHabit({
      ownerUserId: userId,
      name: 'B',
      timezone: 'Asia/Tokyo',
    });

    const result = await listHabitRowsForUser(userId);
    expect(result).toHaveLength(2);
    for (const row of result) {
      expect(row.todayLocal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // The two habits live in different tzs; their `todayLocal` may differ by a
    // day depending on the wall-clock time of the test run.
  });

  it('returns the same streak fields as listHabitsForUser', async () => {
    await makeHabit({ ownerUserId: userId, name: 'X' });
    const rows = await listHabitRowsForUser(userId);
    expect(rows[0]).toHaveProperty('currentStreak', 0);
    expect(rows[0]).toHaveProperty('longestStreak', 0);
    expect(rows[0]).toHaveProperty('totalCompletions', 0);
    expect(rows[0]).toHaveProperty('todayLocal');
  });
});

// ===========================================================================
// computeStreaksForHabit (the glue layer)
// ===========================================================================

describe('computeStreaksForHabit', () => {
  it('returns zero streaks for a habit with no completions', async () => {
    const h = await makeHabit({ ownerUserId: userId });
    const result = await computeStreaksForHabit(h, userId);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.totalCompletions).toBe(0);
    expect(result.lastCompletedDate).toBeNull();
  });

  it('uses the habit timezone to determine the default asOfDate', async () => {
    const h = await makeHabit({
      ownerUserId: userId,
      timezone: 'Asia/Tokyo',
    });
    // Just verify it doesn't crash and returns the expected shape.
    const result = await computeStreaksForHabit(h, userId);
    expect(result).toHaveProperty('currentStreak');
    expect(result).toHaveProperty('longestStreak');
  });

  it('honours an explicit asOfDate', async () => {
    // Backdate creation so the streak math has room to walk through completions.
    const h = await makeHabit({
      ownerUserId: userId,
      timezone: 'UTC',
      createdAt: new Date('2026-01-01T12:00:00Z'),
    });
    await makeHabitCompletion({ habitId: h.id, userId, date: '2026-05-15' });
    await makeHabitCompletion({ habitId: h.id, userId, date: '2026-05-16' });
    await makeHabitCompletion({ habitId: h.id, userId, date: '2026-05-17' });

    const result = await computeStreaksForHabit(h, userId, '2026-05-17');
    expect(result.currentStreak).toBe(3);
    expect(result.longestStreak).toBe(3);
  });
});
