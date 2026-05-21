/**
 * Unit tests for lib/routines/steps.ts.
 *
 * Covers position math:
 *   - countStepsForWeekday
 *   - shiftPositionsUp (insert at middle / end / before-all)
 *   - compactPositions (delete & shift down)
 *   - setPositionsForWeekday (full-list reorder, atomic via TEMP_OFFSET)
 *
 * The TEMP_OFFSET two-pass trick is the load-bearing part of these helpers:
 * the unique index `(routine_id, weekday, position)` must not be violated mid-
 * update. If any helper produces a duplicate, the second update would throw
 * with a unique violation. These tests assert the final ordering AND that no
 * error is thrown by the helpers themselves.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { routineDaySteps } from '@/db/schema';
import {
  countStepsForWeekday,
  shiftPositionsUp,
  compactPositions,
  setPositionsForWeekday,
} from '@/lib/routines/steps';
import {
  resetDb,
  makeUser,
  makeRoutine,
  makeStep,
} from '@/__tests__/helpers/db';

async function listPositions(routineId: string, weekday: number) {
  return db
    .select({
      id: routineDaySteps.id,
      position: routineDaySteps.position,
      title: routineDaySteps.title,
    })
    .from(routineDaySteps)
    .where(
      and(
        eq(routineDaySteps.routineId, routineId),
        eq(routineDaySteps.weekday, weekday),
      ),
    )
    .orderBy(asc(routineDaySteps.position));
}

let userId: string;
let routineId: string;

beforeEach(async () => {
  await resetDb();
  const user = await makeUser({ email: 'alice@example.com', verified: true });
  userId = user.id;
  const routine = await makeRoutine({ ownerUserId: userId, timezone: 'UTC' });
  routineId = routine.id;
});

describe('countStepsForWeekday', () => {
  it('returns 0 for an empty weekday', async () => {
    const count = await db.transaction(async (tx) =>
      countStepsForWeekday(tx, routineId, 0),
    );
    expect(count).toBe(0);
  });

  it('returns the count of steps in the (routine, weekday) bucket', async () => {
    await makeStep({ routineId, weekday: 0 });
    await makeStep({ routineId, weekday: 0 });
    await makeStep({ routineId, weekday: 1 });

    const monCount = await db.transaction(async (tx) =>
      countStepsForWeekday(tx, routineId, 0),
    );
    const tueCount = await db.transaction(async (tx) =>
      countStepsForWeekday(tx, routineId, 1),
    );
    const wedCount = await db.transaction(async (tx) =>
      countStepsForWeekday(tx, routineId, 2),
    );

    expect(monCount).toBe(2);
    expect(tueCount).toBe(1);
    expect(wedCount).toBe(0);
  });
});

describe('shiftPositionsUp', () => {
  it('shifts every position >= fromPosition up by 1 (insert in middle)', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });
    const c = await makeStep({ routineId, weekday: 0, position: 2, title: 'C' });

    // Make room at position 1.
    await db.transaction(async (tx) => shiftPositionsUp(tx, routineId, 0, 1));

    const rows = await listPositions(routineId, 0);
    const byId = new Map(rows.map((r) => [r.id, r.position]));
    expect(byId.get(a.id)).toBe(0);
    expect(byId.get(b.id)).toBe(2);
    expect(byId.get(c.id)).toBe(3);
  });

  it('shifts everything when fromPosition is 0 (insert before all)', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });

    await db.transaction(async (tx) => shiftPositionsUp(tx, routineId, 0, 0));

    const rows = await listPositions(routineId, 0);
    const byId = new Map(rows.map((r) => [r.id, r.position]));
    expect(byId.get(a.id)).toBe(1);
    expect(byId.get(b.id)).toBe(2);
  });

  it('is a no-op when no rows match (fromPosition above max)', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });

    await db.transaction(async (tx) => shiftPositionsUp(tx, routineId, 0, 5));

    const rows = await listPositions(routineId, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.position).toBe(0);
    expect(rows[0]?.id).toBe(a.id);
  });

  it('does not violate the unique (routine, weekday, position) index mid-shift', async () => {
    // Fill positions 0..4 and shift from 0 — this would produce a duplicate at
    // position N if the two-pass TEMP_OFFSET trick weren't in place.
    for (let i = 0; i < 5; i++) {
      await makeStep({ routineId, weekday: 0, position: i, title: `S${i}` });
    }

    await db.transaction(async (tx) => shiftPositionsUp(tx, routineId, 0, 0));

    const rows = await listPositions(routineId, 0);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4, 5]);
    // No duplicates.
    expect(new Set(rows.map((r) => r.position)).size).toBe(rows.length);
  });

  it('does not affect rows in other weekdays', async () => {
    const monA = await makeStep({ routineId, weekday: 0, position: 0, title: 'monA' });
    const tueA = await makeStep({ routineId, weekday: 1, position: 0, title: 'tueA' });

    await db.transaction(async (tx) => shiftPositionsUp(tx, routineId, 0, 0));

    const monRows = await listPositions(routineId, 0);
    const tueRows = await listPositions(routineId, 1);
    expect(monRows.find((r) => r.id === monA.id)?.position).toBe(1);
    expect(tueRows.find((r) => r.id === tueA.id)?.position).toBe(0);
  });
});

describe('compactPositions', () => {
  it('shifts every position > removedPosition down by 1 (gap-fill)', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });
    const c = await makeStep({ routineId, weekday: 0, position: 2, title: 'C' });
    const d = await makeStep({ routineId, weekday: 0, position: 3, title: 'D' });

    // Pretend we deleted position 1, leaving a gap at 1, with c=2 and d=3.
    await db.delete(routineDaySteps).where(eq(routineDaySteps.id, b.id));
    await db.transaction(async (tx) => compactPositions(tx, routineId, 0, 1));

    const rows = await listPositions(routineId, 0);
    const byId = new Map(rows.map((r) => [r.id, r.position]));
    expect(byId.get(a.id)).toBe(0);
    expect(byId.get(c.id)).toBe(1);
    expect(byId.get(d.id)).toBe(2);
  });

  it('is a no-op when removed position was the last', async () => {
    await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });

    await db.delete(routineDaySteps).where(eq(routineDaySteps.id, b.id));
    await db.transaction(async (tx) => compactPositions(tx, routineId, 0, 1));

    const rows = await listPositions(routineId, 0);
    expect(rows.map((r) => r.position)).toEqual([0]);
  });

  it('does not violate the unique index when compacting many rows', async () => {
    // Fill positions 0..4, delete 0, compact.
    const steps = [];
    for (let i = 0; i < 5; i++) {
      steps.push(await makeStep({ routineId, weekday: 0, position: i, title: `S${i}` }));
    }
    await db.delete(routineDaySteps).where(eq(routineDaySteps.id, steps[0]!.id));

    await db.transaction(async (tx) => compactPositions(tx, routineId, 0, 0));

    const rows = await listPositions(routineId, 0);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3]);
    expect(new Set(rows.map((r) => r.position)).size).toBe(rows.length);
  });
});

describe('setPositionsForWeekday — reorder', () => {
  it('reassigns positions to match the supplied ordering', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });
    const c = await makeStep({ routineId, weekday: 0, position: 2, title: 'C' });

    // Reverse the order.
    await db.transaction(async (tx) =>
      setPositionsForWeekday(tx, routineId, 0, [c.id, b.id, a.id]),
    );

    const rows = await listPositions(routineId, 0);
    expect(rows.map((r) => r.title)).toEqual(['C', 'B', 'A']);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
  });

  it('handles a permutation that swaps adjacent rows', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });
    const b = await makeStep({ routineId, weekday: 0, position: 1, title: 'B' });

    await db.transaction(async (tx) =>
      setPositionsForWeekday(tx, routineId, 0, [b.id, a.id]),
    );

    const rows = await listPositions(routineId, 0);
    expect(rows.map((r) => r.title)).toEqual(['B', 'A']);
  });

  it('handles single-item reorder (no-op)', async () => {
    const a = await makeStep({ routineId, weekday: 0, position: 0, title: 'A' });

    await db.transaction(async (tx) =>
      setPositionsForWeekday(tx, routineId, 0, [a.id]),
    );

    const rows = await listPositions(routineId, 0);
    expect(rows[0]?.position).toBe(0);
  });

  it('keeps unique index satisfied throughout a long reorder', async () => {
    const stepIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const s = await makeStep({
        routineId,
        weekday: 0,
        position: i,
        title: `S${i}`,
      });
      stepIds.push(s.id);
    }
    // Reverse the whole list.
    const reversed = [...stepIds].reverse();

    await db.transaction(async (tx) =>
      setPositionsForWeekday(tx, routineId, 0, reversed),
    );

    const rows = await listPositions(routineId, 0);
    expect(rows.map((r) => r.id)).toEqual(reversed);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('only updates rows in the target (routine, weekday) bucket', async () => {
    const monA = await makeStep({ routineId, weekday: 0, position: 0, title: 'mA' });
    const monB = await makeStep({ routineId, weekday: 0, position: 1, title: 'mB' });
    const tueA = await makeStep({ routineId, weekday: 1, position: 0, title: 'tA' });

    await db.transaction(async (tx) =>
      setPositionsForWeekday(tx, routineId, 0, [monB.id, monA.id]),
    );

    const monRows = await listPositions(routineId, 0);
    const tueRows = await listPositions(routineId, 1);
    expect(monRows.map((r) => r.title)).toEqual(['mB', 'mA']);
    expect(tueRows.find((r) => r.id === tueA.id)?.position).toBe(0);
  });
});

describe('cross-weekday move (compose: park + compact + shift)', () => {
  it('compacts source and shifts target without unique-index violation', async () => {
    const sA = await makeStep({ routineId, weekday: 0, position: 0, title: 'sA' });
    const sB = await makeStep({ routineId, weekday: 0, position: 1, title: 'sB' });
    const sC = await makeStep({ routineId, weekday: 0, position: 2, title: 'sC' });
    const tA = await makeStep({ routineId, weekday: 1, position: 0, title: 'tA' });
    const tB = await makeStep({ routineId, weekday: 1, position: 1, title: 'tB' });

    await db.transaction(async (tx) => {
      await tx
        .update(routineDaySteps)
        .set({ position: 1_000_001 })
        .where(eq(routineDaySteps.id, sB.id));
      await compactPositions(tx, routineId, 0, 1);
      await shiftPositionsUp(tx, routineId, 1, 0);
      await tx
        .update(routineDaySteps)
        .set({ weekday: 1, position: 0 })
        .where(eq(routineDaySteps.id, sB.id));
    });

    const monRows = await listPositions(routineId, 0);
    const tueRows = await listPositions(routineId, 1);

    expect(monRows.map((r) => r.id)).toEqual([sA.id, sC.id]);
    expect(monRows.map((r) => r.position)).toEqual([0, 1]);
    expect(tueRows.map((r) => r.id)).toEqual([sB.id, tA.id, tB.id]);
    expect(tueRows.map((r) => r.position)).toEqual([0, 1, 2]);
  });
});
