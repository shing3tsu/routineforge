/**
 * offlineQueue — localStorage-backed queue of completion toggles that the
 * user made while offline. Replayed when the browser reports `online`.
 *
 * # Why localStorage (and not IndexedDB)
 *
 * The whole point of this queue is to be cheap, synchronous, and impossible
 * to miss during page load. The expected payload is tiny: a handful of
 * pending toggles between disconnect events. IndexedDB would force every
 * read site (e.g. the TodayView's initial hydration) into an async dance,
 * which we don't need at this size. One JSON blob under one key is the
 * right shape.
 *
 * # Shape
 *
 * A single localStorage key `rf_offline_queue` holds a JSON array of
 * `QueuedWrite` objects. Each entry encodes ONE intended state for ONE
 * target on ONE date — i.e. "step X on date D should be `done`". Multiple
 * toggles of the same target collapse to the latest desired state via
 * `enqueue`'s dedup, so the queue size is bounded by the number of
 * DISTINCT targets the user has touched while offline, not by the number
 * of taps.
 *
 * # Replay semantics
 *
 * `flushQueue` walks the queue oldest-first and POSTs/DELETEs each entry
 * to the same endpoints the online path uses. Outcomes:
 *
 *   - 2xx (incl. 201 / 204)      → remove from queue, count as `ok`.
 *   - 4xx (definite client error) → remove from queue, count as `failed`.
 *     The most likely 4xx here is a routine/step/habit that was deleted
 *     in the meantime — there's no useful retry, and leaving it would
 *     wedge the queue forever.
 *   - Network error / 5xx        → KEEP in queue. The next online
 *     transition (or a subsequent `flushQueue` call) will retry.
 *
 * v1 retry strategy is "try once per flush". No exponential backoff, no
 * scheduled retries — the next browser `online` event drives the next
 * attempt. This is adequate because in practice the queue is flushed
 * within a few seconds of reconnect.
 *
 * # Idempotency
 *
 * The server endpoints we POST/DELETE against are already idempotent (an
 * `onConflictDoNothing` insert; a DELETE that always returns 204). So a
 * write that succeeds but whose response we never see (e.g. the user
 * disconnects again mid-flush) just gets retried on the next flush — no
 * duplicates, no errors.
 *
 * # SSR safety
 *
 * Every function early-returns or returns an empty array when `window` is
 * undefined, so they're safe to import from server components even though
 * they only do anything in the browser.
 */

/**
 * One pending offline write. The discriminant `kind` decides which
 * endpoint to call during flush.
 *
 * For routines we capture both the routineId (URL path) and the stepId
 * (request body); for habits we just need the habitId. `date` is the
 * local 'YYYY-MM-DD' string in the entity's own timezone, captured at
 * queue time so the server records the correct day even if the user
 * crosses a TZ boundary before reconnecting.
 *
 * `done` represents the DESIRED end state (`true` → POST, `false` →
 * DELETE). Dedup uses this to collapse rapid toggles to the latest
 * intent — if the user taps a step on, off, then on again while offline,
 * we want a single queued POST, not three writes.
 *
 * `queuedAt` is `Date.now()` and is used only for tie-breaking on dedup
 * (newest wins) and as a stable order-by during flush (oldest first).
 */
export type QueuedWrite =
  | {
      kind: 'routine.step.toggle';
      routineId: string;
      stepId: string;
      date: string;
      done: boolean;
      queuedAt: number;
    }
  | {
      kind: 'habit.toggle';
      habitId: string;
      date: string;
      done: boolean;
      queuedAt: number;
    };

/** Storage key for the queue. Prefixed `rf_` so it's obviously ours in devtools. */
export const QUEUE_KEY = 'rf_offline_queue';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Safely retrieve the raw queue array. Tolerates absent storage (SSR,
 * privacy-mode browsers), missing key, and malformed JSON — in all those
 * cases we treat the queue as empty rather than throwing. Defensive
 * because the queue is best-effort UX, never a source of truth.
 */
function readRaw(): QueuedWrite[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Filter out shapes we don't recognise so a partially-corrupt entry
    // can't poison the whole queue.
    return parsed.filter((entry): entry is QueuedWrite => {
      if (!entry || typeof entry !== 'object') return false;
      const e = entry as Record<string, unknown>;
      if (typeof e.date !== 'string') return false;
      if (typeof e.done !== 'boolean') return false;
      if (typeof e.queuedAt !== 'number') return false;
      if (e.kind === 'routine.step.toggle') {
        return typeof e.routineId === 'string' && typeof e.stepId === 'string';
      }
      if (e.kind === 'habit.toggle') {
        return typeof e.habitId === 'string';
      }
      return false;
    });
  } catch {
    return [];
  }
}

/**
 * Best-effort persist. Swallows quota / privacy-mode errors so a failure
 * to remember a queued write never crashes the calling toggle handler.
 * The user just loses the queued state — same outcome as not having the
 * feature at all, which is acceptable.
 */
function writeRaw(queue: QueuedWrite[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore (quota, privacy mode, etc.)
  }
}

/**
 * Two QueuedWrites address the same logical target iff they share `kind`,
 * the relevant id(s), and the same `date`. Used by `enqueue` to collapse
 * rapid toggles and by `removeFromQueue` to find an exact entry.
 *
 * Note: this comparison deliberately ignores `done` and `queuedAt` — we
 * want "off then on" to be recognised as the same target so the second
 * tap replaces the first rather than appending.
 */
function sameTarget(a: QueuedWrite, b: QueuedWrite): boolean {
  if (a.kind !== b.kind) return false;
  if (a.date !== b.date) return false;
  if (a.kind === 'routine.step.toggle' && b.kind === 'routine.step.toggle') {
    return a.routineId === b.routineId && a.stepId === b.stepId;
  }
  if (a.kind === 'habit.toggle' && b.kind === 'habit.toggle') {
    return a.habitId === b.habitId;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append a pending write to the queue, replacing any existing entry that
 * targets the same (kind, id(s), date). The new entry's `done` and
 * `queuedAt` win — the older entry is dropped so we never POST and then
 * DELETE the same target in a single flush.
 */
export function enqueue(write: QueuedWrite): void {
  const current = readRaw();
  const next = current.filter((entry) => !sameTarget(entry, write));
  next.push(write);
  writeRaw(next);
}

/**
 * Return the current queue. Always a fresh array; mutating it does NOT
 * change persisted state. Use `enqueue` / `removeFromQueue` for writes.
 */
export function readQueue(): QueuedWrite[] {
  return readRaw();
}

/**
 * Remove a specific write from the queue. Matches on target (kind +
 * id(s) + date), so passing in the same object reference is not
 * required — equivalent objects work too.
 */
export function removeFromQueue(write: QueuedWrite): void {
  const current = readRaw();
  const next = current.filter((entry) => !sameTarget(entry, write));
  if (next.length !== current.length) writeRaw(next);
}

/**
 * Wipe the queue entirely. Used by tests / debug; not invoked from the
 * UI itself (the UI removes entries individually as each flushes).
 */
export function clearQueue(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(QUEUE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Drive one POST/DELETE for a single QueuedWrite. Pulled out into its own
 * function so the flush loop stays readable and so a future test could
 * stub a single entry's result without orchestrating the whole queue.
 *
 * Returns:
 *   - 'ok'    → 2xx response.
 *   - 'drop'  → 4xx response; the target is gone or permanently invalid.
 *   - 'keep'  → network failure or 5xx; retry on a later flush.
 */
async function sendOne(write: QueuedWrite): Promise<'ok' | 'drop' | 'keep'> {
  try {
    let url: string;
    let body: string;
    if (write.kind === 'routine.step.toggle') {
      url = `/api/routines/${write.routineId}/completions`;
      body = JSON.stringify({ stepId: write.stepId, date: write.date });
    } else {
      url = `/api/habits/${write.habitId}/completions`;
      body = JSON.stringify({ date: write.date });
    }
    const method = write.done ? 'POST' : 'DELETE';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.ok || res.status === 204) return 'ok';
    if (res.status >= 400 && res.status < 500) return 'drop';
    return 'keep';
  } catch {
    // fetch rejects on network failure (CORS, DNS, offline). Keep the
    // entry — the next flush will try again.
    return 'keep';
  }
}

/**
 * Replay every queued write, oldest first. Returns the counts of
 * successful and definitively-failed (4xx) writes. Network-error /
 * 5xx entries are left in the queue and NOT counted in either total.
 *
 * Safe to call when the queue is empty (returns zeros, no network).
 * Concurrent calls are not coordinated — if two flushes race, each will
 * see a snapshot of the queue and each successful entry will be removed
 * once. The server endpoints are idempotent, so double-sending the same
 * entry is harmless.
 */
export async function flushQueue(): Promise<{ ok: number; failed: number }> {
  if (typeof window === 'undefined') return { ok: 0, failed: 0 };
  // Snapshot once, then mutate the persisted queue per-entry. Sorting by
  // `queuedAt` guarantees deterministic replay order even if entries
  // landed out of order (e.g. multiple tabs writing).
  const snapshot = readRaw().slice().sort((a, b) => a.queuedAt - b.queuedAt);
  let ok = 0;
  let failed = 0;
  for (const entry of snapshot) {
    const result = await sendOne(entry);
    if (result === 'ok') {
      removeFromQueue(entry);
      ok += 1;
    } else if (result === 'drop') {
      removeFromQueue(entry);
      failed += 1;
    }
    // 'keep' → leave in queue, fall through to next entry
  }
  return { ok, failed };
}
