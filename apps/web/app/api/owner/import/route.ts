/**
 * POST /api/owner/import — owner-token ONLY.
 *
 * Loads a previously-exported `version: 1` payload into the database, rebound
 * to the authenticated owner's user-id. The CLI in `scripts/manage.ts` calls
 * this endpoint after a `manage export` dump to restore a backup or to
 * migrate from local pglite → production Supabase.
 *
 * Auth: owner-token ONLY. **Never** accept a session cookie here — this
 * endpoint can rewrite the entire user's data set, and we don't want a
 * stolen session cookie to trigger that. The token is admin-grade.
 *
 * Body shape (validated by `exportPayloadSchema` in `lib/export/index.ts`):
 *   - The full export payload, with `version === 1`.
 *   - Plus options at the body or query level:
 *       - `mode`: 'replace' | 'merge'  (default: 'replace')
 *       - `dryRun`: boolean             (default: false)
 *
 * Atomicity: the import runs inside a single `db.transaction(...)`. Any error
 * rolls everything back. Dry-run short-circuits before the transaction so
 * production data is never touched in that mode.
 *
 * Error model:
 *   - 400 invalid_json
 *   - 400 version_mismatch         — payload.version != 1
 *   - 400 validation_error         — zod schema failed
 *   - 400 owner_mismatch           — payload describes a different user
 *   - 401 missing_token / invalid_token
 *   - 500 import_failed            — transaction threw at the DB layer
 *
 * Response on success:
 *   { ok: true, mode, dryRun, counts: { routines, ... } }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateOwner } from '@/lib/auth/owner';
import { importOwnerData } from '@/lib/export';

export const runtime = 'nodejs';

// Pull the import-control options out of the body (we don't pre-validate the
// rest of the payload here — that's the library's job). Mode + dry-run can
// also be passed as query params for CLI ergonomics: `?mode=merge&dryRun=1`.
const optionsBodySchema = z.object({
  mode: z.enum(['replace', 'merge']).optional(),
  dryRun: z.boolean().optional(),
});

function parseQueryOptions(req: NextRequest): {
  mode?: 'replace' | 'merge';
  dryRun?: boolean;
} {
  const out: { mode?: 'replace' | 'merge'; dryRun?: boolean } = {};
  const mode = req.nextUrl.searchParams.get('mode');
  if (mode === 'replace' || mode === 'merge') out.mode = mode;
  const dryRun = req.nextUrl.searchParams.get('dryRun');
  if (dryRun === 'true' || dryRun === '1') out.dryRun = true;
  if (dryRun === 'false' || dryRun === '0') out.dryRun = false;
  return out;
}

export async function POST(req: NextRequest): Promise<Response> {
  const authResult = await authenticateOwner(req);
  if (!authResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: authResult.error.kind,
        message: authResult.error.message,
      },
      { status: authResult.status },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', message: 'Body must be JSON.' },
      { status: 400 },
    );
  }

  if (typeof json !== 'object' || json === null) {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', message: 'Body must be a JSON object.' },
      { status: 400 },
    );
  }

  // Pull mode + dryRun off the body (won't conflict with payload validation
  // because the library's schema ignores unknown top-level keys). Query
  // params take precedence over body fields so the CLI can override.
  const optionsFromBody = optionsBodySchema.safeParse({
    mode: (json as { mode?: unknown }).mode,
    dryRun: (json as { dryRun?: unknown }).dryRun,
  });
  if (!optionsFromBody.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: optionsFromBody.error.flatten() },
      { status: 400 },
    );
  }
  const queryOpts = parseQueryOptions(req);

  const mode = queryOpts.mode ?? optionsFromBody.data.mode ?? 'replace';
  const dryRun = queryOpts.dryRun ?? optionsFromBody.data.dryRun ?? false;

  let result: Awaited<ReturnType<typeof importOwnerData>>;
  try {
    result = await importOwnerData(authResult.owner.id, json, { mode, dryRun });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: 'import_failed', message },
      { status: 500 },
    );
  }

  if (!result.ok) {
    const status = result.error.kind === 'version_mismatch' ? 400 : 400;
    const body: Record<string, unknown> = {
      ok: false,
      error: result.error.kind,
      message: result.error.message,
    };
    if (result.error.kind === 'validation_error') {
      body.issues = result.error.issues;
    }
    return NextResponse.json(body, { status });
  }

  return NextResponse.json(result, { status: 200 });
}
