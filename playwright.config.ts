/**
 * Playwright config for RoutineForge E2E.
 *
 * Approach: isolated pglite via `next dev` on port 4001 with
 * `RF_LOCAL_DATA_DIR=.local-data-e2e` (honored by `apps/web/db/index.ts`).
 * Each Playwright invocation:
 *   1. globalSetup wipes `.local-data-e2e/` and the saved auth state.
 *   2. webServer launches `next dev -p 4001 -H 127.0.0.1` with
 *      RF_LOCAL_DATA_DIR + AUTH_URL pointing at the test origin, piping
 *      stdout/stderr to `.agent-logs/real-user-tester/server.log`.
 *   3. The setup project signs up the owner test user via the UI, reads
 *      the verification URL from the server log, and saves the resulting
 *      NextAuth cookie to `tests/e2e/.auth/owner.json`.
 *
 * Requirements:
 *   - No `next dev` already on port 4001 (Playwright will spawn it).
 *   - The user's own dev server (port 4000) can stay running — we use a
 *     separate port AND a separate `.next-e2e/` build dir so neither
 *     trace files nor pglite locks collide.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4001;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: '.agent-logs/real-user-tester/html-report', open: 'never' }],
  ],
  outputDir: '.agent-logs/real-user-tester/test-output',
  globalSetup: require.resolve('./tests/e2e/global-setup'),
  timeout: 60_000,
  expect: { timeout: 8_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'setup',
      testMatch: /fixtures\/auth\.setup\.ts/,
    },
    {
      name: 'chromium-unauth',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /auth-signup-login\.spec\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/owner.json',
      },
      dependencies: ['setup'],
      testIgnore: [/auth-signup-login\.spec\.ts/, /fixtures\/.*/],
    },
  ],

  webServer: {
    // Spawn `next dev` via a Node wrapper that tees stdout to a log file
    // (Playwright doesn't expose the child's stdout to test code). Tests
    // grep the file for `[signup] verification link for <email>:` lines.
    command: `node tests/e2e/run-dev-server.mjs ${PORT} 127.0.0.1`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      // Isolated pglite data dir — wiped + pre-warmed by
      // run-dev-server.mjs before it spawns next dev.
      RF_LOCAL_DATA_DIR: '.local-data-e2e',
      // Separate Next.js build dir IF the user's foreground `next dev` is
      // ALSO running on a different port. They contend for `.next/trace`
      // otherwise and one fails with EPERM on Windows. Leave undefined
      // when the user's dev is not running so we use cached `.next` and
      // skip a 30s recompile of every route on each Playwright run.
      // The user can set RF_NEXT_DIST_DIR via the environment if needed.
      ...(process.env.RF_NEXT_DIST_DIR_E2E
        ? { RF_NEXT_DIST_DIR: process.env.RF_NEXT_DIST_DIR_E2E }
        : {}),
      // Override AUTH_URL so the signup route logs verification links
      // pointed at the test origin (otherwise it picks up
      // http://localhost:4000 from .env.local).
      AUTH_URL: BASE_URL,
    },
  },
});
