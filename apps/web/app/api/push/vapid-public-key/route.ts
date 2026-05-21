/**
 * GET /api/push/vapid-public-key — PUBLIC (no auth).
 *
 * Returns the configured VAPID public key (base64url) so the browser can
 * pass it to `pushManager.subscribe({ applicationServerKey })`.
 *
 * When push is not configured (no VAPID env vars), returns 503. The
 * frontend uses this to disable the "Enable push" UI cleanly.
 *
 * Heavy caching: the public key is, by definition, public and rarely
 * changes. Setting a 1-hour Cache-Control + immutable header lets browsers
 * and the Vercel CDN absorb the load.
 */

import { NextResponse } from 'next/server';
import { getVapidConfig } from '@/lib/push/vapid';

export const runtime = 'nodejs';

export function GET(): Response {
  const cfg = getVapidConfig();
  if (!cfg) {
    return NextResponse.json(
      {
        ok: false,
        error: 'push_not_configured',
        message:
          'Push notifications are not configured on this server. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.',
      },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { ok: true, key: cfg.publicKey },
    {
      headers: {
        // Public, immutable for the duration of the key's life. If we ever
        // rotate VAPID keys we'll publish a different value at this URL and
        // browsers will re-validate after the max-age.
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, immutable',
      },
    },
  );
}
