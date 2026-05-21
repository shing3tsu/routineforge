/**
 * Drizzle client. Dispatches to one of two drivers:
 *
 * 1. **`pg.Pool` + `drizzle-orm/node-postgres`** — used whenever `DATABASE_URL`
 *    is set. Production always takes this path; dev does too if the user has
 *    pointed it at a real Postgres (Supabase, Docker, etc.).
 *
 * 2. **PGlite + `drizzle-orm/pglite`** — used in dev *only* (`NODE_ENV !==
 *    'production'`) when `DATABASE_URL` is unset. Persists to a local folder
 *    (`apps/web/.local-data/`, gitignored) so the app is runnable end-to-end
 *    without provisioning external Postgres. Migrations under `db/migrations/`
 *    are applied automatically on first boot via Drizzle's pglite migrator.
 *
 * Server-only. Do not import from client components.
 *
 * Build-time tolerance: `next build` runs page-data collection that imports
 * route handlers (and `@/auth`, which instantiates the Drizzle adapter against
 * `db`). Throwing at module-import time would break the build in sandboxes
 * without `DATABASE_URL`. The pg.Pool path registers against a stub URL — pg
 * is lazy and only resolves on first query — and the pglite path defers any
 * disk I/O until the first actual query. So neither path connects during
 * build.
 *
 * Production strictness: if `NODE_ENV === 'production'` and `DATABASE_URL`
 * is unset, the first real query throws a loud error (the original
 * behavior). The pglite fallback is dev-only.
 */

import 'server-only';
import path from 'node:path';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const USE_PGLITE = !DATABASE_URL && !IS_PRODUCTION;

// Path the pglite branch persists data to. Resolved from `process.cwd()`,
// which Next.js sets to the app root (`apps/web`) for both `next dev` and
// `next build`. Using `__dirname` is unreliable here because webpack rewrites
// it inside bundled server output. `.local-data` is listed in the repo
// .gitignore so the folder never gets committed.
//
// Test-affordance only: `RF_LOCAL_DATA_DIR` may override the data dir so
// Playwright E2E runs can use a separate pglite folder. The Playwright
// suite shipped in this repo doesn't currently use it (it shares the dev
// DB instead — see `playwright.config.ts` for the why), but the env-var
// is left in place so a future agent can wire up isolation once the
// pglite-fresh-dir Windows persistence bug is resolved.
const PGLITE_DATA_DIR = path.resolve(
  process.cwd(),
  process.env.RF_LOCAL_DATA_DIR ?? '.local-data',
);
const PGLITE_MIGRATIONS_DIR = path.resolve(process.cwd(), 'db', 'migrations');

// In Next.js dev, `next dev` hot-reloads modules. Reuse a single Pool / pglite
// instance per process to avoid leaking connections (pg) or holding multiple
// file locks on the same data dir (pglite).
//
// The pglite cache holds the underlying pglite instance + the Drizzle client
// + a `health` marker. After many hours of `next dev`, the WASM Postgres can
// enter an aborted state (Emscripten `RuntimeError: Aborted()`), at which
// point the instance is permanently unusable. `health` flips to `'dead'` and
// `getPgliteDb()` rebuilds the cache from scratch on the next access — see
// `markPgliteDead()` for the matcher and `getPgliteDb()` for recovery.
type PgliteCache = {
  pglite: PGlite;
  drizzle: NodePgDatabase<typeof schema>;
  health: 'alive' | 'dead';
};

declare global {
  var __routineforgePool: Pool | undefined;
  var __routineforgePgliteCache: PgliteCache | undefined;
}

let dbInstance: NodePgDatabase<typeof schema>;

if (USE_PGLITE) {
  // Build a transparent Proxy whose property access always defers to the
  // CURRENT live pglite-backed Drizzle client. Holding a stale reference would
  // defeat the recovery path: callers that imported `db` once at module-init
  // time (e.g. `auth.ts`'s `DrizzleAdapter(db, ...)`) need to keep working
  // after a recreation. The Proxy is cheap because every property access
  // already resolves through Drizzle's own indirection.
  dbInstance = new Proxy({} as NodePgDatabase<typeof schema>, {
    get(_target, prop, receiver) {
      const live = getPgliteDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = Reflect.get(live as any, prop, receiver);
      // Re-bind methods to the live instance so `this` doesn't leak the
      // proxy back into Drizzle internals (which would re-enter the trap).
      if (typeof value === 'function') return value.bind(live);
      return value;
    },
    has(_target, prop) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return prop in (getPgliteDb() as any);
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getPgliteDb() as any,
      );
    },
  });
  // First-boot diagnostic emitted lazily on the first real access so we
  // don't print twice during HMR. The cache populator below logs it.
} else {
  // `pg.Pool` accepts any string as `connectionString` and defers actual
  // parsing/connection to the first `pool.connect()` call. So a stub URL is
  // harmless during build-only static analysis; real queries still need
  // DATABASE_URL or they'll fail at `pool.connect()` with the loud error
  // patched in below.
  const STUB_URL_FOR_BUILD = 'postgres://build-stub:build-stub@127.0.0.1:0/build';
  const pool: Pool =
    globalThis.__routineforgePool ??
    new Pool({
      connectionString: DATABASE_URL ?? STUB_URL_FOR_BUILD,
      // Supabase pgbouncer compatibility: keep pool small in serverless-ish envs.
      max: 10,
      // Supabase's transaction-mode pooler holds TCP open; without keepAlive
      // some intermediaries silently drop idle sockets and the next checkout
      // observes a half-closed client.
      keepAlive: true,
      // Match pgbouncer's idle-client reaper: Supabase's pooler closes idle
      // server connections after ~30s. Flushing slightly under that on the
      // client side prevents pg from handing out zombie sockets that will
      // immediately emit `Connection terminated unexpectedly`.
      idleTimeoutMillis: 20_000,
      // Don't wait forever on a hung TCP connection in dev — fail fast and
      // let the route handler return a 5xx instead of stalling the request.
      connectionTimeoutMillis: 10_000,
    });

  if (process.env.NODE_ENV !== 'production') {
    globalThis.__routineforgePool = pool;
  }

  // CRITICAL: attach an 'error' listener to the pool BEFORE any query can run.
  //
  // Background: pg's `Pool` emits 'error' on idle clients whose underlying
  // TCP connection is closed by the server out-of-band — e.g. Supabase's
  // transaction-mode pgbouncer aggressively reaps idle backends. With no
  // listener, Node's EventEmitter promotes the emit to an uncaughtException,
  // which kills the Next.js dev worker. Subsequent requests hit a dead worker
  // pool and the whole process devolves into an EPIPE / 500 flood across all
  // auth + API routes until the user restarts `next dev`.
  //
  // The recovery contract is already implemented inside pg itself: the
  // killed client is removed from the pool, and the NEXT `pool.connect()`
  // simply allocates a fresh one. So all we need to do here is observe the
  // event (log it for diagnosis) and decline to crash.
  //
  // Guard with `listenerCount` because under Next.js HMR this module re-
  // evaluates while `globalThis.__routineforgePool` is reused — we must not
  // stack a new listener on every reload (would eventually exceed the
  // default `maxListeners` warning threshold and leak closures).
  if (pool.listenerCount('error') === 0) {
    pool.on('error', (err) => {
      // Pool#error fires on idle clients only; in-flight queries reject
      // through their own promise. Just log and let pg recycle the slot.
      console.error('[db] idle pg client error (recovering):', err.message);
    });
  }

  // Wrap the actual `pool.connect`/`pool.query` so the first real attempt to
  // talk to the database without DATABASE_URL set fails with the original
  // error message (not a cryptic ECONNREFUSED on 127.0.0.1:0). This branch
  // only fires in production, since dev-without-DATABASE_URL uses pglite.
  if (!DATABASE_URL) {
    const thrower = () => {
      throw new Error(
        'DATABASE_URL is not set. Copy apps/web/.env.example to apps/web/.env.local and fill it in.',
      );
    };
    // Cast to `any` to satisfy both Pool#connect overload signatures (the
    // callback variant doesn't return a value).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pool.connect = thrower as any;
    // `pool.query` also bypasses connect on prepared statements — patch it too.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pool.query = thrower as any;
  }

  dbInstance = drizzlePg(pool, { schema });
}

/**
 * Match the Emscripten / pglite "the WASM runtime is permanently dead" error
 * signature. The exact message we observe in long-running dev sessions is
 * `RuntimeError: Aborted(). Build with -sASSERTIONS for more info.` — any
 * future variant on the same theme should also flip the cache to dead.
 *
 * We intentionally match on the stringified error rather than `instanceof
 * WebAssembly.RuntimeError` so we don't have to chase pglite's internal error
 * wrapping. The string check is cheap and resilient to that wrapping.
 *
 * Exported for the unit test under `__tests__/unit/db-pglite-recovery.test.ts`.
 */
export function isPgliteFatalError(err: unknown): boolean {
  if (!err) return false;
  // Common shape: { name: 'RuntimeError', message: 'Aborted(). ...' }.
  const e = err as { name?: unknown; message?: unknown };
  const name = typeof e.name === 'string' ? e.name : '';
  const message = typeof e.message === 'string' ? e.message : String(err);
  const haystack = `${name}: ${message}`;
  return /Aborted\(\)|RuntimeError|out of memory|memory access out of bounds/i.test(
    haystack,
  );
}

/**
 * Returns the current live pglite-backed Drizzle client, rebuilding the
 * cache slot if the previous instance is dead.
 *
 * "Dead" means either:
 *   - `pglite.closed === true` (pglite's own shutdown signal), or
 *   - one of its `query`/`exec`/`transaction` calls threw an error matching
 *     `isPgliteFatalError(...)`, which flipped `health` to `'dead'` via the
 *     gated proxy wrapper.
 *
 * Recovery is best-effort: we close the corpse (`pglite.close()` may itself
 * throw on a fully-aborted WASM heap, hence the try/catch) and instantiate
 * a fresh pglite + Drizzle wrapper. Any in-flight requests that observed
 * the abort still fail; only SUBSEQUENT requests get a healthy instance.
 * Retrying the failed request is the caller's job — for the dev push
 * scheduler that's automatic (next 60s tick).
 *
 * Exported for the unit test.
 */
export function getPgliteDb(): NodePgDatabase<typeof schema> {
  let cached = globalThis.__routineforgePgliteCache;
  if (cached) {
    const closed = (() => {
      try {
        return cached!.pglite.closed === true;
      } catch {
        // Reading `.closed` on an aborted WASM heap can itself throw. Treat
        // any throw here as "definitely dead".
        return true;
      }
    })();
    if (cached.health === 'dead' || closed) {
      console.warn(
        '[db] pglite instance is dead — discarding and recreating.',
      );
      try {
        // Best-effort cleanup. Swallow because the close path can also
        // throw against an aborted heap, and we don't want recovery to
        // double-fault.
        void cached.pglite.close();
      } catch {
        /* noop */
      }
      cached = undefined;
      globalThis.__routineforgePgliteCache = undefined;
    }
  }
  if (!cached) {
    cached = createPgliteCache();
    globalThis.__routineforgePgliteCache = cached;
    // First-boot / post-recovery diagnostic — surface the fallback so devs
    // know they're not using a real Postgres. Quiet enough not to spam test
    // runs (tests stub DATABASE_URL via vitest.setup.ts and so never hit
    // this branch).
    console.info(
      `[db] DATABASE_URL not set in dev — using pglite at ${PGLITE_DATA_DIR}`,
    );
  }
  return cached.drizzle;
}

/**
 * Test-only helper: flip the current cache to `health: 'dead'` without
 * actually aborting the WASM heap. The next `getPgliteDb()` call will then
 * exercise the recovery path. Used by the recovery unit test.
 */
export function __markPgliteDeadForTests(): void {
  const cached = globalThis.__routineforgePgliteCache;
  if (cached) cached.health = 'dead';
}

/**
 * Build the pglite-backed Drizzle client and arm an async migration step
 * that runs on first boot. Queries issued before migration completes are
 * gated through a Proxy around the pglite instance — Drizzle's client view
 * sees `query`/`exec`/`transaction` methods that first await a one-shot
 * `migrationPromise`, so callers don't need to know about the async
 * bootstrap. See the longer comment on `gatedClient` below for why a Proxy
 * (and not a method patch on pglite itself).
 *
 * Returns the cache record (pglite + drizzle + health). The pglite handle is
 * retained so dead-state recovery can `close()` it and discard the slot;
 * `health` is updated in-place by the gated proxy whenever a query throws a
 * fatal-runtime error.
 */
function createPgliteCache(): PgliteCache {
  // Lazy-load pglite + its Drizzle adapter so the production code path (which
  // doesn't take this branch) doesn't get a module-init hit. `require` keeps
  // the import synchronous so we can return a ready Drizzle client.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require('@electric-sql/pglite') as typeof import('@electric-sql/pglite');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle: drizzlePglite } = require('drizzle-orm/pglite') as typeof import('drizzle-orm/pglite');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readMigrationFiles } = require('drizzle-orm/migrator') as typeof import('drizzle-orm/migrator');

  const pglite = new PGlite({ dataDir: PGLITE_DATA_DIR });

  // The cache record this function ultimately returns. Constructed up-front
  // so closures below (the gated proxy's catch arm, the migration error
  // handler) can flip `cacheRecord.health = 'dead'` without forward-refs.
  const cacheRecord: PgliteCache = {
    pglite,
    // Filled in after `drizzlePglite(gatedClient, ...)` resolves.
    drizzle: undefined as unknown as NodePgDatabase<typeof schema>,
    health: 'alive',
  };

  // One-shot migration promise. Applied directly against the raw pglite
  // instance (NOT through the gated proxy below), so the migration's
  // own queries never wait on themselves. The behaviour mirrors
  // `drizzle-orm/pglite/migrator` (CREATE SCHEMA drizzle, track applied
  // hashes in drizzle.__drizzle_migrations, skip already-applied entries).
  //
  // Final step calls `pglite.syncToFs()` to flush the WAL + in-memory
  // pages to disk. This is REQUIRED for Playwright E2E runs: when
  // Playwright's `webServer` block spawns `next dev` with a fresh
  // `RF_LOCAL_DATA_DIR`, the first DB-touching query was failing with
  // `error: could not open file "base/5/16408": No such file or directory`
  // because pglite's in-memory cluster bootstrap never flushed to disk
  // before that query arrived. Manual shell invocation didn't repro
  // because the cluster had time to flush before the curl hit it. An
  // explicit `syncToFs()` after migrations forces durability before any
  // route handler sees the gated client. It's idempotent and cheap on a
  // small DB, so it's safe to run unconditionally (also helps dev hot-
  // reloads land cleanly).
  const migrationPromise: Promise<void> = (async () => {
    await pglite.waitReady;
    // Flush the INITIAL cluster bootstrap (system catalogs) to disk
    // before running any DDL/DML. Under Playwright's spawn timing, the
    // initdb-equivalent in-memory pages weren't being persisted, so the
    // first query couldn't find base/5/* on disk.
    await pglite.syncToFs();
    const migrations = readMigrationFiles({
      migrationsFolder: PGLITE_MIGRATIONS_DIR,
    });
    await pglite.exec('CREATE SCHEMA IF NOT EXISTS drizzle;');
    await pglite.exec(
      `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      );`,
    );
    const applied = await pglite.query<{ hash: string; created_at: string }>(
      'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1',
    );
    const lastTs = applied.rows[0]
      ? Number(applied.rows[0].created_at)
      : -Infinity;
    await pglite.transaction(async (tx) => {
      for (const migration of migrations) {
        if (migration.folderMillis <= lastTs) continue;
        for (const stmt of migration.sql) {
          await tx.exec(stmt);
        }
        await tx.query(
          'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
          [migration.hash, migration.folderMillis],
        );
      }
    });
    // Flush migrations + bootstrap pages to disk so any subsequent
    // process / cold restart picks up a complete on-disk cluster.
    await pglite.syncToFs();
  })().catch((err: unknown) => {
    console.error('[db] pglite migration failed', err);
    // If the migration itself trips a WASM abort, mark the cache dead so
    // the next access rebuilds rather than awaiting a dead promise forever.
    if (isPgliteFatalError(err)) cacheRecord.health = 'dead';
    throw err;
  });

  // Gate Drizzle's path to pglite at the PROXY boundary, not by replacing
  // methods on pglite itself. PGlite's WASM bootstrap calls `this.query()`
  // internally (e.g. `_initArrayTypes`) — patching the instance method
  // creates a re-entrant deadlock because that internal call would also
  // await the migration promise, which can't resolve until the bootstrap
  // completes.
  //
  // The proxy is the *Drizzle session's* view of the client; pglite's own
  // `this.X` calls hit the real instance and skip the gate. Drizzle calls
  // only ever go through `query` / `exec` / `transaction`, so those are
  // the only properties we wrap.
  const gatedClient = new Proxy(pglite, {
    get(target, prop) {
      if (prop === 'query' || prop === 'exec' || prop === 'transaction') {
        const original = Reflect.get(target, prop, target) as (
          ...a: unknown[]
        ) => Promise<unknown>;
        const bound = original.bind(target);
        return async (...args: unknown[]) => {
          await migrationPromise;
          try {
            return await bound(...args);
          } catch (err) {
            // If the WASM heap aborted (or pglite reports closed), mark the
            // cache slot so the NEXT request triggers full recreation. The
            // current request still fails — retrying it transparently would
            // be nice but is fragile (any failed `transaction` would re-run
            // side-effects). Callers can retry at their own layer.
            if (isPgliteFatalError(err) || target.closed === true) {
              cacheRecord.health = 'dead';
            }
            throw err;
          }
        };
      }
      return Reflect.get(target, prop, target);
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drizzleClient = drizzlePglite(gatedClient as any, { schema });

  // Structural cast: PgliteDatabase and NodePgDatabase both extend PgDatabase
  // and expose the same query-builder API used everywhere in this app. The
  // only differences live in the underlying session's QueryResultHKT, which
  // application code never references. Centralising the cast here keeps every
  // consumer (auth.ts, route handlers, lib/**) free of `as any`.
  cacheRecord.drizzle = drizzleClient as unknown as NodePgDatabase<typeof schema>;
  return cacheRecord;
}

export const db = dbInstance;
export { schema };
