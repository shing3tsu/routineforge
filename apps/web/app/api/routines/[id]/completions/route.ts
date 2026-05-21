/**
 * GET    /api/routines/:id/completions?date=YYYY-MM-DD — completions for that date.
 * POST   /api/routines/:id/completions — { stepId, date } — idempotent.
 * DELETE /api/routines/:id/completions — { stepId, date } — always 204.
 *
 * "Row exists = completed". Absence = not completed.
 *
 * Auth: session OR owner-token.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import {
  routines,
  routineDaySteps,
  routineStepCompletions,
} from '@/db/schema';
import { withUser } from '@/lib/auth/resolveUser';
import {
  completionMutationSchema,
  completionsListQuerySchema,
} from '@/lib/validation/routines';

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

/**
 * Verify the step belongs to the given routine. Returns the step row or null.
 */
async function findStepInRoutine(routineId: string, stepId: string) {
  const [row] = await db
    .select()
    .from(routineDaySteps)
    .where(
      and(
        eq(routineDaySteps.id, stepId),
        eq(routineDaySteps.routineId, routineId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// GET — list completions for a date.
// ---------------------------------------------------------------------------

export const GET = withUser<Params>(async (req: NextRequest, { user, params }) => {
  const ownedId = await assertOwned(params.id, user.id);
  if (!ownedId) {
    return NextResponse.json(
      { ok: false, error: 'not_found', message: 'Routine not found.' },
      { status: 404 },
    );
  }

  const queryParsed = completionsListQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!queryParsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: queryParsed.error.flatten() },
      { status: 400 },
    );
  }

  const rows = await db
    .select({
      stepId: routineStepCompletions.stepId,
      completedAt: routineStepCompletions.completedAt,
    })
    .from(routineStepCompletions)
    .where(
      and(
        eq(routineStepCompletions.routineId, ownedId),
        eq(routineStepCompletions.userId, user.id),
        eq(routineStepCompletions.date, queryParsed.data.date),
      ),
    );

  return NextResponse.json({ ok: true, completions: rows });
});

// ---------------------------------------------------------------------------
// POST — mark a step done for (user, date). Idempotent on
// (stepId, userId, date) via the unique index.
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

  const parsed = completionMutationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { stepId, date } = parsed.data;

  const step = await findStepInRoutine(ownedId, stepId);
  if (!step) {
    return NextResponse.json(
      {
        ok: false,
        error: 'step_not_in_routine',
        message: 'stepId does not belong to this routine.',
      },
      { status: 400 },
    );
  }

  // Idempotent insert: ON CONFLICT DO NOTHING by the (step_id, user_id, date)
  // unique index. Then read back the canonical row to return.
  await db
    .insert(routineStepCompletions)
    .values({
      routineId: ownedId,
      stepId,
      userId: user.id,
      date,
    })
    .onConflictDoNothing({
      target: [
        routineStepCompletions.stepId,
        routineStepCompletions.userId,
        routineStepCompletions.date,
      ],
    });

  const [row] = await db
    .select()
    .from(routineStepCompletions)
    .where(
      and(
        eq(routineStepCompletions.stepId, stepId),
        eq(routineStepCompletions.userId, user.id),
        eq(routineStepCompletions.date, date),
      ),
    )
    .limit(1);

  return NextResponse.json({ ok: true, completion: row }, { status: 201 });
});

// ---------------------------------------------------------------------------
// DELETE — remove the completion row. Always 204.
// ---------------------------------------------------------------------------

export const DELETE = withUser<Params>(async (req: NextRequest, { user, params }) => {
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

  const parsed = completionMutationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { stepId, date } = parsed.data;

  await db
    .delete(routineStepCompletions)
    .where(
      and(
        eq(routineStepCompletions.routineId, ownedId),
        eq(routineStepCompletions.stepId, stepId),
        eq(routineStepCompletions.userId, user.id),
        eq(routineStepCompletions.date, date),
      ),
    );

  // Always 204 per spec — DELETE is idempotent.
  return new NextResponse(null, { status: 204 });
});
