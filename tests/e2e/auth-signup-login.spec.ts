/**
 * Auth signup -> verify -> login full flow.
 *
 * Does NOT use the saved storageState — this spec tests the full new-user
 * onboarding from scratch. Each run creates a unique user (timestamped
 * email) so the spec is idempotent within a single Playwright invocation
 * (globalSetup wipes the DB between invocations).
 */
import { test, expect } from '@playwright/test';
import { waitForVerificationUrl } from './fixtures/verification';

test.describe('auth signup -> verify -> login', () => {
  test('user can sign up, verify their email, and log in', async ({ page }) => {
    const uniqueEmail = `signup-spec-${Date.now()}@test.local`;
    const password = 'correct-horse-battery-staple';
    const name = 'Signup Spec User';

    // 1. Signup
    await page.goto('/signup');
    await expect(
      page.getByRole('heading', { name: 'Create your account' }),
    ).toBeVisible();

    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Email').fill(uniqueEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(
      page.getByRole('heading', { name: 'Check your inbox' }),
    ).toBeVisible();
    await expect(page.getByText(uniqueEmail)).toBeVisible();

    // 2. Verification URL from server log
    const verifyUrl = await waitForVerificationUrl(uniqueEmail);
    expect(verifyUrl).toContain('/api/auth/verify');
    expect(verifyUrl).toContain('token=');

    // 3. Visit verify URL — redirects to /login?verified=1
    await page.goto(verifyUrl);
    await expect(page).toHaveURL(/\/login\?verified=1/);
    await expect(page.getByText('Email verified')).toBeVisible();

    // 4. Login
    await page.getByLabel('Email').fill(uniqueEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // 5. Land on home (today view) — the signed-in branch
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });
  });
});
