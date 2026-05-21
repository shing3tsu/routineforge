#!/usr/bin/env node
/**
 * Spawn `next dev` for the web app and tee stdout+stderr to
 * `.agent-logs/real-user-tester/server.log`. Tests parse that file to
 * extract verification URLs the signup route logs.
 *
 * Why a Node wrapper:
 *   - Playwright's `webServer` block pipes the child's stdout into its own
 *     reporter, which test code can't observe. This wrapper captures stdout
 *     to a file the suite's `verification.ts` helper can grep.
 *   - It also serves as a single place to munge the env we pass to
 *     `next dev` (e.g. stripping Playwright's `FORCE_COLOR` injection).
 *   - PRE-WARM step (added): before spawning `next dev`, we open a PGlite
 *     instance against `RF_LOCAL_DATA_DIR`, run all migrations, sync to
 *     disk, and close it. This works around a pglite-under-Playwright
 *     persistence bug on Windows — when Playwright spawns next dev with
 *     `shell: true` + piped stdio + Windows, the WASM initdb-equivalent
 *     pages don't reliably flush to NodeFS before the first DB-touching
 *     route handler runs, so it fails with
 *     `error: could not open file "base/5/16408": No such file or directory`.
 *     A manual invocation of the same wrapper does NOT hit this bug
 *     (verified empirically), so the actual fault lies somewhere in the
 *     Playwright spawn timing on Windows. Pre-creating the cluster from
 *     this wrapper (a plain `node` process with no Playwright in the
 *     parent chain) sidesteps the bug entirely — by the time `next dev`
 *     opens the same data dir, the cluster + migrations are already
 *     fully persisted on disk.
 *
 * Invoked by `playwright.config.ts → webServer.command`. The first two argv
 * slots are port and host.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const webRoot = path.join(repoRoot, 'apps', 'web');
const logsDir = path.join(repoRoot, '.agent-logs', 'real-user-tester');
mkdirSync(logsDir, { recursive: true });

const logFile = path.join(logsDir, 'server.log');
// `flags: 'w'` — truncate the log at wrapper boot so each Playwright run
// starts with a clean file. globalSetup runs AFTER webServer in Playwright,
// so we can't rely on it to do the truncation.
const out = createWriteStream(logFile, { flags: 'w' });

const port = process.argv[2] ?? '4001';
const host = process.argv[3] ?? '127.0.0.1';

out.write(`[run-dev-server] BOOTING wrapper at ${new Date().toISOString()}\n`);
out.write(
  `[run-dev-server] port=${port} host=${host} ` +
    `RF_LOCAL_DATA_DIR=${process.env.RF_LOCAL_DATA_DIR ?? '(unset)'} ` +
    `AUTH_URL=${process.env.AUTH_URL ?? '(unset)'}\n`,
);

// -----------------------------------------------------------------------
// Wipe + pre-warm step: clear any stale pglite state from a previous run
// (Playwright's globalSetup can't do this because it runs AFTER webServer
// in Playwright's task order), then instantiate pglite at the target data
// dir, run migrations, syncToFs, and close. Mirrors the migration logic
// in `apps/web/db/index.ts` (which would normally do this on first DB-
// touching query inside next dev — but pglite + Playwright + Windows
// races that flush, so we do it up-front here instead).
// -----------------------------------------------------------------------
wipeDataDir();
await prewarmPglite();

out.write(`[run-dev-server] pre-warm complete, spawning next dev...\n`);

// Build a clean env for the child. Strip Playwright's
// `FORCE_COLOR`/`DEBUG_COLORS`/`BROWSER` (DEFAULT_ENVIRONMENT_VARIABLES) —
// they don't affect anything functional in our suite but did affect
// reproducibility while diagnosing the pglite/Playwright issue, so we
// keep them stripped to remove noise.
const childEnv = { ...process.env };
delete childEnv.FORCE_COLOR;
delete childEnv.DEBUG_COLORS;
delete childEnv.BROWSER;

// `pnpm` is `pnpm.cmd` on Windows — `shell: true` so cmd.exe resolves it.
const child = spawn(
  'pnpm',
  ['--filter', 'web', 'exec', 'next', 'dev', '-p', port, '-H', host],
  {
    cwd: repoRoot,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv,
  },
);

// Forward child stdout/stderr to the log file. We deliberately do NOT
// pipe to this wrapper's own process.stdout — Playwright keeps the
// wrapper's stdout pipe open but doesn't actively drain it, so a
// heavily-logging child would fill the kernel buffer and block.
child.stdout.on('data', (chunk) => {
  out.write(chunk);
});
child.stderr.on('data', (chunk) => {
  out.write(chunk);
});

const cleanup = () => {
  if (!child.killed) child.kill();
  out.end();
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

child.on('exit', (code) => {
  out.end();
  process.exit(code ?? 0);
});

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function pgliteDataDir() {
  return path.resolve(
    webRoot,
    process.env.RF_LOCAL_DATA_DIR ?? '.local-data',
  );
}

function wipeDataDir() {
  // Skip if no explicit RF_LOCAL_DATA_DIR — we shouldn't be nuking the
  // user's dev `.local-data/` if someone forgets to set the env var.
  if (!process.env.RF_LOCAL_DATA_DIR) {
    out.write(
      `[run-dev-server] RF_LOCAL_DATA_DIR unset — skipping wipe (safety).\n`,
    );
    return;
  }
  const dataDir = pgliteDataDir();
  try {
    rmSync(dataDir, { recursive: true, force: true });
    out.write(`[run-dev-server] wiped pglite data dir at ${dataDir}\n`);
  } catch (err) {
    // Windows: best-effort. Stale handles from a prior crashed run can
    // hold individual files; pglite will reuse / overwrite the rest.
    out.write(
      `[run-dev-server] wipe of ${dataDir} non-fatal error: ${err}\n`,
    );
  }
}

async function prewarmPglite() {
  const dataDir = pgliteDataDir();
  const migrationsDir = path.resolve(webRoot, 'db', 'migrations');

  out.write(`[run-dev-server] pre-warm pglite at ${dataDir}\n`);

  // Resolve PGlite + drizzle migrator from apps/web's node_modules. We use
  // a require() rooted at apps/web/package.json so we pick up the same
  // versions the runtime uses. Dynamic ESM import of the CJS-style entry
  // points works fine via createRequire().
  const requireFromWeb = createRequire(path.join(webRoot, 'package.json'));
  const { PGlite } = requireFromWeb('@electric-sql/pglite');
  const { readMigrationFiles } = requireFromWeb('drizzle-orm/migrator');

  const pglite = new PGlite({ dataDir });
  try {
    await pglite.waitReady;
    // Flush the initial cluster bootstrap (system catalogs) to disk so any
    // subsequent process opening this dataDir sees a complete on-disk
    // cluster. This is the flush that wasn't reliably happening from
    // inside the Playwright-spawned next dev.
    await pglite.syncToFs();

    const migrations = readMigrationFiles({ migrationsFolder: migrationsDir });
    await pglite.exec('CREATE SCHEMA IF NOT EXISTS drizzle;');
    await pglite.exec(
      `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      );`,
    );
    const applied = await pglite.query(
      'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1',
    );
    const lastTs = applied.rows[0]
      ? Number(applied.rows[0].created_at)
      : -Infinity;

    let appliedCount = 0;
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
        appliedCount++;
      }
    });

    await pglite.syncToFs();
    out.write(
      `[run-dev-server] pre-warm: applied ${appliedCount} new migration(s); ` +
        `total migrations on disk = ${migrations.length}\n`,
    );
  } finally {
    // Release the in-process lock so next dev can open the data dir cleanly.
    try {
      await pglite.close();
    } catch (err) {
      out.write(`[run-dev-server] pglite close error (non-fatal): ${err}\n`);
    }
  }
}

// Suppress "unused" warning for pathToFileURL — kept available for future use.
void pathToFileURL;
