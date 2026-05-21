/**
 * Session middleware. Protects all routes EXCEPT explicit public paths and the
 * owner namespace (which has its own per-route guard).
 *
 * Public:
 *   - `/`
 *   - `/login`, `/signup`
 *   - `/offline` (SW precaches this; must be reachable without auth so the
 *     install-time fetch caches real HTML, not a `/login` redirect)
 *   - `/api/auth/**` (NextAuth handler + our signup/verify endpoints)
 *   - `/api/owner/**` (owner-token guard runs inside the route)
 *   - `/api/routines/**` (dual-auth: session OR owner-token, enforced
 *     per-route via `withUser` from `lib/auth/resolveUser.ts`)
 *   - `/api/habits/**` (dual-auth via `withUser`)
 *   - `/api/push/**` (dual-auth via `withUser`, plus the public VAPID key
 *     endpoint and the cron-only `dispatch-tick` endpoint which does its own
 *     bearer-token check)
 *   - Static asset paths (handled by the `matcher` config below).
 *
 * Anything else: redirects unauthenticated users to `/login?from=<encoded>`.
 *
 * Uses the EDGE-SAFE `authConfig` (no DB / bcrypt imports). The full config
 * lives in `auth.ts` and is only used by route handlers / RSCs.
 */

import { NextResponse, type NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

const { auth } = NextAuth(authConfig);

const PUBLIC_EXACT = new Set(['/', '/login', '/signup', '/offline']);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (pathname.startsWith('/api/auth/')) return true;
  if (pathname.startsWith('/api/owner/')) return true;
  // Dual-auth API namespaces — per-route `withUser` enforces session OR token.
  if (pathname.startsWith('/api/routines')) return true;
  if (pathname.startsWith('/api/habits')) return true;
  if (pathname.startsWith('/api/push')) return true;
  return false;
}

export default auth((req): Response | undefined => {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!req.auth?.user) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}) as unknown as (req: NextRequest) => Response | Promise<Response>;

export const config = {
  // Run on everything except the Next.js internals and common static assets.
  // The function body re-checks for finer-grained public paths.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|workbox-.*\\.js|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map|woff2?|ttf)).*)',
  ],
};
