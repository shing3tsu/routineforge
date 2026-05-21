/**
 * POST /api/push/dispatch-tick — cron entrypoint. Owner-token only.
 *
 * Runs ONE dispatcher tick: finds schedules whose firing-time matches NOW
 * in the subject's IANA timezone, then fans out push messages to every
 * subscription owned by the schedule's user. See
 * `apps/web/lib/push/dispatcher.ts` for the full algorithm.
 *
 * Why owner-token (not `withUser`): this endpoint runs system-level cron
 * work, not user-initiated requests. A user session must never trigger the
 * dispatcher (would let any logged-in user blast their own push schedules
 * on demand). We use a bespoke token check (`isAuthorizedDispatch`) rather
 * than `authenticateOwner` because the dispatcher doesn't need to resolve
 * the OWNER_EMAIL user — it just needs to confirm the call came from a
 * trusted source.
 *
 * Production: invoked by Vercel Cron every minute. Add to vercel.json:
 *
 *   { "crons": [{ "path": "/api/push/dispatch-tick", "schedule": "*​/1 * * * *" }] }
 *
 * (Vercel automatically attaches the `Authorization: Bearer <CRON_SECRET>`
 * header; we re-use OWNER_API_TOKEN for that role here for simplicity.)
 *
 * Returns `{ ok, checked, fired, deleted, errors }` for observability.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { dispatchTick, isAuthorizedDispatch } from '@/lib/push/dispatcher';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<Response> {
  if (!isAuthorizedDispatch(req)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'unauthorized',
        message:
          'Missing or invalid Authorization: Bearer <OWNER_API_TOKEN> header.',
      },
      { status: 401 },
    );
  }

  const result = await dispatchTick();
  return NextResponse.json({ ok: true, ...result });
}
