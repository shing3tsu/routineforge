/**
 * Pure formatters for habit display strings.
 *
 * Lives in `lib/habits/` (no `'server-only'`) so client components — like the
 * future today view and the habits list row — can import the same humanised
 * cadence label without duplicating switch statements. Pure helpers with no
 * side effects; safe in both server and client contexts.
 *
 * Weekday encoding: 0=Mon..6=Sun (matches `db/schema.ts` and `lib/validation`).
 */

import type { HabitCadence } from '@/db/schema';

const WEEKDAY_SHORT: ReadonlyArray<string> = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
];

const WEEKDAY_FULL: ReadonlyArray<string> = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/**
 * Compact one-line label for a habit cadence. Used in list rows, today view,
 * habit detail eyebrow.
 *
 * Examples:
 *   { kind: 'daily' }                                  -> "Daily"
 *   { kind: 'weekly_count', perWeek: 5 }               -> "5 per week"
 *   { kind: 'specific_weekdays', weekdays: [0,2,4] }   -> "Mon · Wed · Fri"
 *   { kind: 'specific_weekdays', weekdays: 0..4 }      -> "Weekdays"
 *   { kind: 'specific_weekdays', weekdays: [5,6] }     -> "Weekends"
 *   { kind: 'specific_weekdays', weekdays: 0..6 }      -> "Every day"
 */
export function formatCadence(cadence: HabitCadence): string {
  if (cadence.kind === 'daily') return 'Daily';
  if (cadence.kind === 'weekly_count') {
    return `${cadence.perWeek} per week`;
  }
  // specific_weekdays
  const wd = [...cadence.weekdays].sort((a, b) => a - b);
  if (wd.length === 0) return 'No days';
  if (wd.length === 7) return 'Every day';
  if (wd.length === 5 && wd.every((v, i) => v === i)) return 'Weekdays';
  if (wd.length === 2 && wd[0] === 5 && wd[1] === 6) return 'Weekends';
  return wd.map((d) => WEEKDAY_SHORT[d]).join(' · ');
}

/**
 * Long-form accessible label for screen readers. Avoids the "·" glyph and uses
 * full weekday names.
 */
export function formatCadenceAccessible(cadence: HabitCadence): string {
  if (cadence.kind === 'daily') return 'Daily';
  if (cadence.kind === 'weekly_count') {
    return `${cadence.perWeek} times per week`;
  }
  const wd = [...cadence.weekdays].sort((a, b) => a - b);
  if (wd.length === 0) return 'No days scheduled';
  if (wd.length === 7) return 'Every day';
  return wd.map((d) => WEEKDAY_FULL[d]).join(', ');
}

/**
 * Is the given date due for this cadence? (Client-side mirror of the
 * server-side `isDueOn` in `lib/habits/streaks.ts`. Kept independent so the
 * client doesn't need to import `server-only` modules.)
 *
 * `weekday` is 0=Mon..6=Sun.
 */
export function isCadenceDueOnWeekday(
  cadence: HabitCadence,
  weekday: number,
): boolean {
  if (cadence.kind === 'daily') return true;
  if (cadence.kind === 'weekly_count') return true; // every day is eligible
  return cadence.weekdays.includes(weekday);
}

/**
 * Pure shape used by the today view's weekly_count progress sub-label.
 * Returns the two numbers plus a `complete` flag so the caller can apply
 * the calm "week complete" color treatment without duplicating the check.
 *
 * No JSX here — the caller composes the spans (mono numerals + sans
 * connectors) so it stays a tiny pure helper that's safe in either env.
 */
export type WeekProgress = {
  count: number;
  target: number;
  complete: boolean;
};

export function formatWeekProgress(
  count: number,
  target: number,
): WeekProgress {
  const safeCount = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
  const safeTarget = Number.isFinite(target) && target > 0 ? Math.floor(target) : 0;
  return {
    count: safeCount,
    target: safeTarget,
    complete: safeTarget > 0 && safeCount >= safeTarget,
  };
}
