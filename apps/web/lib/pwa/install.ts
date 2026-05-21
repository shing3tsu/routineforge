/**
 * Client-side helpers for the PWA install flow.
 *
 * Two platforms, two stories:
 *
 *   - Chromium-based browsers (Chrome, Edge, Brave, Android Chrome) fire
 *     `beforeinstallprompt` on the window once they decide the page is
 *     installable. We catch the event, hide its native prompt
 *     (`preventDefault()`), and surface our own UI. When the user clicks
 *     Install in our UI we call the saved `prompt()` to show the native
 *     dialog. The `userChoice` promise resolves with the outcome.
 *
 *   - iOS Safari does NOT fire `beforeinstallprompt`. Installing a PWA on
 *     iOS is a manual Safari menu action: "Share → Add to Home Screen". We
 *     detect iOS Safari heuristically (Apple Vendor + Safari UA) and show
 *     instruction copy instead of a button. Detecting iPadOS is the
 *     trickiest part: from iPadOS 13+, the UA reports "Macintosh" — we use
 *     touch-point count as a secondary signal.
 *
 * Dismissal: when the user dismisses the prompt, we stash a timestamp in
 * localStorage under a stable key. The prompt isn't shown again for
 * `DISMISS_DAYS` days. The key uses a `rf_` prefix to be obviously ours in
 * Application > Local Storage devtools.
 *
 * NOTE: these helpers are intentionally typed against `window` directly
 * because they're called only from client components. None of these
 * functions are safe to call during SSR — they all early-return on the
 * server.
 */

/**
 * The shape of the BeforeInstallPromptEvent. The DOM types in TypeScript
 * don't include it (it's a non-standard Chromium extension), so we declare
 * a minimal local interface and rely on duck-typing at runtime.
 */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export const DISMISS_KEY = 'rf_install_dismissed';
export const DISMISS_DAYS = 30;

/**
 * Returns true if the user dismissed the install prompt within the last
 * DISMISS_DAYS. Robust against malformed/legacy values: any unparseable
 * stored value is treated as "not dismissed" so we don't permanently hide
 * the prompt because of a bad write.
 */
export function isDismissed(now: Date = new Date()): boolean {
  if (typeof window === 'undefined') return true; // safest default during SSR
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Date.parse(raw);
    if (Number.isNaN(at)) return false;
    const ageMs = now.getTime() - at;
    const ttlMs = DISMISS_DAYS * 24 * 60 * 60 * 1000;
    return ageMs < ttlMs;
  } catch {
    // Privacy-mode browsers throw on localStorage access. Treating "can't
    // tell" as dismissed avoids re-prompting on every page load there.
    return true;
  }
}

/**
 * Persist the current timestamp as the last-dismissed marker. Best-effort:
 * a throw from localStorage.setItem is swallowed (e.g. quota exceeded).
 */
export function markDismissed(now: Date = new Date()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISS_KEY, now.toISOString());
  } catch {
    // ignore
  }
}

/**
 * Detect iOS Safari. We check the navigator vendor (Apple) AND the user
 * agent (Safari but not Chrome/Edge/Firefox/Opera in disguise). iPadOS
 * since 13 reports as Mac, so we also accept `Macintosh` UAs that have
 * `maxTouchPoints > 1` (Macs are touchless).
 *
 * False positives here are mostly harmless — at worst we show the iOS
 * install copy on a desktop Safari, which says "Share → Add to Home
 * Screen" (an existing Safari menu item).
 */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const vendor = (navigator as Navigator & { vendor?: string }).vendor || '';

  const isAppleVendor = /Apple/i.test(vendor);
  if (!isAppleVendor) return false;

  // Block other browsers that run on iOS (CriOS, FxiOS, EdgiOS, OPiOS); they
  // don't expose Add-to-Home-Screen the same way.
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return false;

  // Classic iOS path.
  if (/iPhone|iPad|iPod/i.test(ua)) return true;

  // iPadOS 13+ disguising as Mac.
  const maxTouch = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0;
  if (/Macintosh/i.test(ua) && maxTouch > 1) return true;

  return false;
}

/**
 * Detect whether the app is already running standalone (installed). Avoids
 * showing the install prompt to users who have already installed.
 *
 * Two signals: the `display-mode: standalone` media query (Chromium + recent
 * Safari) and the `navigator.standalone` boolean (legacy iOS Safari).
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  ) {
    return true;
  }
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}
