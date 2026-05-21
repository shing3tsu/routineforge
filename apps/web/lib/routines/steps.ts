/**
 * Helpers for manipulating `routine_day_steps` ordering within a (routine,
 * weekday) bucket.
 *
 * Design choice: **compact on delete / move-out** (no gaps left behind).
 * Rationale: gives the UI a stable contiguous numbering with no edge cases,
 * matches the user mental model ("step 1, step 2, ..."), and the
 * `routine_day_steps_routine_weekday_position_unique` constraint means we
 * can't just decrement positions in-place without a temporary offset (see
 * `bumpPositionsToTemp` below for the trick).
 *
 * All helpers expect to run inside a Drizzle transaction so partial failures
 * are rolled back.
 */

import { and, eq, gt, gte, sql } from 'drizzle-orm';
import type { db as DbType } from '@/db';
import { routineDaySteps } from '@/db/schema';

// Postgres unique constraints are deferrable only if explicitly defined as
// such. Ours aren't, so we shift positions to a high temporary offset before
// reassigning. 1_000_000 is well above the per-weekday step cap (1000 in zod).
const TEMP_OFFSET = 1_000_000;

type Tx = Parameters<Parameters<typeof DbType.transaction>[0]>[0];

/**
 * Count the number of steps currently in a (routine, weekday) bucket.
 * Useful when computing the append position for a new step.
 */
export async function countStepsForWeekday(
  tx: Tx,
  routineId: string,
  weekday: number,
): Promise<number> {
  const result = await tx
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(routineDaySteps)
    .where(
      and(
        eq(routineDaySteps.routineId, routineId),
        eq(routineDaySteps.weekday, weekday),
      ),
    );
  return result[0]?.c ?? 0;
}

/**
 * Shift every step with position >= `fromPosition` UP by 1. Used to make room
 * for a new step inserted at `fromPosition`.
 *
 * Two-pass shift via TEMP_OFFSET so the unique (routine, weekday, position)
 * index never has duplicates mid-operation.
 */
export async function shiftPositionsUp(
  tx: Tx,
  routineId: string,
  weekday: number,
  fromPosition: number,
): Promise<void> {
  // Pass 1: push affected rows to TEMP_OFFSET + position.
  await tx
    .update(routineDaySteps)
    .set({ position: sql`${routineDaySteps.position} + ${TEMP_OFFSET}` })
    .where(
      and(
        eq(routineDaySteps.routineId, routineId),
        eq(routineDaySteps.weekday, weekday),
        gte(routineDaySteps.position, fromPosition),
      ),
    );
  // Pass 2: pull them back down to position + 1.
  await tx
    .update(routineDaySteps)
    .set({ position: sql`${routineDaySteps.position} - ${TEMP_OFFSET} + 1` })
    .where(
      and(
        eq(routineDaySteps.routineId, routineId),
        eq(routineDaySteps.weekday, weekday),
        gte(routineDaySteps.position, TEMP_OFFSET + fromPosition),
      ),
    );
}

/**
 * Compact: shift every step with position > `removedPosition` DOWN by 1.
 * Used after a delete or a move-out to close the gap.
 *
 * Same TEMP_OFFSET trick as `shiftPositionsUp`.
 */
export async function compactPositions(
  tx: Tx,
  routineId: string,
  weekday: number,
  removedPosition: number,
): Promise<void> {
  await tx
    .update(routineDaySteps)
    .set({ position: sql`${routineDaySteps.position} + ${TEMP_OFFSET}` })
    .where(
      and(
        eq(routineDaySteps.routineId, routineId),
        eq(routineDaySteps.weekday, weekday),
        gt(routineDaySteps.position, removedPosition),
      ),
    );
  await tx
    .update(routineDaySteps)
    .set({ position: sql`${routineDaySteps.position} - ${TEMP_OFFSET} - 1` })
    .where(
      and(
        eq(routineDaySteps.routineId, routineId),
        eq(routineDaySteps.weekday, weekday),
        gt(routineDaySteps.position, TEMP_OFFSET + removedPosition),
      ),
    );
}

/**
 * Reassign positions for a (routine, weekday) bucket so they match the given
 * ordered list of step ids. Caller validates the id set equals the existing
 * set BEFORE calling this.
 *
 * Two-pass shift to TEMP_OFFSET keeps the unique index satisfied mid-update.
 */
export async function setPositionsForWeekday(
  tx: Tx,
  routineId: string,
  weekday: number,
  orderedStepIds: string[],
): Promise<void> {
  // Pass 1: shift every affected row to TEMP_OFFSET so the unique index has
  // no collisions while we re-emit final positions.
  await tx
    .update(routineDaySteps)
    .set({ position: sql`${routineDaySteps.position} + ${TEMP_OFFSET}` })
    .where(
      and(
        eq(routineDaySteps.routineId, routineId),
        eq(routineDaySteps.weekday, weekday),
      ),
    );
  // Pass 2: per-step update to its final position.
  for (let i = 0; i < orderedStepIds.length; i++) {
    const id = orderedStepIds[i]!;
    await tx
      .update(routineDaySteps)
      .set({ position: i, updatedAt: new Date() })
      .where(
        and(
          eq(routineDaySteps.id, id),
          eq(routineDaySteps.routineId, routineId),
          eq(routineDaySteps.weekday, weekday),
        ),
      );
  }
}
