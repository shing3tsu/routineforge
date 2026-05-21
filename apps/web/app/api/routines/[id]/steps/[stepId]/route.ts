/**
 * PATCH  /api/routines/:id/steps/:stepId — update title / weekday / position.
 *   - If `weekday` changes, treat as a move (compact source, shift target).
 *   - If `position` changes within the same weekday, re-index.
 * DELETE /api/routines/:id/steps/:stepId — delete + compact source.
 *
 * Auth: session OR owner-token.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { routines, routineDaySteps } from '@/db/schema';
import { withUser } from '@/lib/auth/resolveUser';
import { updateStepSchema } from '@/lib/validation/routines';
import {
  compactPositions,
  countStepsForWeekday,
  shiftPositionsUp,
} from '@/lib/routines/steps';

export const runtime = 'nodejs';

type Params = { id: string; stepId: string };

async function findOwnedStep(routineId: string, stepId: string, userId: string) {
  const [row] = await db
    .select({
      step: routineDaySteps,
      routineId: routines.id,
    })
    .from(routineDaySteps)
    .innerJoin(routines, eq(routines.id, routineDaySteps.routineId))
    .where(
      and(
        eq(routineDaySteps.id, stepId),
        eq(routineDaySteps.routineId, routineId),
        eq(routines.ownerUserId, userId),
        isNull(routines.archivedAt),
      ),
    )
    .limit(1);
  return row?.step ?? null;
}

// ---------------------------------------------------------------------------
// PATCH — title / weekday / position update.
// ---------------------------------------------------------------------------

export const PATCH = withUser<Params>(async (req: NextRequest, { user, params }) => {
  const existing = await findOwnedStep(params.id, params.stepId, user.id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: 'not_found', message: 'Step not found.' },
      { status: 404 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', message: 'Body must be JSON.' },
      { status: 400 },
    );
  }

  const parsed = updateStepSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { title, weekday: newWeekday, position: newPosition } = parsed.data;
  const isMove =
    (newWeekday !== undefined && newWeekday !== existing.weekday) ||
    (newPosition !== undefined && newPosition !== existing.position);

  const updated = await db.transaction(async (tx) => {
    if (!isMove) {
      // Title-only (or no-op) update.
      const [row] = await tx
        .update(routineDaySteps)
        .set({
          title: title ?? existing.title,
          updatedAt: new Date(),
        })
        .where(eq(routineDaySteps.id, existing.id))
        .returning();
      return row;
    }

    // --- Move path ---
    // 1. Park the moving row at TEMP weekday/position so it doesn't conflict
    //    with the unique index during the shift.
    // 2. Compact source bucket.
    // 3. Shift target bucket to make room.
    // 4. Drop the moving row into its new slot.
    const sourceWeekday = existing.weekday;
    const sourcePosition = existing.position;
    const targetWeekday = newWeekday ?? existing.weekday;

    // Park the moving row at a NEGATIVE position so it sits below all valid
    // rows (which are >=0) and below the TEMP_OFFSET shift range used by the
    // helpers. This keeps the unique (routine, weekday, position) index
    // satisfied through the multi-step shuffle, and — critically — the park
    // row is excluded from both compactPositions (filters position > X >=0)
    // and shiftPositionsUp (filters position >= X >= 0), which matters for
    // the same-weekday move case where source and target buckets are the
    // same set of rows.
    await tx
      .update(routineDaySteps)
      .set({ position: -1 })
      .where(eq(routineDaySteps.id, existing.id));

    // Compact source bucket (close the gap left behind).
    await compactPositions(tx, existing.routineId, sourceWeekday, sourcePosition);

    // Compute final target position. countStepsForWeekday returns the row
    // count in the (routine, weekday) bucket including the parked row, so we
    // subtract one when target == source (same-weekday reposition) to get the
    // count of "other" rows the moving row will be placed into.
    const rawTargetCount = await countStepsForWeekday(
      tx,
      existing.routineId,
      targetWeekday,
    );
    const targetCount =
      targetWeekday === sourceWeekday ? rawTargetCount - 1 : rawTargetCount;
    let finalPosition: number;
    if (newPosition === undefined) {
      finalPosition = targetCount;
    } else if (newPosition >= targetCount) {
      finalPosition = targetCount;
    } else {
      finalPosition = Math.max(0, newPosition);
      await shiftPositionsUp(tx, existing.routineId, targetWeekday, finalPosition);
    }

    const [row] = await tx
      .update(routineDaySteps)
      .set({
        weekday: targetWeekday,
        position: finalPosition,
        title: title ?? existing.title,
        updatedAt: new Date(),
      })
      .where(eq(routineDaySteps.id, existing.id))
      .returning();
    return row;
  });

  return NextResponse.json({ ok: true, step: updated });
});

// ---------------------------------------------------------------------------
// DELETE — delete + compact source bucket.
// ---------------------------------------------------------------------------

export const DELETE = withUser<Params>(async (_req, { user, params }) => {
  const existing = await findOwnedStep(params.id, params.stepId, user.id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: 'not_found', message: 'Step not found.' },
      { status: 404 },
    );
  }

  await db.transaction(async (tx) => {
    await tx.delete(routineDaySteps).where(eq(routineDaySteps.id, existing.id));
    await compactPositions(tx, existing.routineId, existing.weekday, existing.position);
  });

  return NextResponse.json({ ok: true });
});
