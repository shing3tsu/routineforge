/**
 * Weekly-count habit spec — creates a `weekly_count` habit and verifies
 * the today view shows the "N of M this week" sub-label and updates it
 * after a single toggle.
 *
 * Uses the saved owner-test storageState.
 */
import { test, expect, type Page } from '@playwright/test';

async function createWeeklyHabit(
  page: Page,
  name: string,
  perWeek: number,
): Promise<void> {
  await page.goto('/habits/new');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Timezone').fill('America/Los_Angeles');
  await page.getByRole('radio', { name: 'N per week' }).click();
  // The numeric input is labelled "Times per week (1 to 7)".
  const numeric = page.getByLabel(/Times per week/);
  await numeric.fill(String(perWeek));
  await page.getByRole('button', { name: 'Create habit' }).click();
  await page.waitForURL(/\/habits\/[0-9a-f-]+/, { timeout: 15_000 });
}

test.describe('weekly_count habit', () => {
  test('today view shows "N of M this week" and updates after toggle', async ({ page }) => {
    const habitName = `Weekly Habit ${Date.now()}`;
    await createWeeklyHabit(page, habitName, 3);

    // --- 1. Today view should show "0 of 3 this week" -------------------
    await page.goto('/');
    await expect(page.getByText(habitName, { exact: false })).toBeVisible();

    // The sub-label is rendered with aria-label "0 of 3 this week".
    await expect(
      page.getByLabel(`0 of 3 this week`).first(),
    ).toBeVisible();

    // --- 2. Toggle the habit done ---------------------------------------
    // Checkbox is a custom `<button role="checkbox">`, so use click()
    // rather than check() (which only works on native inputs).
    const checkbox = page.getByRole('checkbox', {
      name: new RegExp(`Mark "${escapeRegex(habitName)}" done for today`),
    });
    await checkbox.click();

    // --- 3. Sub-label should now show "1 of 3 this week" ----------------
    await expect(
      page.getByLabel(`1 of 3 this week`).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
