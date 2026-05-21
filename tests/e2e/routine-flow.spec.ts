/**
 * Routine flow spec — full create -> add steps -> check off -> delete cycle.
 *
 * Uses the saved owner-test storageState. Each test creates a uniquely-named
 * routine so it doesn't collide with sibling specs. The DB is wiped per
 * Playwright invocation by globalSetup; specs within an invocation share
 * the same user (the e2e owner).
 */
import { test, expect, type Page } from '@playwright/test';

/** Map JS Date.getDay() (0=Sun..6=Sat) to RoutineForge weekday (0=Mon..6=Sun). */
function todayIsoWeekday(): number {
  const js = new Date().getDay();
  return (js + 6) % 7;
}

const WEEKDAY_SHORT_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

async function createRoutine(page: Page, name: string): Promise<void> {
  await page.goto('/routines/new');
  await page.getByLabel('Name').fill(name);
  // Use a fixed timezone so the today computation is deterministic for the
  // test runner's clock-day.
  const tzField = page.getByLabel('Timezone');
  await tzField.fill('America/Los_Angeles');
  await page.getByRole('button', { name: 'Create routine' }).click();

  // Server redirects to /routines/<id> on success.
  await page.waitForURL(/\/routines\/[0-9a-f-]+/, { timeout: 15_000 });
}

test.describe('routine flow', () => {
  test('user can create a routine, add steps, check them off, and persist across reload', async ({ page }) => {
    const routineName = `Test Routine ${Date.now()}`;

    // --- 1. Create routine ---------------------------------------------
    await createRoutine(page, routineName);

    // --- 2. On the routine detail, switch to today's weekday tab ------
    const today = todayIsoWeekday();
    const todayLabel = WEEKDAY_SHORT_LABELS[today]!;
    // The tabs are role="tab". Click the today one.
    await page.getByRole('tab', { name: todayLabel }).click();

    // --- 3. Add 2 steps ------------------------------------------------
    const addInput = page.getByLabel('New step title');
    await addInput.fill('Step A');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    // After add, the step appears as an input labelled "Step 1 title"
    // with value="Step A".
    await expect(page.getByLabel('Step 1 title')).toHaveValue('Step A', {
      timeout: 10_000,
    });

    await addInput.fill('Step B');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByLabel('Step 2 title')).toHaveValue('Step B', {
      timeout: 10_000,
    });

    // --- 4. Return to today view and confirm routine appears -----------
    await page.goto('/');
    // The routine should appear by name as a card eyebrow or section
    // somewhere on the page.
    await expect(page.getByText(routineName, { exact: false })).toBeVisible();

    // --- 5. Check off both steps via CheckRow clicks -------------------
    // The hero card renders each step as a CheckRow — a `<button
    // role="button" aria-pressed aria-label={step.title}>`. Click the
    // button matching the step name to toggle. After both clicks the
    // routine becomes fully done and collapses into the "completed
    // routines" section, so we assert the collapsed-completion checkbox.
    //
    // The dev server's first POST to /api/routines/.../completions
    // recompiles the route (~4s); waiting for the response explicitly
    // is more reliable than polling the DOM for an attribute change.
    const stepA = page.getByRole('button', { name: 'Step A', exact: true });
    const stepB = page.getByRole('button', { name: 'Step B', exact: true });

    const firstCompletion = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        /\/api\/routines\/[0-9a-f-]+\/completions/.test(r.url()),
      { timeout: 30_000 },
    );
    await stepA.click();
    await firstCompletion;

    const secondCompletion = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        /\/api\/routines\/[0-9a-f-]+\/completions/.test(r.url()),
      { timeout: 30_000 },
    );
    await stepB.click();
    await secondCompletion;

    // The completed routine surfaces as a disabled checkbox labelled
    // "<routineName> done" inside the Routines section.
    await expect(
      page.getByRole('checkbox', { name: `${routineName} done` }),
    ).toBeVisible({ timeout: 25_000 });

    // --- 6. Reload and verify the checks persist ----------------------
    await page.reload();
    // After reload, the routine remains "all done" — the same collapsed
    // checkbox should still be visible.
    await expect(
      page.getByRole('checkbox', { name: `${routineName} done` }),
    ).toBeVisible({ timeout: 25_000 });

    // --- 7. Navigate to routine detail and delete -----------------------
    // Open the routine via the routines list (most reliable route).
    await page.goto('/routines');
    await page.getByRole('link', { name: new RegExp(routineName) }).click();
    await page.waitForURL(/\/routines\/[0-9a-f-]+/);

    // Click the danger "Delete routine" button.
    await page.getByRole('button', { name: 'Delete routine' }).click();

    // The Dialog primitive should be visible. Confirm with the primary
    // action labelled "Delete routine".
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete routine' }).click();

    // After delete, redirect to /routines and the routine should be gone.
    await page.waitForURL(/\/routines$/, { timeout: 15_000 });
    await expect(page.getByText(routineName, { exact: false })).not.toBeVisible();
  });
});
