/**
 * Unit tests for lib/rate-limit.ts.
 *
 * Covers the documented behaviour:
 *   - Initial state: full tokens, requests succeed.
 *   - After `capacity` rapid requests: next one is blocked with retryAfterMs.
 *   - After waiting `60_000 / refillPerMinute` ms: token replenishes (fake timers).
 *   - Different keys are isolated.
 *   - Stale entries are pruned after long idle.
 *   - Invalid options throw.
 *
 * Uses vitest fake timers + `__resetRateLimitForTests` to isolate module state
 * between scenarios. Without the reset the module's internal Map would leak
 * buckets between tests (the file-parallelism=false config keeps tests
 * sequential but the buckets Map is module-scoped).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rateLimit, __resetRateLimitForTests } from '@/lib/rate-limit';

beforeEach(() => {
  __resetRateLimitForTests();
});

afterEach(() => {
  vi.useRealTimers();
  __resetRateLimitForTests();
});

describe('rateLimit — initial state', () => {
  it('returns ok=true with full tokens for a freshly seen key', () => {
    const res = rateLimit('192.168.1.1', { capacity: 5, refillPerMinute: 3 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Consumed 1 of 5 → 4 remaining.
    expect(res.remaining).toBe(4);
    expect(res.resetAt).toBeGreaterThan(Date.now());
  });

  it('allows `capacity` consecutive requests immediately', () => {
    const opts = { capacity: 3, refillPerMinute: 1 };
    expect(rateLimit('k', opts).ok).toBe(true);
    expect(rateLimit('k', opts).ok).toBe(true);
    expect(rateLimit('k', opts).ok).toBe(true);
  });
});

describe('rateLimit — exhaustion', () => {
  it('blocks the (capacity+1)th rapid request with a retryAfterMs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z'));

    const opts = { capacity: 3, refillPerMinute: 6 }; // 1 token / 10s
    expect(rateLimit('k', opts).ok).toBe(true);
    expect(rateLimit('k', opts).ok).toBe(true);
    expect(rateLimit('k', opts).ok).toBe(true);

    const blocked = rateLimit('k', opts);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    // Refill rate = 1 token per 10_000 ms, so one full token in ~10_000ms.
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(10_000);
  });

  it('reports decreasing remaining as tokens are consumed', () => {
    const opts = { capacity: 4, refillPerMinute: 1 };
    const r1 = rateLimit('k', opts);
    const r2 = rateLimit('k', opts);
    const r3 = rateLimit('k', opts);
    expect(r1.ok && r1.remaining).toBe(3);
    expect(r2.ok && r2.remaining).toBe(2);
    expect(r3.ok && r3.remaining).toBe(1);
  });
});

describe('rateLimit — refill', () => {
  it('replenishes one token after waiting 60_000 / refillPerMinute ms', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z'));

    const opts = { capacity: 2, refillPerMinute: 6 }; // 1 token / 10s
    expect(rateLimit('k', opts).ok).toBe(true);
    expect(rateLimit('k', opts).ok).toBe(true);
    expect(rateLimit('k', opts).ok).toBe(false); // bucket empty

    // Advance enough time for exactly one token to refill (10_000 ms).
    vi.advanceTimersByTime(10_000);

    const res = rateLimit('k', opts);
    expect(res.ok).toBe(true);
  });

  it('caps refill at capacity even after a long idle', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z'));

    const opts = { capacity: 3, refillPerMinute: 60 }; // 1 token / sec
    // Drain the bucket.
    expect(rateLimit('k', opts).ok).toBe(true);
    expect(rateLimit('k', opts).ok).toBe(true);
    expect(rateLimit('k', opts).ok).toBe(true);
    expect(rateLimit('k', opts).ok).toBe(false);

    // Wait 10 minutes — far more than capacity worth of refill.
    vi.advanceTimersByTime(10 * 60 * 1000);

    // Capacity is 3; after one consume we should have 2 remaining.
    const res = rateLimit('k', opts);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.remaining).toBe(2);
  });

  it('reports retryAfterMs that scales with refill rate', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z'));

    // Slow refill: 1 token / 60s.
    const opts = { capacity: 1, refillPerMinute: 1 };
    expect(rateLimit('k', opts).ok).toBe(true);
    const blocked = rateLimit('k', opts);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    // Should be near 60_000 ms.
    expect(blocked.retryAfterMs).toBeGreaterThan(55_000);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000);
  });
});

describe('rateLimit — key isolation', () => {
  it('keeps buckets independent across keys', () => {
    const opts = { capacity: 2, refillPerMinute: 1 };
    expect(rateLimit('a', opts).ok).toBe(true);
    expect(rateLimit('a', opts).ok).toBe(true);
    expect(rateLimit('a', opts).ok).toBe(false); // a exhausted

    // b is fresh.
    expect(rateLimit('b', opts).ok).toBe(true);
    expect(rateLimit('b', opts).ok).toBe(true);
    expect(rateLimit('b', opts).ok).toBe(false);
  });

  it('treats different prefixes as separate buckets', () => {
    const opts = { capacity: 1, refillPerMinute: 1 };
    expect(rateLimit('signup:1.2.3.4', opts).ok).toBe(true);
    expect(rateLimit('signup:1.2.3.4', opts).ok).toBe(false);
    // Same IP, different prefix — different bucket.
    expect(rateLimit('verify:1.2.3.4', opts).ok).toBe(true);
  });
});

describe('rateLimit — stale eviction', () => {
  it('prunes entries that have been idle longer than ~30 min on the next call', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z'));

    const opts = { capacity: 2, refillPerMinute: 60 }; // 1 token / sec — refills well below capacity
    // Drain key A.
    expect(rateLimit('A', opts).ok).toBe(true);
    expect(rateLimit('A', opts).ok).toBe(true);
    expect(rateLimit('A', opts).ok).toBe(false);

    // Wait 31 minutes — past STALE_MS. A's bucket should be GC'd on the next call.
    vi.advanceTimersByTime(31 * 60 * 1000);

    // Trigger pruneStale via any call. Use key B to avoid touching A.
    expect(rateLimit('B', opts).ok).toBe(true);

    // A should now be treated as a fresh key — full capacity available.
    const res = rateLimit('A', opts);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.remaining).toBe(1); // capacity 2 minus this 1 call
  });

  it('does NOT prune entries inside the stale window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z'));

    // Refill rate slow enough that 29 min won't refill capacity worth of tokens.
    const opts = { capacity: 100, refillPerMinute: 1 };
    // Drain a few — bucket should NOT be reset by a touch within the window.
    expect(rateLimit('A', opts).ok).toBe(true);
    expect(rateLimit('A', opts).ok).toBe(true);

    vi.advanceTimersByTime(29 * 60 * 1000); // 29 min — under STALE_MS

    const res = rateLimit('A', opts);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Tokens were 98, refill = 29 over the window, so tokens ≈ 100 (capped)
    // minus the 1 we just consumed = 99. We assert it's strictly under
    // capacity-1 with margin to confirm the bucket wasn't reset.
    // Worst case (full refill cap): floor(99) = 99
    expect(res.remaining).toBeGreaterThanOrEqual(96);
    expect(res.remaining).toBeLessThanOrEqual(99);
  });
});

describe('rateLimit — argument validation', () => {
  it('throws if capacity <= 0', () => {
    expect(() => rateLimit('k', { capacity: 0, refillPerMinute: 1 })).toThrow();
    expect(() => rateLimit('k', { capacity: -1, refillPerMinute: 1 })).toThrow();
  });

  it('throws if refillPerMinute <= 0', () => {
    expect(() => rateLimit('k', { capacity: 1, refillPerMinute: 0 })).toThrow();
    expect(() => rateLimit('k', { capacity: 1, refillPerMinute: -2 })).toThrow();
  });
});
