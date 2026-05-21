/**
 * POST   /api/habits/:id/completions — { date } — idempotent on (habit, user, date).
 * DELETE /api/habits/:id/completions — { date } — always 204.
 *
 * "Row exists = completed". Absence = not completed. `date` is the LOCAL
 * 'YYYY-MM-DD' date in the habit's IANA timezone (computed by the caller —
 * the CLI does this server-side).
 *
 * Auth: session OR owner-token.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { habitCompletions } from '@/db/schema';
import { withUser } from '@/lib/auth/resolveUser';
import { habitCompletionMutationSchema } from '@/lib/validation/habits';
import {
  computeStreaksForHabit,
  findOwnedHabit,
} from '@/lib/habits/queries';

export const runtime = 'nodejs';

type Params = { id: string };

// ---------------------------------------------------------------------------
// POST — mark habit done for (user, date). Idempotent on
// (habit_id, user_id, date) via the unique index.
// ---------------------------------------------------------------------------

export const POST = withUser<Params>(async (req: NextRequest, { user, params }) => {
  const habit = await findOwnedHabit(params.id, user.id);
  if (!habit) {
    return NextResponse.json(
      { ok: false, error: 'not_found', message: 'Habit not found.' },
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

  const parsed = habitCompletionMutationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { date } = parsed.data;

  // Idempotent insert via the unique index on (habit_id, user_id, date).
  await db
    .insert(habitCompletions)
    .values({
      habitId: habit.id,
      userId: user.id,
      date,
    })
    .onConflictDoNothing({
      target: [
        habitCompletions.habitId,
        habitCompletions.userId,
        habitCompletions.date,
      ],
    });

  // Read back the canonical row + recompute streaks for the response.
  const [row] = await db
    .select()
    .from(habitCompletions)
    .where(
      and(
        eq(habitCompletions.habitId, habit.id),
        eq(habitCompletions.userId, user.id),
        eq(habitCompletions.date, date),
      ),
    )
    .limit(1);

  const streaks = await computeStreaksForHabit(habit, user.id);

  return NextResponse.json(
    { ok: true, completion: row, streaks },
    { status: 201 },
  );
});

// ---------------------------------------------------------------------------
// DELETE — remove the completion row. Always 204. Idempotent.
// ---------------------------------------------------------------------------

export const DELETE = withUser<Params>(async (req: NextRequest, { user, params }) => {
  const habit = await findOwnedHabit(params.id, user.id);
  if (!habit) {
    return NextResponse.json(
      { ok: false, error: 'not_found', message: 'Habit not found.' },
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

  const parsed = habitCompletionMutationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await db
    .delete(habitCompletions)
    .where(
      and(
        eq(habitCompletions.habitId, habit.id),
        eq(habitCompletions.userId, user.id),
        eq(habitCompletions.date, parsed.data.date),
      ),
    );

  // Always 204 per spec — DELETE is idempotent.
  return new NextResponse(null, { status: 204 });
});
