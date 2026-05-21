/**
 * Playwright global setup.
 *
 * Responsibilities:
 *   1. Clear the saved auth state file so the setup project re-runs the
 *      full signup/verify/login flow.
 *
 * NOTE: pglite data-dir wipe is handled by `run-dev-server.mjs` BEFORE it
 * spawns next dev — globalSetup runs AFTER webServer in Playwright's task
 * order, so wiping here would either be too late (next dev's pglite would
 * already have opened the dir) or would race with the running server.
 *
 * NOTE: we also do NOT truncate the server log here. Playwright's webServer
 * is started BEFORE globalSetup runs, so truncating would erase the
 * server's boot lines (including the verification URL the auth setup
 * fixture greps for). The wrapper opens the file in 'w' mode (truncate)
 * before writing its own marker, which is the right place to clear it.
 */
import { rm, mkdir } from 'node:fs/promises';
import path from 'node:path';

export default async function globalSetup(): Promise<void> {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const authStateFile = path.join(repoRoot, 'tests', 'e2e', '.auth', 'owner.json');
  const logsDir = path.join(repoRoot, '.agent-logs', 'real-user-tester');

  try {
    await rm(authStateFile, { force: true });
  } catch {
    // ignore
  }

  await mkdir(logsDir, { recursive: true });
}
