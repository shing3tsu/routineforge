/**
 * GET /api/search?q=<query> — unified free-text search across the current
 * user's routines AND habits.
 *
 * Auth: same as the other authenticated routes — session OR owner-token via
 * the shared `withUser` wrapper. 401 if neither resolves.
 *
 * Lenient input semantics (see `lib/validation/search.ts`):
 *   - Missing `q` or `q.length < 2` → `200 { ok: true, query, results: { routines: [], habits: [] } }`.
 *     We deliberately do NOT 400 short queries — the UI fires while the user
 *     is mid-type and a 4xx would feel hostile.
 *   - `q.length > 100` → silently truncated to 100 chars (don't reject).
 *
 * Per-kind cap: 20 routines + 20 habits. The frontend mixes them itself.
 *
 * `matchedField` priority for each hit (first wins):
 *   routines: name → description → category → location.
 *   habits:   name → category → location.
 * Within each bucket, results are sorted by name ASC (case-insensitive).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withUser } from '@/lib/auth/resolveUser';
import {
  normaliseSearchQuery,
  searchQuerySchema,
} from '@/lib/validation/search';
import {
  searchHabitsForUser,
  searchRoutinesForUser,
} from '@/lib/search/queries';

export const runtime = 'nodejs';

/** Per-kind result cap. Frontend renders all 40; user can refine if needed. */
const RESULTS_PER_KIND_CAP = 20;

export const GET = withUser(async (req: NextRequest, { user }) => {
  // Pull query string params via NextRequest.nextUrl (cheaper than parsing
  // req.url and gives us URLSearchParams for free).
  const rawQ = req.nextUrl.searchParams.get('q');

  // `.strict()` on the schema means unknown params would 400 — but we ONLY
  // pass `q` here to zod so the strict check still passes. Other params are
  // ignored at the URL level (URLSearchParams.get returns null for unknown
  // keys); we don't reject unknown ones at the URL level because that'd be
  // surprising for a GET endpoint. The .strict() on the schema is a belt-and-
  // suspenders guard for the input we actually validate.
  const parsed = searchQuerySchema.safeParse({
    ...(rawQ === null ? {} : { q: rawQ }),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { query, effectiveQuery, shortCircuit } = normaliseSearchQuery(parsed.data);

  if (shortCircuit) {
    return NextResponse.json({
      ok: true,
      query,
      results: { routines: [], habits: [] },
    });
  }

  // Two independent reads — Promise.all is safe (no transaction needed; this
  // is read-only and per-kind queries don't share state).
  const [routineHits, habitHits] = await Promise.all([
    searchRoutinesForUser(user.id, effectiveQuery),
    searchHabitsForUser(user.id, effectiveQuery),
  ]);

  return NextResponse.json({
    ok: true,
    query: effectiveQuery,
    results: {
      routines: routineHits.slice(0, RESULTS_PER_KIND_CAP),
      habits: habitHits.slice(0, RESULTS_PER_KIND_CAP),
    },
  });
});
