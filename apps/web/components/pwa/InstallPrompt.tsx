/**
 * InstallPrompt — bottom-of-screen banner that offers to install the PWA.
 *
 * Client island. Mounted from the root layout after the page body so it
 * never blocks first paint. Renders nothing in any of these cases:
 *
 *   - SSR (the hook would be unsafe).
 *   - Already running as a standalone installed app.
 *   - User dismissed the prompt within the last 30 days (see
 *     `lib/pwa/install.ts`).
 *   - On non-iOS browsers that haven't fired `beforeinstallprompt` yet — we
 *     wait silently rather than guessing.
 *
 * Two paths:
 *
 *   1. Chromium / Edge / Android: catch `beforeinstallprompt`, save the
 *      event, suppress the browser's native banner, render our "Install"
 *      button. On click, call the saved prompt() and read userChoice. If
 *      the install completes (Chromium fires `appinstalled`) we hide the
 *      banner.
 *
 *   2. iOS Safari: there's no install API. We detect iOS Safari and show a
 *      static instruction banner with the Share→Add to Home Screen text.
 *      Same Dismiss button + 30-day cooldown.
 *
 * Layout: position: fixed; bottom: 0; full-width; the Card primitive
 * conveys elevation. The banner sits above the mobile bottom-tabbar (no
 * such bar exists in the current Next pages, but the safe-area-bottom
 * inset keeps it clear of iOS home indicator).
 *
 * Accessibility:
 *   - The banner is `role="dialog"` with `aria-modal="false"` (non-blocking)
 *     and `aria-labelledby` pointing at the heading.
 *   - Install + Dismiss are real <button>s with keyboard focus rings.
 *   - We do NOT trap focus — the banner is supplementary; the user should
 *     be free to keep using the app while it's visible.
 */
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import {
  isDismissed,
  isIosSafari,
  isStandalone,
  markDismissed,
  type BeforeInstallPromptEvent,
} from '@/lib/pwa/install';
import styles from './InstallPrompt.module.css';

/**
 * Reason the banner is being shown. `null` means "don't show".
 *   - `beforeinstall`: native install API available, button installs immediately.
 *   - `ios`: iOS Safari → display Share→Add instructions.
 */
type Mode = 'beforeinstall' | 'ios' | null;

export function InstallPrompt() {
  const [mode, setMode] = React.useState<Mode>(null);
  const promptEventRef = React.useRef<BeforeInstallPromptEvent | null>(null);

  // ---------------------------------------------------------------
  // 1. Decide which mode (if any) applies, on mount.
  // ---------------------------------------------------------------
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    // Already installed → never show.
    if (isStandalone()) return;

    // Dismissed within cooldown → never show.
    if (isDismissed()) return;

    // iOS path: there's no install API; show the instruction banner directly.
    // We delay a tick so initial layout has settled (avoids competing with
    // the today view's first paint).
    if (isIosSafari()) {
      const t = window.setTimeout(() => setMode('ios'), 1500);
      return () => window.clearTimeout(t);
    }

    // Non-iOS: wait for the browser to fire `beforeinstallprompt`. If it
    // never fires, we never show anything — that's the correct UX (the page
    // isn't deemed installable).
    const onBeforeInstall = (event: Event) => {
      // The native prompt would appear immediately if we don't preventDefault.
      event.preventDefault();
      promptEventRef.current = event as BeforeInstallPromptEvent;
      setMode('beforeinstall');
    };

    // If the app gets installed via the browser's omnibox or some other
    // surface, dismiss our banner.
    const onAppInstalled = () => {
      setMode(null);
      promptEventRef.current = null;
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  // ---------------------------------------------------------------
  // 2. Install / dismiss actions.
  // ---------------------------------------------------------------
  const handleInstall = async () => {
    const event = promptEventRef.current;
    if (!event) {
      // Defensive: button is only rendered in `beforeinstall` mode, but if
      // the event was somehow nulled, gracefully no-op rather than throwing.
      setMode(null);
      return;
    }
    try {
      await event.prompt();
      const choice = await event.userChoice;
      promptEventRef.current = null;
      // Always hide the banner after the user has answered the native dialog
      // — even on `dismissed`, the native dialog already represented a
      // "no thanks", so we shouldn't immediately ask again.
      setMode(null);
      if (choice.outcome === 'dismissed') {
        markDismissed();
      }
    } catch {
      // `prompt()` rejects if called more than once or outside a user
      // gesture. Drop the banner so we don't sit broken.
      setMode(null);
    }
  };

  const handleDismiss = () => {
    markDismissed();
    setMode(null);
  };

  if (mode === null) return null;

  const titleId = 'rf-install-title';
  const descId = 'rf-install-desc';

  return (
    <div
      className={styles.root}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className={styles.inner}>
        <div className={styles.body}>
          <h2 id={titleId} className={styles.title}>
            {mode === 'ios'
              ? 'Install RoutineForge as an app'
              : 'Install RoutineForge'}
          </h2>
          <p id={descId} className={styles.desc}>
            {mode === 'ios' ? (
              // Two-step instruction. Naming the Safari controls
              // explicitly ("Share" + "Add to Home Screen") matches the
              // labels iOS actually uses, so the user can scan rather
              // than hunt. Calm and literal — no exclamation, no arrow
              // pointer (Safari's share button is bottom-center on
              // iPhone, but on iPadOS it's top-right; pointing would be
              // wrong half the time).
              <>
                Tap the{' '}
                <span aria-hidden="true" className={styles.shareGlyph}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    focusable="false"
                  >
                    <path d="M12 3v13" />
                    <path d="M7 8l5-5 5 5" />
                    <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
                  </svg>
                </span>{' '}
                Share button, then choose &ldquo;Add to Home Screen.&rdquo;
              </>
            ) : (
              'Install the app for faster access and offline use.'
            )}
          </p>
        </div>
        <div className={styles.actions}>
          {mode === 'beforeinstall' ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleInstall}
            >
              Install
            </Button>
          ) : null}
          <button
            type="button"
            onClick={handleDismiss}
            className={styles.closeBtn}
            aria-label="Dismiss install prompt"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
