/**
 * POST /api/owner/export — owner-token ONLY.
 *
 * Dumps the owner's full data set (routines, habits, completions, schedules,
 * the owner's user row + linked OAuth account ids) as a `version: 1` JSON
 * payload. The CLI in `scripts/manage.ts` pipes this to a backup file or to
 * `import` against a different deployment to migrate local → production.
 *
 * Auth model: **owner-token only**. Sessions deliberately cannot trigger this
 * endpoint — a stolen session cookie should NOT be able to exfiltrate the
 * complete data dump. The owner-token is admin-grade; the session is not.
 *
 * Security exclusions enforced at the library layer (`lib/export/index.ts`):
 *   - password hashes (column never selected)
 *   - OAuth refresh / access / id tokens / scope / session_state (never selected)
 *   - session tokens (always empty array in payload)
 *   - verification tokens (always empty array in payload)
 *   - push subscription keys (always empty array in payload)
 *
 * Body (all optional):
 *   { scope?: 'mine' | 'all' }
 *
 *   - `'mine'` (default) → only the owner's data.
 *   - `'all'`            → reserved for future multi-user support. Currently
 *                          throws a 400 in the library because the codebase
 *                          is single-tenant.
 *
 * Response: full export payload as JSON (Content-Type: application/json).
 * No special streaming — single-user data is small. The owner's data even
 * after years of use is well under a few MB; a single response body is fine.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateOwner } from '@/lib/auth/owner';
import { exportOwnerData } from '@/lib/export';

export const runtime = 'nodejs';

const bodySchema = z
  .object({
    scope: z.enum(['mine', 'all']).optional(),
  })
  .optional();

export async function POST(req: NextRequest): Promise<Response> {
  // Owner-token only — bypass withUser intentionally so the session path is
  // not even attempted.
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

  // Body is optional. Allow empty body / missing content-type for a GET-like
  // `curl -X POST /api/owner/export` invocation.
  let json: unknown = undefined;
  const raw = await req.text();
  if (raw.length > 0) {
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { ok: false, error: 'invalid_json', message: 'Body must be JSON.' },
        { status: 400 },
      );
    }
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const scope = parsed.data?.scope ?? 'mine';

  try {
    const payload = await exportOwnerData(authResult.owner.id, { scope });
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: 'export_failed', message },
      { status: 400 },
    );
  }
}
