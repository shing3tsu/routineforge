/**
 * GET    /api/push/subscriptions — list current user's devices (no secrets).
 * POST   /api/push/subscriptions — upsert by endpoint.
 * DELETE /api/push/subscriptions — remove by endpoint.
 *
 * Auth: session OR owner-token via `withUser`.
 *
 * POST requires VAPID to be configured (otherwise the dispatcher couldn't
 * ever send to the subscription). When VAPID is missing, returns 503 with a
 * helpful message so the frontend can disable the UI.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withUser } from '@/lib/auth/resolveUser';
import {
  subscribePushSchema,
  unsubscribePushSchema,
} from '@/lib/validation/push';
import {
  deleteSubscriptionForUser,
  listSubscriptionsForUser,
  upsertSubscription,
} from '@/lib/push/queries';
import { isVapidConfigured } from '@/lib/push/vapid';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// GET — list (account "Devices: 2" UI).
// ---------------------------------------------------------------------------

export const GET = withUser(async (_req, { user }) => {
  const subs = await listSubscriptionsForUser(user.id);
  return NextResponse.json({ ok: true, subscriptions: subs });
});

// ---------------------------------------------------------------------------
// POST — upsert by endpoint.
// ---------------------------------------------------------------------------

export const POST = withUser(async (req: NextRequest, { user }) => {
  if (!isVapidConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'push_not_configured',
        message:
          'Push notifications are not configured on this server. Ask the admin to set VAPID env vars.',
      },
      { status: 503 },
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

  const parsed = subscribePushSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { endpoint, keys, userAgent } = parsed.data;
  const row = await upsertSubscription({
    userId: user.id,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent,
  });

  // Don't echo the secrets back; the client already has them. Surface only
  // the identifying fields so callers can confirm the row was saved.
  return NextResponse.json(
    {
      ok: true,
      subscription: {
        id: row.id,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
      },
    },
    { status: 201 },
  );
});

// ---------------------------------------------------------------------------
// DELETE — by endpoint. Always 204 per spec.
// ---------------------------------------------------------------------------

export const DELETE = withUser(async (req: NextRequest, { user }) => {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', message: 'Body must be JSON.' },
      { status: 400 },
    );
  }

  const parsed = unsubscribePushSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await deleteSubscriptionForUser(user.id, parsed.data.endpoint);
  return new NextResponse(null, { status: 204 });
});
