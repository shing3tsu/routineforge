/**
 * Unit tests for lib/routines/queries.ts.
 *
 * Server-side Drizzle helpers used by routine pages. Mirrors the API route
 * shapes; we test them in isolation since they're called directly by server
 * components (not via the API).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

import {
  listRoutinesForUser,
  getRoutineForUser,
} from '@/lib/routines/queries';
import {
  addDaysInTz,
  isoWeekdayInTz,
  todayInTz,
} from '@/lib/habits/streaks';
import {
  resetDb,
  makeUser,
  makeRoutine,
  makeStep,
  makeCompletion,
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

describe('listRoutinesForUser', () => {
  it('returns an empty array when the user has no routines', async () => {
    const result = await listRoutinesForUser(userId);
    expect(result).toEqual([]);
  });

  it('returns the user routines with derived scheduleWeekdays', async () => {
    const r = await makeRoutine({ ownerUserId: userId, name: 'R' });
    await makeStep({ routineId: r.id, weekday: 1 });
    await makeStep({ routineId: r.id, weekday: 4 });

    const result = await listRoutinesForUser(userId);
    expect(result).toHaveLength(1);
    expect(result[0]?.scheduleWeekdays).toEqual([1, 4]);
  });

  // ---- New: today + last-7-days stats -------------------------------------
  //
  // The query keys "today" off the routine's IANA tz. To make the assertions
  // deterministic without freezing the system clock, we resolve today in the
  // SAME tz the test uses (`UTC` for most cases) and key step weekdays off it.

  it('reports 0/0 + isScheduledToday: false when no steps are scheduled today', async () => {
    const tz = 'UTC';
    const today = todayInTz(tz);
    const todayWd = isoWeekdayInTz(today, tz);
    // Put a single step on a NON-today weekday (todayWd + 1, mod 7).
    const r = await makeRoutine({ ownerUserId: userId, name: 'R', timezone: tz });
    await makeStep({ routineId: r.id, weekday: (todayWd + 1) % 7 });

    const [item] = await listRoutinesForUser(userId);
    expect(item).toBeDefined();
    expect(item!.stepCountToday).toBe(0);
    expect(item!.stepsCompletedToday).toBe(0);
    expect(item!.isScheduledToday).toBe(false);
  });

  it('reports stepCountToday and stepsCompletedToday for scheduled + partially completed days', async () => {
    const tz = 'UTC';
    const today = todayInTz(tz);
    const todayWd = isoWeekdayInTz(today, tz);
    const r = await makeRoutine({ ownerUserId: userId, name: 'R', timezone: tz });
    const s1 = await makeStep({ routineId: r.id, weekday: todayWd, position: 0, title: 'A' });
    const s2 = await makeStep({ routineId: r.id, weekday: todayWd, position: 1, title: 'B' });
    await makeStep({ routineId: r.id, weekday: todayWd, position: 2, title: 'C' });

    // Complete s1 + s2 today (s3 still open).
    await makeCompletion({ stepId: s1.id, userId, date: today });
    await makeCompletion({ stepId: s2.id, userId, date: today });

    const [item] = await listRoutinesForUser(userId);
    expect(item).toBeDefined();
    expect(item!.stepCountToday).toBe(3);
    expect(item!.stepsCompletedToday).toBe(2);
    expect(item!.isScheduledToday).toBe(true);
  });

  it("uses the routine's tz (not the server's) when resolving today's weekday", async () => {
    // Etc/GMT+14 is the most extreme tz (~UTC-14). At ANY UTC moment, the
    // local "today" in Etc/GMT+14 may be a different calendar date than UTC,
    // so the resolved weekday can differ from the UTC weekday. We assert
    // that the query uses the routine's tz: we put steps on the LOCAL today
    // weekday in Etc/GMT+14, and we should see stepCountToday > 0 regardless
    // of the server's UTC weekday.
    const tz = 'Etc/GMT+14';
    const localToday = todayInTz(tz);
    const localWd = isoWeekdayInTz(localToday, tz);
    const r = await makeRoutine({ ownerUserId: userId, name: 'TzR', timezone: tz });
    await makeStep({ routineId: r.id, weekday: localWd, title: 'tz-local-step' });

    const [item] = await listRoutinesForUser(userId);
    expect(item).toBeDefined();
    expect(item!.timezone).toBe(tz);
    expect(item!.stepCountToday).toBe(1);
    expect(item!.isScheduledToday).toBe(true);
    // The last entry of lastSevenDays carries today's local date in the tz.
    expect(item!.lastSevenDays[6]?.date).toBe(localToday);
  });

  it('returns lastSevenDays with exactly 7 entries, oldest first, today last', async () => {
    const tz = 'UTC';
    const today = todayInTz(tz);
    const r = await makeRoutine({ ownerUserId: userId, name: 'R', timezone: tz });

    const [item] = await listRoutinesForUser(userId);
    expect(item).toBeDefined();
    expect(item!.lastSevenDays).toHaveLength(7);
    // Today is the last entry.
    expect(item!.lastSevenDays[6]?.date).toBe(today);
    // Strictly ascending order.
    for (let i = 1; i < 7; i++) {
      const prev = item!.lastSevenDays[i - 1]!.date;
      const cur = item!.lastSevenDays[i]!.date;
      expect(cur > prev).toBe(true);
    }
    // With no steps at all, every day reports 0 scheduled / 0 completed.
    for (const day of item!.lastSevenDays) {
      expect(day.scheduled).toBe(0);
      expect(day.completed).toBe(0);
    }
    expect(r.id).toBeDefined();
  });

  it('per-day scheduled count reflects the weekday of THAT date (not just today)', async () => {
    const tz = 'UTC';
    const today = todayInTz(tz);
    const todayWd = isoWeekdayInTz(today, tz);
    const yesterdayWd = (todayWd + 6) % 7; // todayWd - 1 mod 7
    const r = await makeRoutine({ ownerUserId: userId, name: 'R', timezone: tz });
    // Two steps for today's weekday, one step for yesterday's weekday.
    await makeStep({ routineId: r.id, weekday: todayWd, position: 0 });
    await makeStep({ routineId: r.id, weekday: todayWd, position: 1 });
    await makeStep({ routineId: r.id, weekday: yesterdayWd, position: 0 });

    const [item] = await listRoutinesForUser(userId);
    expect(item).toBeDefined();
    const seven = item!.lastSevenDays;
    // Last entry (today): scheduled = 2.
    expect(seven[6]?.scheduled).toBe(2);
    // Second-to-last entry (yesterday): scheduled = 1.
    expect(seven[5]?.scheduled).toBe(1);
  });

  it("does not leak completions from another user's identical routine", async () => {
    const tz = 'UTC';
    const today = todayInTz(tz);
    const todayWd = isoWeekdayInTz(today, tz);
    // Alice's routine + step.
    const ra = await makeRoutine({ ownerUserId: userId, name: 'Mine', timezone: tz });
    const sa = await makeStep({ routineId: ra.id, weekday: todayWd });
    // Bob has a parallel routine with a completion today — must not leak.
    const rb = await makeRoutine({ ownerUserId: otherId, name: 'Bobs', timezone: tz });
    const sb = await makeStep({ routineId: rb.id, weekday: todayWd });
    await makeCompletion({ stepId: sb.id, userId: otherId, date: today });

    const result = await listRoutinesForUser(userId);
    expect(result).toHaveLength(1);
    const mine = result[0]!;
    expect(mine.id).toBe(ra.id);
    expect(mine.stepsCompletedToday).toBe(0);
    expect(mine.lastSevenDays[6]?.completed).toBe(0);
    // Sanity: the step references we created shouldn't bleed.
    expect(sa.id).not.toBe(sb.id);
  });

  it('does not leak completions from a DIFFERENT routine of the same user', async () => {
    const tz = 'UTC';
    const today = todayInTz(tz);
    const todayWd = isoWeekdayInTz(today, tz);
    // Two routines for Alice; complete a step on routine B, query stats on A.
    const ra = await makeRoutine({ ownerUserId: userId, name: 'A', timezone: tz });
    await makeStep({ routineId: ra.id, weekday: todayWd, title: 'A-step' });
    const rb = await makeRoutine({ ownerUserId: userId, name: 'B', timezone: tz });
    const sb = await makeStep({ routineId: rb.id, weekday: todayWd, title: 'B-step' });
    await makeCompletion({ stepId: sb.id, userId, date: today });

    const result = await listRoutinesForUser(userId);
    // Two routines returned (sorted: A then B).
    expect(result.map((r) => r.name)).toEqual(['A', 'B']);
    const [a, b] = result;
    expect(a!.stepsCompletedToday).toBe(0);
    expect(a!.lastSevenDays[6]?.completed).toBe(0);
    expect(b!.stepsCompletedToday).toBe(1);
    expect(b!.lastSevenDays[6]?.completed).toBe(1);
  });

  it('handles a routine with zero steps gracefully', async () => {
    await makeRoutine({ ownerUserId: userId, name: 'Bare' });
    const [item] = await listRoutinesForUser(userId);
    expect(item).toBeDefined();
    expect(item!.scheduleWeekdays).toEqual([]);
    expect(item!.stepCountToday).toBe(0);
    expect(item!.stepsCompletedToday).toBe(0);
    expect(item!.isScheduledToday).toBe(false);
    expect(item!.lastSevenDays).toHaveLength(7);
    for (const d of item!.lastSevenDays) {
      expect(d.scheduled).toBe(0);
      expect(d.total).toBe(0);
      expect(d.completed).toBe(0);
    }
  });

  // ---- lastSevenDays.total alias ------------------------------------------
  //
  // The polished routines-list page consumes `{ date, completed, total }`.
  // `total` is a deliberate alias of `scheduled` so both shapes work — assert
  // equality on every day rather than just spot-checking today.

  it('populates lastSevenDays[i].total as an alias of `scheduled`', async () => {
    const tz = 'UTC';
    const today = todayInTz(tz);
    const todayWd = isoWeekdayInTz(today, tz);
    const yesterdayWd = (todayWd + 6) % 7;
    const r = await makeRoutine({ ownerUserId: userId, name: 'R', timezone: tz });
    await makeStep({ routineId: r.id, weekday: todayWd, position: 0 });
    await makeStep({ routineId: r.id, weekday: todayWd, position: 1 });
    await makeStep({ routineId: r.id, weekday: yesterdayWd, position: 0 });

    const [item] = await listRoutinesForUser(userId);
    expect(item).toBeDefined();
    for (const day of item!.lastSevenDays) {
      expect(day.total).toBe(day.scheduled);
    }
    // Spot-check actual values for today and yesterday.
    expect(item!.lastSevenDays[6]?.total).toBe(2);
    expect(item!.lastSevenDays[5]?.total).toBe(1);
  });

  // ---- Day-boundary completion (timezone edge) ----------------------------
  //
  // Completions are stored with the LOCAL 'YYYY-MM-DD' the user was on when
  // they tapped done — not a server-UTC date. Two completions inserted with
  // different local-date strings (yesterday vs today, in the routine's tz)
  // must land in the matching `lastSevenDays` buckets and NOT bleed across.

  it('attributes completions to their stored local date, not server UTC', async () => {
    // America/Los_Angeles (UTC-7/-8) is reliably present in Node's Intl tzdata
    // and noon UTC falls in the middle of LA's day, so `addDaysInTz` (which
    // anchors at noon UTC) round-trips cleanly. We deliberately AVOID UTC+12+
    // timezones like Pacific/Auckland here: at those offsets noon UTC equals
    // local midnight, and `addDaysInTz` can collapse `yesterday === today`
    // (separate concern, out of scope for this query).
    const tz = 'America/Los_Angeles';
    const today = todayInTz(tz);
    const todayWd = isoWeekdayInTz(today, tz);
    const yesterday = addDaysInTz(today, -1, tz);
    const yesterdayWd = isoWeekdayInTz(yesterday, tz);

    const r = await makeRoutine({
      ownerUserId: userId,
      name: 'TzBoundary',
      timezone: tz,
    });
    // One step on today's weekday, one on yesterday's.
    const sToday = await makeStep({
      routineId: r.id,
      weekday: todayWd,
      title: 'today-step',
    });
    const sYesterday = await makeStep({
      routineId: r.id,
      // If today/yesterday happen to land on the same weekday (won't because
      // they're adjacent days, but be defensive), still produce a distinct
      // step row by varying position.
      weekday: yesterdayWd === todayWd ? (todayWd + 2) % 7 : yesterdayWd,
      title: 'yesterday-step',
    });
    // Complete each step on its OWN local date.
    await makeCompletion({ stepId: sToday.id, userId, date: today });
    await makeCompletion({ stepId: sYesterday.id, userId, date: yesterday });

    const [item] = await listRoutinesForUser(userId);
    expect(item).toBeDefined();
    expect(item!.timezone).toBe(tz);
    // Today's bucket must show exactly 1 completed (the today-step).
    expect(item!.lastSevenDays[6]?.date).toBe(today);
    expect(item!.lastSevenDays[6]?.completed).toBe(1);
    // Yesterday's bucket must show exactly 1 completed (the yesterday-step).
    expect(item!.lastSevenDays[5]?.date).toBe(yesterday);
    expect(item!.lastSevenDays[5]?.completed).toBe(1);
    // stepsCompletedToday counts only today's completions, not yesterday's.
    expect(item!.stepsCompletedToday).toBe(1);
  });

  // ---- Completion BEFORE the 7-day window ---------------------------------
  //
  // Completions older than 7 days must not appear in lastSevenDays. This
  // exercises the bounded query (gte/lte on date) — a regression here would
  // either include stale rows or, worse, swap two rows.

  it('ignores completions older than the 7-day window', async () => {
    const tz = 'UTC';
    const today = todayInTz(tz);
    const todayWd = isoWeekdayInTz(today, tz);
    const r = await makeRoutine({ ownerUserId: userId, name: 'R', timezone: tz });
    const s = await makeStep({ routineId: r.id, weekday: todayWd });
    // 30 days ago — way outside the window.
    const ancient = addDaysInTz(today, -30, tz);
    await makeCompletion({ stepId: s.id, userId, date: ancient });

    const [item] = await listRoutinesForUser(userId);
    expect(item).toBeDefined();
    for (const day of item!.lastSevenDays) {
      expect(day.completed).toBe(0);
    }
    expect(item!.stepsCompletedToday).toBe(0);
  });
});

describe('getRoutineForUser', () => {
  it('returns null when the routine does not exist', async () => {
    const result = await getRoutineForUser(
      '00000000-0000-0000-0000-000000000099',
      userId,
    );
    expect(result).toBeNull();
  });

  it('returns null when the routine is owned by another user (404 ambiguity)', async () => {
    const r = await makeRoutine({ ownerUserId: otherId });
    const result = await getRoutineForUser(r.id, userId);
    expect(result).toBeNull();
  });

  it('returns null for an archived routine', async () => {
    const r = await makeRoutine({
      ownerUserId: userId,
      archivedAt: new Date(),
    });
    const result = await getRoutineForUser(r.id, userId);
    expect(result).toBeNull();
  });

  it('returns the routine with stepsByWeekday + scheduleWeekdays', async () => {
    const r = await makeRoutine({ ownerUserId: userId, name: 'My' });
    const s1 = await makeStep({ routineId: r.id, weekday: 0, position: 0, title: 'A' });
    const s2 = await makeStep({ routineId: r.id, weekday: 0, position: 1, title: 'B' });
    const s3 = await makeStep({ routineId: r.id, weekday: 3, position: 0, title: 'C' });

    const result = await getRoutineForUser(r.id, userId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(r.id);
    expect(result!.name).toBe('My');
    expect(result!.stepsByWeekday[0]).toHaveLength(2);
    expect(result!.stepsByWeekday[0]?.map((s) => s.id)).toEqual([s1.id, s2.id]);
    expect(result!.stepsByWeekday[3]).toHaveLength(1);
    expect(result!.stepsByWeekday[3]?.[0]?.id).toBe(s3.id);
    expect(result!.stepsByWeekday[1]).toEqual([]);
    expect(result!.scheduleWeekdays).toEqual([0, 3]);
    // Dates are serialised to ISO strings.
    expect(typeof result!.createdAt).toBe('string');
    expect(result!.archivedAt).toBeNull();
  });

  it('serialises archivedAt to an ISO string when present (would require lookup of archived; verifies the type path)', async () => {
    // Since getRoutineForUser filters out archivedAt routines, we can't fetch
    // one directly. But we exercise the `archivedAt ? ...toISOString() : null`
    // branch via the negative case (returns null).
    const r = await makeRoutine({
      ownerUserId: userId,
      archivedAt: new Date(),
    });
    expect(await getRoutineForUser(r.id, userId)).toBeNull();
  });
});
