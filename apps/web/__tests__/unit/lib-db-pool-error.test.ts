/**
 * Unit tests for the pg.Pool 'error' handler installed in `db/index.ts`.
 *
 * Background — root cause for the EPIPE / 500 flood:
 *
 *   `pg.Pool` emits `'error'` on an idle client whose underlying TCP
 *   connection was closed by the server out-of-band (most commonly when
 *   Supabase's transaction-mode pgbouncer reaps an idle backend). If no
 *   listener is attached, Node's EventEmitter promotes the emit to an
 *   `uncaughtException`, which kills the Next.js dev worker. Once dead,
 *   every subsequent request to that worker errors with EPIPE writing to
 *   the dead socket, and the user sees a flood of 500s across all auth
 *   and API routes until they restart `next dev`.
 *
 * `db/index.ts` now attaches a recovery listener: it logs the error and
 * declines to crash. The next `pool.connect()` allocates a fresh client
 * — that recovery contract lives in `pg` itself, so we only verify our
 * half: emitting `'error'` on the pool does NOT escape as an unhandled
 * exception.
 *
 * Test design:
 *   - The vitest setup file primes `DATABASE_URL`, which forces
 *     `db/index.ts` to take the pg.Pool branch on module-init. That same
 *     branch is what installs our listener. Importing the module is
 *     therefore enough to arm the handler against the cached
 *     `globalThis.__routineforgePool` (which `__tests__/helpers/db.ts`
 *     does NOT touch — that helper builds a pglite-backed Drizzle and
 *     never constructs a pg.Pool).
 *   - To exercise the handler without holding a reference to the
 *     module-internal `pool` instance, we build a fresh `pg.Pool`,
 *     manually attach the same recovery shape, and verify the contract.
 *     This isolates the assertion from any HMR / global-cache leakage
 *     across test files.
 *   - For the integration assertion (that `db/index.ts` actually
 *     attaches the listener), we read `globalThis.__routineforgePool`
 *     after importing `@/db` and check `listenerCount('error') >= 1`.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Pool } from 'pg';

// Importing `@/db` for its side effect: in node env with DATABASE_URL set,
// the module constructs (or reuses) the global pg.Pool and attaches the
// recovery listener. We don't actually use the exported `db` here.
import '@/db';

type GlobalPoolSlot = {
  __routineforgePool?: Pool;
};

function getGlobalPool(): Pool | undefined {
  return (globalThis as unknown as GlobalPoolSlot).__routineforgePool;
}

describe('db pool error recovery — integration', () => {
  it('module init attaches an error listener to the global pg.Pool', () => {
    const pool = getGlobalPool();
    // In test env, DATABASE_URL is set by vitest.setup.ts, so the pg.Pool
    // branch runs and globalThis.__routineforgePool is populated.
    expect(pool).toBeDefined();
    expect(pool!.listenerCount('error')).toBeGreaterThanOrEqual(1);
  });

  it('emitting "error" on the global pool does NOT throw an unhandled exception', () => {
    const pool = getGlobalPool();
    expect(pool).toBeDefined();
    // If the listener weren't attached, `EventEmitter` would re-throw the
    // emitted error synchronously (the "Unhandled 'error' event" path). The
    // listener swallows it via console.error, so `emit` returns true and
    // nothing escapes.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const synthetic = new Error('Connection terminated unexpectedly');
      expect(() => pool!.emit('error', synthetic)).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(
        '[db] idle pg client error (recovering):',
        'Connection terminated unexpectedly',
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('db pool error recovery — listener contract on a fresh Pool', () => {
  // These tests reproduce the same listener shape against a throwaway pool,
  // so the contract is asserted independently of the global-cache state.
  // Each test builds and ends its own pool to avoid cross-test interference.
  let createdPools: Pool[] = [];

  afterEach(async () => {
    // pg.Pool#end is idempotent-ish but can throw if already ended; swallow.
    for (const p of createdPools) {
      try {
        await p.end();
      } catch {
        /* noop */
      }
    }
    createdPools = [];
  });

  function newPool(): Pool {
    const p = new Pool({
      connectionString: 'postgres://stub:stub@127.0.0.1:0/stub',
      max: 1,
    });
    createdPools.push(p);
    return p;
  }

  it('a Pool with no error listener re-throws an emitted error (the bug shape)', () => {
    const pool = newPool();
    // No listener attached — pg.Pool inherits EventEmitter, which throws
    // synchronously on `emit('error', ...)` when listenerCount('error') === 0.
    expect(pool.listenerCount('error')).toBe(0);
    expect(() => pool.emit('error', new Error('Connection terminated unexpectedly'))).toThrow(
      /Connection terminated unexpectedly/,
    );
  });

  it('attaching a recovery listener swallows the emitted error', () => {
    const pool = newPool();
    const seen: string[] = [];
    pool.on('error', (err: Error) => {
      seen.push(err.message);
    });
    expect(pool.listenerCount('error')).toBe(1);
    expect(() =>
      pool.emit('error', new Error('Connection terminated unexpectedly')),
    ).not.toThrow();
    expect(seen).toEqual(['Connection terminated unexpectedly']);
  });

  it('guarding with listenerCount prevents stacked listeners under HMR-style reloads', () => {
    const pool = newPool();
    const handler = (_err: Error) => {
      /* noop */
    };
    // Simulate the guard from db/index.ts: only attach if not already
    // attached. Re-running module-init code under HMR must not pile on
    // duplicate handlers.
    if (pool.listenerCount('error') === 0) pool.on('error', handler);
    if (pool.listenerCount('error') === 0) pool.on('error', handler);
    if (pool.listenerCount('error') === 0) pool.on('error', handler);
    expect(pool.listenerCount('error')).toBe(1);
  });

  it('multiple sequential errors are all absorbed by a single listener', () => {
    const pool = newPool();
    const messages: string[] = [];
    pool.on('error', (err: Error) => {
      messages.push(err.message);
    });
    expect(() => {
      pool.emit('error', new Error('first'));
      pool.emit('error', new Error('second'));
      pool.emit('error', new Error('third'));
    }).not.toThrow();
    expect(messages).toEqual(['first', 'second', 'third']);
  });
});
