/**
 * GET    /api/routines/:id — fetch one routine + all day-steps grouped by weekday.
 * PATCH  /api/routines/:id — partial update of name / description / timezone.
 * DELETE /api/routines/:id — soft delete (sets archivedAt).
 *
 * Auth: session OR owner-token. 404 if the routine isn't owned by the resolved
 * user (we do NOT distinguish "doesn't exist" from "not yours" — avoids
 * exposing existence of other users' routine ids).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { routines, routineDaySteps } from '@/db/schema';
import { withUser } from '@/lib/auth/resolveUser';
import { updateRoutineSchema } from '@/lib/validation/routines';

export const runtime = 'nodejs';

type Params = { id: string };

async function findOwnedRoutine(routineId: string, userId: string) {
  const [row] = await db
    .select()
    .from(routines)
    .where(
      and(
        eq(routines.id, routineId),
        eq(routines.ownerUserId, userId),
        isNull(routines.archivedAt),
      ),
    )
    .limit(1);
  return row;
}

// ---------------------------------------------------------------------------
// GET — routine + steps grouped by weekday.
// ---------------------------------------------------------------------------

export const GET = withUser<Params>(async (_req, { user, params }) => {
  const routine = await findOwnedRoutine(params.id, user.id);
  if (!routine) {
    return NextResponse.json(
      { ok: false, error: 'not_found', message: 'Routine not found.' },
      { status: 404 },
    );
  }

  const steps = await db
    .select()
    .from(routineDaySteps)
    .where(eq(routineDaySteps.routineId, routine.id))
    .orderBy(asc(routineDaySteps.weekday), asc(routineDaySteps.position));

  // Group by weekday for the response. Empty weekdays are represented as an
  // empty array. Caller can derive scheduleWeekdays by filtering keys.
  const stepsByWeekday: Record<number, typeof steps> = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  };
  for (const s of steps) {
    stepsByWeekday[s.weekday]!.push(s);
  }

  return NextResponse.json({
    ok: true,
    routine: {
      ...routine,
      stepsByWeekday,
      scheduleWeekdays: Object.entries(stepsByWeekday)
        .filter(([, v]) => v.length > 0)
        .map(([k]) => Number(k))
        .sort((a, b) => a - b),
    },
  });
});

// ---------------------------------------------------------------------------
// PATCH — partial update. Body may include any of name / description / timezone.
// ---------------------------------------------------------------------------

export const PATCH = withUser<Params>(async (req: NextRequest, { user, params }) => {
  const existing = await findOwnedRoutine(params.id, user.id);
  if (!existing) {
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

  const parsed = updateRoutineSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const patch: Partial<{
    name: string;
    description: string | null;
    timezone: string;
    category: string | null;
    location: string | null;
    updatedAt: Date;
  }> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.timezone !== undefined) patch.timezone = parsed.data.timezone;
  // category / location: `undefined` = field omitted (no change); `null` =
  // explicit clear. The validator turns `''` into `null` so the route doesn't
  // need to special-case empty strings.
  if (parsed.data.category !== undefined) patch.category = parsed.data.category;
  if (parsed.data.location !== undefined) patch.location = parsed.data.location;

  const [updated] = await db
    .update(routines)
    .set(patch)
    .where(eq(routines.id, existing.id))
    .returning();

  return NextResponse.json({ ok: true, routine: updated });
});

// ---------------------------------------------------------------------------
// DELETE — soft delete via archivedAt.
// ---------------------------------------------------------------------------

export const DELETE = withUser<Params>(async (_req, { user, params }) => {
  const existing = await findOwnedRoutine(params.id, user.id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: 'not_found', message: 'Routine not found.' },
      { status: 404 },
    );
  }

  await db
    .update(routines)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(routines.id, existing.id));

  return NextResponse.json({ ok: true });
});
