import { config as loadDotenv } from 'dotenv';
import type { Config } from 'drizzle-kit';

// drizzle-kit doesn't go through Next's env loader, so we need to pull in
// .env.local manually. Precedence (highest first): shell env, .env.local, .env.
// Neither call passes `override: true`, so already-set values (shell env after
// the first load; shell-or-.env-local after the second) are preserved. This
// matches Next.js's documented precedence and lets a developer override either
// URL inline with `DIRECT_URL=... pnpm db:migrate`.
loadDotenv({ path: '.env.local' });
loadDotenv({ path: '.env' });

// Prefer DIRECT_URL for migrations. The pooler URL (DATABASE_URL) goes through
// PgBouncer in transaction mode on Supabase, which doesn't support session-
// scoped DDL operations like CREATE TABLE / ALTER TABLE that migrations issue.
// DIRECT_URL hits port 5432 directly. Fall back to DATABASE_URL for local dev
// where the user might only set one. Final fallback is a syntactic placeholder
// so `drizzle-kit generate` (schema-diffing only, no connection) still works.
const MIGRATION_URL =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  'postgres://placeholder:placeholder@localhost:5432/placeholder';

export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: MIGRATION_URL,
  },
  strict: true,
  verbose: true,
} satisfies Config;
