/**
 * Vitest configuration for the RoutineForge web app.
 *
 * - Node environment (we test backend routes, not React components).
 * - `@/*` path alias mirrors `tsconfig.json` so test files can import from
 *   `@/lib/...`, `@/db`, etc.
 * - `server-only` aliased to an empty shim — Next.js's poison module isn't
 *   resolvable in plain Vitest, but server files like `lib/auth/owner.ts`
 *   import it at module top.
 * - v8 coverage with thresholds matching the dispatch contract.
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // React plugin is needed because tsconfig.json has `jsx: "preserve"` (for
  // Next.js's own SWC pipeline). Without it, Vite's import analyzer chokes on
  // raw JSX in .tsx test files. The plugin is a no-op for .ts files used by
  // backend tests.
  plugins: [react()],
  resolve: {
    alias: {
      '@': root,
      'server-only': path.join(root, '__tests__/helpers/server-only-shim.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    // Backend tests live in __tests__/**.test.ts (node env).
    // Component tests live in components/__tests__/**.test.tsx and app/**.test.tsx,
    // each opting into jsdom via a per-file `// @vitest-environment jsdom` directive.
    include: [
      '__tests__/**/*.test.{ts,tsx}',
      'components/**/__tests__/**/*.test.{ts,tsx}',
      'app/**/__tests__/**/*.test.{ts,tsx}',
    ],
    // Tests touch a shared pglite-backed schema; keep them sequential. In
    // Vitest 4, the old `poolOptions.forks.singleFork` was removed; the
    // equivalent is now `fileParallelism: false` at the top level.
    pool: 'forks',
    fileParallelism: false,
    // Bumped from 20_000 to 60_000 because v8 coverage instrumentation
    // significantly slows bcrypt-heavy tests (the auth signup test was hitting
    // ~44s under coverage). The test itself passes; the timeout was the bottleneck.
    testTimeout: 60_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      // Backend-test scope per dispatch: auth/owner library + auth/owner API
      // routes, plus the routines validators / position helpers / API. Out of
      // scope:
      //   - `lib/theme/**`: UI-side server theme rendering (frontend-test owns).
      //   - `app/api/auth/[...nextauth]/**`: one-line re-export of NextAuth
      //     library handlers; logic lives in @/auth which is library-config,
      //     not business logic this agent owns.
      include: [
        'lib/auth/**',
        'lib/duplicate.ts',
        'lib/validation/routines.ts',
        'lib/validation/habits.ts',
        'lib/validation/push.ts',
        'lib/routines/**',
        'lib/habits/**',
        'lib/push/dispatcher.ts',
        'lib/push/vapid.ts',
        'lib/push/queries.ts',
        'app/api/auth/signup/**',
        'app/api/auth/verify/**',
        'app/api/owner/**',
        'app/api/routines/**',
        'app/api/habits/**',
        'app/api/push/**',
      ],
      exclude: [
        'app/**/page.tsx',
        '**/*.d.ts',
        'db/migrations/**',
        '__tests__/**',
        // Timer-based glue — coverage gates would force fragile tests for the
        // setInterval bootstrap. See backend-test dispatch report.
        'lib/push/dev-scheduler.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
