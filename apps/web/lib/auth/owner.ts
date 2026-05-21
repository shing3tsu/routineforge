/**
 * Owner-token guard for the `/api/owner/**` namespace.
 *
 * Auth model: a long random secret (OWNER_API_TOKEN) sent as
 * `Authorization: Bearer <token>`. The CLI in scripts/manage.ts uses this to
 * authenticate as the user whose email matches OWNER_EMAIL.
 *
 * Comparison uses Node's timingSafeEqual to avoid leaking the token length /
 * prefix via a string-equality timing side channel.
 */

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, type User } from '@/db/schema';

const BEARER = /^Bearer\s+(.+)$/i;

export type OwnerAuthError =
  | { kind: 'missing_token'; message: string }
  | { kind: 'misconfigured'; message: string }
  | { kind: 'invalid_token'; message: string }
  | { kind: 'no_owner_user'; message: string };

export type OwnerAuthResult =
  | { ok: true; owner: User }
  | { ok: false; status: 400 | 401 | 500; error: OwnerAuthError };

function constantTimeEqual(a: string, b: string): boolean {
  // Buffer.from is safe — both inputs are ASCII secrets.
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Authenticate an incoming Request via the owner token.
 *
 * - 401 if no Bearer header / wrong token.
 * - 500 if OWNER_API_TOKEN or OWNER_EMAIL env vars are not set.
 * - 400 if OWNER_EMAIL is set but the corresponding user does not exist (route
 *   explicitly should NOT auto-create the owner user).
 */
export async function authenticateOwner(req: NextRequest): Promise<OwnerAuthResult> {
  const expected = process.env.OWNER_API_TOKEN;
  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();

  if (!expected || expected.length < 16) {
    return {
      ok: false,
      status: 500,
      error: {
        kind: 'misconfigured',
        message: 'OWNER_API_TOKEN is not set (or is too short) on the server.',
      },
    };
  }
  if (!ownerEmail) {
    return {
      ok: false,
      status: 500,
      error: {
        kind: 'misconfigured',
        message: 'OWNER_EMAIL is not set on the server.',
      },
    };
  }

  const header = req.headers.get('authorization');
  const match = header ? BEARER.exec(header) : null;
  if (!match || !match[1]) {
    return {
      ok: false,
      status: 401,
      error: {
        kind: 'missing_token',
        message: 'Missing Authorization: Bearer <token> header.',
      },
    };
  }

  const presented = match[1].trim();
  if (!constantTimeEqual(presented, expected)) {
    return {
      ok: false,
      status: 401,
      error: { kind: 'invalid_token', message: 'Invalid owner token.' },
    };
  }

  const [owner] = await db
    .select()
    .from(users)
    .where(eq(users.email, ownerEmail))
    .limit(1);

  if (!owner) {
    return {
      ok: false,
      status: 400,
      error: {
        kind: 'no_owner_user',
        message: `Owner user not found; sign up with OWNER_EMAIL (${ownerEmail}) first.`,
      },
    };
  }

  return { ok: true, owner };
}

/**
 * Wrap a route handler so the owner is authenticated before the handler runs.
 * The handler receives the resolved owner User as its second argument.
 *
 * Usage:
 *   export const GET = withOwnerAuth(async (req, owner) => { ... });
 */
export function withOwnerAuth(
  handler: (req: NextRequest, owner: User) => Promise<Response> | Response,
): (req: NextRequest) => Promise<Response> {
  return async (req: NextRequest) => {
    const result = await authenticateOwner(req);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error.kind, message: result.error.message },
        { status: result.status },
      );
    }
    return handler(req, result.owner);
  };
}
