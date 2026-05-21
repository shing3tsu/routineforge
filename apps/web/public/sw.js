/**
 * RoutineForge service worker.
 *
 * Two concerns live here, in this order:
 *
 *   1. PWA offline shell + runtime caching (Task 5). Precaches a thin app
 *      shell on `install` (root page, manifest, icons, /offline fallback).
 *      Serves runtime caches by strategy depending on request type:
 *        - `/_next/static/*`     → cache-first (immutable hashed assets).
 *        - `GET /api/routines` / `GET /api/habits` / today completions
 *                                → stale-while-revalidate (last-known data on
 *                                  offline; freshen in the background online).
 *        - HTML page navigations → network-first with cache fallback, and
 *                                  finally the precached `/offline` page.
 *
 *   2. Push display + click-through (Task 4). The handlers below are
 *      unchanged from their original form — the only difference is they now
 *      coexist with a `fetch` handler. The push handlers do NOT depend on any
 *      cache state, so the two concerns are independent.
 *
 * Cache naming: every cache name is prefixed `v1-`. Bumping `CACHE_VERSION`
 * (e.g. to `v2`) is the only thing required to invalidate the entire pool on
 * the next activate. The `activate` handler deletes any cache whose name
 * does NOT start with the current `CACHE_VERSION-` prefix.
 *
 * Why a plain .js (not .ts): service workers are served verbatim by Next.js
 * from `/public/`. Adding TS compilation here is more trouble than it's worth.
 */

// -----------------------------------------------------------------------
// Cache configuration
// -----------------------------------------------------------------------

const CACHE_VERSION = 'v1';

const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const TODAY_DATA_CACHE = `${CACHE_VERSION}-today-data`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;

/**
 * URLs precached at install time. These are the bare minimum for the app to
 * render its offline shell. Keeping the list small avoids long install times
 * and reduces risk of one bad URL aborting the whole install.
 *
 * NOTE: `/offline` is the fallback page; it must respond 200 with HTML so
 * that the precache succeeds. The Next.js route at `apps/web/app/offline/page.tsx`
 * serves it.
 */
const APP_SHELL_URLS = [
  '/',
  '/offline',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
];

/**
 * The HTML page routes we want to keep around for offline navigation. We
 * don't precache them (they'd be stale immediately for a signed-in user);
 * the network-first runtime handler caches them as they're visited.
 */
const HTML_ROUTES = new Set(['/', '/routines', '/habits', '/account', '/offline', '/login', '/signup']);

/**
 * GET API endpoints we cache for offline-read. The matcher checks the
 * pathname only (we ignore query strings other than `date=…` — the cache key
 * keeps the full URL so different days don't collide).
 */
function isTodayDataRequest(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  if (p === '/api/routines') return true;
  if (p === '/api/habits') return true;
  // Routines completions today: /api/routines/<id>/completions?date=YYYY-MM-DD
  if (/^\/api\/routines\/[^/]+\/completions$/.test(p)) return true;
  return false;
}

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
}

function isHtmlNavigationRequest(request) {
  if (request.mode === 'navigate') return true;
  // Some browsers don't set request.mode = 'navigate' for prefetch / link
  // navigations; fall back to the Accept header.
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

// -----------------------------------------------------------------------
// Lifecycle: install + activate
// -----------------------------------------------------------------------

self.addEventListener('install', (event) => {
  // Precache the app shell. If any single URL fails (e.g. /offline returns
  // 404 in an in-progress build), `addAll` rejects the whole batch; we still
  // call skipWaiting so the SW becomes active and the next-page network
  // requests at least work normally.
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(APP_SHELL_CACHE);
        await cache.addAll(APP_SHELL_URLS);
      } catch (err) {
        // Surfaced in DevTools; the SW still installs (push, runtime cache
        // for visited pages still work).
        console.warn('[sw] app-shell precache failed:', err);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  // Delete every cache that isn't from the current version. This is the only
  // place stale caches get reaped — bump CACHE_VERSION at the top of this
  // file to invalidate the pool wholesale.
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const prefix = `${CACHE_VERSION}-`;
      await Promise.all(
        keys
          .filter((name) => !name.startsWith(prefix))
          .map((name) => caches.delete(name)),
      );
      // Take over any open tabs so the new SW controls them right away.
      await self.clients.claim();
    })(),
  );
});

// -----------------------------------------------------------------------
// Runtime fetch handler
// -----------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // We only ever touch GETs. POST/PUT/DELETE (e.g. completions writes) MUST
  // go straight to the network — caching them would corrupt state.
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Skip cross-origin requests entirely. Browsers handle cross-origin caching
  // less predictably (opaque responses, CORS rules) and we don't need it.
  if (url.origin !== self.location.origin) return;

  // 1) Hashed static assets: cache-first. Once cached, served from disk
  //    forever (Next emits content-hashed filenames so collisions are safe).
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 2) Today's data API: stale-while-revalidate. Always attempts network
  //    first to keep the cache fresh; falls back to the cache when offline.
  if (isTodayDataRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, TODAY_DATA_CACHE));
    return;
  }

  // 3) HTML page navigations: network-first. Cache hits serve as offline
  //    fallback; if both miss, return the precached /offline page.
  if (isHtmlNavigationRequest(request) && HTML_ROUTES.has(url.pathname)) {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  // 4) Everything else: pass through, no caching. (API writes, non-listed
  //    HTML routes, etc.)
});

/**
 * cache-first: try cache; on miss fetch and store the result.
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    // Only cache successful, non-opaque responses.
    if (fresh && fresh.ok && fresh.type !== 'opaque') {
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (err) {
    // No cache, no network → propagate the error so the browser shows its
    // native failure page (or a Response.error). For static assets this is
    // acceptable; the user is offline AND we've never seen this asset.
    throw err;
  }
}

/**
 * stale-while-revalidate: respond from cache immediately if present, then
 * (always) trigger a network fetch in the background to refresh the cache.
 * If there's no cache and the network fails, surface a JSON error so the
 * client can present "you're offline".
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((resp) => {
      // Cache only successful JSON-ish responses. Don't cache 4xx/5xx — those
      // shouldn't be served as "stale" later.
      if (resp && resp.ok) {
        cache.put(request, resp.clone()).catch(() => {});
      }
      return resp;
    })
    .catch(() => null);

  if (cached) {
    // Fire-and-forget the network refresh; serve the cached body now.
    return cached;
  }

  const fresh = await networkPromise;
  if (fresh) return fresh;

  // Truly offline + no cache. Return a synthetic JSON 503 so the client can
  // detect this case (vs. surfacing the browser's "failed to fetch").
  return new Response(
    JSON.stringify({
      offline: true,
      message: "You're offline and this data hasn't been cached yet.",
    }),
    {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

/**
 * network-first for HTML pages. Cache the latest copy on success; fall back
 * to cache on failure; final fallback is the precached `/offline` page.
 */
async function networkFirstHtml(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    // Last resort: precached offline page.
    const offlineCache = await caches.open(APP_SHELL_CACHE);
    const offline = await offlineCache.match('/offline');
    if (offline) return offline;

    // We don't have anything to serve. Build a minimal HTML inline so the
    // browser at least shows our origin's chrome rather than the network
    // failure page. Avoid templating tokens here — this is a last-ditch path
    // hit only when the install precache also failed.
    return new Response(
      '<!doctype html><html><head><meta charset="utf-8"><title>Offline</title></head><body><h1>Offline</h1><p>RoutineForge is unreachable right now. Please check your connection.</p></body></html>',
      {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    );
  }
}

// -----------------------------------------------------------------------
// Push notifications (Task 4) — unchanged
// -----------------------------------------------------------------------

/**
 * Parse the push payload defensively. The dispatcher always sends JSON, but a
 * test push from DevTools / a third party could send plain text — fall back to
 * sensible defaults rather than throwing inside the event handler (a thrown
 * error inside `push` aborts the notification with no UI feedback).
 */
function parsePayload(event) {
  if (!event.data) {
    return { title: 'RoutineForge', body: '', url: '/' };
  }
  try {
    const obj = event.data.json();
    return {
      title: typeof obj.title === 'string' && obj.title.length > 0 ? obj.title : 'RoutineForge',
      body: typeof obj.body === 'string' ? obj.body : '',
      url: typeof obj.url === 'string' && obj.url.length > 0 ? obj.url : '/',
      subjectType: obj.subjectType,
      subjectId: obj.subjectId,
    };
  } catch {
    // Not JSON — surface the raw text as the body.
    let body = '';
    try {
      body = event.data.text();
    } catch {
      // ignore
    }
    return { title: 'RoutineForge', body, url: '/' };
  }
}

self.addEventListener('push', (event) => {
  const payload = parsePayload(event);
  const tag = payload.subjectType && payload.subjectId
    ? `rf-${payload.subjectType}-${payload.subjectId}`
    : 'rf-notification';

  // `showNotification` returns a promise; tying it to `waitUntil` keeps the SW
  // alive until the OS renders the notification. Without this the browser can
  // terminate the SW mid-show on slow devices.
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      tag,
      // Stash the deep-link URL on the notification itself so the click handler
      // doesn't have to re-derive it from the title/body.
      data: { url: payload.url },
      // Avoid silently re-firing the OS sound for the same subject (e.g. two
      // dispatcher ticks in the same minute).
      renotify: false,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      // Resolve the absolute URL to match against open clients. The SW's
      // origin matches the app's origin by construction.
      const absoluteUrl = new URL(targetUrl, self.location.origin).href;

      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // If a tab is already pointing at the target URL, focus it.
      for (const client of allClients) {
        if (client.url === absoluteUrl && 'focus' in client) {
          return client.focus();
        }
      }

      // Else, if the app has any open tab, navigate the first one (better UX
      // than opening another duplicate tab on most platforms).
      for (const client of allClients) {
        if ('focus' in client && 'navigate' in client) {
          try {
            await client.navigate(absoluteUrl);
            return client.focus();
          } catch {
            // navigate() can fail (e.g. cross-origin redirect, browser quirk).
            // Fall through to opening a fresh window.
          }
        }
      }

      // Otherwise open a fresh window at the URL.
      if (self.clients.openWindow) {
        return self.clients.openWindow(absoluteUrl);
      }
      return null;
    })(),
  );
});
