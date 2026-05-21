/**
 * Palette + theme switcher spec — verifies the Account page palette/theme
 * controls update `<html data-palette>` / `<html data-theme>`.
 *
 * Uses the saved owner-test storageState.
 */
import { test, expect } from '@playwright/test';

const PALETTES = ['bone', 'fog', 'sage', 'graphite'] as const;
const THEMES: Array<{ name: 'System' | 'Light' | 'Dark'; expected: string | null }> = [
  { name: 'System', expected: null },
  { name: 'Light', expected: 'light' },
  { name: 'Dark', expected: 'dark' },
];

test.describe('palette + theme switchers', () => {
  test('each palette swatch updates html[data-palette]', async ({ page }) => {
    await page.goto('/account');

    // Both the sidebar's quick-swatch row AND the main Appearance region
    // expose buttons named "<X> palette" — scope to the main region so we
    // exercise the full Account control (not the sidebar shortcut).
    const appearance = page.getByRole('region', { name: 'Appearance' });

    for (const palette of PALETTES) {
      await appearance
        .getByRole('button', { name: `${capitalize(palette)} palette` })
        .click();
      // The server action `setPaletteAction` revalidates the root layout,
      // then a router.refresh() picks up the new `data-palette`. Both are
      // async and serialised through React's transition — give the round-
      // trip a generous timeout because dev-mode revalidations include a
      // recompile on cold paths.
      await expect(page.locator('html')).toHaveAttribute('data-palette', palette, {
        timeout: 20_000,
      });
    }
  });

  test('each theme tab updates html[data-theme]', async ({ page }) => {
    await page.goto('/account');

    // The sidebar exposes tabs named "<X> theme"; the main Appearance
    // region exposes tabs named just "<X>". Use the main-region scope
    // for the explicit short-named tabs.
    const themeTabs = page
      .getByRole('region', { name: 'Appearance' })
      .getByRole('tablist', { name: 'Theme' });

    for (const t of THEMES) {
      await themeTabs.getByRole('tab', { name: t.name, exact: true }).click();
      if (t.expected === null) {
        // System clears the cookie; the data-theme attribute should not be
        // set on <html>. Allow a moment for the action to settle.
        await expect(async () => {
          const attr = await page.locator('html').getAttribute('data-theme');
          expect(attr).toBeNull();
        }).toPass({ timeout: 5_000 });
      } else {
        await expect(page.locator('html')).toHaveAttribute(
          'data-theme',
          t.expected,
          { timeout: 5_000 },
        );
      }
    }
  });
});

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
