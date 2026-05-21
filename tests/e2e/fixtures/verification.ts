/**
 * Verification-URL extraction helper.
 *
 * The signup route (`apps/web/app/api/auth/signup/route.ts`) logs each
 * verification URL via:
 *
 *   `[signup] verification link for <email>: <url>`
 *
 * We grep the server log file produced by `tests/e2e/run-dev-server.mjs`
 * to recover the URL for a given email. Polls until a match appears or
 * the timeout elapses — `next dev` flushes stdout asynchronously, so
 * the line may take a few hundred ms to appear after the POST returns.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SERVER_LOG = path.join(
  REPO_ROOT,
  '.agent-logs',
  'real-user-tester',
  'server.log',
);

export async function waitForVerificationUrl(
  email: string,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const pollMs = opts.pollMs ?? 200;
  const deadline = Date.now() + timeoutMs;
  const needle = email.toLowerCase();
  // We want the LAST match (most recent token) — if the same email re-runs
  // signup the latter token is the one we should follow.
  const re = new RegExp(
    `\\[signup\\] verification link for ${escapeRegex(needle)}: (https?://[^\\s]+)`,
    'g',
  );

  while (Date.now() < deadline) {
    let contents = '';
    try {
      contents = await readFile(SERVER_LOG, 'utf8');
    } catch {
      // file may not exist yet
    }
    let lastMatch: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(contents)) !== null) {
      lastMatch = m;
    }
    if (lastMatch && lastMatch[1]) {
      return lastMatch[1];
    }
    await sleep(pollMs);
  }
  throw new Error(
    `Timed out (${timeoutMs}ms) waiting for verification URL for ${email}. ` +
      `Check ${SERVER_LOG}.`,
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
