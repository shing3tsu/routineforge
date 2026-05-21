/**
 * POST /api/routines/:id/duplicate — clone a routine + all its day-steps.
 *
 * Auth: session OR owner-token. 404 if the routine isn't owned by the resolved
 * user (mirrors the rest of the routines namespace — we deliberately do NOT
 * distinguish "doesn't exist" from "not yours").
 *
 * Semantics:
 *   - New routine inherits name (suffixed with " (copy)"), description,
 *     timezone, category, location. Streak-like fields don't exist on the
 *     routine row directly — they're derived from completions, which are NOT
 *     cloned, so the clone naturally starts at "zero progress".
 *   - All `routine_day_steps` rows are cloned, preserving `weekday`, `position`,
 *     and `title`. This means the clone has the same per-weekday gating as the
 *     original; a weekday with no steps in the source is still off in the clone.
 *   - The whole operation runs inside a Drizzle transaction so a partial insert
 *     (e.g. routine row created but steps insert fails) is rolled back. Without
 *     this, a failed clone would leak an empty routine into the user's list.
 *
 * No request body — the URL param is the source. We don't even parse JSON,
 * which avoids needlessly choking on clients that send `Content-Type: application/json`
 * with an empty body (per RFC 7230 §3.3 a POST with no body is valid).
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { routines, routineDaySteps } from '@/db/schema';
import { withUser } from '@/lib/auth/resolveUser';
import { buildCopyName } from '@/lib/duplicate';

export const runtime = 'nodejs';

type Params = { id: string };

export const POST = withUser<Params>(async (_req, { user, params }) => {
  // 1) Resolve the source routine (also enforces ownership + not archived).
  //    Same query shape as the rest of the routines namespace.
  const [source] = await db
    .select()
    .from(routines)
    .where(
      and(
        eq(routines.id, params.id),
        eq(routines.ownerUserId, user.id),
        isNull(routines.archivedAt),
      ),
    )
    .limit(1);

  if (!source) {
    return NextResponse.json(
      { ok: false, error: 'not_found', message: 'Routine not found.' },
      { status: 404 },
    );
  }

  // 2) Read the source's steps OUTSIDE the transaction — they don't change
  //    between read and write because (a) the route holds no lock and (b)
  //    even if the source is mutated concurrently, the clone is a point-in-time
  //    snapshot. Worst case we miss a step added during the same millisecond,
  //    which the user can re-clone.
  const sourceSteps = await db
    .select({
      weekday: routineDaySteps.weekday,
      position: routineDaySteps.position,
      title: routineDaySteps.title,
    })
    .from(routineDaySteps)
    .where(eq(routineDaySteps.routineId, source.id));

  // 3) Insert the routine + its steps atomically.
  const created = await db.transaction(async (tx) => {
    const [routine] = await tx
      .insert(routines)
      .values({
        ownerUserId: user.id,
        name: buildCopyName(source.name),
        description: source.description,
        timezone: source.timezone,
        category: source.category,
        location: source.location,
      })
      .returning();

    if (!routine) {
      // Bail out of the transaction — caller renders a 500.
      throw new Error('routine_insert_failed');
    }

    if (sourceSteps.length > 0) {
      await tx.insert(routineDaySteps).values(
        sourceSteps.map((s) => ({
          routineId: routine.id,
          weekday: s.weekday,
          position: s.position,
          title: s.title,
        })),
      );
    }

    return routine;
  });

  // Match the POST /api/routines response shape: brand-new routine, no steps
  // visible-from-list-yet from the caller's perspective means we surface the
  // derived `scheduleWeekdays`. We DO know what they are without a re-query —
  // they're the unique weekdays in `sourceSteps`.
  const scheduleWeekdays = Array.from(
    new Set(sourceSteps.map((s) => s.weekday)),
  ).sort((a, b) => a - b);

  return NextResponse.json(
    { ok: true, routine: { ...created, scheduleWeekdays } },
    { status: 201 },
  );
});
