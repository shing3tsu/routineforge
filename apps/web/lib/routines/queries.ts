/**
 * Server-only Drizzle queries for routines, shared between API route handlers
 * and server components.
 *
 * Why this file exists: the routines pages need the same data as the API
 * routes. Rather than doing a server-side `fetch('/api/routines')` from a
 * server component (which would self-hit Next.js and require cookie
 * forwarding), we factor the Drizzle reads into a small helper module that
 * both the page and (potentially) the route handler can call.
 *
 * Note: we do NOT modify the existing API route handlers in this dispatch.
 * They keep their inline queries; this file is additive and is consumed only
 * by the new server components in `app/routines/**`.
 */

import 'server-only';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { db } from '@/db';
import { routines, routineDaySteps, routineStepCompletions } from '@/db/schema';
import {
  addDaysInTz,
  isoWeekdayInTz,
  todayInTz,
} from '@/lib/habits/streaks';

// ---------------------------------------------------------------------------
// Shared types (kept loose / serializable so the page can pass them into
// client components without converting types).
// ---------------------------------------------------------------------------

/**
 * One day's slot in the {@link RoutineListItem.lastSevenDays} array.
 *
 *   - `date`:      'YYYY-MM-DD' in the routine's tz (NOT server tz).
 *   - `scheduled`: number of routine_day_steps rows whose `weekday` matches the
 *                  weekday of `date` (in the routine's tz). 0 = "off day".
 *   - `total`:     alias of `scheduled` exposed under the name the polished
 *                  routines list page consumes. Same value, different name.
 *                  Kept as a separate field (rather than renaming) so existing
 *                  API consumers reading `scheduled` continue to work; both
 *                  fields are always populated and always equal.
 *   - `completed`: number of routine_step_completions for THIS routine on
 *                  `date` for the owner user. Capped at `scheduled` would be
 *                  wrong: we deliberately don't cap so the UI can detect
 *                  consistency anomalies (e.g. user completed a step that's
 *                  no longer in today's slot because they edited the routine).
 *                  In practice, completed <= scheduled in normal usage.
 */
export type RoutineDayStat = {
  date: string;
  scheduled: number;
  total: number;
  completed: number;
};

export type RoutineListItem = {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  category: string | null;
  location: string | null;
  scheduleWeekdays: number[];
  updatedAt: string;
  // Per-routine today + last-7-days stats (additive, frontend list polish).
  /** Number of steps scheduled for the routine's today-weekday (in routine tz). */
  stepCountToday: number;
  /** Number of those steps the user has completed today (in routine tz). */
  stepsCompletedToday: number;
  /** `stepCountToday > 0`. Convenience flag for the UI. */
  isScheduledToday: boolean;
  /**
   * Last 7 LOCAL dates in the routine's tz, oldest first; today is the last
   * entry. Each entry has `{ date, scheduled, total, completed }` (`total`
   * mirrors `scheduled`) so the UI can compute completion ratios / draw a
   * mini-heatmap without further math.
   */
  lastSevenDays: RoutineDayStat[];
};

export type RoutineStep = {
  id: string;
  routineId: string;
  weekday: number;
  position: number;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type RoutineDetail = {
  id: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  timezone: string;
  category: string | null;
  location: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  scheduleWeekdays: number[];
  stepsByWeekday: Record<number, RoutineStep[]>;
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * List the user's non-archived routines, sorted by name, with each routine's
 * derived `scheduleWeekdays` (the weekdays that have at least one step) plus
 * today + last-7-days stats so the routines list page can render progress
 * without a second round-trip.
 *
 * Implementation: batched (NOT N+1). For N routines we do exactly 3 DB reads
 * regardless of how many completions exist:
 *
 *   1. The routines themselves.
 *   2. ALL step rows for those routines (just `(routineId, weekday)`) — used
 *      to compute both `scheduleWeekdays` and per-(routine, weekday) step
 *      counts (so we don't load step titles we don't need here).
 *   3. ALL completions for those routines + user within the union 7-day
 *      window (min..max across per-routine tzs), pulled with a single
 *      indexed range scan. Per-routine filtering happens in JS.
 *
 * Per-routine timezone handling: each routine resolves its own "today" and
 * weekday in its own IANA tz (mirrors the habits-side convention). A user
 * whose routines live in mixed tzs gets the right local date per row.
 *
 * Mirrors the shape of `GET /api/routines` so the page renders the same data.
 */
export async function listRoutinesForUser(
  userId: string,
): Promise<RoutineListItem[]> {
  // ---- 1) Routines ---------------------------------------------------------
  const rows = await db
    .select({
      id: routines.id,
      name: routines.name,
      description: routines.description,
      timezone: routines.timezone,
      category: routines.category,
      location: routines.location,
      updatedAt: routines.updatedAt,
    })
    .from(routines)
    .where(and(eq(routines.ownerUserId, userId), isNull(routines.archivedAt)))
    .orderBy(asc(routines.name));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  // ---- 2) Steps: just (routineId, weekday) for both scheduleWeekdays and
  //              per-(routine, weekday) step counts.
  //
  // We need COUNT per (routineId, weekday), not just DISTINCT weekdays, so we
  // pull every step row (one column) and tally in JS. A single step row is
  // ~40 bytes over the wire — fine for MVP scale.
  const stepRows = await db
    .select({
      routineId: routineDaySteps.routineId,
      weekday: routineDaySteps.weekday,
    })
    .from(routineDaySteps)
    .where(inArray(routineDaySteps.routineId, ids));

  // Per-routine, per-weekday step count: Map<routineId, Map<weekday, count>>.
  const stepCountByRoutineWeekday = new Map<string, Map<number, number>>();
  for (const s of stepRows) {
    let inner = stepCountByRoutineWeekday.get(s.routineId);
    if (!inner) {
      inner = new Map();
      stepCountByRoutineWeekday.set(s.routineId, inner);
    }
    inner.set(s.weekday, (inner.get(s.weekday) ?? 0) + 1);
  }

  // scheduleWeekdays = sorted keys of inner map for each routine.
  const weekdaysByRoutine = new Map<string, number[]>();
  for (const [routineId, inner] of stepCountByRoutineWeekday.entries()) {
    weekdaysByRoutine.set(
      routineId,
      Array.from(inner.keys()).sort((a, b) => a - b),
    );
  }

  // ---- 3) Per-routine date math (in each routine's own tz).
  //
  // For each routine we resolve:
  //   - todayLocal: 'YYYY-MM-DD' in routine.timezone
  //   - sevenDates: oldest..today, length 7
  //   - perDateWeekday: weekday for each of those 7 dates (in routine.tz)
  //
  // We also collect the GLOBAL min/max date string across all routines to
  // bound the completions query below.
  type RoutineDateMeta = {
    sevenDates: string[];
    perDateWeekday: number[];
    todayLocal: string;
    todayWeekday: number;
  };
  const dateMetaByRoutine = new Map<string, RoutineDateMeta>();
  let globalMinDate: string | null = null;
  let globalMaxDate: string | null = null;
  for (const r of rows) {
    const todayLocal = todayInTz(r.timezone);
    const sevenDates: string[] = [];
    const perDateWeekday: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = i === 0 ? todayLocal : addDaysInTz(todayLocal, -i, r.timezone);
      sevenDates.push(d);
      perDateWeekday.push(isoWeekdayInTz(d, r.timezone));
    }
    const todayWeekday = perDateWeekday[6]!;
    dateMetaByRoutine.set(r.id, {
      sevenDates,
      perDateWeekday,
      todayLocal,
      todayWeekday,
    });
    const oldest = sevenDates[0]!;
    const newest = sevenDates[6]!;
    if (globalMinDate === null || oldest < globalMinDate) globalMinDate = oldest;
    if (globalMaxDate === null || newest > globalMaxDate) globalMaxDate = newest;
  }

  // ---- 4) Completions for these routines + user within the union 7-day
  //         window. One bounded query; per-routine filtering in JS.
  //
  // Why filter on `date` server-side: even at MVP scale this is the cheapest
  // way to skip historical rows. The `routine_step_completions_routine_date_idx`
  // (routine_id, date) index covers the predicate.
  const completionRows =
    globalMinDate !== null && globalMaxDate !== null
      ? await db
          .select({
            routineId: routineStepCompletions.routineId,
            stepId: routineStepCompletions.stepId,
            date: routineStepCompletions.date,
          })
          .from(routineStepCompletions)
          .where(
            and(
              inArray(routineStepCompletions.routineId, ids),
              eq(routineStepCompletions.userId, userId),
              gte(routineStepCompletions.date, globalMinDate),
              lte(routineStepCompletions.date, globalMaxDate),
            ),
          )
      : [];

  // Bucket by (routineId, date) -> set of completed stepIds (set so duplicates
  // — which the UNIQUE index prevents anyway — can't double-count).
  const completionsByRoutineDate = new Map<string, Set<string>>();
  const keyFor = (routineId: string, date: string) => `${routineId}|${date}`;
  for (const c of completionRows) {
    const k = keyFor(c.routineId, c.date);
    let set = completionsByRoutineDate.get(k);
    if (!set) {
      set = new Set();
      completionsByRoutineDate.set(k, set);
    }
    set.add(c.stepId);
  }

  // ---- 5) Assemble per-routine payloads.
  return rows.map((r) => {
    const meta = dateMetaByRoutine.get(r.id)!;
    const stepCountByWeekday = stepCountByRoutineWeekday.get(r.id) ?? new Map();

    const stepCountToday = stepCountByWeekday.get(meta.todayWeekday) ?? 0;
    const todayKey = keyFor(r.id, meta.todayLocal);
    const stepsCompletedToday = completionsByRoutineDate.get(todayKey)?.size ?? 0;

    const lastSevenDays: RoutineDayStat[] = meta.sevenDates.map((date, idx) => {
      const weekday = meta.perDateWeekday[idx]!;
      const scheduled = stepCountByWeekday.get(weekday) ?? 0;
      const completed =
        completionsByRoutineDate.get(keyFor(r.id, date))?.size ?? 0;
      // `total` is an alias of `scheduled` (see RoutineDayStat docstring).
      return { date, scheduled, total: scheduled, completed };
    });

    return {
      id: r.id,
      name: r.name,
      description: r.description,
      timezone: r.timezone,
      category: r.category,
      location: r.location,
      scheduleWeekdays: weekdaysByRoutine.get(r.id) ?? [],
      updatedAt: r.updatedAt.toISOString(),
      stepCountToday,
      stepsCompletedToday,
      isScheduledToday: stepCountToday > 0,
      lastSevenDays,
    };
  });
}

/**
 * Fetch a single routine plus all its steps grouped by weekday.
 *
 * Returns `null` when the routine is not found OR is not owned by the user
 * (deliberately ambiguous: matches the API contract).
 */
export async function getRoutineForUser(
  routineId: string,
  userId: string,
): Promise<RoutineDetail | null> {
  const [row] = await db
    .select()
    .from(routines)
    .where(
      and(
        eq(routines.id, routineId),
        eq(routines.ownerUserId, userId),
        isNull(routines.archivedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  const steps = await db
    .select()
    .from(routineDaySteps)
    .where(eq(routineDaySteps.routineId, row.id))
    .orderBy(asc(routineDaySteps.weekday), asc(routineDaySteps.position));

  const stepsByWeekday: Record<number, RoutineStep[]> = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  };
  for (const s of steps) {
    stepsByWeekday[s.weekday]!.push({
      id: s.id,
      routineId: s.routineId,
      weekday: s.weekday,
      position: s.position,
      title: s.title,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    });
  }

  const scheduleWeekdays = Object.entries(stepsByWeekday)
    .filter(([, v]) => v.length > 0)
    .map(([k]) => Number(k))
    .sort((a, b) => a - b);

  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    description: row.description,
    timezone: row.timezone,
    category: row.category,
    location: row.location,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    scheduleWeekdays,
    stepsByWeekday,
  };
}

// ---------------------------------------------------------------------------
// Distinct category / location suggestions (for form datalists)
// ---------------------------------------------------------------------------

/**
 * Distinct non-null `category` values across the user's non-archived routines.
 * Used to populate the `<datalist>` suggestions on the new-routine form so a
 * user with existing categories ("Wellness", "Fitness") gets a quick pick
 * without having to retype.
 *
 * Sorted alphabetically (case-insensitive) for stable UI. Empty list when the
 * user has never set a category — caller renders the `<datalist>` regardless
 * so the input keeps its native "with suggestions" affordance.
 */
export async function getDistinctCategoriesForUser(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: routines.category })
    .from(routines)
    .where(
      and(
        eq(routines.ownerUserId, userId),
        isNull(routines.archivedAt),
        isNotNull(routines.category),
      ),
    );
  const out = rows
    .map((r) => r.category)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return out;
}

/**
 * Distinct non-null `location` values across the user's non-archived routines.
 * Mirror of {@link getDistinctCategoriesForUser}; see that for rationale.
 */
export async function getDistinctLocationsForUser(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ location: routines.location })
    .from(routines)
    .where(
      and(
        eq(routines.ownerUserId, userId),
        isNull(routines.archivedAt),
        isNotNull(routines.location),
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
 * One step within a "today's routine" payload, including the user's completion
 * state for the date in question.
 */
export type TodayRoutineStep = {
  id: string;
  title: string;
  position: number;
  completed: boolean;
};

/**
 * A routine that has steps scheduled for "today" (in the routine's tz) plus
 * the per-step completion state for the user.
 *
 * `todayLocal` is the 'YYYY-MM-DD' the steps were resolved against (in the
 * routine's timezone). The client uses it to make POST/DELETE calls with the
 * same canonical date the server already computed.
 */
export type TodayRoutine = {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  category: string | null;
  location: string | null;
  /** ISO weekday (0=Mon..6=Sun) in the routine's tz used to pick the steps. */
  weekday: number;
  /** Today's local date in the routine's tz, 'YYYY-MM-DD'. */
  todayLocal: string;
  steps: TodayRoutineStep[];
};

/**
 * List the user's active routines that have at least one step for *today*
 * (today = local date in the routine's IANA timezone). For each routine,
 * returns its today-weekday steps plus the user's completion state.
 *
 * `asOfDate` is an optional override useful for tests and for the (hypothetical)
 * "show me tomorrow's plan" view. When omitted, defaults to today in EACH
 * routine's own timezone — a user with routines in mixed tzs gets the right
 * day-of-week per routine.
 *
 * Implementation notes:
 *   - O(routines) tz computations + 2 grouped DB reads (steps for the day,
 *     completions for the day) joined client-side. Avoids N+1.
 *   - Only routines whose today-weekday has ≥1 step are returned. A routine
 *     with steps only for Mon/Wed/Fri is NOT in "today" on a Tuesday.
 */
export async function listTodaysRoutinesForUser(
  userId: string,
  asOfDate?: string,
): Promise<TodayRoutine[]> {
  // 1) All active routines for the user.
  const ownedRoutines = await db
    .select({
      id: routines.id,
      name: routines.name,
      description: routines.description,
      timezone: routines.timezone,
      category: routines.category,
      location: routines.location,
    })
    .from(routines)
    .where(and(eq(routines.ownerUserId, userId), isNull(routines.archivedAt)))
    .orderBy(asc(routines.name));

  if (ownedRoutines.length === 0) return [];

  // 2) Resolve today's weekday + local date per routine (in its own tz).
  const meta = ownedRoutines.map((r) => {
    const localDate = asOfDate ?? todayInTz(r.timezone);
    const weekday = isoWeekdayInTz(localDate, r.timezone);
    return { ...r, todayLocal: localDate, weekday };
  });

  const routineIds = meta.map((r) => r.id);

  // 3) Pull all (routine, weekday) steps for the routines in one shot. We
  // filter to the right weekday per routine in JS because each routine has its
  // own tz-derived weekday.
  const allSteps = await db
    .select({
      id: routineDaySteps.id,
      routineId: routineDaySteps.routineId,
      weekday: routineDaySteps.weekday,
      position: routineDaySteps.position,
      title: routineDaySteps.title,
    })
    .from(routineDaySteps)
    .where(inArray(routineDaySteps.routineId, routineIds))
    .orderBy(asc(routineDaySteps.position));

  // Group steps by (routineId, weekday).
  const stepsByRoutineDay = new Map<string, typeof allSteps>();
  for (const s of allSteps) {
    const key = `${s.routineId}:${s.weekday}`;
    const list = stepsByRoutineDay.get(key) ?? [];
    list.push(s);
    stepsByRoutineDay.set(key, list);
  }

  // 4) Pull completions for these routines for the relevant dates. Since each
  // routine may resolve to a different local date (mixed tzs), we collect the
  // unique (routineId, date) pairs and query with an IN over routine ids,
  // filtering by date in JS for correctness.
  const completionRows = await db
    .select({
      stepId: routineStepCompletions.stepId,
      routineId: routineStepCompletions.routineId,
      date: routineStepCompletions.date,
    })
    .from(routineStepCompletions)
    .where(
      and(
        inArray(routineStepCompletions.routineId, routineIds),
        eq(routineStepCompletions.userId, userId),
      ),
    );

  // Build a set of completed step ids keyed by (routineId, date) lookup.
  const completedKey = (routineId: string, date: string, stepId: string) =>
    `${routineId}|${date}|${stepId}`;
  const completedSet = new Set<string>();
  for (const c of completionRows) {
    completedSet.add(completedKey(c.routineId, c.date, c.stepId));
  }

  // 5) Assemble per-routine payloads; skip routines with no steps today.
  const out: TodayRoutine[] = [];
  for (const r of meta) {
    const daySteps = stepsByRoutineDay.get(`${r.id}:${r.weekday}`) ?? [];
    if (daySteps.length === 0) continue;
    out.push({
      id: r.id,
      name: r.name,
      description: r.description,
      timezone: r.timezone,
      category: r.category,
      location: r.location,
      weekday: r.weekday,
      todayLocal: r.todayLocal,
      steps: daySteps.map((s) => ({
        id: s.id,
        title: s.title,
        position: s.position,
        completed: completedSet.has(completedKey(r.id, r.todayLocal, s.id)),
      })),
    });
  }
  return out;
}
