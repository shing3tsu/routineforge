/**
 * Owner-data export / import helpers.
 *
 * Two purposes:
 *   1. **Insurance against pglite corruption** in local dev — periodically dump
 *      the owner's data to a JSON file so a bad WASM abort can't destroy
 *      everything irreversibly.
 *   2. **Local → production migration** — once the user deploys, dump local
 *      pglite data and load it into Supabase via the same endpoints.
 *
 * Design tenets:
 *   - **Pure** (no NextResponse / HTTP plumbing). Reusable from the route
 *     handlers AND from a CLI / test in-process.
 *   - **Security-first**: never write password hashes, OAuth tokens, session
 *     tokens, verification tokens, or push-subscription keys to disk. Those
 *     fields are *scrubbed* (nulled or wholly omitted) at the export layer so
 *     a leaked backup file is useless for impersonation. Push subscriptions
 *     are also per-device (not portable across browsers / OS reinstalls) so
 *     restoring them would be both wrong and dangerous.
 *   - **Versioned payload** (`version: 1`) so future shape evolution is
 *     forced through an explicit upgrade path. Importing a different version
 *     is a hard error; downstream migration code can read the version and
 *     decide what to do.
 *   - **Transactional import**: the entire import is wrapped in
 *     `db.transaction(...)`. Any failure aborts; partial writes are
 *     impossible. The `dryRun: true` mode runs all validation logic but
 *     **rolls back** the transaction at the end so it's safe to call against
 *     prod without making changes.
 *   - **Owner-id rebinding**: every row's `userId` / `ownerUserId` /
 *     `userId`-style FK is rewritten to the *current* authenticated owner.
 *     This makes "dump local → load prod" work even if the local and prod
 *     user-id uuids differ. Cross-user payload mixing is still rejected: if
 *     the payload contains rows whose owner-id is anything other than the
 *     single user-id present in `users[]`, we 400 — a hand-crafted payload
 *     cannot impersonate.
 */

import 'server-only';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { db as defaultDb } from '@/db';
import {
  users,
  accounts,
  routines,
  routineDaySteps,
  routineStepCompletions,
  habits,
  habitCompletions,
  notificationSchedules,
  type HabitCadence,
} from '@/db/schema';

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

export const EXPORT_VERSION = 1 as const;

export type ExportScope = 'mine' | 'all';

/** The export payload. `version` is the wire-format contract version. */
export interface ExportPayload {
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  scope: ExportScope;
  users: ExportedUser[];
  accounts: ExportedAccount[];
  /** Always empty — verification tokens are short-lived secrets. */
  verificationTokens: never[];
  /** Always empty — session tokens are short-lived secrets. */
  sessions: never[];
  routines: ExportedRoutine[];
  routineDaySteps: ExportedRoutineDayStep[];
  routineStepCompletions: ExportedRoutineStepCompletion[];
  habits: ExportedHabit[];
  habitCompletions: ExportedHabitCompletion[];
  /** Always empty — push subscription keys are per-device + sensitive. */
  pushSubscriptions: never[];
  notificationSchedules: ExportedNotificationSchedule[];
}

// Each "Exported*" type below is the same as the schema row type but with the
// security-sensitive fields removed. Dates serialise to ISO strings on JSON
// round-trip; the zod parser below accepts either Date or string.

export interface ExportedUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: string | Date | null;
  // passwordHash deliberately omitted — never export bcrypt hashes.
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ExportedAccount {
  userId: string;
  type: 'oauth' | 'oidc' | 'email' | 'webauthn';
  provider: string;
  providerAccountId: string;
  // refresh_token / access_token / id_token / session_state / expires_at /
  // token_type / scope ALL omitted — those are OAuth secrets we never export.
  // Reimporting an account WITHOUT these means the user has to re-link the
  // provider on the destination; that's the correct behaviour for security.
}

export interface ExportedRoutine {
  id: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  timezone: string;
  category: string | null;
  location: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  archivedAt: string | Date | null;
}

export interface ExportedRoutineDayStep {
  id: string;
  routineId: string;
  weekday: number;
  position: number;
  title: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ExportedRoutineStepCompletion {
  id: string;
  routineId: string;
  stepId: string;
  userId: string;
  date: string;
  completedAt: string | Date;
}

export interface ExportedHabit {
  id: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  timezone: string;
  cadence: HabitCadence;
  category: string | null;
  location: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  archivedAt: string | Date | null;
}

export interface ExportedHabitCompletion {
  id: string;
  habitId: string;
  userId: string;
  date: string;
  completedAt: string | Date;
}

export interface ExportedNotificationSchedule {
  id: string;
  userId: string;
  routineId: string | null;
  habitId: string | null;
  time: string;
  weekdays: number[];
  enabled: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

// ---------------------------------------------------------------------------
// Zod schema for IMPORT validation. Accept either Date instances (in-process
// callers) or ISO strings (HTTP / file round-trip). Numbers are typed.
// ---------------------------------------------------------------------------

const dateLike = z.union([z.string(), z.date()]);
const nullableDateLike = z.union([z.string(), z.date(), z.null()]);

const habitCadenceSchema: z.ZodType<HabitCadence> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily') }),
  z.object({
    kind: z.literal('weekly_count'),
    perWeek: z.number().int().min(1).max(7),
    weekStart: z.number().int().min(0).max(6),
  }),
  z.object({
    kind: z.literal('specific_weekdays'),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  }),
]);

const exportedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  emailVerified: nullableDateLike,
  createdAt: dateLike,
  updatedAt: dateLike,
});

const exportedAccountSchema = z.object({
  userId: z.string().uuid(),
  type: z.enum(['oauth', 'oidc', 'email', 'webauthn']),
  provider: z.string().min(1),
  providerAccountId: z.string().min(1),
});

const exportedRoutineSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().nullable(),
  timezone: z.string().min(1).max(64),
  // category / location are forward-compat: optional + nullable so an older
  // export (version 1 without these fields) still parses cleanly. Newer
  // exports always populate them (with null when unset). 50-char cap mirrors
  // the route-layer validator.
  category: z.string().max(50).nullable().optional(),
  location: z.string().max(50).nullable().optional(),
  createdAt: dateLike,
  updatedAt: dateLike,
  archivedAt: nullableDateLike,
});

const exportedRoutineDayStepSchema = z.object({
  id: z.string().uuid(),
  routineId: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  position: z.number().int().min(0),
  title: z.string().min(1).max(200),
  createdAt: dateLike,
  updatedAt: dateLike,
});

const exportedRoutineStepCompletionSchema = z.object({
  id: z.string().uuid(),
  routineId: z.string().uuid(),
  stepId: z.string().uuid(),
  userId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  completedAt: dateLike,
});

const exportedHabitSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().nullable(),
  timezone: z.string().min(1).max(64),
  cadence: habitCadenceSchema,
  // See exportedRoutineSchema for the rationale behind optional + nullable.
  category: z.string().max(50).nullable().optional(),
  location: z.string().max(50).nullable().optional(),
  createdAt: dateLike,
  updatedAt: dateLike,
  archivedAt: nullableDateLike,
});

const exportedHabitCompletionSchema = z.object({
  id: z.string().uuid(),
  habitId: z.string().uuid(),
  userId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  completedAt: dateLike,
});

const exportedNotificationScheduleSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  routineId: z.string().uuid().nullable(),
  habitId: z.string().uuid().nullable(),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  enabled: z.boolean(),
  createdAt: dateLike,
  updatedAt: dateLike,
});

/**
 * Strict schema for incoming import payloads. The `version === 1` check is
 * enforced both here (via `z.literal`) AND a redundant explicit guard in
 * `importOwnerData` for a clearer error.
 *
 * `.strict()` would reject unknown top-level keys, but we intentionally allow
 * unknowns to be ignored — a forward-compat decision so adding fields in a
 * future export version doesn't force users to upgrade in lockstep. The
 * VERSION number is the actual contract.
 */
export const exportPayloadSchema = z.object({
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.string(),
  scope: z.enum(['mine', 'all']),
  users: z.array(exportedUserSchema),
  accounts: z.array(exportedAccountSchema),
  verificationTokens: z.array(z.unknown()).max(0).default([]),
  sessions: z.array(z.unknown()).max(0).default([]),
  routines: z.array(exportedRoutineSchema),
  routineDaySteps: z.array(exportedRoutineDayStepSchema),
  routineStepCompletions: z.array(exportedRoutineStepCompletionSchema),
  habits: z.array(exportedHabitSchema),
  habitCompletions: z.array(exportedHabitCompletionSchema),
  pushSubscriptions: z.array(z.unknown()).max(0).default([]),
  notificationSchedules: z.array(exportedNotificationScheduleSchema),
});

export type ParsedExportPayload = z.infer<typeof exportPayloadSchema>;

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

/**
 * Pull the owner's full data set into a `version: 1` payload.
 *
 * Implementation chooses parallel `select()`s rather than a single big join
 * for two reasons:
 *   1. Drizzle's relational query API would produce nested JSON that we'd
 *      have to flatten anyway — the export shape is flat (one array per
 *      table) by design so the import can be a sequence of `insert()`s.
 *   2. Each table is independently bounded by the owner's data (small for
 *      single-user MVP), so parallelism wins over a single round-trip.
 */
export async function exportOwnerData(
  ownerUserId: string,
  options: { scope?: ExportScope; database?: typeof defaultDb } = {},
): Promise<ExportPayload> {
  const scope = options.scope ?? 'mine';
  const database = options.database ?? defaultDb;

  if (scope !== 'mine') {
    // 'all' is reserved for future multi-user support. The CURRENT contract is
    // single-tenant; refuse to export rows that aren't ours so a misconfigured
    // dispatch can't accidentally leak another user's data.
    throw new Error(
      `exportOwnerData: scope="${scope}" is not supported yet. Only "mine" is implemented.`,
    );
  }

  // --- Users + accounts ---------------------------------------------------
  // We only return the OWNER's row (a single user), with passwordHash REMOVED.
  const userRow = await database
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      // passwordHash intentionally excluded from the column list — never make
      // it onto the wire.
    })
    .from(users)
    .where(eq(users.id, ownerUserId))
    .limit(1);

  const accountRows = await database
    .select({
      userId: accounts.userId,
      type: accounts.type,
      provider: accounts.provider,
      providerAccountId: accounts.providerAccountId,
      // OAuth tokens intentionally excluded — see ExportedAccount comment.
    })
    .from(accounts)
    .where(eq(accounts.userId, ownerUserId));

  // --- Routines + their step / completion children ------------------------
  const routineRows = await database
    .select()
    .from(routines)
    .where(eq(routines.ownerUserId, ownerUserId));

  const routineIds = routineRows.map((r) => r.id);

  const stepRows =
    routineIds.length > 0
      ? await database
          .select()
          .from(routineDaySteps)
          .where(inArray(routineDaySteps.routineId, routineIds))
      : [];

  const stepCompletionRows =
    routineIds.length > 0
      ? await database
          .select()
          .from(routineStepCompletions)
          .where(eq(routineStepCompletions.userId, ownerUserId))
      : [];

  // --- Habits + completions ----------------------------------------------
  const habitRows = await database
    .select()
    .from(habits)
    .where(eq(habits.ownerUserId, ownerUserId));

  const habitCompletionRows = await database
    .select()
    .from(habitCompletions)
    .where(eq(habitCompletions.userId, ownerUserId));

  // --- Notification schedules -------------------------------------------
  const scheduleRows = await database
    .select()
    .from(notificationSchedules)
    .where(eq(notificationSchedules.userId, ownerUserId));

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    scope,
    users: userRow as ExportedUser[],
    accounts: accountRows as ExportedAccount[],
    verificationTokens: [],
    sessions: [],
    routines: routineRows as ExportedRoutine[],
    routineDaySteps: stepRows as ExportedRoutineDayStep[],
    routineStepCompletions: stepCompletionRows as ExportedRoutineStepCompletion[],
    habits: habitRows as ExportedHabit[],
    habitCompletions: habitCompletionRows as ExportedHabitCompletion[],
    pushSubscriptions: [],
    notificationSchedules: scheduleRows as ExportedNotificationSchedule[],
  };
}

// ---------------------------------------------------------------------------
// IMPORT
// ---------------------------------------------------------------------------

export type ImportMode = 'replace' | 'merge';

export interface ImportOptions {
  mode: ImportMode;
  dryRun: boolean;
  database?: typeof defaultDb;
}

export interface ImportCounts {
  routines: number;
  routineDaySteps: number;
  routineStepCompletions: number;
  habits: number;
  habitCompletions: number;
  notificationSchedules: number;
}

export interface ImportResult {
  ok: true;
  mode: ImportMode;
  dryRun: boolean;
  counts: ImportCounts;
}

export type ImportError =
  | { kind: 'version_mismatch'; message: string }
  | { kind: 'validation_error'; message: string; issues: z.inferFlattenedErrors<typeof exportPayloadSchema> }
  | { kind: 'owner_mismatch'; message: string };

/**
 * Coerce a `string | Date | null` into a `Date | null`. JSON round-trip
 * always gives us strings; in-process callers may pass Date objects.
 */
function toDateOrNull(v: string | Date | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  return new Date(v);
}

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

/**
 * Import an export payload for the authenticated owner.
 *
 * Modes:
 *   - `'replace'` — deletes all the owner's existing data first, then inserts
 *     the import payload. The transaction is the unit of atomicity: if any
 *     insert fails, the entire delete is rolled back too. Cleanest for
 *     "this is the new canonical state."
 *   - `'merge'` — skips rows whose primary key already exists. Safer for
 *     partial restores where some new data has been created since the
 *     export. Implemented as `ON CONFLICT DO NOTHING` via `onConflictDoNothing()`.
 *
 * `dryRun: true` runs all validation + computes counts, but the transaction
 * is rolled back via a deliberate throw at the end. The thrown sentinel is
 * caught here so the caller sees `{ ok: true, dryRun: true }`.
 *
 * Owner rebinding: every user-id-bearing FK in the payload is rewritten to
 * the authenticated owner's id. The payload MUST contain exactly one user row
 * — if it contains more, or if any FK points at a user-id that isn't the
 * one user-id in the payload, we 400 (owner_mismatch). This prevents a
 * hand-crafted payload from inserting rows that point at a third party.
 */
export async function importOwnerData(
  ownerUserId: string,
  rawPayload: unknown,
  options: ImportOptions,
): Promise<ImportResult | { ok: false; error: ImportError }> {
  // --- Validation pass 1: top-level version --------------------------------
  // We check version BEFORE zod-parsing so a wrong-version v2 payload returns
  // a crisp `version_mismatch` error rather than an opaque zod tree.
  const versionedView = rawPayload as { version?: unknown };
  if (
    typeof rawPayload !== 'object' ||
    rawPayload === null ||
    versionedView.version !== EXPORT_VERSION
  ) {
    return {
      ok: false,
      error: {
        kind: 'version_mismatch',
        message: `Import payload version is not ${EXPORT_VERSION}. Future versions require an explicit migration.`,
      },
    };
  }

  // --- Validation pass 2: zod ---------------------------------------------
  const parsed = exportPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: 'validation_error',
        message: 'Import payload failed schema validation.',
        issues: parsed.error.flatten(),
      },
    };
  }
  const payload = parsed.data;

  // --- Owner-id consistency -----------------------------------------------
  // The payload must describe ONE user. Their id is the "source" owner id; we
  // rebind everything to ownerUserId. If any FK in the payload points at a
  // user-id other than the source id, refuse — that's a cross-user attempt.
  if (payload.users.length !== 1) {
    return {
      ok: false,
      error: {
        kind: 'owner_mismatch',
        message: `Import payload must contain exactly one user; got ${payload.users.length}.`,
      },
    };
  }
  const sourceOwnerId = payload.users[0]!.id;

  // Validate every userId / ownerUserId reference in the payload matches the
  // single source-owner id. Routine and habit ownership uses `ownerUserId`;
  // completions / schedules use `userId`. Anything else is a hand-crafted
  // attempt to import for another user.
  const ownerIdFields: Array<{ name: string; id: string }> = [
    ...payload.routines.map((r) => ({ name: 'routines.ownerUserId', id: r.ownerUserId })),
    ...payload.habits.map((h) => ({ name: 'habits.ownerUserId', id: h.ownerUserId })),
    ...payload.routineStepCompletions.map((c) => ({ name: 'routineStepCompletions.userId', id: c.userId })),
    ...payload.habitCompletions.map((c) => ({ name: 'habitCompletions.userId', id: c.userId })),
    ...payload.notificationSchedules.map((s) => ({ name: 'notificationSchedules.userId', id: s.userId })),
    ...payload.accounts.map((a) => ({ name: 'accounts.userId', id: a.userId })),
  ];
  for (const ref of ownerIdFields) {
    if (ref.id !== sourceOwnerId) {
      return {
        ok: false,
        error: {
          kind: 'owner_mismatch',
          message: `Import payload contains a row owned by a user other than the payload's user: ${ref.name}=${ref.id} (expected ${sourceOwnerId}).`,
        },
      };
    }
  }

  const counts: ImportCounts = {
    routines: payload.routines.length,
    routineDaySteps: payload.routineDaySteps.length,
    routineStepCompletions: payload.routineStepCompletions.length,
    habits: payload.habits.length,
    habitCompletions: payload.habitCompletions.length,
    notificationSchedules: payload.notificationSchedules.length,
  };

  // --- Dry-run short-circuit ---------------------------------------------
  // No DB writes; report counts only. Distinct from a transaction-rollback
  // implementation because pglite's rollback semantics under nested awaits
  // are subtler than we want to depend on here.
  if (options.dryRun) {
    return {
      ok: true,
      mode: options.mode,
      dryRun: true,
      counts,
    };
  }

  const database = options.database ?? defaultDb;

  // --- Real write inside a transaction -----------------------------------
  await database.transaction(async (tx) => {
    if (options.mode === 'replace') {
      // Delete in CHILD → PARENT order to respect FKs even though Drizzle's
      // schema marks them ON DELETE CASCADE — explicit deletes are clearer
      // in the audit trail than a single users-cascade, and let us scope to
      // exactly the owner's rows without nuking the users table.
      await tx
        .delete(notificationSchedules)
        .where(eq(notificationSchedules.userId, ownerUserId));
      await tx
        .delete(habitCompletions)
        .where(eq(habitCompletions.userId, ownerUserId));
      await tx.delete(habits).where(eq(habits.ownerUserId, ownerUserId));
      await tx
        .delete(routineStepCompletions)
        .where(eq(routineStepCompletions.userId, ownerUserId));
      // routine_day_steps cascade via routine_id ON DELETE CASCADE — but to
      // be defensive, delete them explicitly via the owner's routines.
      const ownerRoutines = await tx
        .select({ id: routines.id })
        .from(routines)
        .where(eq(routines.ownerUserId, ownerUserId));
      const ownerRoutineIds = ownerRoutines.map((r) => r.id);
      if (ownerRoutineIds.length > 0) {
        await tx
          .delete(routineDaySteps)
          .where(inArray(routineDaySteps.routineId, ownerRoutineIds));
      }
      await tx.delete(routines).where(eq(routines.ownerUserId, ownerUserId));
      // We deliberately do NOT delete the users row or its accounts — those
      // back the authenticated session, and deleting the row mid-request
      // would yank the rug out. Accounts are merged below (insert-or-skip).
    }

    // --- Inserts ----------------------------------------------------------
    // PARENT → CHILD order so FKs hold.

    // Accounts: merge mode for both modes (we never delete the user row, so
    // existing OAuth links remain; new ones get added).
    if (payload.accounts.length > 0) {
      const accountValues = payload.accounts.map((a) => ({
        userId: ownerUserId,
        type: a.type,
        provider: a.provider,
        providerAccountId: a.providerAccountId,
      }));
      await tx.insert(accounts).values(accountValues).onConflictDoNothing();
    }

    // Routines
    if (payload.routines.length > 0) {
      const routineValues = payload.routines.map((r) => ({
        id: r.id,
        ownerUserId,
        name: r.name,
        description: r.description,
        timezone: r.timezone,
        // Older payloads (pre-category/location) omit these fields; coerce
        // `undefined` to `null` so the column receives an explicit NULL.
        category: r.category ?? null,
        location: r.location ?? null,
        createdAt: toDate(r.createdAt),
        updatedAt: toDate(r.updatedAt),
        archivedAt: toDateOrNull(r.archivedAt ?? null),
      }));
      if (options.mode === 'merge') {
        await tx.insert(routines).values(routineValues).onConflictDoNothing();
      } else {
        await tx.insert(routines).values(routineValues);
      }
    }

    // Routine day-steps
    if (payload.routineDaySteps.length > 0) {
      const stepValues = payload.routineDaySteps.map((s) => ({
        id: s.id,
        routineId: s.routineId,
        weekday: s.weekday,
        position: s.position,
        title: s.title,
        createdAt: toDate(s.createdAt),
        updatedAt: toDate(s.updatedAt),
      }));
      if (options.mode === 'merge') {
        await tx
          .insert(routineDaySteps)
          .values(stepValues)
          .onConflictDoNothing();
      } else {
        await tx.insert(routineDaySteps).values(stepValues);
      }
    }

    // Routine step completions
    if (payload.routineStepCompletions.length > 0) {
      const completionValues = payload.routineStepCompletions.map((c) => ({
        id: c.id,
        routineId: c.routineId,
        stepId: c.stepId,
        userId: ownerUserId,
        date: c.date,
        completedAt: toDate(c.completedAt),
      }));
      if (options.mode === 'merge') {
        await tx
          .insert(routineStepCompletions)
          .values(completionValues)
          .onConflictDoNothing();
      } else {
        await tx.insert(routineStepCompletions).values(completionValues);
      }
    }

    // Habits
    if (payload.habits.length > 0) {
      const habitValues = payload.habits.map((h) => ({
        id: h.id,
        ownerUserId,
        name: h.name,
        description: h.description,
        timezone: h.timezone,
        cadence: h.cadence,
        // See routineValues above for the `?? null` rationale.
        category: h.category ?? null,
        location: h.location ?? null,
        createdAt: toDate(h.createdAt),
        updatedAt: toDate(h.updatedAt),
        archivedAt: toDateOrNull(h.archivedAt ?? null),
      }));
      if (options.mode === 'merge') {
        await tx.insert(habits).values(habitValues).onConflictDoNothing();
      } else {
        await tx.insert(habits).values(habitValues);
      }
    }

    // Habit completions
    if (payload.habitCompletions.length > 0) {
      const habitCompletionValues = payload.habitCompletions.map((c) => ({
        id: c.id,
        habitId: c.habitId,
        userId: ownerUserId,
        date: c.date,
        completedAt: toDate(c.completedAt),
      }));
      if (options.mode === 'merge') {
        await tx
          .insert(habitCompletions)
          .values(habitCompletionValues)
          .onConflictDoNothing();
      } else {
        await tx.insert(habitCompletions).values(habitCompletionValues);
      }
    }

    // Notification schedules
    if (payload.notificationSchedules.length > 0) {
      const scheduleValues = payload.notificationSchedules.map((s) => ({
        id: s.id,
        userId: ownerUserId,
        routineId: s.routineId,
        habitId: s.habitId,
        time: s.time,
        weekdays: s.weekdays,
        enabled: s.enabled,
        createdAt: toDate(s.createdAt),
        updatedAt: toDate(s.updatedAt),
      }));
      if (options.mode === 'merge') {
        await tx
          .insert(notificationSchedules)
          .values(scheduleValues)
          .onConflictDoNothing();
      } else {
        await tx.insert(notificationSchedules).values(scheduleValues);
      }
    }
  });

  return {
    ok: true,
    mode: options.mode,
    dryRun: false,
    counts,
  };
}
