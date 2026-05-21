/**
 * POST /api/habits/:id/duplicate — clone a habit (cadence preserved, completions NOT).
 *
 * Auth: session OR owner-token. 404 if the habit isn't owned by the resolved
 * user (mirrors the rest of the habits namespace).
 *
 * Semantics:
 *   - New habit inherits name (suffixed with " (copy)"), description, timezone,
 *     cadence (verbatim — the discriminated union is copied as-is, including
 *     `weekStart` defaults and any specific_weekdays array), category, location.
 *   - Habit completions are NOT cloned — the response carries the zero-streak
 *     shape (`currentStreak: 0`, `longestStreak: 0`, `totalCompletions: 0`,
 *     `lastCompletedDate: null`) so the client can render the new row without
 *     a follow-up GET. This matches POST /api/habits exactly.
 *
 * No transaction needed: there's no second table to write — a single insert
 * into `habits` is atomic by itself.
 *
 * No request body — the URL param is the source. See the routines duplicate
 * route for the rationale.
 */

import { NextResponse } from 'next/server';
import { db } from '@/db';
import { habits } from '@/db/schema';
import { withUser } from '@/lib/auth/resolveUser';
import { findOwnedHabit } from '@/lib/habits/queries';
import { buildCopyName } from '@/lib/duplicate';

export const runtime = 'nodejs';

type Params = { id: string };

export const POST = withUser<Params>(async (_req, { user, params }) => {
  const source = await findOwnedHabit(params.id, user.id);
  if (!source) {
    return NextResponse.json(
      { ok: false, error: 'not_found', message: 'Habit not found.' },
      { status: 404 },
    );
  }

  const [created] = await db
    .insert(habits)
    .values({
      ownerUserId: user.id,
      name: buildCopyName(source.name),
      description: source.description,
      timezone: source.timezone,
      // Cadence is a discriminated-union JSONB. Drizzle stores it verbatim, so
      // passing through the source row is safe — no need to re-parse / re-normalise.
      cadence: source.cadence,
      category: source.category,
      location: source.location,
    })
    .returning();

  if (!created) {
    return NextResponse.json(
      { ok: false, error: 'insert_failed', message: 'Failed to duplicate habit.' },
      { status: 500 },
    );
  }

  // Brand-new clone has no completions yet → zero streaks. Mirrors the shape
  // of POST /api/habits so the client can treat both responses identically.
  return NextResponse.json(
    {
      ok: true,
      habit: {
        ...created,
        currentStreak: 0,
        longestStreak: 0,
        totalCompletions: 0,
        lastCompletedDate: null,
      },
    },
    { status: 201 },
  );
});
