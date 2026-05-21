/**
 * Unified user resolution for API routes.
 *
 * Composes two auth modes into a single helper:
 *
 *   1. **Session** (NextAuth JWT) — `auth()` from `@/auth`. Cheap and the
 *      common case for browser-originated requests.
 *   2. **Owner token** (Bearer header) — `authenticateOwner` from
 *      `@/lib/auth/owner`. Used by the CLI in `scripts/manage.ts`.
 *
 * Order: session first (it's cheaper and more common); fall back to the owner
 * token. Both failing → 401.
 *
 * On owner-token success but a missing `OWNER_EMAIL` user, we surface the same
 * 400 `no_owner_user` error as the existing `/api/owner/ping` route — keeps
 * CLI ergonomics consistent across endpoints.
 *
 * NOTE on extension: This file **composes** `authenticateOwner` rather than
 * re-implementing it. Per the dispatch contract `lib/auth/owner.ts` is not to
 * be modified.
 */

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { authenticateOwner } from '@/lib/auth/owner';
import { db } from '@/db';
import { users, type User } from '@/db/schema';

export type ResolveUserResult =
  | { ok: true; user: User; via: 'session' | 'owner-token' }
  | { ok: false; response: NextResponse };

/**
 * Resolve the authenticated user from either a NextAuth session cookie or
 * an `Authorization: Bearer <OWNER_API_TOKEN>` header.
 *
 * Returns either the user (with how they authenticated) or a ready-to-return
 * NextResponse on failure. Callers should `if (!result.ok) return result.response;`.
 */
export async function resolveUser(req: NextRequest): Promise<ResolveUserResult> {
  // --- 1. Session (cheaper, more common) ----------------------------------
  const session = await auth();
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;

  if (sessionUserId) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, sessionUserId))
      .limit(1);

    if (user) {
      return { ok: true, user, via: 'session' };
    }
    // Session has an id but the user vanished (e.g. account deleted): treat
    // as unauthenticated and fall through to owner-token (a CLI request might
    // still succeed even if the browser session is stale).
  }

  // --- 2. Owner token -----------------------------------------------------
  // Only attempt this when the Authorization header looks like a bearer
  // present. authenticateOwner internally returns 401 missing_token when the
  // header is missing — but we don't want to surface that error if the
  // session was also absent (the user is just unauthenticated). So only call
  // it when the header is present.
  const authHeader = req.headers.get('authorization');
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const ownerResult = await authenticateOwner(req);
    if (ownerResult.ok) {
      return { ok: true, user: ownerResult.owner, via: 'owner-token' };
    }
    // Owner-token attempt failed with a specific kind. Surface its status
    // and structured error so the CLI sees `no_owner_user` 400 / `invalid_token`
    // 401 / `misconfigured` 500 verbatim.
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: ownerResult.error.kind,
          message: ownerResult.error.message,
        },
        { status: ownerResult.status },
      ),
    };
  }

  // No session, no bearer token.
  return {
    ok: false,
    response: NextResponse.json(
      {
        ok: false,
        error: 'unauthenticated',
        message: 'Sign in or provide an owner Bearer token to access this resource.',
      },
      { status: 401 },
    ),
  };
}

/**
 * Wrap a route handler so the user is resolved before the handler runs.
 *
 * The handler receives the resolved User and the route-context (Next.js
 * dynamic-segment params via `ctx.params`).
 *
 * Usage:
 *
 *   export const GET = withUser(async (req, { user, params }) => {
 *     // ...
 *   });
 *
 * For routes without dynamic segments, the `params` field is the empty object
 * (Next.js still passes `{ params: Promise<{}> }`).
 */
export type RouteContext<P extends Record<string, string> = Record<string, never>> = {
  params: Promise<P>;
};

export function withUser<P extends Record<string, string> = Record<string, never>>(
  handler: (
    req: NextRequest,
    ctx: { user: User; params: P; via: 'session' | 'owner-token' },
  ) => Promise<Response> | Response,
): (req: NextRequest, ctx: RouteContext<P>) => Promise<Response> {
  return async (req, ctx) => {
    const resolved = await resolveUser(req);
    if (!resolved.ok) return resolved.response;
    const params = (await ctx.params) ?? ({} as P);
    return handler(req, { user: resolved.user, params, via: resolved.via });
  };
}
