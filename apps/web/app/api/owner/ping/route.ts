/**
 * GET /api/owner/ping — owner-token only.
 *
 * Smoke test for the CLI in scripts/manage.ts. Returns the resolved owner's
 * email and a server timestamp on success.
 */

import { NextResponse } from 'next/server';
import { withOwnerAuth } from '@/lib/auth/owner';

export const runtime = 'nodejs';

export const GET = withOwnerAuth(async (_req, owner) => {
  return NextResponse.json({
    ok: true,
    owner: owner.email,
    ts: new Date().toISOString(),
  });
});
