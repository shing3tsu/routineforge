/**
 * useOnline — React hook returning a live "is the browser online?" boolean.
 *
 * Subscribes to the window `online` / `offline` events. Initial value is
 * `navigator.onLine` on the client; on the server (SSR) we default to
 * `true` so the first render matches the most-common case (no warning
 * banner) and lets the effect transition to `false` after mount if we're
 * actually offline.
 *
 * The browser's `online`/`offline` events are a best-effort signal — they
 * tell us whether the network adapter is up, not whether our backend is
 * reachable. Good enough for the "you're offline" UX, but a captive-portal
 * Wi-Fi will report `online: true` while still blocking outbound traffic.
 * Network-level errors from fetch are the real source of truth; this hook
 * just lights up the banner more eagerly when the device knows for sure.
 */
'use client';

import * as React from 'react';

export function useOnline(): boolean {
  // SSR-safe initial: assume online so the server-rendered first paint
  // doesn't include the offline banner (which would flash off on hydrate
  // when the client is actually online — the common case).
  const [online, setOnline] = React.useState<boolean>(true);

  React.useEffect(() => {
    if (typeof navigator === 'undefined') return;
    // Settle to the actual current state right after mount.
    setOnline(navigator.onLine);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return online;
}
