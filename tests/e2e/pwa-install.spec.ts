/**
 * PWA install infrastructure spec.
 *
 * Validates the PWA is discoverable + installable from the document's
 * perspective. We do NOT click the OS-mediated install button (that's
 * not driveable from Playwright). We assert:
 *
 *   1. `<link rel="manifest" href="/manifest.webmanifest">` is in <head>.
 *   2. /manifest.webmanifest serves valid JSON with all required PWA fields.
 *   3. `<meta name="theme-color">` is present with valid color values.
 *   4. `<link rel="apple-touch-icon">` is present (iOS install target).
 *   5. /sw.js serves 200 with a JS content-type.
 *   6. Service worker registers successfully via the PushBootstrap island.
 *
 * Runs under the `chromium` project (signed-in via storageState). The
 * manifest/meta/icon tags come from the root layout and are present
 * regardless of auth state, so signed-in is fine and avoids needing a
 * separate unauth project for this spec.
 *
 * SW registration is gated by NEXT_PUBLIC_PUSH_ENABLED in dev; the value
 * is set to `true` in apps/web/.env.local which `next dev` loads on boot.
 * If registration is genuinely off in the test env, the SW assertion will
 * fail loudly — we don't silently skip.
 */
import { test, expect } from '@playwright/test';

test.describe('PWA install infrastructure', () => {
  test('manifest link, theme-color, apple-touch-icon, and SW are all wired up', async ({
    page,
    request,
    baseURL,
  }) => {
    await page.goto('/');

    // 1. Manifest link in <head>. Next's `metadata.manifest` export emits
    //    `<link rel="manifest" href="/manifest.webmanifest">`.
    const manifestLink = page.locator('head link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest');

    // 2. theme-color meta. The layout's `viewport.themeColor` produces TWO
    //    meta tags (light + dark via media queries). Assert at least one
    //    exists with a non-empty color value that looks like a CSS color.
    const themeColors = page.locator('head meta[name="theme-color"]');
    const themeColorCount = await themeColors.count();
    expect(themeColorCount).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < themeColorCount; i++) {
      const content = await themeColors.nth(i).getAttribute('content');
      expect(content).toBeTruthy();
      // Accept #RRGGBB / #RGB / rgb()/rgba()/hsl()/hsla() / named colors.
      // The current layout uses `#F4F4F5` (light) and `#101012` (dark).
      expect(content).toMatch(/^(#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\(.+\)|[a-zA-Z]+)$/);
    }

    // 3. apple-touch-icon link — required for iOS Add-to-Home-Screen icon.
    const appleIcon = page.locator('head link[rel="apple-touch-icon"]');
    await expect(appleIcon.first()).toHaveAttribute('href', /\.(svg|png|ico)$/);

    // 4. Fetch /manifest.webmanifest directly; assert JSON shape.
    const manifestResp = await request.get('/manifest.webmanifest');
    expect(manifestResp.status()).toBe(200);
    const manifest = (await manifestResp.json()) as Record<string, unknown>;

    expect(typeof manifest.name).toBe('string');
    expect((manifest.name as string).length).toBeGreaterThan(0);
    expect(typeof manifest.short_name).toBe('string');
    expect((manifest.short_name as string).length).toBeGreaterThan(0);
    expect(typeof manifest.start_url).toBe('string');
    expect(manifest.display).toBe('standalone');
    expect(typeof manifest.theme_color).toBe('string');
    expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    expect(typeof manifest.background_color).toBe('string');
    expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{3,8}$/);

    // Icons array: at least one icon. We don't require strict 192/512 pixel
    // raster icons because the current ship uses `sizes: "any"` SVGs (which
    // scale to any install target) — that's a valid PWA install icon per
    // the spec. Assert: array non-empty + each entry has src + type + sizes.
    expect(Array.isArray(manifest.icons)).toBe(true);
    const icons = manifest.icons as Array<Record<string, unknown>>;
    expect(icons.length).toBeGreaterThanOrEqual(1);
    for (const icon of icons) {
      expect(typeof icon.src).toBe('string');
      expect((icon.src as string).length).toBeGreaterThan(0);
      expect(typeof icon.sizes).toBe('string');
      expect((icon.sizes as string).length).toBeGreaterThan(0);
    }
    // At least one "any"-purpose icon (or unscoped purpose = "any" by default).
    const hasAnyIcon = icons.some((i) => {
      const purpose = (i.purpose as string | undefined) ?? 'any';
      return purpose === 'any' || purpose.split(/\s+/).includes('any');
    });
    expect(hasAnyIcon).toBe(true);

    // 5. /sw.js serves with a JS content-type. (Browsers refuse to register
    //    a SW served with the wrong MIME type — this is the silent killer
    //    of "my SW won't register" bugs in deploy.)
    const swResp = await request.get('/sw.js');
    expect(swResp.status()).toBe(200);
    const swContentType = swResp.headers()['content-type'] ?? '';
    expect(swContentType.toLowerCase()).toMatch(
      /^(application|text)\/javascript/,
    );
    // Sanity: body contains the SW prelude.
    const swBody = await swResp.text();
    expect(swBody).toContain('addEventListener');
    expect(swBody).toContain('install');

    // 6. SW actually registers. PushBootstrap kicks off
    //    `navigator.serviceWorker.register('/sw.js')` in a useEffect on the
    //    layout mount; give it a brief window to settle. The registration
    //    is gated by NEXT_PUBLIC_PUSH_ENABLED, which `apps/web/.env.local`
    //    sets to "true" — Next.js reads .env.local on dev startup.
    const registration = await page.waitForFunction(
      async () => {
        if (!('serviceWorker' in navigator)) return null;
        const reg = await navigator.serviceWorker.getRegistration('/');
        return reg ? { scope: reg.scope } : null;
      },
      undefined,
      { timeout: 15_000 },
    );
    const regInfo = (await registration.jsonValue()) as { scope: string } | null;
    expect(regInfo).not.toBeNull();
    // Scope ends with the base URL's origin + "/". baseURL is e.g. http://127.0.0.1:4001.
    expect(regInfo!.scope).toMatch(new RegExp(`^${baseURL ?? ''}/$`));
  });
});
