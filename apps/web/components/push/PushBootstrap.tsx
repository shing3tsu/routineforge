/**
 * PushBootstrap — client island that registers `/sw.js` once per session.
 *
 * Imported by the root layout's body. Rendering it is a side-effect-only
 * affair: it adds no DOM (`return null`), it just runs an effect.
 *
 * Why a separate component (vs inline in the layout): the root layout is a
 * server component. We need a client island for `useEffect` + access to
 * `navigator.serviceWorker`.
 *
 * Why registration is no longer gated by `NEXT_PUBLIC_PUSH_ENABLED` in prod:
 * the SW now also drives the PWA offline shell + caching (Task 5). Push and
 * caching share a single SW file (`/public/sw.js`). We MUST register the SW
 * for the offline experience to work, regardless of whether the user has
 * subscribed to push notifications.
 *
 * Dev behavior is unchanged: the SW lifecycle is noisy on hot-reload, so dev
 * still requires `NEXT_PUBLIC_PUSH_ENABLED=true` (legacy name kept; consider
 * renaming to `NEXT_PUBLIC_SW_ENABLED` in a follow-up). Set to `'false'`
 * to disable in prod as an emergency escape hatch.
 *
 * On register success: no-op. The user EXPLICITLY enables notifications from
 * the account page; we never prompt for permission here. The offline cache
 * starts populating itself on the first SW-controlled navigation.
 *
 * On register failure: log a warning. We don't surface anything in the UI
 * because the user hasn't asked for push yet; the failure becomes visible
 * later when they try to enable it or go offline.
 */
'use client';

import * as React from 'react';

function shouldRegister(): boolean {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  const flag = process.env.NEXT_PUBLIC_PUSH_ENABLED;
  // Explicit opt-out wins.
  if (flag === 'false') return false;
  // In prod, default ON — required for the PWA offline shell.
  if (process.env.NODE_ENV === 'production') return true;
  // In dev, opt IN by setting NEXT_PUBLIC_PUSH_ENABLED=true. Skip otherwise
  // to keep dev console clean from SW lifecycle noise.
  return flag === 'true';
}

export function PushBootstrap(): null {
  React.useEffect(() => {
    if (!shouldRegister()) return;
    // Fire-and-forget. We intentionally don't await this inside a React effect;
    // failures are logged but never throw to the React tree.
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      // Surfaced in dev console only; not user-visible. The account page's
      // subscribe flow will show a clear error if registration is genuinely
      // broken when the user clicks "Enable notifications".
      console.warn('[sw] service worker registration failed:', err);
    });
  }, []);

  return null;
}
