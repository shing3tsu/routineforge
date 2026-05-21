/**
 * GET /api/auth/verify?token=...&email=... — public.
 *
 * Marks the user's `emailVerified` timestamp and consumes the token. Redirects
 * to `/login?verified=1` on success, or `/login?verified=0&reason=...` on
 * failure (expired, unknown, rate_limited, etc.).
 *
 * Rate limiting: per-IP token bucket (capacity 10, refill 5/min). This is a
 * GET browser flow, so on limit we redirect with `reason=rate_limited` rather
 * than returning JSON (matching the existing redirect pattern). Tuned slightly
 * more permissively than signup since legitimate users may click the
 * verification link multiple times (e.g. re-loading a tab), while still
 * making bulk token-guessing impractical.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { users, verificationTokens } from '@/db/schema';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const querySchema = z.object({
  token: z.string().min(32).max(128),
  email: z.string().trim().toLowerCase().email(),
});

const RATE_LIMIT_OPTIONS = { capacity: 10, refillPerMinute: 5 };

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

export async function GET(req: NextRequest): Promise<Response> {
  const base = process.env.AUTH_URL ?? req.nextUrl.origin;

  const ip = getClientIp(req);
  const limit = rateLimit(`verify:${ip}`, RATE_LIMIT_OPTIONS);
  if (!limit.ok) {
    return NextResponse.redirect(`${base}/login?verified=0&reason=rate_limited`);
  }

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.redirect(`${base}/login?verified=0&reason=bad_request`);
  }

  const { token, email } = parsed.data;

  const [row] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.token, token),
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.redirect(`${base}/login?verified=0&reason=invalid_token`);
  }
  if (row.expires.getTime() < Date.now()) {
    // Best-effort cleanup of expired tokens.
    await db
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, email),
          eq(verificationTokens.token, token),
        ),
      );
    return NextResponse.redirect(`${base}/login?verified=0&reason=expired`);
  }

  // Mark verified + delete the token.
  await db
    .update(users)
    .set({ emailVerified: new Date(), updatedAt: new Date() })
    .where(eq(users.email, email));

  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.token, token),
      ),
    );

  return NextResponse.redirect(`${base}/login?verified=1`);
}
