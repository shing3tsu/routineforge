/**
 * In-process push dispatcher for development.
 *
 * Next.js doesn't have a clean lifecycle hook for "start a long-running
 * timer", and we don't want to drag in a job runner like BullMQ for a
 * single-developer project. The compromise: a setInterval that fires every
 * 60s, gated on `NODE_ENV !== 'production'` and registered from
 * `apps/web/instrumentation.ts` (the only Next.js bootstrap hook available
 * for server-only side effects).
 *
 * In PROD, this module is never invoked — the cron entrypoint at
 * `/api/push/dispatch-tick` is hit by Vercel Cron instead.
 *
 * Robustness notes:
 *   - The interval is module-singleton (kept across hot reloads via
 *     `globalThis`) so HMR doesn't multiply firers.
 *   - The interval body swallows errors so a one-off DB failure doesn't kill
 *     the loop forever.
 *   - We never start the interval if VAPID isn't configured — the dispatcher
 *     would no-op anyway, and the noisy "VAPID not configured" log every 60s
 *     is more annoying than useful.
 */

import 'server-only';
import { dispatchTick } from './dispatcher';
import { isVapidConfigured } from './vapid';

const TICK_MS = 60_000;

/**
 * Detect the pglite "WASM heap aborted" error signature so the scheduler
 * can log it succinctly instead of dumping the full Emscripten stack every
 * 60s until the DB module rebuilds the instance.
 *
 * Mirrors `isPgliteFatalError` in `db/index.ts`. Duplicated here (rather
 * than imported) to keep the dev-scheduler's module graph small — the DB
 * module pulls in pg / drizzle / pglite, and we don't want the scheduler
 * itself owning that surface area just for one regex.
 */
function isAbortedWasmError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { name?: unknown; message?: unknown };
  const name = typeof e.name === 'string' ? e.name : '';
  const message = typeof e.message === 'string' ? e.message : String(err);
  return /Aborted\(\)|RuntimeError|memory access out of bounds|out of memory/i.test(
    `${name}: ${message}`,
  );
}

declare global {
  var __routineforgeDevTickHandle: NodeJS.Timeout | undefined;
}

/**
 * Start the dev scheduler. Idempotent — safe to call from instrumentation.ts
 * across HMR reloads.
 *
 * Returns `true` when the scheduler started (or was already running),
 * `false` when it was a no-op (prod or VAPID missing).
 */
export function startDevScheduler(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (!isVapidConfigured()) {
    console.warn(
      '[push] dev scheduler not started: VAPID env vars missing. Run `pnpm dlx web-push generate-vapid-keys` and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT.',
    );
    return false;
  }
  if (globalThis.__routineforgeDevTickHandle) return true;

  console.log('[push] dev scheduler started (60s interval).');

  globalThis.__routineforgeDevTickHandle = setInterval(() => {
    void (async () => {
      try {
        const result = await dispatchTick();
        if (result.fired > 0 || result.deleted > 0 || result.errors > 0) {
          console.log('[push] dev tick:', result);
        }
      } catch (e) {
        // Special-case the pglite WASM-abort signature: it's noisy (every 60s
        // until the next tick triggers recovery) and the giant Emscripten
        // stack adds nothing actionable. Single-line warning and continue.
        // The DB module's getPgliteDb() will rebuild the cache on the next
        // tick, so no further action is needed here.
        if (isAbortedWasmError(e)) {
          console.warn(
            '[push] dev tick: pglite WASM aborted; will retry next tick after recovery.',
          );
          return;
        }
        console.error('[push] dev tick failed:', e);
      }
    })();
  }, TICK_MS);

  return true;
}

/**
 * Stop the dev scheduler. Mostly useful for tests / one-off scripts —
 * production never calls this.
 */
export function stopDevScheduler(): void {
  if (globalThis.__routineforgeDevTickHandle) {
    clearInterval(globalThis.__routineforgeDevTickHandle);
    globalThis.__routineforgeDevTickHandle = undefined;
  }
}
