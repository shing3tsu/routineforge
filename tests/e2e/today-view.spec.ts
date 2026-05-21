/**
 * Today view spec — verifies the signed-in home page renders core
 * structure for any state (the suite seeds data across specs in a
 * single Playwright invocation, so we don't rely on an empty state).
 *
 * Uses the saved owner-test storageState from `tests/e2e/.auth/owner.json`
 * (created by `fixtures/auth.setup.ts`).
 */
import { test, expect } from '@playwright/test';

test.describe('today view', () => {
  test('renders the today region with the day-eyebrow and hero h1', async ({ page }) => {
    await page.goto('/');

    // The today view always renders a region labelled "Today" with a
    // visually-hidden "Today" h1 inside it. Just assert the element is
    // attached — `visually-hidden` clipping makes Playwright's visibility
    // heuristics shaky.
    await expect(
      page.getByRole('heading', { name: 'Today', level: 1 }),
    ).toBeAttached();

    // Date eyebrow lives inside the today region — e.g. "MON · 18 MAY".
    const today = page.getByRole('region', { name: 'Today' });
    await expect(today).toBeVisible();
    await expect(today).toContainText(/[A-Z]{3}\s*·\s*\d{1,2}\s*[A-Z]{3}/);
  });

  test('date eyebrow renders (sanity check)', async ({ page }) => {
    await page.goto('/');
    // The eyebrow looks like "WED · 27 MAY" — assert the bullet separator is
    // present somewhere on the page (any of the eyebrow's day/month tokens
    // is sufficient evidence the formatter ran).
    const body = page.locator('body');
    await expect(body).toContainText(/[A-Z]{3}\s*·\s*\d{1,2}\s*[A-Z]{3}/);
  });
});
