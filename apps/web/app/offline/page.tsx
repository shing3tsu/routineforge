/**
 * /offline — the precached fallback page the service worker serves when the
 * user requests an HTML route but is offline AND the route hasn't been
 * cached yet.
 *
 * Reachable two ways:
 *
 *   1. Online: a user types /offline directly (rare, harmless). The page is
 *      a static-friendly server component so the SW can precache the
 *      response during `install`.
 *   2. Offline: the SW intercepts a navigation request, fails to fetch it,
 *      finds no cached response, and serves the precached /offline copy.
 *      The Retry button below reloads the page once connectivity returns.
 *
 * Visual target: `design/mockups/offline.html` + `design/screens/edges.jsx
 * → OfflineMobile / OfflineDesktop`. Calm copy, the same wash backdrop, a
 * single retry CTA.
 *
 * Server component on purpose:
 *   - No interactivity beyond the Retry button, which is wrapped in a
 *     minimal client island below.
 *   - Server-rendered HTML is what the SW caches; a client-rendered shell
 *     would render an empty page when served from cache without JS.
 *
 * The page renders WITHOUT the AppShell because the root layout's
 * `auth()` call would fail when the service worker is offline. The flat
 * shell is correct here — there's no app to navigate to anyway.
 */
import * as React from 'react';
import type { Metadata } from 'next';
import { Alert } from '@/components/ui/Alert';
import { BrandLockup } from '@/components/ui/BrandLockup';
import { IconOffline } from '@/components/ui/icons';
import { OfflineRetryButton } from '@/components/pwa/OfflineRetryButton';

export const metadata: Metadata = {
  title: "You're offline — RoutineForge",
  description:
    'RoutineForge is unreachable. Last-known data may be available when you reconnect.',
};

export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <div
      className="rf-wash"
      style={{
        minHeight: '100dvh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: 'var(--s-4) var(--s-5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <BrandLockup size="sm" />
        <span
          className="mono rf-eyebrow"
          aria-label="Connection status"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--s-2)',
          }}
        >
          <IconOffline size={16} />
          offline
        </span>
      </header>

      <main
        style={{
          flex: 1,
          maxWidth: 640,
          width: '100%',
          margin: '0 auto',
          padding: 'var(--s-6) var(--s-5) var(--s-12) var(--s-5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
        }}
        aria-labelledby="offline-heading"
      >
        <div
          style={{
            width: '100%',
            maxWidth: 480,
            marginBottom: 'var(--s-6)',
            textAlign: 'left',
          }}
        >
          <Alert variant="warning" title="You're offline">
            RoutineForge is unreachable right now. Your last-known routines
            and habits should still be available on the main view; any
            check-ins will sync when you reconnect.
          </Alert>
        </div>

        <div
          aria-hidden="true"
          style={{
            color: 'var(--c-text-muted)',
            marginBottom: 'var(--s-5)',
          }}
        >
          <IconOffline size={56} />
        </div>

        <h1
          id="offline-heading"
          style={{
            fontSize: 'var(--fs-3xl)',
            fontWeight: 600,
            letterSpacing: 'var(--tr-tight)',
            color: 'var(--c-text-primary)',
            margin: '0 0 var(--s-3) 0',
          }}
        >
          You&apos;re offline.
        </h1>
        <p
          style={{
            fontSize: 'var(--fs-base)',
            color: 'var(--c-text-secondary)',
            maxWidth: '48ch',
            margin: '0 auto var(--s-6) auto',
            lineHeight: 1.5,
          }}
        >
          We couldn&apos;t reach RoutineForge. While you&apos;re here, you
          can still view today&apos;s routines and habits if you&apos;ve
          loaded the app recently. New check-ins and edits will need a
          connection.
        </p>

        <div
          style={{
            display: 'inline-flex',
            gap: 'var(--s-3)',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <OfflineRetryButton />
        </div>
      </main>
    </div>
  );
}
