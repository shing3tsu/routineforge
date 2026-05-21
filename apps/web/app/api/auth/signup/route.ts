/**
 * POST /api/auth/signup — public.
 *
 * Creates a new user with a bcrypt-hashed password and a single-use email
 * verification token. The verification URL is dispatched via
 * `sendVerificationEmail` (see `@/lib/email`):
 *   - dev (no `RESEND_API_KEY`) → logged to the server console in the
 *     `[signup] verification link for <email>: <url>` format the Playwright
 *     verification fixture depends on.
 *   - prod (with `RESEND_API_KEY` + `RESEND_FROM_EMAIL`) → real email via
 *     Resend.
 * Email send failures do NOT block signup — we log the error and return ok.
 *
 * Idempotency / enumeration: we deliberately return a vague success message
 * even if the email already exists, to avoid leaking which addresses have
 * accounts.
 *
 * Rate limiting: per-IP token bucket (capacity 5, refill 3/min). Bots hitting
 * the endpoint at burst speed are rejected with 429; legitimate users
 * (re-tries after typos / failed validation) have plenty of headroom. See
 * `apps/web/lib/rate-limit.ts` for the algorithm + scope caveats.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { users, verificationTokens } from '@/db/schema';
import { rateLimit } from '@/lib/rate-limit';
import { sendVerificationEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  name: z.string().trim().min(1).max(120).optional(),
});

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24h

const RATE_LIMIT_OPTIONS = { capacity: 5, refillPerMinute: 3 };

/**
 * Best-effort client IP extraction. Behind Vercel / a typical reverse proxy
 * the first hop of `x-forwarded-for` is the real client. If that header is
 * absent (curl from localhost during dev, an unusual proxy setup), we fall
 * back to the literal string `'unknown'` so all such callers share one bucket
 * — bots can't trivially evade the limit by simply omitting the header.
 */
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

export async function POST(req: NextRequest): Promise<Response> {
  const ip = getClientIp(req);
  const limit = rateLimit(`signup:${ip}`, RATE_LIMIT_OPTIONS);
  if (!limit.ok) {
    const retryAfterSec = Math.max(1, Math.ceil(limit.retryAfterMs / 1000));
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSec) },
      },
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

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: 'validation_error',
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { email, password, name } = parsed.data;

  // Check for existing user. We still return the same vague success response
  // either way to avoid email-enumeration.
  const [existing] = await db
    .select({ id: users.id, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    // Don't create a token for an already-verified user, but ALSO don't reveal
    // the address is taken. Just return ok.
    if (existing.emailVerified) {
      return NextResponse.json({ ok: true });
    }
    // If unverified, issue a fresh token so the user can complete signup.
    const token = await issueVerificationToken(email);
    await dispatchVerificationEmail(email, token, name ?? null);
    return NextResponse.json({ ok: true });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.insert(users).values({
    email,
    name: name ?? null,
    passwordHash,
  });

  const token = await issueVerificationToken(email);
  await dispatchVerificationEmail(email, token, name ?? null);

  return NextResponse.json({ ok: true });
}

async function issueVerificationToken(email: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + TOKEN_TTL_MS);
  await db.insert(verificationTokens).values({
    identifier: email,
    token,
    expires,
  });
  return token;
}

/**
 * Build the verify URL and hand it off to the email layer. Email failures are
 * logged but do NOT propagate — signup must still complete and return ok so
 * we don't break account creation just because Resend is down (the user can
 * request a fresh verification email later) and so enumeration-resistance is
 * preserved (callers can't tell which side of the existing-user branch they
 * hit by observing a 5xx).
 */
async function dispatchVerificationEmail(
  email: string,
  token: string,
  name: string | null,
): Promise<void> {
  const base = process.env.AUTH_URL ?? 'http://localhost:3000';
  const verificationUrl = `${base}/api/auth/verify?token=${token}&email=${encodeURIComponent(email)}`;
  const result = await sendVerificationEmail({
    to: email,
    verificationUrl,
    name,
  });
  if (!result.sent) {
    // Surface for ops visibility (Vercel function logs). Intentionally
    // console.error — not thrown — so signup still returns ok.
    console.error(
      `[signup] verification email FAILED via ${result.provider} for ${email}: ${result.error ?? 'unknown error'}`,
    );
  }
}
