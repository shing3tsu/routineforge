/**
 * GET  /api/routines/:id/steps?weekday=N — list steps for a weekday.
 * POST /api/routines/:id/steps — create a step. If `position` is omitted, append.
 *
 * Auth: session OR owner-token.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { routines, routineDaySteps } from '@/db/schema';
import { withUser } from '@/lib/auth/resolveUser';
import {
  createStepSchema,
  stepsListQuerySchema,
} from '@/lib/validation/routines';
import {
  countStepsForWeekday,
  shiftPositionsUp,
} from '@/lib/routines/steps';

export const runtime = 'nodejs';

type Params = { id: string };

async function assertOwned(routineId: string, userId: string) {
  const [row] = await db
    .select({ id: routines.id })
    .from(routines)
    .where(
      and(
        eq(routines.id, routineId),
        eq(routines.ownerUserId, userId),
        isNull(routines.archivedAt),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// GET — list steps for a weekday.
// ---------------------------------------------------------------------------

export const GET = withUser<Params>(async (req: NextRequest, { user, params }) => {
  const ownedId = await assertOwned(params.id, user.id);
  if (!ownedId) {
    return NextResponse.json(
      { ok: false, error: 'not_found', message: 'Routine not found.' },
      { status: 404 },
    );
  }

  const queryParsed = stepsListQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!queryParsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: queryParsed.error.flatten() },
      { status: 400 },
    );
  }

  const steps = await db
    .select()
    .from(routineDaySteps)
    .where(
      and(
        eq(routineDaySteps.routineId, ownedId),
        eq(routineDaySteps.weekday, queryParsed.data.weekday),
      ),
    )
    .orderBy(asc(routineDaySteps.position));

  return NextResponse.json({ ok: true, steps });
});

// ---------------------------------------------------------------------------
// POST — create a step.
// ---------------------------------------------------------------------------

export const POST = withUser<Params>(async (req: NextRequest, { user, params }) => {
  const ownedId = await assertOwned(params.id, user.id);
  if (!ownedId) {
    return NextResponse.json(
      { ok: false, error: 'not_found', message: 'Routine not found.' },
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

  const parsed = createStepSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { weekday, title, position } = parsed.data;

  const created = await db.transaction(async (tx) => {
    const count = await countStepsForWeekday(tx, ownedId, weekday);

    // If position omitted -> append at the end (index = count).
    // If supplied -> clamp to [0, count] and shift later rows up to make room.
    let finalPosition: number;
    if (position === undefined) {
      finalPosition = count;
    } else if (position >= count) {
      finalPosition = count;
    } else {
      finalPosition = Math.max(0, position);
      await shiftPositionsUp(tx, ownedId, weekday, finalPosition);
    }

    const [row] = await tx
      .insert(routineDaySteps)
      .values({
        routineId: ownedId,
        weekday,
        position: finalPosition,
        title,
      })
      .returning();
    return row;
  });

  if (!created) {
    return NextResponse.json(
      { ok: false, error: 'insert_failed', message: 'Failed to create step.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, step: created }, { status: 201 });
});
