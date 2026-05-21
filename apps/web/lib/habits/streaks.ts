/**
 * Pure server-side streak math for habits.
 *
 * Design rationale (the part that bites):
 *
 *   - **Server-side only**: the client never sends a streak count; we always
 *     recompute from the completion rows. This is the only way to keep the
 *     numbers consistent across devices + protect against tampering.
 *
 *   - **Pure function**: no DB calls. The caller (route handler) does the
 *     query, then hands a sorted `completionDates` array + the cadence + tz
 *     + asOfDate to `computeStreaks`. Makes the function trivially testable
 *     without a database (backend-test will cover edge cases next dispatch).
 *
 *   - **Calendar-day math, not 24-hour math**: DST flips (e.g. America/
 *     Los_Angeles "spring forward" in March) mean two consecutive local dates
 *     can be 23 OR 25 hours apart. We never use millisecond subtraction for
 *     day boundaries. Instead we work entirely in `'YYYY-MM-DD'` strings in
 *     the habit's IANA timezone, with `addDaysInTz` doing tz-aware
 *     calendar-day arithmetic via `Intl.DateTimeFormat`.
 *
 *   - **Habit created mid-streak**: streak counting stops at the habit's
 *     creation date. Pre-creation due dates are NOT counted as misses.
 *
 *   - **Three numbers per habit**: currentStreak, longestStreak, totalCompletions.
 *     - For `daily` / `specific_weekdays`: streak counts consecutive DUE +
 *       COMPLETED dates ending at `asOfDate`. Non-due days don't break the
 *       streak (they just don't count toward it).
 *     - For `weekly_count`: streak counts consecutive WEEKS (per `weekStart`)
 *       where the user hit `perWeek` completions. The current partial week
 *       only counts if it already has `perWeek` completions; otherwise the
 *       streak ends at the most recently *completed* week that hit perWeek.
 *
 * `date-fns-tz` vs alternatives: I considered adding `date-fns-tz` per the
 * dispatch hint, but the only date primitive we actually need is "given a
 * 'YYYY-MM-DD' local date + an IANA tz, what's that date plus N days in the
 * SAME tz". That's a 30-line helper using `Intl.DateTimeFormat` (built into
 * Node 22), and it dodges the package-install + lockfile churn. We can swap
 * to `date-fns-tz` later if/when we need formatting beyond YYYY-MM-DD. Keeps
 * the dispatch tight.
 */

import 'server-only';
import type { HabitCadence } from '@/db/schema';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type StreakResult = {
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  /** Most recent completion date, ISO 'YYYY-MM-DD' (in habit tz), or null. */
  lastCompletedDate: string | null;
};

/**
 * Inputs for the pure streak computation. All dates are local 'YYYY-MM-DD'
 * strings in the habit's `timezone`.
 */
export type StreakInputs = {
  cadence: HabitCadence;
  /** IANA timezone the habit lives in. */
  timezone: string;
  /** Sorted list of completion dates (de-duped, ascending). */
  completionDates: readonly string[];
  /** Today in habit tz (or whatever reference point the caller wants). */
  asOfDate: string;
  /** Habit creation date in habit tz. Streak math never crosses this boundary. */
  habitCreatedDate: string;
};

// ---------------------------------------------------------------------------
// Calendar-day math in an IANA timezone
// ---------------------------------------------------------------------------

/**
 * Format a 'YYYY-MM-DD' for a Date at a given fixed UTC offset (in hours).
 * Internal helper: works by shifting the UTC instant by the offset and reading
 * the resulting UTC wall-clock as if it were local. Side-steps Intl entirely.
 */
function formatYmdAtOffsetHours(date: Date, offsetHours: number): string {
  const shifted = new Date(date.getTime() + offsetHours * 3600 * 1000);
  // Use UTC getters on the SHIFTED instant so we never touch local time.
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Try formatting via a fixed-offset shortcut. Windows ICU (small-icu) doesn't
 * ship the full set of `Etc/GMT+N` fixed-offset zones, so
 * `Intl.DateTimeFormat` with one of those zones throws RangeError. We detect
 * the common fixed-offset zones up-front and handle them with pure math.
 *
 * Returns the formatted YYYY-MM-DD if `tz` matched a known fixed-offset zone,
 * otherwise null (caller falls back to Intl).
 *
 * POSIX sign convention: `Etc/GMT+N` is UTC-N, `Etc/GMT-N` is UTC+N (inverted).
 */
function tryFixedOffsetFormat(date: Date, tz: string): string | null {
  if (tz === 'UTC' || tz === 'Etc/UTC' || tz === 'Etc/GMT' || tz === 'GMT') {
    return formatYmdAtOffsetHours(date, 0);
  }
  const m = /^Etc\/GMT([+-])(\d{1,2})$/.exec(tz);
  if (!m) return null;
  const sign = m[1] === '+' ? -1 : 1; // POSIX-inverted
  const hours = Number(m[2]) * sign;
  return formatYmdAtOffsetHours(date, hours);
}

/**
 * Read the offset of `tz` from UTC, in MINUTES, at the given instant. Positive
 * means tz is ahead of UTC (e.g. Asia/Tokyo = +540), negative means behind
 * (e.g. America/Los_Angeles = -480 in PDT, -420 in PST... wait, PST is -480
 * and PDT is -420 — corrected: -480 PST, -420 PDT).
 *
 * Works by formatting the instant in `tz` via `Intl.DateTimeFormat` and
 * subtracting that from the same wall-clock time interpreted as UTC.
 *
 * Falls back to a pure-math computation for fixed-offset zones (avoids Intl
 * on Windows where Etc/GMT+N can throw RangeError).
 */
function tzOffsetMinutesAt(date: Date, tz: string): number {
  if (tz === 'UTC' || tz === 'Etc/UTC' || tz === 'Etc/GMT' || tz === 'GMT') {
    return 0;
  }
  const fixedMatch = /^Etc\/GMT([+-])(\d{1,2})$/.exec(tz);
  if (fixedMatch) {
    const sign = fixedMatch[1] === '+' ? -1 : 1;
    return Number(fixedMatch[2]) * sign * 60;
  }
  // Format the date in `tz` and reconstruct the wall-clock as if it were UTC.
  // The diff between that reconstruction and the actual instant is the offset.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const y = get('year');
  const mo = get('month');
  const d = get('day');
  let h = get('hour');
  const mi = get('minute');
  const s = get('second');
  // hourCycle 'h23' can still emit '24' for midnight in some en-US ICU builds;
  // normalize to 0 (the date part already reflects the rollover).
  if (h === 24) h = 0;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/**
 * Construct a Date representing 12:00 LOCAL TIME on `ymd` in `tz`.
 *
 * Why: anchoring `addDaysInTz` at noon UTC breaks for UTC+12+ zones (e.g.
 * Pacific/Auckland). Noon UTC of 2026-05-20 is 2026-05-21 00:00 NZST — already
 * past the local midnight boundary. Subtracting 1 calendar day then returns
 * 2026-05-20 (not 2026-05-19) because the UTC anchor sat on the next local
 * day. Anchoring at noon LOCAL keeps us comfortably mid-day in any tz.
 *
 * Strategy: pick a rough UTC anchor (noon UTC on the desired ymd), read the
 * tz's offset at that instant, then compute the true UTC instant for 12:00
 * local on the desired ymd. The offset can shift across DST boundaries, so
 * we iterate once: re-read the offset at the corrected instant and adjust.
 */
function noonInTz(ymd: string, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  // tz_local = UTC + offset.  We want tz_local = ymd 12:00:00.
  // => UTC instant = (ymd 12:00 as if it were UTC) - offset.
  const naiveLocalAsUtc = Date.UTC(y!, m! - 1, d!, 12, 0, 0);
  // First estimate: read offset at a UTC instant near the same calendar date.
  let offsetMin = tzOffsetMinutesAt(new Date(naiveLocalAsUtc), tz);
  let candidate = new Date(naiveLocalAsUtc - offsetMin * 60000);
  // If we crossed a DST boundary, the offset at the candidate may differ.
  // One refinement is enough for any real-world DST transition (≤1 hour).
  const refinedOffset = tzOffsetMinutesAt(candidate, tz);
  if (refinedOffset !== offsetMin) {
    candidate = new Date(naiveLocalAsUtc - refinedOffset * 60000);
  }
  return candidate;
}

/**
 * Format a Date as 'YYYY-MM-DD' in the given IANA timezone. en-CA happens to
 * format as YYYY-MM-DD natively, which dodges locale parsing.
 *
 * Fixed-offset zones (Etc/GMT+N, Etc/UTC, UTC, GMT) use a pure-math fast path
 * because Windows ICU's small-icu build doesn't ship the full Etc/* set and
 * `Intl.DateTimeFormat` throws RangeError for many of them.
 */
export function formatLocalDateInTz(date: Date, timezone: string): string {
  const fixed = tryFixedOffsetFormat(date, timezone);
  if (fixed !== null) return fixed;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
}

/**
 * Today's local 'YYYY-MM-DD' in the given timezone.
 */
export function todayInTz(timezone: string, now: Date = new Date()): string {
  return formatLocalDateInTz(now, timezone);
}

/**
 * Add `days` to a 'YYYY-MM-DD' local date in the given IANA timezone.
 *
 * Why this is non-trivial: a local date like '2026-03-08' in 'America/
 * Los_Angeles' could be ambiguous in UTC (DST spring-forward means 02:00 ->
 * 03:00 doesn't exist locally). We anchor at noon LOCAL TIME in the target tz
 * (via `noonInTz`), add `days` via UTC date arithmetic, then re-project. Noon
 * local sits comfortably in the middle of any day, even in extreme zones like
 * UTC+12+ where noon UTC would already be past local midnight (and would
 * cause `-1 day` to round-trip back to the same date).
 */
export function addDaysInTz(
  dateStr: string,
  days: number,
  timezone: string,
): string {
  const anchor = noonInTz(dateStr, timezone);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return formatLocalDateInTz(anchor, timezone);
}

/**
 * ISO weekday for a local 'YYYY-MM-DD' date in the given timezone. Returns
 * 0=Monday..6=Sunday (matches the codebase convention; NOT JS getDay()'s
 * 0=Sunday).
 *
 * Anchors at noon LOCAL TIME so we never cross the local midnight boundary
 * in extreme tz like UTC+12+ (Pacific/Auckland) or UTC-12 (Etc/GMT+12). Also
 * uses the fixed-offset shortcut so Etc/GMT+N works on Windows ICU.
 */
export function isoWeekdayInTz(dateStr: string, timezone: string): number {
  const anchor = noonInTz(dateStr, timezone);
  // For fixed-offset zones, derive the weekday directly via UTC math on the
  // same shifted instant we use for date formatting. This avoids Intl on
  // Windows where Etc/GMT+N may not exist in the small-icu build.
  const fixedFmt = tryFixedOffsetFormat(anchor, timezone);
  if (fixedFmt !== null) {
    // fixedFmt is YYYY-MM-DD; derive weekday from a UTC midnight Date.
    const [y, m, d] = fixedFmt.split('-').map(Number);
    const jsDay = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0=Sun..6=Sat
    // Convert JS 0=Sun..6=Sat → ISO 0=Mon..6=Sun.
    return (jsDay + 6) % 7;
  }
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(anchor);
  // Map en-US short names to ISO 0..6.
  const map: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  return map[wd] ?? 0;
}

/**
 * Compare two 'YYYY-MM-DD' date strings lexically. Works correctly because
 * the format is zero-padded ISO order.
 */
export function compareDateStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Cadence helpers
// ---------------------------------------------------------------------------

/**
 * Is the given local date a "due date" for this cadence? (Pre-creation
 * filtering is the caller's job — see `computeStreaks`.)
 *
 *   - daily: every date is due.
 *   - specific_weekdays: only the listed ISO weekdays.
 *   - weekly_count: handled separately (per-week, not per-day) so this returns
 *     `true` (every day counts as a potential completion day).
 */
export function isDueOn(
  dateStr: string,
  cadence: HabitCadence,
  timezone: string,
): boolean {
  if (cadence.kind === 'daily') return true;
  if (cadence.kind === 'specific_weekdays') {
    return cadence.weekdays.includes(isoWeekdayInTz(dateStr, timezone));
  }
  // weekly_count: every day is "eligible"; the streak math counts per-week.
  return true;
}

/**
 * Given a local date and a `weekStart` (0..6, ISO), return the first day of
 * that week as a 'YYYY-MM-DD' string in the same tz.
 *
 * e.g. weekStart=0 (Monday) and dateStr=Wednesday -> the previous Monday.
 */
export function weekStartFor(
  dateStr: string,
  weekStart: number,
  timezone: string,
): string {
  const wd = isoWeekdayInTz(dateStr, timezone);
  // How many days back to the most recent `weekStart`?
  const diff = (wd - weekStart + 7) % 7;
  return addDaysInTz(dateStr, -diff, timezone);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Compute current / longest / total streak numbers from the inputs.
 *
 * The caller is responsible for:
 *   - Querying completion dates for this (habit, user).
 *   - De-duping them (the UNIQUE index on `habit_completions` already does
 *     this at write time, but defensive de-dup here costs nothing).
 *   - Sorting ascending.
 *   - Passing the habit's creation date as YYYY-MM-DD in the habit tz.
 */
export function computeStreaks(inputs: StreakInputs): StreakResult {
  const { cadence, timezone, completionDates, asOfDate, habitCreatedDate } = inputs;

  const totalCompletions = completionDates.length;
  const lastCompletedDate =
    completionDates.length === 0
      ? null
      : (completionDates[completionDates.length - 1] ?? null);

  if (cadence.kind === 'weekly_count') {
    return {
      ...computeWeeklyCountStreaks({
        perWeek: cadence.perWeek,
        weekStart: cadence.weekStart,
        timezone,
        completionDates,
        asOfDate,
        habitCreatedDate,
      }),
      totalCompletions,
      lastCompletedDate,
    };
  }

  return {
    ...computeDailyOrSpecificStreaks({
      cadence,
      timezone,
      completionDates,
      asOfDate,
      habitCreatedDate,
    }),
    totalCompletions,
    lastCompletedDate,
  };
}

// ---------------------------------------------------------------------------
// Daily / specific_weekdays branch
// ---------------------------------------------------------------------------

function computeDailyOrSpecificStreaks(args: {
  cadence: Extract<HabitCadence, { kind: 'daily' } | { kind: 'specific_weekdays' }>;
  timezone: string;
  completionDates: readonly string[];
  asOfDate: string;
  habitCreatedDate: string;
}): { currentStreak: number; longestStreak: number } {
  const { cadence, timezone, completionDates, asOfDate, habitCreatedDate } = args;
  const completedSet = new Set(completionDates);

  // --- currentStreak: walk backward from asOfDate to habitCreatedDate.
  // For each DUE date encountered, it must be completed; if not, break.
  // Non-due dates are skipped (don't count toward, don't break).
  let currentStreak = 0;
  let cursor = asOfDate;
  while (compareDateStrings(cursor, habitCreatedDate) >= 0) {
    if (isDueOn(cursor, cadence, timezone)) {
      if (completedSet.has(cursor)) {
        currentStreak += 1;
      } else {
        break;
      }
    }
    cursor = addDaysInTz(cursor, -1, timezone);
  }

  // --- longestStreak: walk forward from the earliest of (habitCreatedDate,
  // first completion) to asOfDate, tracking the longest run of consecutive
  // DUE-AND-COMPLETED dates. Same rule: non-due dates skip; missed due dates
  // reset the run to zero. Bounded walk = O(span_in_days), which is fine for
  // any realistic habit (years of daily habits = ~3650 iterations).
  const startDate =
    completionDates.length > 0 && completionDates[0]! < habitCreatedDate
      ? completionDates[0]!
      : habitCreatedDate;

  let longestStreak = 0;
  let run = 0;
  let walk = startDate;
  // Safety bound: at most ~50 years of daily iterations before we bail out.
  const MAX_ITERATIONS = 50 * 366;
  let i = 0;
  while (compareDateStrings(walk, asOfDate) <= 0 && i < MAX_ITERATIONS) {
    if (isDueOn(walk, cadence, timezone)) {
      if (completedSet.has(walk)) {
        run += 1;
        if (run > longestStreak) longestStreak = run;
      } else {
        run = 0;
      }
    }
    walk = addDaysInTz(walk, 1, timezone);
    i += 1;
  }

  return { currentStreak, longestStreak };
}

// ---------------------------------------------------------------------------
// weekly_count branch
// ---------------------------------------------------------------------------

function computeWeeklyCountStreaks(args: {
  perWeek: number;
  weekStart: number;
  timezone: string;
  completionDates: readonly string[];
  asOfDate: string;
  habitCreatedDate: string;
}): { currentStreak: number; longestStreak: number } {
  const { perWeek, weekStart, timezone, completionDates, asOfDate, habitCreatedDate } =
    args;

  if (completionDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  // Build a map of week-start -> completion count. We bucket completions by
  // the start-of-week date in the habit tz so we can iterate week-by-week.
  const countsByWeek = new Map<string, number>();
  for (const d of completionDates) {
    const ws = weekStartFor(d, weekStart, timezone);
    countsByWeek.set(ws, (countsByWeek.get(ws) ?? 0) + 1);
  }

  // --- longestStreak: walk weeks from the habit's first eligible week to the
  // most recent week before/including asOfDate. Run resets on any week below
  // perWeek; partial weeks count if they hit the threshold.
  const habitFirstWeek = weekStartFor(habitCreatedDate, weekStart, timezone);
  const asOfWeek = weekStartFor(asOfDate, weekStart, timezone);

  let longestStreak = 0;
  let run = 0;
  let wkCursor = habitFirstWeek;
  const MAX_WEEKS = 50 * 53; // ~50 years safety bound.
  let i = 0;
  while (compareDateStrings(wkCursor, asOfWeek) <= 0 && i < MAX_WEEKS) {
    const count = countsByWeek.get(wkCursor) ?? 0;
    if (count >= perWeek) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 0;
    }
    wkCursor = addDaysInTz(wkCursor, 7, timezone);
    i += 1;
  }

  // --- currentStreak: count consecutive weeks ending at asOfWeek where the
  // user hit perWeek. The current (in-progress) week counts ONLY if it has
  // already hit perWeek. If not, drop back to the previous completed week.
  let currentStreak = 0;
  let curWeek = asOfWeek;
  // If the in-progress (asOf) week is short of perWeek, start counting from
  // the previous week instead. (Otherwise a user mid-week with 2/3 still has
  // their prior streak intact and shouldn't see it reset to zero.)
  if ((countsByWeek.get(asOfWeek) ?? 0) < perWeek) {
    curWeek = addDaysInTz(asOfWeek, -7, timezone);
  }
  while (compareDateStrings(curWeek, habitFirstWeek) >= 0) {
    const count = countsByWeek.get(curWeek) ?? 0;
    if (count >= perWeek) {
      currentStreak += 1;
    } else {
      break;
    }
    curWeek = addDaysInTz(curWeek, -7, timezone);
  }

  return { currentStreak, longestStreak };
}
