/**
 * PATCH  /api/push/schedules/:id — partial update of time/weekdays/enabled.
 * DELETE /api/push/schedules/:id — remove.
 *
 * Auth: session OR owner-token via `withUser`. 404 when the schedule isn't
 * owned by the caller (existence not distinguished — same convention as
 * routines and habits).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withUser } from '@/lib/auth/resolveUser';
import { updateScheduleSchema } from '@/lib/validation/push';
import {
  deleteScheduleForUser,
  findScheduleForUser,
  updateScheduleById,
} from '@/lib/push/queries';

export const runtime = 'nodejs';

type Params = { id: string };

// ---------------------------------------------------------------------------
// PATCH — partial update.
// ---------------------------------------------------------------------------

export const PATCH = withUser<Params>(async (req: NextRequest, { user, params }) => {
  const existing = await findScheduleForUser(params.id, user.id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: 'not_found', message: 'Schedule not found.' },
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

  const parsed = updateScheduleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const patch: { time?: string; weekdays?: number[]; enabled?: boolean } = {};
  if (parsed.data.time !== undefined) patch.time = parsed.data.time;
  if (parsed.data.weekdays !== undefined) patch.weekdays = parsed.data.weekdays;
  if (parsed.data.enabled !== undefined) patch.enabled = parsed.data.enabled;

  const schedule = await updateScheduleById(existing.id, patch);
  return NextResponse.json({ ok: true, schedule });
});

// ---------------------------------------------------------------------------
// DELETE — always 204.
// ---------------------------------------------------------------------------

export const DELETE = withUser<Params>(async (_req, { user, params }) => {
  await deleteScheduleForUser(params.id, user.id);
  // Always 204 per spec; DELETE is idempotent. Returning 404 here would
  // surface row-existence info via timing/status, which violates the
  // not-yours-vs-doesnt-exist invariant.
  return new NextResponse(null, { status: 204 });
});
