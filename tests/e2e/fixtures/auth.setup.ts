/**
 * Auth setup project. Runs ONCE per Playwright invocation and produces
 * `tests/e2e/.auth/owner.json`, the storage state every authenticated
 * spec consumes via `test.use({ storageState })`.
 *
 * Flow:
 *   1. Visit /signup, fill the form with the deterministic owner-e2e user.
 *   2. Submit. Server logs the verification URL via console.log; the
 *      `run-dev-server.mjs` wrapper tees it to a log file.
 *   3. Wait for the line in the log via `waitForVerificationUrl`.
 *   4. Visit the verification URL — server redirects to /login?verified=1.
 *   5. Log in with the same credentials.
 *   6. Wait for the home page (signed-in users land on /).
 *   7. Persist storage state.
 *
 * The `run-dev-server.mjs` wrapper wipes + pre-warms the pglite data dir
 * BEFORE spawning next dev (Playwright-on-Windows races the WASM initdb
 * flush otherwise), so by the time this fixture runs the DB is already
 * a healthy, fully-migrated cluster.
 */
import { test as setup, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { waitForVerificationUrl } from './verification';

export const OWNER_TEST_EMAIL = 'owner-e2e@test.local';
export const OWNER_TEST_PASSWORD = 'correct-horse-battery-staple';
export const OWNER_TEST_NAME = 'E2E Owner';

const AUTH_FILE = path.resolve(__dirname, '..', '.auth', 'owner.json');

setup('signup, verify, and login as the e2e owner', async ({ page }) => {
  await mkdir(path.dirname(AUTH_FILE), { recursive: true });

  // 1. Real signup via UI
  await page.goto('/signup');
  await page.getByLabel('Name').fill(OWNER_TEST_NAME);
  await page.getByLabel('Email').fill(OWNER_TEST_EMAIL);
  await page.getByLabel('Password').fill(OWNER_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(
    page.getByRole('heading', { name: 'Check your inbox' }),
  ).toBeVisible();

  // 2. Verification URL from server log
  const verifyUrl = await waitForVerificationUrl(OWNER_TEST_EMAIL);

  // 3. Visit verify URL — redirects to /login?verified=1
  await page.goto(verifyUrl);
  await expect(page).toHaveURL(/\/login\?verified=1/);

  // 4. Login
  await page.getByLabel('Email').fill(OWNER_TEST_EMAIL);
  await page.getByLabel('Password').fill(OWNER_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // 5. Wait for redirect to /
  await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });

  // 6. Save storage state
  await page.context().storageState({ path: AUTH_FILE });
});
