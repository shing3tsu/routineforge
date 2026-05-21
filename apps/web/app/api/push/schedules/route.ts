/**
 * GET  /api/push/schedules?subjectType=routine|habit&subjectId=<id> — list.
 * POST /api/push/schedules — create.
 *
 * Auth: session OR owner-token via `withUser`.
 *
 * GET: both query params are optional; when both are omitted, returns ALL
 * schedules for the user (powers the account / audit screen). When provided,
 * filters to that subject; we validate that the subject is owned by the user
 * so unknown ids return a 404.
 *
 * POST: rejects schedules for subjects the caller doesn't own (404
 * `not_found`, matching the routines/habits convention).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withUser } from '@/lib/auth/resolveUser';
import {
  createScheduleSchema,
  schedulesListQuerySchema,
} from '@/lib/validation/push';
import {
  insertSchedule,
  listSchedulesForUser,
  userOwnsSubject,
} from '@/lib/push/queries';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// GET — list.
// ---------------------------------------------------------------------------

export const GET = withUser(async (req: NextRequest, { user }) => {
  // searchParams.get returns null when absent; convert to undefined so zod's
  // optional() doesn't trip over the null.
  const subjectType = req.nextUrl.searchParams.get('subjectType') ?? undefined;
  const subjectId = req.nextUrl.searchParams.get('subjectId') ?? undefined;

  const parsed = schedulesListQuerySchema.safeParse({
    ...(subjectType !== undefined ? { subjectType } : {}),
    ...(subjectId !== undefined ? { subjectId } : {}),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.subjectType && parsed.data.subjectId) {
    const owns = await userOwnsSubject(
      user.id,
      parsed.data.subjectType,
      parsed.data.subjectId,
    );
    if (!owns) {
      return NextResponse.json(
        { ok: false, error: 'not_found', message: 'Subject not found.' },
        { status: 404 },
      );
    }
    const schedules = await listSchedulesForUser(user.id, {
      subjectType: parsed.data.subjectType,
      subjectId: parsed.data.subjectId,
    });
    return NextResponse.json({ ok: true, schedules });
  }

  const schedules = await listSchedulesForUser(user.id);
  return NextResponse.json({ ok: true, schedules });
});

// ---------------------------------------------------------------------------
// POST — create.
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

  const parsed = createScheduleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { subjectType, subjectId, time, weekdays, enabled } = parsed.data;

  const owns = await userOwnsSubject(user.id, subjectType, subjectId);
  if (!owns) {
    return NextResponse.json(
      { ok: false, error: 'not_found', message: 'Subject not found.' },
      { status: 404 },
    );
  }

  const schedule = await insertSchedule({
    userId: user.id,
    subjectType,
    subjectId,
    time,
    weekdays,
    enabled: enabled ?? true,
  });

  return NextResponse.json({ ok: true, schedule }, { status: 201 });
});
