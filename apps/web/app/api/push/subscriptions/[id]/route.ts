/**
 * DELETE /api/push/subscriptions/:id — remove a push subscription by its DB id.
 *
 * Companion to the endpoint-based `DELETE /api/push/subscriptions` (which the
 * browser uses to unsubscribe its OWN device, since it has the `endpoint`
 * URL but not the DB id). This per-id variant exists for the account
 * "Devices" UI: `GET /api/push/subscriptions` exposes ids but deliberately
 * omits the endpoint (a secret), so the UI needs an id-keyed delete to drop
 * other devices' rows.
 *
 * Auth: session OR owner-token via `withUser`.
 *
 * Ownership scope is enforced inline by adding `userId = <caller>` to the
 * WHERE clause — non-owned and non-existent rows alike are no-ops. Always
 * returns 204 (idempotent), mirroring the endpoint-based DELETE and the
 * schedules DELETE convention so existence isn't leaked via status code.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { pushSubscriptions } from '@/db/schema';
import { withUser } from '@/lib/auth/resolveUser';

export const runtime = 'nodejs';

type Params = { id: string };

// ---------------------------------------------------------------------------
// DELETE — by id, owner-scoped. Always 204.
// ---------------------------------------------------------------------------

export const DELETE = withUser<Params>(async (_req, { user, params }) => {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.id, params.id),
        eq(pushSubscriptions.userId, user.id),
      ),
    );
  // Always 204 per spec; DELETE is idempotent. Returning 404 here would
  // surface row-existence info via status, which violates the
  // not-yours-vs-doesnt-exist invariant.
  return new NextResponse(null, { status: 204 });
});
