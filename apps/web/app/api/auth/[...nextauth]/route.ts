/**
 * NextAuth v5 route handler.
 * Re-exports the GET/POST handlers from the central auth config.
 *
 * `dynamic = 'force-dynamic'` + `runtime = 'nodejs'` are required:
 * Next 15 dev otherwise spawns a Jest worker to "generate static paths"
 * for this catch-all route. The worker loads the full `@/auth` import
 * chain (Drizzle adapter + `pg` Pool + schema) and crashes, then EPIPEs
 * cascade — `/api/auth/csrf` and `/api/auth/callback/credentials` start
 * returning HTML 500s that break `signIn()` JSON parsing on the client.
 * This route is inherently dynamic (session/CSRF/callback), so forcing
 * dynamic just matches reality and skips the worker analysis entirely.
 */
import { handlers } from '@/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const { GET, POST } = handlers;
