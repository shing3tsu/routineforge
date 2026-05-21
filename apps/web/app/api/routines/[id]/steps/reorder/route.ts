/**
 * POST /api/routines/:id/steps/reorder — bulk reorder.
 *
 * Body: { weekday: 0..6, stepIds: string[] }
 *
 * Validates that the supplied id set matches EXACTLY the existing set of
 * steps for (routine, weekday) — refuses partial reorders / cross-weekday
 * sneaks. Then re-emits positions 0..n-1 in order.
 *
 * Auth: session OR owner-token.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { routines, routineDaySteps } from '@/db/schema';
import { withUser } from '@/lib/auth/resolveUser';
import { reorderStepsSchema } from '@/lib/validation/routines';
import { setPositionsForWeekday } from '@/lib/routines/steps';

export const runtime = 'nodejs';

type Params = { id: string };

export const POST = withUser<Params>(async (req: NextRequest, { user, params }) => {
  // Ownership check.
  const [owned] = await db
    .select({ id: routines.id })
    .from(routines)
    .where(
      and(
        eq(routines.id, params.id),
        eq(routines.ownerUserId, user.id),
        isNull(routines.archivedAt),
      ),
    )
    .limit(1);
  if (!owned) {
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

  const parsed = reorderStepsSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { weekday, stepIds } = parsed.data;

  // Reject duplicates within the supplied list.
  if (new Set(stepIds).size !== stepIds.length) {
    return NextResponse.json(
      {
        ok: false,
        error: 'duplicate_step_ids',
        message: 'stepIds contains duplicate values.',
      },
      { status: 400 },
    );
  }

  // Verify supplied id set matches existing set for (routine, weekday).
  const existing = await db
    .select({ id: routineDaySteps.id })
    .from(routineDaySteps)
    .where(
      and(
        eq(routineDaySteps.routineId, owned.id),
        eq(routineDaySteps.weekday, weekday),
      ),
    );

  const existingIds = new Set(existing.map((r) => r.id));
  const suppliedIds = new Set(stepIds);

  if (
    existingIds.size !== suppliedIds.size ||
    [...existingIds].some((id) => !suppliedIds.has(id))
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: 'mismatched_step_ids',
        message:
          'stepIds must equal the full set of step ids currently in this weekday.',
      },
      { status: 400 },
    );
  }

  await db.transaction(async (tx) => {
    await setPositionsForWeekday(tx, owned.id, weekday, stepIds);
  });

  return NextResponse.json({ ok: true });
});
