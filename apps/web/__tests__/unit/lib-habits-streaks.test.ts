/**
 * Unit tests for lib/habits/streaks.ts — the pure streak math.
 *
 * This is THE priority test suite. Streak math has many subtle edge cases:
 *   - DST flips (spring-forward, fall-back) — must use calendar-day, not 24h
 *   - Leap years (Feb 29)
 *   - Habit created mid-streak (no penalty for pre-creation days)
 *   - Cadence semantics: daily / specific_weekdays / weekly_count
 *   - weekly_count in-progress week (don't reset prior streak)
 *   - Timezone-aware (cadence due days in habit tz, not UTC)
 *
 * All tests pin `asOfDate` for determinism — no `new Date()` reads here.
 */

import { describe, it, expect } from 'vitest';
import {
  computeStreaks,
  formatLocalDateInTz,
  todayInTz,
  addDaysInTz,
  isoWeekdayInTz,
  weekStartFor,
  isDueOn,
  compareDateStrings,
  type StreakInputs,
} from '@/lib/habits/streaks';
import type { HabitCadence } from '@/db/schema';

// ---------------------------------------------------------------------------
// Tiny helpers for building test inputs (DRY across many tests).
// ---------------------------------------------------------------------------

function inputs(partial: Partial<StreakInputs> & {
  cadence: HabitCadence;
  asOfDate: string;
  habitCreatedDate: string;
}): StreakInputs {
  return {
    timezone: partial.timezone ?? 'UTC',
    completionDates: partial.completionDates ?? [],
    ...partial,
  } as StreakInputs;
}

// ===========================================================================
// formatLocalDateInTz
// ===========================================================================

describe('formatLocalDateInTz', () => {
  it('formats a UTC noon Date as YYYY-MM-DD in UTC', () => {
    const d = new Date('2026-05-17T12:00:00Z');
    expect(formatLocalDateInTz(d, 'UTC')).toBe('2026-05-17');
  });

  it('rolls to the previous local date when the UTC moment is past midnight in a behind-UTC tz', () => {
    // 2026-05-17T03:00:00Z is 2026-05-16 20:00 in LA (UTC-7 in DST).
    const d = new Date('2026-05-17T03:00:00Z');
    expect(formatLocalDateInTz(d, 'America/Los_Angeles')).toBe('2026-05-16');
  });

  it('rolls to the next local date when the UTC moment is early in an ahead-of-UTC tz', () => {
    // 2026-05-16T22:00:00Z is 2026-05-17 07:00 in Tokyo (UTC+9).
    const d = new Date('2026-05-16T22:00:00Z');
    expect(formatLocalDateInTz(d, 'Asia/Tokyo')).toBe('2026-05-17');
  });

  // ---------------------------------------------------------------------------
  // Fixed-offset zones (Etc/GMT+N) — Windows ICU compatibility regression tests.
  //
  // Windows small-icu doesn't ship the full Etc/* set, so naive
  // `Intl.DateTimeFormat({ timeZone: 'Etc/GMT+14' })` throws RangeError. We
  // route fixed-offset zones through a pure-math path; these tests pin that
  // behavior so a regression to the Intl-only path would fail loudly.
  // ---------------------------------------------------------------------------
  it('Etc/GMT+14 (UTC-14): noon UTC renders as previous local date', () => {
    // POSIX inversion: Etc/GMT+14 = UTC-14. 2026-05-17T12:00Z is
    // 2026-05-16T22:00 local → date is 2026-05-16.
    const d = new Date('2026-05-17T12:00:00Z');
    expect(formatLocalDateInTz(d, 'Etc/GMT+14')).toBe('2026-05-16');
  });

  it('Etc/GMT-12 (UTC+12): noon UTC renders as next local date', () => {
    // Etc/GMT-12 = UTC+12. 2026-05-17T12:00Z is 2026-05-18T00:00 local.
    const d = new Date('2026-05-17T12:00:00Z');
    expect(formatLocalDateInTz(d, 'Etc/GMT-12')).toBe('2026-05-18');
  });

  it('Etc/UTC formats identically to UTC', () => {
    const d = new Date('2026-05-17T12:00:00Z');
    expect(formatLocalDateInTz(d, 'Etc/UTC')).toBe('2026-05-17');
    expect(formatLocalDateInTz(d, 'Etc/GMT')).toBe('2026-05-17');
    expect(formatLocalDateInTz(d, 'GMT')).toBe('2026-05-17');
  });

  it('named zone Asia/Tokyo still works (no regression on Intl path)', () => {
    // 2026-05-16T22:00Z is 2026-05-17 07:00 in Tokyo.
    const d = new Date('2026-05-16T22:00:00Z');
    expect(formatLocalDateInTz(d, 'Asia/Tokyo')).toBe('2026-05-17');
  });
});

// ===========================================================================
// todayInTz
// ===========================================================================

describe('todayInTz', () => {
  it('uses the provided Date to derive the local date', () => {
    const d = new Date('2026-05-17T12:00:00Z');
    expect(todayInTz('UTC', d)).toBe('2026-05-17');
    expect(todayInTz('America/Los_Angeles', d)).toBe('2026-05-17'); // noon UTC is 05:00 LA
  });

  it('defaults to new Date() when no Date is passed', () => {
    // Just ensure the function returns a YYYY-MM-DD string and doesn't throw.
    const result = todayInTz('UTC');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ===========================================================================
// addDaysInTz — DST-safe day math
// ===========================================================================

describe('addDaysInTz', () => {
  it('adds 1 day in UTC', () => {
    expect(addDaysInTz('2026-05-17', 1, 'UTC')).toBe('2026-05-18');
  });

  it('subtracts 1 day in UTC', () => {
    expect(addDaysInTz('2026-05-17', -1, 'UTC')).toBe('2026-05-16');
  });

  it('subtracts 0 returns the same date', () => {
    expect(addDaysInTz('2026-05-17', 0, 'UTC')).toBe('2026-05-17');
  });

  it('handles month boundaries', () => {
    expect(addDaysInTz('2026-05-31', 1, 'UTC')).toBe('2026-06-01');
    expect(addDaysInTz('2026-06-01', -1, 'UTC')).toBe('2026-05-31');
  });

  it('handles year boundaries', () => {
    expect(addDaysInTz('2026-12-31', 1, 'UTC')).toBe('2027-01-01');
    expect(addDaysInTz('2026-01-01', -1, 'UTC')).toBe('2025-12-31');
  });

  it('handles leap-year Feb 29 → Mar 1 forward', () => {
    expect(addDaysInTz('2024-02-29', 1, 'UTC')).toBe('2024-03-01');
  });

  it('handles non-leap-year Feb 28 → Mar 1 forward', () => {
    expect(addDaysInTz('2025-02-28', 1, 'UTC')).toBe('2025-03-01');
  });

  it('handles leap-year backward across Feb 29', () => {
    expect(addDaysInTz('2024-03-01', -1, 'UTC')).toBe('2024-02-29');
  });

  it('skips Feb 29 in a non-leap year backward', () => {
    expect(addDaysInTz('2025-03-01', -1, 'UTC')).toBe('2025-02-28');
  });

  it('DST spring-forward in America/Los_Angeles — day-after-flip math is calendar-based', () => {
    // 2026-03-08 is the 2nd Sunday of March. LA "springs forward" 02:00 -> 03:00.
    // Calendar day after 2026-03-07 is 2026-03-08; calendar day after 2026-03-08
    // is 2026-03-09. Despite the lost hour, we should still report calendar days.
    expect(addDaysInTz('2026-03-07', 1, 'America/Los_Angeles')).toBe('2026-03-08');
    expect(addDaysInTz('2026-03-08', 1, 'America/Los_Angeles')).toBe('2026-03-09');
    // Backward across the flip.
    expect(addDaysInTz('2026-03-09', -1, 'America/Los_Angeles')).toBe('2026-03-08');
    expect(addDaysInTz('2026-03-08', -1, 'America/Los_Angeles')).toBe('2026-03-07');
  });

  it('DST fall-back in America/Los_Angeles — calendar-day math', () => {
    // 2026-11-01 is the first Sunday of November (LA falls back 02:00 -> 01:00).
    expect(addDaysInTz('2026-10-31', 1, 'America/Los_Angeles')).toBe('2026-11-01');
    expect(addDaysInTz('2026-11-01', 1, 'America/Los_Angeles')).toBe('2026-11-02');
    expect(addDaysInTz('2026-11-02', -1, 'America/Los_Angeles')).toBe('2026-11-01');
  });

  it('crosses multiple days correctly', () => {
    expect(addDaysInTz('2026-05-17', 7, 'UTC')).toBe('2026-05-24');
    expect(addDaysInTz('2026-05-17', -7, 'UTC')).toBe('2026-05-10');
    expect(addDaysInTz('2026-05-17', 365, 'UTC')).toBe('2027-05-17');
  });

  // ---------------------------------------------------------------------------
  // Extreme-offset zones — noon-LOCAL anchor regression tests.
  //
  // The prior implementation anchored at noon UTC. For UTC+12+ zones (e.g.
  // Pacific/Auckland), noon UTC of YYYY-MM-DD is already past the local
  // midnight boundary, so `-1 day` would round-trip back to the SAME date.
  // We now anchor at noon LOCAL TIME so day arithmetic is correct at any
  // offset.
  // ---------------------------------------------------------------------------
  it('Pacific/Auckland (UTC+12/+13): -1 day decrements the local calendar date', () => {
    // The bug: noon UTC of 2026-05-20 is 2026-05-21 00:00 NZST (already past
    // midnight). Subtracting 1 UTC day lands on 2026-05-20 00:00 NZST, which
    // would render as 2026-05-20 — the SAME date we started with. Fix lands
    // at 2026-05-19.
    expect(addDaysInTz('2026-05-20', -1, 'Pacific/Auckland')).toBe('2026-05-19');
  });

  it('Pacific/Auckland (UTC+12/+13): +1 day increments the local calendar date', () => {
    expect(addDaysInTz('2026-05-20', +1, 'Pacific/Auckland')).toBe('2026-05-21');
  });

  it('Pacific/Auckland: round-trip +1 / -1 returns the same date', () => {
    expect(addDaysInTz(addDaysInTz('2026-05-20', +1, 'Pacific/Auckland'), -1, 'Pacific/Auckland')).toBe('2026-05-20');
    expect(addDaysInTz(addDaysInTz('2026-05-20', -1, 'Pacific/Auckland'), +1, 'Pacific/Auckland')).toBe('2026-05-20');
  });

  it('Pacific/Kiritimati (UTC+14, most ahead): -1 / +1 work correctly', () => {
    // Pacific/Kiritimati is UTC+14 year-round (no DST).
    expect(addDaysInTz('2026-05-20', -1, 'Pacific/Kiritimati')).toBe('2026-05-19');
    expect(addDaysInTz('2026-05-20', +1, 'Pacific/Kiritimati')).toBe('2026-05-21');
  });

  it('Etc/GMT-14 (UTC+14 fixed-offset): -1 / +1 work', () => {
    // POSIX-inverted: Etc/GMT-14 = UTC+14.
    expect(addDaysInTz('2026-05-20', -1, 'Etc/GMT-14')).toBe('2026-05-19');
    expect(addDaysInTz('2026-05-20', +1, 'Etc/GMT-14')).toBe('2026-05-21');
  });

  it('Etc/GMT+14 (UTC-14 fixed-offset, most behind): -1 / +1 work', () => {
    // POSIX-inverted: Etc/GMT+14 = UTC-14. With the old noon-UTC anchor this
    // was the symmetric failure mode — though depending on direction it
    // sometimes happened to be right. Pin it.
    expect(addDaysInTz('2026-05-20', -1, 'Etc/GMT+14')).toBe('2026-05-19');
    expect(addDaysInTz('2026-05-20', +1, 'Etc/GMT+14')).toBe('2026-05-21');
  });

  it('America/New_York across DST spring-forward (2026-03-08)', () => {
    // Sanity: regardless of the lost hour, calendar-day math is unaffected.
    expect(addDaysInTz('2026-03-08', +1, 'America/New_York')).toBe('2026-03-09');
    expect(addDaysInTz('2026-03-07', +1, 'America/New_York')).toBe('2026-03-08');
    expect(addDaysInTz('2026-03-09', -1, 'America/New_York')).toBe('2026-03-08');
  });
});

// ===========================================================================
// isoWeekdayInTz — 0=Mon..6=Sun
// ===========================================================================

describe('isoWeekdayInTz', () => {
  // 2026-05-17 is a Sunday in UTC.
  it('returns 6 (Sun) for 2026-05-17 UTC', () => {
    expect(isoWeekdayInTz('2026-05-17', 'UTC')).toBe(6);
  });

  it('returns 0 (Mon) for 2026-05-18 UTC', () => {
    expect(isoWeekdayInTz('2026-05-18', 'UTC')).toBe(0);
  });

  it('returns 1 (Tue) for 2026-05-19 UTC', () => {
    expect(isoWeekdayInTz('2026-05-19', 'UTC')).toBe(1);
  });

  it('returns 5 (Sat) for 2026-05-16 UTC', () => {
    expect(isoWeekdayInTz('2026-05-16', 'UTC')).toBe(5);
  });

  it('matches across IANA timezones for a noon-anchored date', () => {
    // Anchor at noon UTC: every tz should agree on the same weekday since
    // noon UTC is comfortably mid-day worldwide.
    expect(isoWeekdayInTz('2026-05-17', 'Asia/Tokyo')).toBe(6);
    expect(isoWeekdayInTz('2026-05-17', 'America/Los_Angeles')).toBe(6);
  });
});

// ===========================================================================
// compareDateStrings
// ===========================================================================

describe('compareDateStrings', () => {
  it('returns negative for earlier date', () => {
    expect(compareDateStrings('2026-05-16', '2026-05-17')).toBeLessThan(0);
  });
  it('returns positive for later date', () => {
    expect(compareDateStrings('2026-05-18', '2026-05-17')).toBeGreaterThan(0);
  });
  it('returns 0 for equal dates', () => {
    expect(compareDateStrings('2026-05-17', '2026-05-17')).toBe(0);
  });
});

// ===========================================================================
// weekStartFor
// ===========================================================================

describe('weekStartFor', () => {
  // 2026-05-17 is a Sunday (ISO 6). Previous Monday (ISO 0) is 2026-05-11.
  it('finds previous Monday for Sunday (weekStart=0)', () => {
    expect(weekStartFor('2026-05-17', 0, 'UTC')).toBe('2026-05-11');
  });

  it('returns the same date when already the weekStart', () => {
    expect(weekStartFor('2026-05-11', 0, 'UTC')).toBe('2026-05-11');
  });

  it('weekStart=6 (Sunday): Sunday 2026-05-17 → itself; Monday 2026-05-18 → 2026-05-17', () => {
    expect(weekStartFor('2026-05-17', 6, 'UTC')).toBe('2026-05-17');
    expect(weekStartFor('2026-05-18', 6, 'UTC')).toBe('2026-05-17');
    expect(weekStartFor('2026-05-23', 6, 'UTC')).toBe('2026-05-17'); // Sat
  });

  it('weekStart=2 (Wednesday): Tuesday 2026-05-19 → previous Wednesday 2026-05-13', () => {
    expect(weekStartFor('2026-05-19', 2, 'UTC')).toBe('2026-05-13');
  });
});

// ===========================================================================
// isDueOn
// ===========================================================================

describe('isDueOn', () => {
  it('daily — always true', () => {
    expect(isDueOn('2026-05-17', { kind: 'daily' }, 'UTC')).toBe(true);
    expect(isDueOn('2026-05-18', { kind: 'daily' }, 'UTC')).toBe(true);
  });

  it('specific_weekdays — true only for listed weekdays', () => {
    // 2026-05-18 is a Monday (ISO 0).
    const c: HabitCadence = { kind: 'specific_weekdays', weekdays: [0, 2, 4] };
    expect(isDueOn('2026-05-18', c, 'UTC')).toBe(true); // Mon
    expect(isDueOn('2026-05-19', c, 'UTC')).toBe(false); // Tue
    expect(isDueOn('2026-05-20', c, 'UTC')).toBe(true); // Wed
    expect(isDueOn('2026-05-22', c, 'UTC')).toBe(true); // Fri
    expect(isDueOn('2026-05-17', c, 'UTC')).toBe(false); // Sun
  });

  it('weekly_count — always true (per-week math handled elsewhere)', () => {
    const c: HabitCadence = { kind: 'weekly_count', perWeek: 3, weekStart: 0 };
    expect(isDueOn('2026-05-17', c, 'UTC')).toBe(true);
    expect(isDueOn('2026-05-18', c, 'UTC')).toBe(true);
  });
});

// ===========================================================================
// computeStreaks — DAILY cadence
// ===========================================================================

describe('computeStreaks — daily', () => {
  const DAILY: HabitCadence = { kind: 'daily' };

  it('empty completions → all zero', () => {
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        completionDates: [],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(0);
    expect(r.longestStreak).toBe(0);
    expect(r.totalCompletions).toBe(0);
    expect(r.lastCompletedDate).toBeNull();
  });

  it('one completion yesterday → currentStreak=0 (broken)', () => {
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        completionDates: ['2026-05-16'],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(0); // yesterday only, today not done
    expect(r.longestStreak).toBe(1);
    expect(r.totalCompletions).toBe(1);
    expect(r.lastCompletedDate).toBe('2026-05-16');
  });

  it('one completion today → currentStreak=1, longestStreak=1, total=1', () => {
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        completionDates: ['2026-05-17'],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(1);
    expect(r.longestStreak).toBe(1);
    expect(r.totalCompletions).toBe(1);
    expect(r.lastCompletedDate).toBe('2026-05-17');
  });

  it('7 consecutive completions ending today → currentStreak=7, longestStreak=7', () => {
    const dates = [
      '2026-05-11',
      '2026-05-12',
      '2026-05-13',
      '2026-05-14',
      '2026-05-15',
      '2026-05-16',
      '2026-05-17',
    ];
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        completionDates: dates,
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(7);
    expect(r.longestStreak).toBe(7);
    expect(r.totalCompletions).toBe(7);
    expect(r.lastCompletedDate).toBe('2026-05-17');
  });

  it('3 consecutive today/yesterday/2-days-ago, then a gap, then 5 consecutive a month ago → current=3, longest=5', () => {
    // Five consecutive a month earlier:
    const longer = [
      '2026-04-11',
      '2026-04-12',
      '2026-04-13',
      '2026-04-14',
      '2026-04-15',
    ];
    // Three consecutive ending today:
    const recent = ['2026-05-15', '2026-05-16', '2026-05-17'];
    const dates = [...longer, ...recent].sort();
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        completionDates: dates,
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(3);
    expect(r.longestStreak).toBe(5);
    expect(r.totalCompletions).toBe(8);
    expect(r.lastCompletedDate).toBe('2026-05-17');
  });

  it('DST spring-forward (2026-03-08): completion on day-before and day-after the flip extends the streak', () => {
    // 2026-03-08 is the "spring forward" day in LA.
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        timezone: 'America/Los_Angeles',
        completionDates: ['2026-03-07', '2026-03-08', '2026-03-09'],
        asOfDate: '2026-03-09',
        habitCreatedDate: '2026-01-01',
      }),
    );
    // Calendar-day math: 3 consecutive days even with the lost hour.
    expect(r.currentStreak).toBe(3);
    expect(r.longestStreak).toBe(3);
    expect(r.totalCompletions).toBe(3);
  });

  it('DST fall-back (2026-11-01): completions on day-before and day-after the flip extend the streak', () => {
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        timezone: 'America/Los_Angeles',
        completionDates: ['2026-10-31', '2026-11-01', '2026-11-02'],
        asOfDate: '2026-11-02',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(3);
    expect(r.longestStreak).toBe(3);
  });

  it('leap day: completions on 2024-02-28, 2024-02-29, 2024-03-01 with asOfDate 2024-03-01 → currentStreak=3', () => {
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        completionDates: ['2024-02-28', '2024-02-29', '2024-03-01'],
        asOfDate: '2024-03-01',
        habitCreatedDate: '2024-01-01',
      }),
    );
    expect(r.currentStreak).toBe(3);
    expect(r.longestStreak).toBe(3);
    expect(r.totalCompletions).toBe(3);
  });

  it('leap day: dispatch spec — completion on 2024-02-29 with asOfDate=2024-03-01 → currentStreak=2 if 2024-02-28 + 2024-03-01 also done', () => {
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        completionDates: ['2024-02-29', '2024-03-01'],
        asOfDate: '2024-03-01',
        habitCreatedDate: '2024-01-01',
      }),
    );
    // With only 2024-02-29 + 2024-03-01: current=2 (today + yesterday).
    expect(r.currentStreak).toBe(2);
  });

  it('habit created today, completion today → current=1 (don\'t penalize pre-creation days)', () => {
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        completionDates: ['2026-05-17'],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-05-17',
      }),
    );
    expect(r.currentStreak).toBe(1);
    expect(r.longestStreak).toBe(1);
  });

  it('habit created a week ago, no completions before creation, completion today → current=1', () => {
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        completionDates: ['2026-05-17'],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-05-10',
      }),
    );
    // The days BETWEEN creation and today that weren't completed break the streak,
    // but since we walk backward from asOfDate, the FIRST missing due day breaks
    // the streak. The completion is today, then yesterday is missed → break.
    // currentStreak=1.
    expect(r.currentStreak).toBe(1);
    expect(r.longestStreak).toBe(1);
  });

  it('habit created a week ago, NO completions at all → currentStreak=0, longestStreak=0 (pre-creation days NOT counted as misses)', () => {
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        completionDates: [],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-05-10',
      }),
    );
    expect(r.currentStreak).toBe(0);
    expect(r.longestStreak).toBe(0);
  });

  it('completion in the future (later than asOfDate) → ignored for currentStreak', () => {
    // Unusual but possible if someone marks tomorrow done.
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        completionDates: ['2026-05-18'],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(0); // today not done
    expect(r.totalCompletions).toBe(1);
    expect(r.lastCompletedDate).toBe('2026-05-18');
  });

  it('asOfDate equals habitCreatedDate, no completions → all zero', () => {
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        completionDates: [],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-05-17',
      }),
    );
    expect(r.currentStreak).toBe(0);
    expect(r.longestStreak).toBe(0);
  });

  it('longest streak runs entirely before today and is not the current streak', () => {
    const dates = [
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
      '2026-05-04',
      '2026-05-05',
      // gap
      '2026-05-17',
    ];
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        completionDates: dates,
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(1); // only today
    expect(r.longestStreak).toBe(5);
  });

  it('completion before habitCreatedDate (backfill) still counts toward longest if contiguous-with-post-creation completions', () => {
    // A weird-but-supported edge case the streak doc mentions.
    const r = computeStreaks(
      inputs({
        cadence: DAILY,
        completionDates: ['2026-04-30', '2026-05-01', '2026-05-02'],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-05-01',
      }),
    );
    // Forward walk starts at min(habitCreatedDate, firstCompletion) = 2026-04-30,
    // so the 3 days form a longest run of 3.
    expect(r.longestStreak).toBe(3);
    // currentStreak walks backward from asOfDate to habitCreatedDate. Today
    // (2026-05-17) is not completed → current=0.
    expect(r.currentStreak).toBe(0);
  });
});

// ===========================================================================
// computeStreaks — SPECIFIC_WEEKDAYS
// ===========================================================================

describe('computeStreaks — specific_weekdays', () => {
  // Mon/Wed/Fri = ISO weekdays [0, 2, 4].
  const MWF: HabitCadence = { kind: 'specific_weekdays', weekdays: [0, 2, 4] };

  it('empty completions → 0', () => {
    const r = computeStreaks(
      inputs({
        cadence: MWF,
        completionDates: [],
        asOfDate: '2026-05-22', // Friday
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(0);
    expect(r.longestStreak).toBe(0);
  });

  it('done Mon/Wed/Fri this week, asOfDate=Friday → current=3', () => {
    // 2026-05-18 = Mon, 2026-05-20 = Wed, 2026-05-22 = Fri.
    const r = computeStreaks(
      inputs({
        cadence: MWF,
        completionDates: ['2026-05-18', '2026-05-20', '2026-05-22'],
        asOfDate: '2026-05-22',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(3);
    expect(r.longestStreak).toBe(3);
  });

  it('done Mon/Wed only, asOfDate=Wed → current=2', () => {
    const r = computeStreaks(
      inputs({
        cadence: MWF,
        completionDates: ['2026-05-18', '2026-05-20'],
        asOfDate: '2026-05-20',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(2);
    expect(r.longestStreak).toBe(2);
  });

  it('done Mon/Wed only, asOfDate=Fri (Fri missed) → current=0', () => {
    const r = computeStreaks(
      inputs({
        cadence: MWF,
        completionDates: ['2026-05-18', '2026-05-20'],
        asOfDate: '2026-05-22', // Fri — missed
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(0);
    expect(r.longestStreak).toBe(2);
  });

  it('skipping Tue (non-due) does NOT break a streak that runs Mon-Wed-Fri', () => {
    // Same as the Mon-Wed-Fri test — verifies non-due Tue is "skipped" not "broken".
    const r = computeStreaks(
      inputs({
        cadence: MWF,
        completionDates: ['2026-05-18', '2026-05-20', '2026-05-22'],
        asOfDate: '2026-05-22',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(3);
  });

  it('long streak across weeks: Mon-Wed-Fri (week 1) + Mon-Wed (week 2), today=Wed → current=5', () => {
    // Week 1: 2026-05-18 (Mon), 2026-05-20 (Wed), 2026-05-22 (Fri).
    // Week 2: 2026-05-25 (Mon), 2026-05-27 (Wed). Today = Wed week 2.
    const dates = [
      '2026-05-18',
      '2026-05-20',
      '2026-05-22',
      '2026-05-25',
      '2026-05-27',
    ];
    const r = computeStreaks(
      inputs({
        cadence: MWF,
        completionDates: dates,
        asOfDate: '2026-05-27',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(5);
    expect(r.longestStreak).toBe(5);
  });

  it('missing a middle Wed breaks the streak; recent run is current', () => {
    // Mon and Fri done, Wed missed. asOfDate=Fri.
    const dates = ['2026-05-18', '2026-05-22'];
    const r = computeStreaks(
      inputs({
        cadence: MWF,
        completionDates: dates,
        asOfDate: '2026-05-22',
        habitCreatedDate: '2026-01-01',
      }),
    );
    // Walk backward from Fri: Fri done (1), Wed missing → break.
    expect(r.currentStreak).toBe(1);
    expect(r.longestStreak).toBe(1);
  });

  it('tz-aware: due days are in the habit tz, not UTC', () => {
    // A completion stored as 2026-05-18 (Mon UTC) — same date in LA is Mon too.
    // To test tz-awareness, let's check Sunday-into-Monday is handled correctly.
    // 2026-05-17 is Sunday (ISO 6) — not in MWF (weekdays 0,2,4).
    const r = computeStreaks(
      inputs({
        cadence: MWF,
        timezone: 'America/Los_Angeles',
        completionDates: ['2026-05-18'], // Monday
        asOfDate: '2026-05-18',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(1);
  });

  it('only Sundays cadence', () => {
    // Sundays = ISO 6.
    const sun: HabitCadence = { kind: 'specific_weekdays', weekdays: [6] };
    // 2026-05-17 = Sun, 2026-05-24 = Sun.
    const r = computeStreaks(
      inputs({
        cadence: sun,
        completionDates: ['2026-05-17', '2026-05-24'],
        asOfDate: '2026-05-24',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(2);
    expect(r.longestStreak).toBe(2);
  });

  it('all 7 weekdays specified is equivalent to daily for streak math', () => {
    const everyDay: HabitCadence = {
      kind: 'specific_weekdays',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    };
    const r = computeStreaks(
      inputs({
        cadence: everyDay,
        completionDates: ['2026-05-15', '2026-05-16', '2026-05-17'],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(3);
    expect(r.longestStreak).toBe(3);
  });
});

// ===========================================================================
// computeStreaks — WEEKLY_COUNT
// ===========================================================================

describe('computeStreaks — weekly_count', () => {
  // perWeek=3, weekStart=0 (Monday).
  const W3: HabitCadence = { kind: 'weekly_count', perWeek: 3, weekStart: 0 };

  it('empty completions → 0', () => {
    const r = computeStreaks(
      inputs({
        cadence: W3,
        completionDates: [],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(0);
    expect(r.longestStreak).toBe(0);
  });

  it('done 3 times this week → current=1 (one complete week)', () => {
    // Week of 2026-05-11 to 2026-05-17 (Monday start). Three completions.
    const r = computeStreaks(
      inputs({
        cadence: W3,
        completionDates: ['2026-05-11', '2026-05-13', '2026-05-15'],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(1);
    expect(r.longestStreak).toBe(1);
    expect(r.totalCompletions).toBe(3);
  });

  it('done 3 last week + 3 this week → current=2', () => {
    const r = computeStreaks(
      inputs({
        cadence: W3,
        completionDates: [
          // Last week (2026-05-04..2026-05-10).
          '2026-05-04',
          '2026-05-06',
          '2026-05-08',
          // This week (2026-05-11..2026-05-17).
          '2026-05-11',
          '2026-05-13',
          '2026-05-15',
        ],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(2);
    expect(r.longestStreak).toBe(2);
  });

  it('done 2 this week, mid-week → current=0 (week not yet complete) — but prior week complete → current includes prior week', () => {
    // Mid-week (Wed = 2026-05-13) with only 2 completions this week.
    // No prior weeks. current=0.
    const r = computeStreaks(
      inputs({
        cadence: W3,
        completionDates: ['2026-05-11', '2026-05-13'],
        asOfDate: '2026-05-13',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(0);
    expect(r.longestStreak).toBe(0);
  });

  it('done 2 this week mid-week, prior week complete → current=1 (in-progress week deferred to previous)', () => {
    const r = computeStreaks(
      inputs({
        cadence: W3,
        completionDates: [
          // Prior week, complete.
          '2026-05-04',
          '2026-05-06',
          '2026-05-08',
          // This week, only 2 (in progress).
          '2026-05-11',
          '2026-05-13',
        ],
        asOfDate: '2026-05-13',
        habitCreatedDate: '2026-01-01',
      }),
    );
    // In-progress week short: drop back to previous, which is complete → current=1.
    expect(r.currentStreak).toBe(1);
  });

  it('done 2 this week, week ended → current=0 (week ended short)', () => {
    // Week ended (asOfDate = Sun 2026-05-17, week 05-11..05-17). Only 2 completions.
    const r = computeStreaks(
      inputs({
        cadence: W3,
        completionDates: ['2026-05-11', '2026-05-13'],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(0);
  });

  it('done 4 this week → current=1 (extra completions don\'t add weeks)', () => {
    const r = computeStreaks(
      inputs({
        cadence: W3,
        completionDates: [
          '2026-05-11',
          '2026-05-12',
          '2026-05-13',
          '2026-05-14',
        ],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(1);
    expect(r.longestStreak).toBe(1);
    expect(r.totalCompletions).toBe(4);
  });

  it('weekStart=Sunday variant (weekStart=6): week boundaries shift', () => {
    const cadenceSun: HabitCadence = {
      kind: 'weekly_count',
      perWeek: 3,
      weekStart: 6, // Sunday
    };
    // weekStart=6 means weeks run Sun..Sat. Week containing 2026-05-17 (Sun)
    // is 2026-05-17..2026-05-23. Three completions in that week:
    const r = computeStreaks(
      inputs({
        cadence: cadenceSun,
        completionDates: ['2026-05-17', '2026-05-19', '2026-05-21'],
        asOfDate: '2026-05-23',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(1);
    expect(r.longestStreak).toBe(1);
  });

  it('weekStart shift: same completions, different weekStart → different week buckets', () => {
    // Completions 2026-05-17 (Sun) + 2026-05-18 (Mon) + 2026-05-19 (Tue).
    // weekStart=0 (Mon): Sun is week 05-11..05-17; Mon+Tue are next week.
    //   → week 1 has 1 completion, week 2 has 2 — neither hits 3, current=0.
    // weekStart=6 (Sun): Sun+Mon+Tue are all in the same week (Sun-Sat).
    //   → 3 completions → current=1.
    const dates = ['2026-05-17', '2026-05-18', '2026-05-19'];
    const w3Mon: HabitCadence = { kind: 'weekly_count', perWeek: 3, weekStart: 0 };
    const w3Sun: HabitCadence = { kind: 'weekly_count', perWeek: 3, weekStart: 6 };

    const rMon = computeStreaks(
      inputs({
        cadence: w3Mon,
        completionDates: dates,
        asOfDate: '2026-05-23',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(rMon.currentStreak).toBe(0);

    const rSun = computeStreaks(
      inputs({
        cadence: w3Sun,
        completionDates: dates,
        asOfDate: '2026-05-23',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(rSun.currentStreak).toBe(1);
  });

  it('asOfDate mid-week with completed prior weeks but zero this week → current includes prior week', () => {
    const r = computeStreaks(
      inputs({
        cadence: W3,
        completionDates: ['2026-05-04', '2026-05-06', '2026-05-08'],
        asOfDate: '2026-05-13', // Wed of next week, no completions
        habitCreatedDate: '2026-01-01',
      }),
    );
    // In-progress week short of 3 → fall back to previous (which has 3) → current=1.
    expect(r.currentStreak).toBe(1);
    expect(r.longestStreak).toBe(1);
  });

  it('three-week streak, then gap of 2 weeks, then partial week — longest=3, current depends on partial', () => {
    const dates = [
      // Week starting 2026-04-13 (3 completions)
      '2026-04-13',
      '2026-04-15',
      '2026-04-17',
      // Week starting 2026-04-20 (3 completions)
      '2026-04-20',
      '2026-04-22',
      '2026-04-24',
      // Week starting 2026-04-27 (3 completions)
      '2026-04-27',
      '2026-04-29',
      '2026-05-01',
      // GAP weeks 2026-05-04 and 2026-05-11
      // Week starting 2026-05-18 (1 completion only, in progress)
      '2026-05-18',
    ];
    const r = computeStreaks(
      inputs({
        cadence: W3,
        completionDates: dates,
        asOfDate: '2026-05-19', // Tue of partial week
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.longestStreak).toBe(3);
    // In-progress week has 1, < 3. Drop back to 2026-05-11 week (zero) → 0.
    expect(r.currentStreak).toBe(0);
  });

  it('perWeek=7 (every day) — only weeks with all 7 days count', () => {
    const cadence: HabitCadence = { kind: 'weekly_count', perWeek: 7, weekStart: 0 };
    const dates = [
      // Week 05-11..05-17: all 7 days.
      '2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14',
      '2026-05-15', '2026-05-16', '2026-05-17',
    ];
    const r = computeStreaks(
      inputs({
        cadence,
        completionDates: dates,
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(1);
    expect(r.longestStreak).toBe(1);
  });

  it('perWeek=1 — single completion any day counts that week', () => {
    const cadence: HabitCadence = { kind: 'weekly_count', perWeek: 1, weekStart: 0 };
    const dates = [
      '2026-05-13', // Wed of week 1
      '2026-05-21', // Thu of week 2
    ];
    const r = computeStreaks(
      inputs({
        cadence,
        completionDates: dates,
        asOfDate: '2026-05-21',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.currentStreak).toBe(2);
    expect(r.longestStreak).toBe(2);
  });

  it('habit created mid-week — streak starts from habit creation week', () => {
    const r = computeStreaks(
      inputs({
        cadence: W3,
        completionDates: ['2026-05-15', '2026-05-16', '2026-05-17'],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-05-15', // Friday
      }),
    );
    expect(r.currentStreak).toBe(1);
    expect(r.longestStreak).toBe(1);
  });
});

// ===========================================================================
// computeStreaks — robustness
// ===========================================================================

describe('computeStreaks — robustness / "doesn\'t crash"', () => {
  it('handles past-asOfDate completions (e.g. backfills) without crashing', () => {
    const dates = ['2020-01-01', '2020-01-02', '2020-01-03', '2025-12-31', '2026-01-01'];
    const r = computeStreaks(
      inputs({
        cadence: { kind: 'daily' },
        completionDates: dates,
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.totalCompletions).toBe(5);
    expect(r.lastCompletedDate).toBe('2026-01-01');
  });

  it('totalCompletions counts the array correctly (independent of uniqueness — DB enforces unique)', () => {
    // The function trusts the caller to de-dupe; we verify length-based counting.
    const r = computeStreaks(
      inputs({
        cadence: { kind: 'daily' },
        completionDates: ['2026-05-15', '2026-05-16', '2026-05-17'],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.totalCompletions).toBe(3);
  });

  it('lastCompletedDate is the LAST element of the sorted array', () => {
    const r = computeStreaks(
      inputs({
        cadence: { kind: 'daily' },
        completionDates: ['2026-05-15', '2026-05-16', '2026-05-17'],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.lastCompletedDate).toBe('2026-05-17');
  });

  it('lastCompletedDate is null when completions is empty', () => {
    const r = computeStreaks(
      inputs({
        cadence: { kind: 'daily' },
        completionDates: [],
        asOfDate: '2026-05-17',
        habitCreatedDate: '2026-01-01',
      }),
    );
    expect(r.lastCompletedDate).toBeNull();
  });

  it('streak math handles a 10-year daily streak (3650+ iterations) within reasonable time', () => {
    // Generate dates for ~10 years.
    const dates: string[] = [];
    let cursor = '2016-01-01';
    for (let i = 0; i < 3650; i++) {
      dates.push(cursor);
      cursor = addDaysInTz(cursor, 1, 'UTC');
    }
    // The final cursor at this point IS the day after the last completion.
    // Use it as asOfDate-1 so all completions are <= asOfDate.
    const asOfDate = dates[dates.length - 1]!;
    const t0 = Date.now();
    const r = computeStreaks(
      inputs({
        cadence: { kind: 'daily' },
        completionDates: dates,
        asOfDate,
        habitCreatedDate: '2016-01-01',
      }),
    );
    const t1 = Date.now();
    expect(r.longestStreak).toBe(3650);
    expect(r.currentStreak).toBe(3650);
    // Very generous bound — Intl.DateTimeFormat allocations are slow but the
    // function is O(span_in_days), bounded by the MAX_ITERATIONS safety cap.
    // We just want to ensure no quadratic / pathological behavior.
    expect(t1 - t0).toBeLessThan(10_000);
  });
});
