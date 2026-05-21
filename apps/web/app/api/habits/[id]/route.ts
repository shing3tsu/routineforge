/**
 * GET    /api/habits/:id — fetch one habit + streaks + last 90 days of completions.
 * PATCH  /api/habits/:id — partial update of name / description / timezone / cadence.
 * DELETE /api/habits/:id — soft delete (sets archivedAt).
 *
 * Auth: session OR owner-token. 404 if the habit isn't owned by the resolved
 * user (we do NOT distinguish "doesn't exist" from "not yours" — mirrors the
 * routines convention).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { habits } from '@/db/schema';
import { withUser } from '@/lib/auth/resolveUser';
import { updateHabitSchema } from '@/lib/validation/habits';
import { findOwnedHabit, getHabitDetail } from '@/lib/habits/queries';

export const runtime = 'nodejs';

type Params = { id: string };

// ---------------------------------------------------------------------------
// GET — habit detail with streaks + last 90 days of completions.
// ---------------------------------------------------------------------------

export const GET = withUser<Params>(async (_req, { user, params }) => {
  const detail = await getHabitDetail(params.id, user.id);
  if (!detail) {
    return NextResponse.json(
      { ok: false, error: 'not_found', message: 'Habit not found.' },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, habit: detail });
});

// ---------------------------------------------------------------------------
// PATCH — partial update. Body may include name/description/timezone/cadence.
// Streaks are recomputed on next read; cadence-change has no migration needed.
// ---------------------------------------------------------------------------

export const PATCH = withUser<Params>(async (req: NextRequest, { user, params }) => {
  const existing = await findOwnedHabit(params.id, user.id);
  if (!existing) {
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

  const parsed = updateHabitSchema.safeParse(json);
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
    cadence: typeof existing.cadence;
    category: string | null;
    location: string | null;
    updatedAt: Date;
  }> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.timezone !== undefined) patch.timezone = parsed.data.timezone;
  if (parsed.data.cadence !== undefined) patch.cadence = parsed.data.cadence;
  // category / location: `undefined` = omitted; `null` = explicit clear. The
  // validator turns `''` into `null`.
  if (parsed.data.category !== undefined) patch.category = parsed.data.category;
  if (parsed.data.location !== undefined) patch.location = parsed.data.location;

  await db.update(habits).set(patch).where(eq(habits.id, existing.id));

  // Re-fetch with streaks so the client gets a consistent shape (mirrors GET).
  const detail = await getHabitDetail(existing.id, user.id);
  return NextResponse.json({ ok: true, habit: detail });
});

// ---------------------------------------------------------------------------
// DELETE — soft delete via archivedAt.
// ---------------------------------------------------------------------------

export const DELETE = withUser<Params>(async (_req, { user, params }) => {
  const existing = await findOwnedHabit(params.id, user.id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: 'not_found', message: 'Habit not found.' },
      { status: 404 },
    );
  }

  await db
    .update(habits)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(habits.id, existing.id));

  return NextResponse.json({ ok: true });
});
