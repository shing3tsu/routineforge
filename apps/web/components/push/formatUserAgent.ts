/**
 * Compress a raw `User-Agent` header into a humane "Browser on OS" label for
 * the devices list. Pure function — safe in both client and server contexts.
 *
 * We deliberately avoid a UA-parser library here. The full standards are
 * messy, but the common cases on the four engines that matter (Chromium,
 * Gecko, WebKit, Edge fork of Chromium) are easy to recognise from a few
 * substrings. Anything we don't recognise falls back to "Unknown browser".
 *
 * Ordering note: Edge tests must come BEFORE Chrome (Edge UAs include
 * `Chrome/<v> Safari/537.36 Edg/<v>`). Same goes for Opera. Firefox is
 * unambiguous. Safari must be tested AFTER Chrome/Edge/Opera because Chrome
 * UAs also contain `Safari/<v>`.
 */

const BROWSER_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // Edge first (Chromium-based Edge still includes "Chrome/" + "Safari/").
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\//, 'Opera'],
  [/\bFirefox\//, 'Firefox'],
  [/\bChrome\//, 'Chrome'],
  [/\bCriOS\//, 'Chrome'],
  [/\bFxiOS\//, 'Firefox'],
  [/\bSafari\//, 'Safari'],
];

const OS_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bWindows NT 10/i, 'Windows'],
  [/\bWindows NT/i, 'Windows'],
  [/\bMac OS X|\bMacintosh/i, 'macOS'],
  [/\bAndroid/i, 'Android'],
  [/\biPhone|\biPad|\biPod/i, 'iOS'],
  [/\bCrOS\b/i, 'ChromeOS'],
  [/\bLinux/i, 'Linux'],
];

export function formatUserAgent(raw: string | null | undefined): string {
  if (!raw) return 'Unknown device';
  const ua = raw.trim();
  if (!ua) return 'Unknown device';

  const browser =
    BROWSER_PATTERNS.find(([re]) => re.test(ua))?.[1] ?? 'Unknown browser';
  const os = OS_PATTERNS.find(([re]) => re.test(ua))?.[1];

  return os ? `${browser} on ${os}` : browser;
}

/**
 * Format an ISO timestamp as a short relative phrase ("just now", "5 minutes
 * ago", "2 days ago"). Falls back to the localised date for older entries.
 */
export function formatRelative(isoTimestamp: string, now: Date = new Date()): string {
  const then = new Date(isoTimestamp);
  if (Number.isNaN(then.getTime())) return '—';
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 30) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 14) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return then.toLocaleDateString();
}
