/**
 * Vitest global setup.
 *
 * - Prime env vars the production code reads on import time. The real `db`
 *   module throws if DATABASE_URL is unset; we point it at a placeholder
 *   because tests mock `@/db` to a pglite-backed Drizzle client (see
 *   `__tests__/helpers/db.ts`). The placeholder is never actually connected to.
 * - Default OWNER_* values so `lib/auth/owner.ts` doesn't trip its
 *   misconfigured branch unless a test explicitly overrides.
 *
 * Individual tests stub-and-restore env vars via vi.stubEnv / vi.unstubAllEnvs
 * to exercise specific branches.
 *
 * Component tests opt into jsdom via the per-file `// @vitest-environment jsdom`
 * directive. The `typeof window !== 'undefined'` guard below loads jest-dom's
 * custom matchers (toBeInTheDocument, toHaveAttribute, etc.) only in those
 * tests, keeping the node-env backend tests unaffected.
 */

process.env.DATABASE_URL ??= 'postgres://placeholder:placeholder@localhost:5432/placeholder';
process.env.OWNER_API_TOKEN ??= 'test-owner-token-must-be-at-least-sixteen-chars';
process.env.OWNER_EMAIL ??= 'owner@example.com';
process.env.AUTH_URL ??= 'http://localhost:3000';
// Silence NextAuth runtime warnings in tests that never invoke NextAuth.
process.env.AUTH_SECRET ??= 'test-auth-secret-not-used-anywhere-real';

if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
}

// Mark this file as a module so the top-level `await` above is legal under
// `tsc --noEmit`. (TS1375 otherwise — see backend dispatch findings.)
export {};
