/**
 * Habit flow spec — create daily habit -> see streak zero-state ->
 * toggle from today view -> verify persistence.
 *
 * Uses the saved owner-test storageState.
 */
import { test, expect, type Page } from '@playwright/test';

async function createDailyHabit(page: Page, name: string): Promise<void> {
  await page.goto('/habits/new');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Timezone').fill('America/Los_Angeles');
  // 'Daily' is the default cadence; assert it's selected and submit.
  await expect(page.getByRole('radio', { name: 'Daily' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Create habit' }).click();
  // Server redirects to /habits/<id> on success.
  await page.waitForURL(/\/habits\/[0-9a-f-]+/, { timeout: 15_000 });
}

test.describe('habit flow', () => {
  test('user can create a daily habit, toggle from today view, and persist across reload', async ({ page }) => {
    const habitName = `Test Habit ${Date.now()}`;

    // --- 1. Create -------------------------------------------------------
    await createDailyHabit(page, habitName);

    // --- 2. On habit detail, the hero shows the zero streak state -------
    // The habit-detail hero renders an aria-labelled numeral
    // ("<N> day(s) streak") and a "Mark today done" CTA. Use the CTA as
    // the most-reliable post-create signal — it's only rendered when the
    // habit is due today (daily cadence is always due).
    await expect(
      page.getByRole('button', { name: 'Mark today done' }),
    ).toBeVisible();

    // --- 3. Today view shows the habit row ------------------------------
    await page.goto('/');
    // The habit appears within the Habits section. Its name is the most
    // reliable signal.
    await expect(page.getByText(habitName, { exact: false })).toBeVisible();

    // --- 4. Toggle the habit done via its checkbox -----------------------
    // TodayHabitRow renders a Checkbox with aria-label that contains the
    // habit name. Match by name fragment — we'll assert state via
    // aria-checked (most reliable signal regardless of label wording).
    const habitCheckbox = page
      .getByRole('group', { name: habitName })
      .getByRole('checkbox');
    await expect(habitCheckbox).toHaveAttribute('aria-checked', 'false');

    // Wait for the API round-trip explicitly to avoid racing the
    // optimistic-UI update with React's transition replay (Playwright
    // can otherwise observe the post-fetch revert before the server's
    // refresh response makes it to the DOM).
    const completionResponse = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        /\/api\/habits\/[0-9a-f-]+\/completions/.test(r.url()),
      { timeout: 20_000 },
    );
    await habitCheckbox.click();
    const res = await completionResponse;
    expect(res.status()).toBe(201);

    // --- 5. Wait for aria-checked to flip on the SAME element ----------
    // The toggle keeps the same DOM node; only its aria-checked / aria-
    // label flip. Asserting aria-checked is the most reliable signal —
    // it doesn't depend on label-string formatting.
    await expect(habitCheckbox).toHaveAttribute('aria-checked', 'true', {
      timeout: 20_000,
    });

    // --- 6. Reload — verify persistence --------------------------------
    await page.reload();
    await expect(
      page
        .getByRole('group', { name: habitName })
        .getByRole('checkbox'),
    ).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 });

    // --- 7. Open the habit detail and confirm streak increased ---------
    // Click the habit's name link to navigate to /habits/<id>. The Today
    // habit row may not be a link itself; navigate via /habits.
    await page.goto('/habits');
    await page.getByRole('link', { name: new RegExp(escapeRegex(habitName)) }).click();
    await page.waitForURL(/\/habits\/[0-9a-f-]+/);

    // Current streak should now be >= 1. The hero renders a span with
    // aria-label "<N> day(s) streak"; we want N >= 1.
    const heroNumeral = page.locator(
      'span[aria-label$="day streak"], span[aria-label$="days streak"]',
    );
    await expect(heroNumeral).toBeVisible();
    const label = await heroNumeral.first().getAttribute('aria-label');
    expect(label).toMatch(/^(?:[1-9]\d*) day(?:s)? streak$/);
  });
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
