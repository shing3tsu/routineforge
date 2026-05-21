/**
 * Unit tests for the pglite dead-WASM recovery path in `db/index.ts`.
 *
 * Background: after long `next dev` runtime the pglite WASM cluster can
 * abort (`RuntimeError: Aborted()`). The instance is then permanently
 * unusable, so `db/index.ts` detects the dead state and rebuilds the cache
 * on the next access. These tests cover the two halves of that contract:
 *
 *   1. `isPgliteFatalError(err)` — does the error matcher classify the
 *      observed Emscripten / WASM signatures as fatal?
 *
 *   2. The `health: 'dead'` flag, when applied to the cached pglite
 *      instance via `__markPgliteDeadForTests()`, causes the next
 *      `getPgliteDb()` call to discard the corpse and rebuild — invoking
 *      `pglite.close()` along the way.
 *
 * Recovery test design: `db/index.ts` uses `require('@electric-sql/pglite')`
 * (CJS) inside `createPgliteCache()`, which `vi.mock()` cannot reliably
 * intercept across ESM/CJS boundaries. So we DON'T rely on module mocks
 * here; instead we test the recovery logic by directly manipulating the
 * `globalThis.__routineforgePgliteCache` slot with a stub record. The
 * `__markPgliteDeadForTests()` helper flips the health flag in the existing
 * slot, and we observe the side effects of the next `getPgliteDb()` call
 * (close-call on the corpse, slot cleared, new slot built).
 *
 * Letting the recovery actually instantiate a fresh pglite would create a
 * `.local-data` folder and lock the WASM heap for the rest of the worker
 * — not appropriate for a unit test. We sidestep that by intercepting the
 * cache slot's setter: when the recovery code writes `undefined` (the
 * "discard" step), we re-set it to a healthy stub BEFORE the next
 * statement (the createPgliteCache call) can run.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isPgliteFatalError,
  getPgliteDb,
  __markPgliteDeadForTests,
} from '@/db';

// Minimal stub matching the cache record's shape. `pglite.close()` is the
// only method the recovery path invokes on the corpse; everything else is
// inert.
type StubPglite = {
  closed: boolean;
  closeCalls: number;
  shouldCloseThrow: boolean;
  close: () => void;
};

type StubCache = {
  pglite: StubPglite;
  drizzle: unknown;
  health: 'alive' | 'dead';
};

function makeStubPglite(opts?: { closed?: boolean; shouldCloseThrow?: boolean }): StubPglite {
  const stub: StubPglite = {
    closed: opts?.closed ?? false,
    closeCalls: 0,
    shouldCloseThrow: opts?.shouldCloseThrow ?? false,
    close: () => {
      stub.closeCalls += 1;
      stub.closed = true;
      if (stub.shouldCloseThrow) throw new Error('close failed against aborted heap');
    },
  };
  return stub;
}

function makeStubCache(health: 'alive' | 'dead' = 'alive', pgliteOpts?: { closed?: boolean; shouldCloseThrow?: boolean }): StubCache {
  return {
    pglite: makeStubPglite(pgliteOpts),
    drizzle: { __stubDrizzle: true },
    health,
  };
}

type GlobalCacheSlot = {
  __routineforgePgliteCache?: StubCache;
};

function getCache(): StubCache | undefined {
  return (globalThis as unknown as GlobalCacheSlot).__routineforgePgliteCache;
}

function setCache(value: StubCache | undefined): void {
  (globalThis as unknown as GlobalCacheSlot).__routineforgePgliteCache = value;
}

/**
 * Install a setter trap on the global cache slot. When the recovery code
 * inside `getPgliteDb()` writes `undefined` (the discard step) we record
 * the event AND inject a healthy stub immediately, so the subsequent
 * `createPgliteCache()` call sees a populated slot and short-circuits...
 *
 * ...actually no — `getPgliteDb()` reads `cached` once at the top and only
 * calls `createPgliteCache()` if `cached` is undefined at that point. The
 * recovery branch unsets the local `cached` AND the global slot, then
 * checks `if (!cached)` and rebuilds.
 *
 * Workaround: substitute the GLOBAL `createPgliteCache` via a Symbol on
 * globalThis is not possible (the function is module-private). The clean
 * answer is to let `createPgliteCache()` actually run. Since the
 * recovery test only cares about the DISCARD step (close + clear slot),
 * we install a trap that throws on the post-discard `=` assignment of a
 * non-undefined value (i.e. the moment recovery tries to install a fresh
 * cache). The throw aborts `getPgliteDb()` mid-recovery — but ONLY AFTER
 * the corpse has been closed and the slot has been cleared. Tests then
 * inspect those observable side effects.
 */
function installCacheSetterTrap(): {
  uninstall: () => void;
  // Whether the slot transitioned to `undefined` during the test.
  observedDiscard: () => boolean;
} {
  const original = getCache();
  let current = original;
  let discardObserved = false;
  Object.defineProperty(globalThis, '__routineforgePgliteCache', {
    configurable: true,
    get() {
      return current;
    },
    set(v) {
      if (v === undefined && current !== undefined) {
        discardObserved = true;
        current = undefined;
        // Throw to short-circuit createPgliteCache(): the recovery code
        // will check `if (!cached)` next, but `cached` is the local
        // variable and is already undefined, so it'll call
        // `createPgliteCache()` which would instantiate a real pglite.
        // Throwing from this setter prevents the assignment from
        // returning, which... actually it returns regardless. The throw
        // propagates up through getPgliteDb().
        throw new Error('__test_short_circuit__');
      }
      current = v;
    },
  });
  return {
    uninstall: () => {
      // Drop the accessor and restore the plain value.
      delete (globalThis as Record<string, unknown>).__routineforgePgliteCache;
      (globalThis as unknown as GlobalCacheSlot).__routineforgePgliteCache = original;
    },
    observedDiscard: () => discardObserved,
  };
}

describe('isPgliteFatalError', () => {
  it('matches the observed Emscripten Aborted() signature', () => {
    const err = Object.assign(
      new Error('Aborted(). Build with -sASSERTIONS for more info.'),
      { name: 'RuntimeError' },
    );
    expect(isPgliteFatalError(err)).toBe(true);
  });

  it('matches a bare RuntimeError instance', () => {
    const err = Object.assign(new Error('memory access out of bounds'), {
      name: 'RuntimeError',
    });
    expect(isPgliteFatalError(err)).toBe(true);
  });

  it('matches an out-of-memory error', () => {
    const err = new Error('Cannot enlarge memory arrays: out of memory');
    expect(isPgliteFatalError(err)).toBe(true);
  });

  it('matches a memory-access-out-of-bounds error', () => {
    const err = new Error('memory access out of bounds');
    expect(isPgliteFatalError(err)).toBe(true);
  });

  it('matches when only .name carries the RuntimeError marker', () => {
    const err = Object.assign(new Error('whatever'), { name: 'RuntimeError' });
    expect(isPgliteFatalError(err)).toBe(true);
  });

  it('does NOT match a routine Postgres error', () => {
    const err = Object.assign(
      new Error('duplicate key value violates unique constraint'),
      { code: '23505' },
    );
    expect(isPgliteFatalError(err)).toBe(false);
  });

  it('does NOT match a connection refused error', () => {
    const err = new Error('ECONNREFUSED 127.0.0.1:5432');
    expect(isPgliteFatalError(err)).toBe(false);
  });

  it('returns false for null / undefined', () => {
    expect(isPgliteFatalError(null)).toBe(false);
    expect(isPgliteFatalError(undefined)).toBe(false);
  });
});

describe('getPgliteDb — dead-WASM recovery', () => {
  // Preserve the original cache slot so we don't leak state into other
  // test files (they import @/db transitively via various route helpers
  // and the shared production db is built once per worker).
  let originalCache: StubCache | undefined;

  beforeEach(() => {
    originalCache = getCache();
  });

  afterEach(() => {
    setCache(originalCache);
  });

  it('exports the helpers needed for recovery', () => {
    expect(typeof getPgliteDb).toBe('function');
    expect(typeof __markPgliteDeadForTests).toBe('function');
  });

  it('returns the cached Drizzle instance when health is alive', () => {
    const stub = makeStubCache('alive');
    setCache(stub);
    expect(getPgliteDb()).toBe(stub.drizzle);
    expect(stub.pglite.closeCalls).toBe(0);
    expect(getCache()).toBe(stub);
  });

  it('__markPgliteDeadForTests flips the health flag on the current slot', () => {
    const stub = makeStubCache('alive');
    setCache(stub);
    __markPgliteDeadForTests();
    expect(getCache()?.health).toBe('dead');
  });

  it('__markPgliteDeadForTests is a noop when no cache exists', () => {
    setCache(undefined);
    expect(() => __markPgliteDeadForTests()).not.toThrow();
    expect(getCache()).toBeUndefined();
  });

  it('discards a dead cache slot (close + clear) before attempting rebuild', () => {
    const stub = makeStubCache('dead');
    setCache(stub);

    const trap = installCacheSetterTrap();
    try {
      // getPgliteDb sees health='dead', calls close() and assigns the slot
      // to undefined. The trap throws to prevent the actual recreation
      // step (which would instantiate a real pglite).
      expect(() => getPgliteDb()).toThrow('__test_short_circuit__');
      expect(trap.observedDiscard()).toBe(true);
      expect(stub.pglite.closeCalls).toBe(1);
    } finally {
      trap.uninstall();
    }
  });

  it('treats a cache slot whose pglite reports closed=true as dead', () => {
    const stub = makeStubCache('alive', { closed: true });
    setCache(stub);

    const trap = installCacheSetterTrap();
    try {
      expect(() => getPgliteDb()).toThrow('__test_short_circuit__');
      expect(trap.observedDiscard()).toBe(true);
      // Even though health was alive, the closed-flag check forced recovery.
      expect(stub.pglite.closeCalls).toBe(1);
    } finally {
      trap.uninstall();
    }
  });

  it('survives a pglite.close() that itself throws while still clearing the slot', () => {
    const stub = makeStubCache('dead', { shouldCloseThrow: true });
    setCache(stub);

    const trap = installCacheSetterTrap();
    try {
      // The close() throw is swallowed; the discard still happens; the
      // post-discard recreate step is intercepted by the trap.
      expect(() => getPgliteDb()).toThrow('__test_short_circuit__');
      expect(trap.observedDiscard()).toBe(true);
      expect(stub.pglite.closeCalls).toBe(1);
    } finally {
      trap.uninstall();
    }
  });

  it('does NOT discard a healthy cache slot (closed=false, health=alive)', () => {
    const stub = makeStubCache('alive', { closed: false });
    setCache(stub);

    const trap = installCacheSetterTrap();
    try {
      const result = getPgliteDb();
      expect(result).toBe(stub.drizzle);
      expect(trap.observedDiscard()).toBe(false);
      expect(stub.pglite.closeCalls).toBe(0);
    } finally {
      trap.uninstall();
    }
  });
});
