/**
 * Server-only Drizzle queries for habits, plus the glue that combines a
 * habit row with the pure streak math in `lib/habits/streaks.ts`.
 *
 * Mirrors `lib/routines/queries.ts` in shape and intent: route handlers and
 * (eventually) server components can both import from here.
 */

import 'server-only';
import { and, asc, eq, gte, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { habits, habitCompletions, type Habit, type HabitCadence } from '@/db/schema';
import {
  computeStreaks,
  formatLocalDateInTz,
  isoWeekdayInTz,
  todayInTz,
  weekStartFor,
  addDaysInTz,
  type StreakResult,
} from './streaks';

// ---------------------------------------------------------------------------
// Shared response shapes
// ---------------------------------------------------------------------------

export type HabitWithStreaks = Habit & StreakResult;

export type HabitDetail = HabitWithStreaks & {
  /** Last 90 days of completion dates as 'YYYY-MM-DD'. Used by CalendarHeatmap. */
  completionsLast90Days: string[];
};

/**
 * Habit row enriched with the habit-tz "today" string. Server components use
 * this so the client (which can't import `streaks.ts` — it's `'server-only'`)
 * receives today's date pre-computed in the habit's timezone for things like
 * the "checked off today" indicator on the list.
 */
export type HabitListRow = HabitWithStreaks & {
  todayLocal: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find a habit owned by the user (and not archived). Returns null otherwise
 * — callers convert to 404. We deliberately do NOT distinguish "not yours"
 * from "doesn't exist" (mirrors the routines convention to avoid id leakage).
 */
export async function findOwnedHabit(
  habitId: string,
  userId: string,
): Promise<Habit | null> {
  const [row] = await db
    .select()
    .from(habits)
    .where(
      and(
        eq(habits.id, habitId),
        eq(habits.ownerUserId, userId),
        isNull(habits.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Fetch ALL completion dates for a habit/user, sorted ascending and de-duped.
 * Used as input to `computeStreaks`.
 *
 * Trade-off: this scans every completion row for the habit, which is fine for
 * normal usage (a daily habit done for 10 years = 3650 rows). If we ever need
 * to support pathological row counts, we could window to "last N years" — but
 * longestStreak is genuinely an all-time number, so we can't trim arbitrarily.
 */
export async function getAllCompletionDates(
  habitId: string,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ date: habitCompletions.date })
    .from(habitCompletions)
    .where(
      and(
        eq(habitCompletions.habitId, habitId),
        eq(habitCompletions.userId, userId),
      ),
    )
    .orderBy(asc(habitCompletions.date));
  // Drizzle's `date` column returns string 'YYYY-MM-DD' values (per the pg
  // driver default). De-dup defensively — the unique index already guarantees
  // it at write time, but cheap insurance for the streak math.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (!seen.has(r.date)) {
      seen.add(r.date);
      out.push(r.date);
    }
  }
  return out;
}

/**
 * Compute streaks for one habit. Reads all completion dates, then calls the
 * pure streak function. `asOfDate` defaults to today in the habit's timezone.
 */
export async function computeStreaksForHabit(
  habit: Habit,
  userId: string,
  asOfDate?: string,
): Promise<StreakResult> {
  const completionDates = await getAllCompletionDates(habit.id, userId);
  const tz = habit.timezone;
  const today = asOfDate ?? todayInTz(tz);
  const createdLocal = formatLocalDateInTz(habit.createdAt, tz);
  return computeStreaks({
    cadence: habit.cadence,
    timezone: tz,
    completionDates,
    asOfDate: today,
    habitCreatedDate: createdLocal,
  });
}

/**
 * List the user's non-archived habits with computed streak fields.
 * Streak math runs per-habit; for now we do N+1 reads (one query per habit's
 * completions). Optimisation opportunity: a single grouped query if habit
 * counts grow — defer until measured.
 */
export async function listHabitsForUser(
  userId: string,
): Promise<HabitWithStreaks[]> {
  const rows = await db
    .select()
    .from(habits)
    .where(and(eq(habits.ownerUserId, userId), isNull(habits.archivedAt)))
    .orderBy(asc(habits.name));

  const out: HabitWithStreaks[] = [];
  for (const h of rows) {
    const streaks = await computeStreaksForHabit(h, userId);
    out.push({ ...h, ...streaks });
  }
  return out;
}

/**
 * Server-component friendly variant of `listHabitsForUser` that also includes
 * each habit's `todayLocal` (today as 'YYYY-MM-DD' in the habit's tz). The
 * page renders a "checked off today" indicator on each row, and the client
 * has no way to compute today-in-tz without pulling in `Intl.DateTimeFormat`
 * AND the tz string per habit — so we pre-compute server-side.
 */
export async function listHabitRowsForUser(
  userId: string,
): Promise<HabitListRow[]> {
  const withStreaks = await listHabitsForUser(userId);
  return withStreaks.map((h) => ({
    ...h,
    todayLocal: todayInTz(h.timezone),
  }));
}

/**
 * Fetch one habit with streaks + the last 90 days of completion dates.
 */
export async function getHabitDetail(
  habitId: string,
  userId: string,
): Promise<HabitDetail | null> {
  const habit = await findOwnedHabit(habitId, userId);
  if (!habit) return null;
  const tz = habit.timezone;
  const today = todayInTz(tz);

  // 90 days back from today (in habit tz). We compute the cutoff in tz, then
  // pass it to Drizzle as a YYYY-MM-DD string compared against the `date`
  // column (which is already a local-date string).
  const ninetyAgoLocal = (() => {
    const [yStr, mStr, dStr] = today.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    utc.setUTCDate(utc.getUTCDate() - 89); // inclusive 90-day window
    return formatLocalDateInTz(utc, tz);
  })();

  const last90Rows = await db
    .select({ date: habitCompletions.date })
    .from(habitCompletions)
    .where(
      and(
        eq(habitCompletions.habitId, habit.id),
        eq(habitCompletions.userId, userId),
        gte(habitCompletions.date, ninetyAgoLocal),
      ),
    )
    .orderBy(asc(habitCompletions.date));

  const completionsLast90Days = last90Rows.map((r) => r.date);

  const streaks = await computeStreaksForHabit(habit, userId, today);
  return { ...habit, ...streaks, completionsLast90Days };
}

// ---------------------------------------------------------------------------
// Distinct category / location suggestions (for form datalists)
// ---------------------------------------------------------------------------

/**
 * Distinct non-null `category` values across the user's non-archived habits.
 * Used to populate the `<datalist>` suggestions on the new-habit form. Mirror
 * of the routine-side helper — habits and routines deliberately keep separate
 * lists (a "gym" habit and a "gym" routine can coexist; the form only suggests
 * within the same domain).
 *
 * Sorted alphabetically (case-insensitive).
 */
export async function getDistinctCategoriesForUser(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: habits.category })
    .from(habits)
    .where(
      and(
        eq(habits.ownerUserId, userId),
        isNull(habits.archivedAt),
        isNotNull(habits.category),
      ),
    );
  const out = rows
    .map((r) => r.category)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return out;
}

/**
 * Distinct non-null `location` values across the user's non-archived habits.
 * Mirror of {@link getDistinctCategoriesForUser}; see that for rationale.
 */
export async function getDistinctLocationsForUser(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ location: habits.location })
    .from(habits)
    .where(
      and(
        eq(habits.ownerUserId, userId),
        isNull(habits.archivedAt),
        isNotNull(habits.location),
      ),
    );
  const out = rows
    .map((r) => r.location)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return out;
}

// ---------------------------------------------------------------------------
// Today view
// ---------------------------------------------------------------------------

/**
 * A habit due for completion "today" plus enough state to render its row on
 * the today view.
 *
 *   - `completedToday` — does a completion row exist for (habit, user,
 *     todayLocal)?
 *   - `currentStreak` / `longestStreak` — for the StreakBadge.
 *   - For `weekly_count` cadence: `weekCompletedCount` and `weekTarget` so the
 *     row can show "2 of 3 this week" sub-copy.
 *   - `todayLocal` — today in the habit's tz, returned to the client so the
 *     POST/DELETE on completion can pass the same canonical date.
 */
export type TodayHabit = {
  id: string;
  name: string;
  cadence: HabitCadence;
  timezone: string;
  category: string | null;
  location: string | null;
  todayLocal: string;
  completedToday: boolean;
  currentStreak: number;
  longestStreak: number;
  /** Only present for cadence.kind === 'weekly_count'. */
  weekCompletedCount?: number;
  /** Only present for cadence.kind === 'weekly_count'. */
  weekTarget?: number;
};

/**
 * List the user's active habits that are "due today" per their cadence.
 *
 *   - `daily` → always due.
 *   - `specific_weekdays` → due iff today's weekday (in habit tz) is in the
 *     selected weekdays.
 *   - `weekly_count` → always shown ("due today" in the sense that any day this
 *     week the user can complete it). The row includes `weekCompletedCount` and
 *     `weekTarget` so the UI can show progress.
 *
 * Each habit's streak is computed via the existing pure streak math. Mirrors
 * `listHabitsForUser` for the per-habit work but pre-filters by due-today.
 */
export async function listTodaysHabitsForUser(
  userId: string,
  asOfDate?: string,
): Promise<TodayHabit[]> {
  const rows = await db
    .select()
    .from(habits)
    .where(and(eq(habits.ownerUserId, userId), isNull(habits.archivedAt)))
    .orderBy(asc(habits.name));

  if (rows.length === 0) return [];

  // 1) Filter to "due today" per cadence (in each habit's own tz).
  type WithTodayMeta = {
    habit: Habit;
    todayLocal: string;
    weekday: number;
  };
  const dueRows: WithTodayMeta[] = [];
  for (const h of rows) {
    const todayLocal = asOfDate ?? todayInTz(h.timezone);
    const weekday = isoWeekdayInTz(todayLocal, h.timezone);

    let due: boolean;
    if (h.cadence.kind === 'daily') {
      due = true;
    } else if (h.cadence.kind === 'specific_weekdays') {
      due = h.cadence.weekdays.includes(weekday);
    } else {
      // weekly_count — always shown with progress meta.
      due = true;
    }
    if (due) dueRows.push({ habit: h, todayLocal, weekday });
  }

  if (dueRows.length === 0) return [];

  // 2) Pull all completions for these habits in one go (we'll need them for
  // streak math AND for the weekly_count progress + completedToday lookups).
  const habitIds = dueRows.map((r) => r.habit.id);
  const completionRows = await db
    .select({
      habitId: habitCompletions.habitId,
      date: habitCompletions.date,
    })
    .from(habitCompletions)
    .where(
      and(
        inArray(habitCompletions.habitId, habitIds),
        eq(habitCompletions.userId, userId),
      ),
    );

  // Group + sort completions per habit so we can pass them into computeStreaks.
  const completionsByHabit = new Map<string, string[]>();
  for (const c of completionRows) {
    const list = completionsByHabit.get(c.habitId) ?? [];
    list.push(c.date);
    completionsByHabit.set(c.habitId, list);
  }
  for (const v of completionsByHabit.values()) {
    v.sort();
  }

  const out: TodayHabit[] = [];
  for (const { habit, todayLocal, weekday: _weekday } of dueRows) {
    void _weekday;
    const dates = completionsByHabit.get(habit.id) ?? [];
    const completedToday = dates.includes(todayLocal);
    const createdLocal = formatLocalDateInTz(habit.createdAt, habit.timezone);
    const streaks = computeStreaks({
      cadence: habit.cadence,
      timezone: habit.timezone,
      completionDates: dates,
      asOfDate: todayLocal,
      habitCreatedDate: createdLocal,
    });

    let weekCompletedCount: number | undefined;
    let weekTarget: number | undefined;
    if (habit.cadence.kind === 'weekly_count') {
      weekTarget = habit.cadence.perWeek;
      // Count completion dates falling in [weekStart, weekStart + 7) in tz.
      const startOfWeek = weekStartFor(
        todayLocal,
        habit.cadence.weekStart,
        habit.timezone,
      );
      const endOfWeek = addDaysInTz(startOfWeek, 7, habit.timezone);
      weekCompletedCount = 0;
      for (const d of dates) {
        if (d >= startOfWeek && d < endOfWeek) weekCompletedCount += 1;
      }
    }

    out.push({
      id: habit.id,
      name: habit.name,
      cadence: habit.cadence,
      timezone: habit.timezone,
      category: habit.category,
      location: habit.location,
      todayLocal,
      completedToday,
      currentStreak: streaks.currentStreak,
      longestStreak: streaks.longestStreak,
      ...(weekTarget !== undefined
        ? { weekCompletedCount, weekTarget }
        : {}),
    });
  }
  return out;
}
