/**
 * GET /api/habits — list current user's non-archived habits + computed streaks.
 * POST /api/habits — create a new habit.
 *
 * Auth: session OR owner-token (see `lib/auth/resolveUser.ts`).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/db';
import { habits } from '@/db/schema';
import { withUser } from '@/lib/auth/resolveUser';
import { createHabitSchema } from '@/lib/validation/habits';
import { listHabitsForUser } from '@/lib/habits/queries';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// GET — list with streaks.
// ---------------------------------------------------------------------------

export const GET = withUser(async (_req, { user }) => {
  const rows = await listHabitsForUser(user.id);
  return NextResponse.json({ ok: true, habits: rows });
});

// ---------------------------------------------------------------------------
// POST — create a habit. Streaks for a brand-new habit are always 0/0/0.
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

  const parsed = createHabitSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, description, timezone, cadence, category, location } = parsed.data;

  const [created] = await db
    .insert(habits)
    .values({
      ownerUserId: user.id,
      name,
      description: description ?? null,
      timezone,
      cadence,
      category: category ?? null,
      location: location ?? null,
    })
    .returning();

  if (!created) {
    return NextResponse.json(
      { ok: false, error: 'insert_failed', message: 'Failed to create habit.' },
      { status: 500 },
    );
  }

  // Brand-new habit: streaks are zero, no completions yet.
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
