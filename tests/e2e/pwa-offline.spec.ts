/**
 * PWA offline shell spec.
 *
 * Validates that with the service worker registered and warmed, the user
 * can still see the /offline fallback when the network drops. We:
 *
 *   1. Visit `/` (signed-in via storageState) and let the SW register +
 *      reach `activated`. Wait for `navigator.serviceWorker.controller`
 *      to be non-null so we know the SW is in control of this page.
 *   2. Reload once after the SW activates — first-load pages aren't yet
 *      controlled by the SW (Chrome behavior). After reload, future fetches
 *      go through `/sw.js`'s fetch handler.
 *   3. Flip the network offline via `context.setOffline(true)`.
 *   4. Navigate to `/offline` — assert the precached fallback renders
 *      with its accessible heading.
 *   5. Navigate to `/` — assert the SW serves the cached HTML (network-
 *      first with cache fallback), OR if `/` wasn't cached yet falls
 *      through to the offline fallback page.
 *   6. Restore network with `setOffline(false)` and assert a normal
 *      navigation succeeds again.
 *
 * The SW is registered via PushBootstrap (gated by NEXT_PUBLIC_PUSH_ENABLED;
 * set to `true` in apps/web/.env.local).
 */
import { test, expect } from '@playwright/test';

test.describe('PWA offline shell', () => {
  test('serves /offline + cached pages with network down, restores when back', async ({
    page,
    context,
  }) => {
    // 1. Warm up: load the page so the SW registers + activates + the app
    //    shell is precached. The install handler runs `cache.addAll(
    //    APP_SHELL_URLS)` then `skipWaiting()`; the activate handler then
    //    runs `clients.claim()`. `navigator.serviceWorker.ready` resolves
    //    with the registration whose `.active` is non-null — i.e. once
    //    the SW has reached `activating` or beyond. We give the precache
    //    a brief settle window after ready resolves.
    await page.goto('/');

    const swState = await page.waitForFunction(
      async () => {
        if (!('serviceWorker' in navigator)) return null;
        // Trigger registration polling — PushBootstrap fires register on
        // mount but ready won't resolve unless something is installing.
        const existing = await navigator.serviceWorker.getRegistration('/');
        if (!existing) return null;
        const ready = await navigator.serviceWorker.ready;
        return ready.active ? { state: ready.active.state } : null;
      },
      undefined,
      { timeout: 30_000 },
    );
    const sw = (await swState.jsonValue()) as { state: string } | null;
    expect(sw).not.toBeNull();
    expect(['activating', 'activated']).toContain(sw!.state);

    // 2. Reload so the SW controls this page (first-load page is uncontrolled
    //    in default Chrome behavior; we also call clients.claim() in the
    //    activate handler, but reload removes any uncertainty).
    await page.reload();
    await page.waitForFunction(
      () => !!navigator.serviceWorker.controller,
      undefined,
      { timeout: 10_000 },
    );

    // Warm /offline through the network so Next dev compiles it and the
    // SW's network-first HTML handler caches it in PAGES_CACHE. (The
    // install-time precache may have raced the Next dev compile and ended
    // up caching a 200 OR a redirect — explicitly warming under SW
    // control guarantees a usable copy in PAGES_CACHE.)
    await page.goto('/offline');
    await expect(
      page.getByRole('heading', { name: /you'?re offline/i, level: 1 }),
    ).toBeVisible({ timeout: 15_000 });

    // Pull / into the SW's cache (network-first handler caches `/` once
    // it's been visited under SW control).
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // 3. Flip offline.
    await context.setOffline(true);

    // 4. Visit /offline. The SW's APP_SHELL_CACHE precached this at install
    //    time. The fallback page uses an h1 "You're offline."; match
    //    case-insensitively via a regex.
    await page.goto('/offline');
    await expect(
      page.getByRole('heading', { name: /you'?re offline/i, level: 1 }),
    ).toBeVisible({ timeout: 10_000 });

    // The page also has a "Try again" button (OfflineRetryButton client
    // island). Don't click it (it'd reload and we're still offline) — just
    // assert it's there to confirm the full page rendered, not a stub.
    await expect(
      page.getByRole('button', { name: 'Try again' }),
    ).toBeVisible();

    // 5. Navigate to `/`. The SW's networkFirstHtml handler will try the
    //    network (fails — offline), fall back to PAGES_CACHE (populated
    //    during step 2), then finally to the precached /offline. Either
    //    outcome is valid — assert one of them via the body text.
    await page.goto('/');
    // Don't fail the test on either branch:
    //   - "Today" heading (cached `/` from step 2 was served), OR
    //   - "You're offline." heading (offline fallback was served).
    await expect
      .poll(
        async () => {
          // Wait for either heading to be visible.
          const todayHeading = await page
            .getByRole('heading', { name: 'Today', level: 1 })
            .count();
          const offlineHeading = await page
            .getByRole('heading', { name: /you'?re offline/i, level: 1 })
            .count();
          return todayHeading + offlineHeading > 0;
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    // 6. Restore network. A subsequent navigation should hit the network
    //    again (network-first handler). Visit /offline directly while
    //    online and assert it still renders correctly (the offline page
    //    is precached + statically dynamic = 'force-static', so it
    //    always renders the same content).
    await context.setOffline(false);
    await page.goto('/offline');
    await expect(
      page.getByRole('heading', { name: /you'?re offline/i, level: 1 }),
    ).toBeVisible({ timeout: 10_000 });

    // And navigating back to `/` while online works normally.
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Today', level: 1 }),
    ).toBeAttached();
  });
});
