/**
 * GET /api/routines — list current user's non-archived routines.
 * POST /api/routines — create a new routine.
 *
 * Auth: session OR owner-token (see `lib/auth/resolveUser.ts`).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/db';
import { routines } from '@/db/schema';
import { withUser } from '@/lib/auth/resolveUser';
import { listRoutinesForUser } from '@/lib/routines/queries';
import { createRoutineSchema } from '@/lib/validation/routines';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// GET — list non-archived routines for the resolved user, ordered by name.
//
// Each row carries:
//   - the core routine fields (name, description, timezone, ...)
//   - derived `scheduleWeekdays` (weekdays with ≥1 step)
//   - per-routine today + last-7-days stats (`stepCountToday`,
//     `stepsCompletedToday`, `isScheduledToday`, `lastSevenDays[]`)
//
// The stats are an additive contract change — existing consumers that only
// read core fields keep working. See `listRoutinesForUser` for the batched
// query strategy.
// ---------------------------------------------------------------------------

export const GET = withUser(async (_req, { user }) => {
  const items = await listRoutinesForUser(user.id);
  return NextResponse.json({ ok: true, routines: items });
});

// ---------------------------------------------------------------------------
// POST — create a routine.
// ---------------------------------------------------------------------------

export const POST = withUser(async (req: NextRequest, { user }) => {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', message: 'Body must be JSON.' },
      { status: 400 },
    );
  }

  const parsed = createRoutineSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, description, timezone, category, location } = parsed.data;

  const [created] = await db
    .insert(routines)
    .values({
      ownerUserId: user.id,
      name,
      description: description ?? null,
      timezone,
      category: category ?? null,
      location: location ?? null,
    })
    .returning();

  if (!created) {
    return NextResponse.json(
      { ok: false, error: 'insert_failed', message: 'Failed to create routine.' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, routine: { ...created, scheduleWeekdays: [] } },
    { status: 201 },
  );
});
