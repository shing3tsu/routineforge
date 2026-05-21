/**
 * Client-side push helpers.
 *
 * Lives alongside the server-only push code in `apps/web/lib/push/`. The
 * SERVER files (`dispatcher.ts`, `dev-scheduler.ts`, `queries.ts`, `vapid.ts`)
 * all start with `import 'server-only'`. This file starts with `'use client'`
 * so Next.js will reject any accidental import from a server component
 * boundary (same containment guarantee, opposite direction).
 *
 * Public surface (matches the dispatch spec verbatim):
 *
 *   getVapidPublicKey()          → cached fetch of /api/push/vapid-public-key
 *   subscribe()                  → registers SW, subscribes pushManager, POSTs.
 *   unsubscribe()                → unsubscribes locally + DELETEs server-side.
 *   getCurrentSubscription()     → returns the existing PushSubscription | null.
 *   getNotificationPermission()  → reads Notification.permission.
 *   requestNotificationPermission() → prompts the user.
 *   isPushSupported()            → feature-detect SW + Push + Notification.
 *
 * Why module-scoped caching for the VAPID key: it never changes for the
 * lifetime of a tab, and the route serves it with `Cache-Control:
 * public,max-age=3600,immutable`, so even cross-tab calls fetch from the disk
 * cache. The module memo just saves the awaited promise.
 *
 * The whole module is import-safe at module-evaluation time: it does NOT touch
 * `navigator`, `window`, or `Notification` until a function is called. That
 * way it can be imported from a server component file (e.g. for type-only
 * imports) without crashing the build.
 */
'use client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SW_URL = '/sw.js';
const VAPID_URL = '/api/push/vapid-public-key';
const SUBSCRIPTIONS_URL = '/api/push/subscriptions';

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

/**
 * True when the runtime supports the three APIs the push flow needs:
 * service workers, the PushManager interface, and the Notification API.
 *
 * Safari on iOS < 16.4 lacks PushManager despite having `serviceWorker`, so we
 * check all three independently rather than assuming.
 */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

// ---------------------------------------------------------------------------
// VAPID public key (cached)
// ---------------------------------------------------------------------------

let vapidPublicKeyPromise: Promise<string> | null = null;

/**
 * Fetch the VAPID public key (base64url) from the server, memoized for the
 * lifetime of the tab.
 *
 * Throws `Error` with code `'push_not_configured'` when the server returns
 * 503 — the UI uses that to disable the enable-push button.
 */
export async function getVapidPublicKey(): Promise<string> {
  if (vapidPublicKeyPromise) return vapidPublicKeyPromise;
  vapidPublicKeyPromise = (async () => {
    let res: Response;
    try {
      res = await fetch(VAPID_URL, { cache: 'force-cache' });
    } catch (e) {
      vapidPublicKeyPromise = null; // allow retry on transient network error
      throw new Error(
        e instanceof Error ? e.message : 'Network error fetching VAPID key.',
      );
    }
    if (res.status === 503) {
      vapidPublicKeyPromise = null; // env vars might be set later
      const err = new Error(
        'Push notifications are not configured on this server.',
      );
      (err as Error & { code?: string }).code = 'push_not_configured';
      throw err;
    }
    if (!res.ok) {
      vapidPublicKeyPromise = null;
      throw new Error(`Could not fetch VAPID key (${res.status}).`);
    }
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; key?: string }
      | null;
    if (!data?.ok || typeof data.key !== 'string') {
      vapidPublicKeyPromise = null;
      throw new Error('Malformed VAPID key response.');
    }
    return data.key;
  })();
  return vapidPublicKeyPromise;
}

/**
 * Test-only: clear the memo so the next call re-fetches. Not part of the
 * public contract but exported for future tests / debugging.
 */
export function _resetVapidCache(): void {
  vapidPublicKeyPromise = null;
}

// ---------------------------------------------------------------------------
// Base64url -> Uint8Array (for `applicationServerKey`)
// ---------------------------------------------------------------------------

/**
 * Convert a base64url string (the VAPID public key as served) into the
 * Uint8Array shape `pushManager.subscribe` expects.
 *
 * `atob` only handles standard base64; we transform the base64url alphabet
 * back to base64 and pad to a multiple of 4 first.
 */
function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Service worker registration
// ---------------------------------------------------------------------------

/**
 * Return an active SW registration, registering `/sw.js` if needed.
 *
 * `register` is idempotent — the browser dedupes against the same script URL +
 * scope. Awaiting `navigator.serviceWorker.ready` after register ensures the
 * registration's `active` worker is non-null before we try to subscribe.
 */
async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser.');
  }
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  if (existing) {
    await navigator.serviceWorker.ready;
    return existing;
  }
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  await navigator.serviceWorker.ready;
  return reg;
}

// ---------------------------------------------------------------------------
// Notification permission
// ---------------------------------------------------------------------------

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Prompts the user for notification permission. Returns the resulting state.
 *
 * Modern Chrome/Edge/Firefox return a Promise; older Safari uses a callback
 * variant. We always promisify so callers can `await`.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  // The standard API now returns a Promise. The older callback form was
  // deprecated in 2019 and the promise form is supported everywhere we care
  // about. Use it unconditionally.
  const result = await Notification.requestPermission();
  return result;
}

// ---------------------------------------------------------------------------
// Subscription read
// ---------------------------------------------------------------------------

/**
 * The currently active `PushSubscription` for this device, or null.
 *
 * Calls `pushManager.getSubscription()` against the existing SW registration —
 * does NOT auto-register the SW; if there's no registration we just return
 * null so the caller can treat it as "not yet subscribed".
 */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

// ---------------------------------------------------------------------------
// Subscribe
// ---------------------------------------------------------------------------

export type SubscribeResult = { ok: true; endpoint: string };

/**
 * Full subscribe flow: ensure SW → subscribe pushManager → POST to server.
 *
 * Errors are surfaced verbatim — the caller (PushToggle) maps them to UI.
 *
 * Important: `userVisibleOnly: true` is REQUIRED by Chrome's push spec. The
 * server-side dispatcher always shows a notification on receive, so this is
 * also semantically correct.
 */
export async function subscribe(): Promise<SubscribeResult> {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported in this browser.');
  }
  // Fetch the VAPID key FIRST. If the server isn't configured we want to fail
  // before we ask the browser for permission — otherwise the user grants
  // permission and we then have to explain "actually nothing will be sent".
  const vapid = await getVapidPublicKey();

  const reg = await ensureRegistration();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as unknown as BufferSource,
    });
  }

  // POST to the server. Body shape mirrors `subscribePushSchema` in
  // `lib/validation/push.ts`.
  const subJson = sub.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (
    !subJson.endpoint ||
    !subJson.keys?.p256dh ||
    !subJson.keys?.auth
  ) {
    throw new Error('Browser returned an incomplete subscription.');
  }

  const res = await fetch(SUBSCRIPTIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subJson.endpoint,
      keys: {
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
      },
      userAgent:
        typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
          ? navigator.userAgent.slice(0, 512)
          : undefined,
    }),
  });

  if (res.status === 503) {
    // Server says VAPID is unset. Roll back the local subscription so we don't
    // leave a dangling browser subscription that the server doesn't know about.
    try {
      await sub.unsubscribe();
    } catch {
      // best-effort
    }
    const err = new Error(
      'Push notifications are not configured on this server.',
    );
    (err as Error & { code?: string }).code = 'push_not_configured';
    throw err;
  }

  if (!res.ok) {
    // Server-side rejection (validation, auth, etc). Also roll back to keep
    // the browser + server in sync.
    try {
      await sub.unsubscribe();
    } catch {
      // best-effort
    }
    const data = (await res.json().catch(() => null)) as
      | { message?: string }
      | null;
    throw new Error(
      data?.message ?? `Could not save subscription (${res.status}).`,
    );
  }

  return { ok: true, endpoint: subJson.endpoint };
}

// ---------------------------------------------------------------------------
// Unsubscribe
// ---------------------------------------------------------------------------

/**
 * Tear down the local PushSubscription and tell the server to forget it.
 * Idempotent — safe to call when no subscription exists.
 */
export async function unsubscribe(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  // Order: unsubscribe locally first so even if the server call fails the
  // browser stops receiving pushes for this device.
  try {
    await sub.unsubscribe();
  } catch {
    // ignore — we'll still try to clean up server-side
  }
  await fetch(SUBSCRIPTIONS_URL, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}
