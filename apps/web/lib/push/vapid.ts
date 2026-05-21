/**
 * VAPID configuration for Web Push.
 *
 * Reads `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` from the
 * environment and applies them to the shared `web-push` library client on
 * first use.
 *
 * Why a module-level memo: `web-push.setVapidDetails` is process-global. We
 * want to call it once per process, not on every request. The `applyVapid`
 * helper is idempotent (safe to call from multiple route handlers and from
 * the dev scheduler at startup).
 *
 * Why a "configured" gate: VAPID is OPTIONAL in dev (the user might not have
 * generated keys yet). Routes that REQUIRE push (subscribe, dispatcher) call
 * `requireVapid()` and surface a clear 503 when keys are absent. The public
 * key endpoint surfaces the same condition so the frontend can disable the
 * "Enable push" button cleanly.
 *
 * `web-push` is a CommonJS module; we import it via the default export to
 * avoid ESM-interop foot-guns.
 */

import 'server-only';
import webpush from 'web-push';

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

let appliedFor: string | null = null;

function readEnv(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  // `web-push` requires the subject to be a `mailto:` or `https:` URL per
  // RFC 8292. We surface the canonical error early rather than letting the
  // first push attempt fail cryptically.
  if (!/^mailto:|^https:\/\//i.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

/**
 * Returns the configured VAPID details if env vars are present + sane.
 * Returns `null` when push is not configured (don't crash the route — let it
 * surface a 503).
 */
export function getVapidConfig(): VapidConfig | null {
  return readEnv();
}

/**
 * True if all three VAPID env vars are present + the subject is a valid
 * mailto/https URL.
 */
export function isVapidConfigured(): boolean {
  return getVapidConfig() !== null;
}

/**
 * Idempotently apply the env-derived VAPID details to `web-push`. Returns
 * false when env vars are missing (caller should 503).
 *
 * Memoization key includes all three values so a hot-reload that swapped
 * keys re-applies them.
 */
export function applyVapid(): boolean {
  const cfg = readEnv();
  if (!cfg) return false;
  const fingerprint = `${cfg.publicKey}:${cfg.privateKey}:${cfg.subject}`;
  if (appliedFor === fingerprint) return true;
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  appliedFor = fingerprint;
  return true;
}

/**
 * Reset the memoized "applied" fingerprint. Test-only — exported so the
 * future backend-test dispatch can re-apply with different env values per
 * test without spawning a new process.
 */
export function _resetVapidMemo(): void {
  appliedFor = null;
}
