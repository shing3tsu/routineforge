/**
 * In-memory token-bucket rate limiter, keyed by an arbitrary string (typically
 * a client IP).
 *
 * Algorithm: classic token bucket.
 *   - Each key has a bucket with `capacity` max tokens, refilling at
 *     `refillPerMinute` tokens/min (continuously, computed lazily on each call).
 *   - A request consumes one token. If none are available, the request is
 *     rejected with the wait time until the next token is available.
 *
 * Eviction: stale entries (idle for longer than `STALE_MS`, default ~30 min)
 * are dropped from the underlying Map on each call (lazy GC). We deliberately
 * avoid setInterval so the module has no module-load side effects and stays
 * safe for serverless / Edge runtimes.
 *
 * Scope: SINGLE-PROCESS ONLY. The bucket Map lives in module memory and is
 * therefore per-Node-instance. For multi-instance production deployments this
 * should be replaced with a Redis-backed implementation (e.g. via
 * `@upstash/ratelimit` or a self-hosted Redis with INCR+EXPIRE). For RoutineForge's
 * current single-server dev/prod posture this in-memory limiter is sufficient;
 * a follow-up dispatch should swap it out when we go multi-instance.
 */

import 'server-only';

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; retryAfterMs: number };

export interface RateLimitOptions {
  /** Max burst tokens — a freshly-seen key starts with this many tokens. */
  capacity: number;
  /** Tokens refilled per minute (fractional rates are fine). */
  refillPerMinute: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

/** Entries idle for longer than this are pruned on the next call. */
const STALE_MS = 30 * 60 * 1000; // 30 minutes

const buckets = new Map<string, Bucket>();

/**
 * Consume one token for `key`. Returns `{ ok: true, ... }` on success, with the
 * remaining token count and an ISO ms timestamp at which the bucket will be
 * back to full. On rejection, returns `{ ok: false, retryAfterMs }` — the
 * minimum wait (in ms) before another call would succeed.
 */
export function rateLimit(
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  if (options.capacity <= 0) {
    throw new Error('rateLimit: capacity must be > 0');
  }
  if (options.refillPerMinute <= 0) {
    throw new Error('rateLimit: refillPerMinute must be > 0');
  }

  const now = Date.now();
  pruneStale(now);

  const refillPerMs = options.refillPerMinute / 60_000;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: options.capacity, lastRefill: now };
    buckets.set(key, bucket);
  } else {
    // Refill since last touch, capped at capacity.
    const elapsed = Math.max(0, now - bucket.lastRefill);
    const refilled = elapsed * refillPerMs;
    bucket.tokens = Math.min(options.capacity, bucket.tokens + refilled);
    bucket.lastRefill = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    const remainingWhole = Math.floor(bucket.tokens);
    // resetAt = when the bucket is back to `capacity` worth of tokens.
    const missing = options.capacity - bucket.tokens;
    const msToFull = missing / refillPerMs;
    return {
      ok: true,
      remaining: remainingWhole,
      resetAt: now + Math.ceil(msToFull),
    };
  }

  // Not enough tokens — compute how long until we'd have 1.
  const deficit = 1 - bucket.tokens;
  const retryAfterMs = Math.ceil(deficit / refillPerMs);
  return { ok: false, retryAfterMs };
}

/**
 * Lazy GC: drop buckets that haven't been touched in over STALE_MS. We iterate
 * with a snapshot of entries so the map can be safely mutated mid-loop.
 */
function pruneStale(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > STALE_MS) {
      buckets.delete(key);
    }
  }
}

/**
 * Test-only: reset all internal state. Production code should never call this.
 * Exported so unit tests can isolate scenarios without relying on global state
 * leaking between cases.
 */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}
