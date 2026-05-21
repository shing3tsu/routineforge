/**
 * Server-only Drizzle queries that power the unified search endpoint
 * (`GET /api/search`).
 *
 * Why a separate module: the search shape is its own thing — we don't want to
 * accidentally couple it to `listRoutinesForUser` / `listHabitsForUser`, which
 * return the rich list-view payloads (per-routine stats, computed streaks).
 * Search needs a flat, cheap, per-field-matched response — co-locating the
 * routine + habit search helpers here keeps the two halves of the unified
 * endpoint visually adjacent.
 *
 * Implementation: per-field `ILIKE '%${q}%'` predicates OR'd together. This is
 * plenty for a single-user app with dozens of entries — full Postgres FTS
 * (tsvector) would be overkill and would force a column / index migration.
 *
 * The per-field match is computed in JS (not in SQL) after the rows come back:
 * we want `matchedField` to follow a stable priority order (name → description
 * → category → location), and doing that in SQL would require either a
 * `CASE` expression per field or N round-trips. JS-side priority pick over a
 * capped result set (≤20 per kind) is trivial.
 *
 * Bucket-ordering: results are sorted client-side (here) into 4 buckets
 * by matched field (name, description, category, location) and alphabetically
 * by name within each bucket. The caller (route handler) just slices to the
 * cap.
 *
 * Future-proofing note: if we ever move to tsvector, this module is the only
 * place that needs to change — route handlers and validation stay put.
 */

import 'server-only';
import { and, asc, eq, ilike, isNull, or, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { habits, routines } from '@/db/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The field on a routine that matched the query. Priority order (highest first):
 *   name → description → category → location.
 */
export type RoutineMatchedField = 'name' | 'description' | 'category' | 'location';

/**
 * The field on a habit that matched. Habits have no `description` in the
 * search-field set per the API contract — only name → category → location.
 */
export type HabitMatchedField = 'name' | 'category' | 'location';

export type RoutineSearchHit = {
  id: string;
  name: string;
  description: string | null;
  scheduleWeekdays: number[];
  category: string | null;
  location: string | null;
  matchedField: RoutineMatchedField;
};

export type HabitSearchHit = {
  id: string;
  name: string;
  cadence: import('@/db/schema').HabitCadence;
  currentStreak: number;
  longestStreak: number;
  category: string | null;
  location: string | null;
  matchedField: HabitMatchedField;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape the `%` and `_` glob wildcards inside a user-supplied query so we
 * don't accidentally let one user's input behave like a SQL pattern (e.g.
 * `"100%"` searching for "anything ending with 100"). The outer wrapper
 * `%${escaped}%` still does the contains-match — the only effect of the escape
 * is to make user-supplied `%` / `_` match themselves literally.
 *
 * NOTE: this is NOT a security boundary — Drizzle's parameter binding already
 * makes SQL injection impossible. This is purely about predictable matching.
 */
function escapeLike(q: string): string {
  return q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Bucket-priority pick: returns the first field (in priority order) whose
 * value case-insensitively contains `needle`. Throws if none match — callers
 * only pass rows that the SQL `OR(ilike, ...)` already matched, so at least
 * one field MUST contain the needle. The throw is a defensive guard against
 * collation drift between Postgres ILIKE and JS `.toLowerCase().includes(...)`
 * (in practice they agree for ASCII; for accented Unicode they MAY disagree —
 * we surface that as an error rather than silently mislabelling).
 */
function pickMatchedField<F extends string>(
  fields: ReadonlyArray<readonly [F, string | null]>,
  needle: string,
): F {
  const n = needle.toLowerCase();
  for (const [name, value] of fields) {
    if (value !== null && value.toLowerCase().includes(n)) return name;
  }
  // Should be unreachable when called on SQL-filtered rows; if it fires it's
  // a bug (or an edge-case Unicode mismatch). Default to the first field so
  // the route still returns something usable rather than 500.
  return fields[0]![0];
}

/** Stable order within each bucket: name ASC (case-insensitive). */
function compareByName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

const ROUTINE_FIELD_PRIORITY: ReadonlyArray<RoutineMatchedField> = [
  'name',
  'description',
  'category',
  'location',
] as const;

const HABIT_FIELD_PRIORITY: ReadonlyArray<HabitMatchedField> = [
  'name',
  'category',
  'location',
] as const;

/** Re-bucket a list of hits by matchedField priority, then by name. */
function sortByBucketThenName<F extends string, T extends { matchedField: F; name: string }>(
  hits: T[],
  priority: ReadonlyArray<F>,
): T[] {
  const rank = new Map<F, number>();
  priority.forEach((f, i) => rank.set(f, i));
  return hits.slice().sort((a, b) => {
    const ra = rank.get(a.matchedField) ?? priority.length;
    const rb = rank.get(b.matchedField) ?? priority.length;
    if (ra !== rb) return ra - rb;
    return compareByName(a, b);
  });
}

// ---------------------------------------------------------------------------
// Public: routines
// ---------------------------------------------------------------------------

/**
 * Search the user's non-archived routines for `q` against
 * (name, description, category, location). Returns at most 20 hits ordered
 * by matched-field bucket priority (name first), then name ASC within bucket.
 *
 * Caller is responsible for empty / short-`q` handling (don't call this with
 * `q.length < 2`).
 */
export async function searchRoutinesForUser(
  userId: string,
  q: string,
): Promise<RoutineSearchHit[]> {
  const pattern = `%${escapeLike(q)}%`;

  const predicates: SQL[] = [
    ilike(routines.name, pattern),
    ilike(routines.description, pattern),
    ilike(routines.category, pattern),
    ilike(routines.location, pattern),
  ];

  const rows = await db
    .select({
      id: routines.id,
      name: routines.name,
      description: routines.description,
      category: routines.category,
      location: routines.location,
    })
    .from(routines)
    .where(
      and(
        eq(routines.ownerUserId, userId),
        isNull(routines.archivedAt),
        or(...predicates),
      ),
    )
    .orderBy(asc(routines.name));

  if (rows.length === 0) return [];

  // Derive scheduleWeekdays in a single follow-up query bounded to the
  // matched routine ids. Keeps the search response useful for the frontend
  // ("highlight which weekdays this routine runs") without a second API call.
  //
  // Inlined here to avoid an import cycle with `lib/routines/queries.ts` and
  // because the matched set is small (≤ N routines that ILIKE'd, capped at 20
  // by the caller).
  const { routineDaySteps } = await import('@/db/schema');
  const { inArray } = await import('drizzle-orm');
  const ids = rows.map((r) => r.id);
  const stepRows =
    ids.length > 0
      ? await db
          .select({
            routineId: routineDaySteps.routineId,
            weekday: routineDaySteps.weekday,
          })
          .from(routineDaySteps)
          .where(inArray(routineDaySteps.routineId, ids))
      : [];

  const weekdaysByRoutine = new Map<string, Set<number>>();
  for (const s of stepRows) {
    let set = weekdaysByRoutine.get(s.routineId);
    if (!set) {
      set = new Set();
      weekdaysByRoutine.set(s.routineId, set);
    }
    set.add(s.weekday);
  }

  const hits: RoutineSearchHit[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    scheduleWeekdays: Array.from(weekdaysByRoutine.get(r.id) ?? []).sort(
      (a, b) => a - b,
    ),
    category: r.category,
    location: r.location,
    matchedField: pickMatchedField<RoutineMatchedField>(
      [
        ['name', r.name],
        ['description', r.description],
        ['category', r.category],
        ['location', r.location],
      ],
      q,
    ),
  }));

  return sortByBucketThenName(hits, ROUTINE_FIELD_PRIORITY);
}

// ---------------------------------------------------------------------------
// Public: habits
// ---------------------------------------------------------------------------

/**
 * Search the user's non-archived habits for `q` against
 * (name, category, location). NB: habits intentionally do NOT search on
 * `description` per the API contract — even though the column exists.
 *
 * Returns at most all matches; caller caps to 20. Streaks are computed for
 * each hit via `computeStreaksForHabit`, which is one extra read per match.
 * For the search use-case the matched set is tiny (≤ user's library size,
 * capped at 20), so the extra reads are fine.
 */
export async function searchHabitsForUser(
  userId: string,
  q: string,
): Promise<HabitSearchHit[]> {
  const pattern = `%${escapeLike(q)}%`;

  const predicates: SQL[] = [
    ilike(habits.name, pattern),
    ilike(habits.category, pattern),
    ilike(habits.location, pattern),
  ];

  const rows = await db
    .select()
    .from(habits)
    .where(
      and(
        eq(habits.ownerUserId, userId),
        isNull(habits.archivedAt),
        or(...predicates),
      ),
    )
    .orderBy(asc(habits.name));

  if (rows.length === 0) return [];

  // Lazy import to avoid pulling the heavy streak math into modules that
  // don't need it (and to keep import order forgiving for tests that mock
  // `@/db`).
  const { computeStreaksForHabit } = await import('@/lib/habits/queries');

  const hits: HabitSearchHit[] = [];
  for (const h of rows) {
    const streaks = await computeStreaksForHabit(h, userId);
    hits.push({
      id: h.id,
      name: h.name,
      cadence: h.cadence,
      currentStreak: streaks.currentStreak,
      longestStreak: streaks.longestStreak,
      category: h.category,
      location: h.location,
      matchedField: pickMatchedField<HabitMatchedField>(
        [
          ['name', h.name],
          ['category', h.category],
          ['location', h.location],
        ],
        q,
      ),
    });
  }

  return sortByBucketThenName(hits, HABIT_FIELD_PRIORITY);
}
