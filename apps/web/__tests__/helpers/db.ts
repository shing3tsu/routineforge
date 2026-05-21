/**
 * Test DB helper — pglite-backed Drizzle client.
 *
 * Why pglite (and not a Postgres container or TEST_DATABASE_URL):
 *   - Zero infra: no Docker, no network, runs in-process. CI-friendly.
 *   - Same SQL surface area as Postgres for what we test (text, uuid,
 *     timestamps, primary keys, indexes). The auth code uses no Postgres-
 *     specific features beyond `gen_random_uuid()`, which pglite supports.
 *   - The Drizzle pglite adapter exists at `drizzle-orm/pglite`, so we don't
 *     monkey-patch the pg driver.
 *
 * How tests use it:
 *   - Top of each test file: `vi.mock('@/db', () => import('@/__tests__/helpers/db'))`
 *     This swaps the production `db` (pg.Pool against DATABASE_URL) for an
 *     in-memory pglite-backed Drizzle client that exposes the same schema.
 *   - Call `await resetDb()` in `beforeEach` to truncate all tables — fast
 *     and avoids needing to re-apply the migration per test.
 *   - Factory helpers (`makeUser`, `makeVerificationToken`) seed rows.
 *
 * One pglite instance is shared per worker process. We use vitest's
 * `singleFork: true` to keep that single instance simple and predictable.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import * as schema from '@/db/schema';
import type { HabitCadence } from '@/db/schema';

const pglite = new PGlite();
export const db = drizzle(pglite, { schema });
export { schema };

let migrationApplied = false;

/**
 * Apply the schema once for the process. We don't use drizzle-kit migrate
 * because the migration file targets `pg`, references `gen_random_uuid()` (we
 * substitute below), and we just need the tables in place.
 */
async function ensureSchema(): Promise<void> {
  if (migrationApplied) return;
  // Explicit DDL mirrors db/migrations/0000_clumsy_ted_forrester.sql but
  // simplified for pglite's parser (no statement-breakpoints, single CREATEs).
  await pglite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      email text NOT NULL,
      name text,
      image text,
      email_verified timestamp with time zone,
      password_hash text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT users_email_unique UNIQUE(email)
    );

    CREATE TABLE IF NOT EXISTS accounts (
      "userId" uuid NOT NULL,
      type text NOT NULL,
      provider text NOT NULL,
      "providerAccountId" text NOT NULL,
      refresh_token text,
      access_token text,
      expires_at integer,
      token_type text,
      scope text,
      id_token text,
      session_state text,
      CONSTRAINT accounts_pk PRIMARY KEY (provider, "providerAccountId"),
      CONSTRAINT accounts_userId_fk FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      "sessionToken" text PRIMARY KEY NOT NULL,
      "userId" uuid NOT NULL,
      expires timestamp with time zone NOT NULL,
      CONSTRAINT sessions_userId_fk FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "verificationTokens" (
      identifier text NOT NULL,
      token text NOT NULL,
      expires timestamp with time zone NOT NULL,
      CONSTRAINT "verificationTokens_pk" PRIMARY KEY (identifier, token)
    );

    CREATE TABLE IF NOT EXISTS routines (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      owner_user_id uuid NOT NULL,
      name text NOT NULL,
      description text,
      timezone text NOT NULL,
      category text,
      location text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      archived_at timestamp with time zone,
      CONSTRAINT routines_owner_user_id_fk FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS routines_owner_user_id_idx ON routines (owner_user_id);

    CREATE TABLE IF NOT EXISTS routine_day_steps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      routine_id uuid NOT NULL,
      weekday smallint NOT NULL,
      position integer NOT NULL,
      title text NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT routine_day_steps_routine_id_fk FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS routine_day_steps_routine_weekday_idx
      ON routine_day_steps (routine_id, weekday);

    CREATE UNIQUE INDEX IF NOT EXISTS routine_day_steps_routine_weekday_position_unique
      ON routine_day_steps (routine_id, weekday, position);

    CREATE TABLE IF NOT EXISTS routine_step_completions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      routine_id uuid NOT NULL,
      step_id uuid NOT NULL,
      user_id uuid NOT NULL,
      date date NOT NULL,
      completed_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT routine_step_completions_routine_id_fk FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE,
      CONSTRAINT routine_step_completions_step_id_fk FOREIGN KEY (step_id) REFERENCES routine_day_steps(id) ON DELETE CASCADE,
      CONSTRAINT routine_step_completions_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS routine_step_completions_step_user_date_unique
      ON routine_step_completions (step_id, user_id, date);

    CREATE INDEX IF NOT EXISTS routine_step_completions_routine_date_idx
      ON routine_step_completions (routine_id, date);

    CREATE TABLE IF NOT EXISTS habits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      owner_user_id uuid NOT NULL,
      name text NOT NULL,
      description text,
      timezone text NOT NULL,
      cadence jsonb NOT NULL,
      category text,
      location text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      archived_at timestamp with time zone,
      CONSTRAINT habits_owner_user_id_fk FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS habits_owner_user_id_idx ON habits (owner_user_id);

    CREATE TABLE IF NOT EXISTS habit_completions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      habit_id uuid NOT NULL,
      user_id uuid NOT NULL,
      date date NOT NULL,
      completed_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT habit_completions_habit_id_fk FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
      CONSTRAINT habit_completions_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS habit_completions_habit_user_date_unique
      ON habit_completions (habit_id, user_id, date);

    CREATE INDEX IF NOT EXISTS habit_completions_habit_date_idx
      ON habit_completions (habit_id, date);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      user_id uuid NOT NULL,
      endpoint text NOT NULL,
      p256dh text NOT NULL,
      auth text NOT NULL,
      user_agent text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT push_subscriptions_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_unique
      ON push_subscriptions (endpoint);

    CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
      ON push_subscriptions (user_id);

    CREATE TABLE IF NOT EXISTS notification_schedules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      user_id uuid NOT NULL,
      routine_id uuid,
      habit_id uuid,
      time text NOT NULL,
      weekdays jsonb NOT NULL,
      enabled boolean DEFAULT true NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT notification_schedules_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT notification_schedules_routine_id_fk FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE,
      CONSTRAINT notification_schedules_habit_id_fk FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
      CONSTRAINT notification_schedules_subject_xor_check CHECK (
        (routine_id IS NOT NULL AND habit_id IS NULL)
        OR
        (routine_id IS NULL AND habit_id IS NOT NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS notification_schedules_user_id_idx
      ON notification_schedules (user_id);

    CREATE INDEX IF NOT EXISTS notification_schedules_routine_id_idx
      ON notification_schedules (routine_id);

    CREATE INDEX IF NOT EXISTS notification_schedules_habit_id_idx
      ON notification_schedules (habit_id);

    CREATE INDEX IF NOT EXISTS notification_schedules_enabled_idx
      ON notification_schedules (enabled);
  `);
  migrationApplied = true;
}

/** Process-local counter used by `makeStep` for default step titles. */
let stepTitleCounter = 0;
/** Process-local counter used by `makePushSubscription` for unique default endpoints. */
let subEndpointCounter = 0;

/**
 * Truncate all data so each test starts clean. Faster than re-applying DDL.
 */
export async function resetDb(): Promise<void> {
  await ensureSchema();
  // Order: child tables first to dodge FK constraints (CASCADE handles users
  // for accounts/sessions, but TRUNCATE ... CASCADE is the simplest).
  // The routines / habits tables CASCADE off users; we list them explicitly here
  // so the truncate is fast (truncating users would cascade-delete everything
  // but would also potentially leave step-counter state behind in some drivers).
  await pglite.exec(
    'TRUNCATE TABLE notification_schedules, push_subscriptions, habit_completions, habits, routine_step_completions, routine_day_steps, routines, users, accounts, sessions, "verificationTokens" CASCADE;',
  );
  stepTitleCounter = 0;
  subEndpointCounter = 0;
}

// -- Factories --------------------------------------------------------------

export interface MakeUserInput {
  email?: string;
  name?: string | null;
  password?: string | null; // null → no passwordHash (OAuth-only style)
  verified?: boolean;
  image?: string | null;
}

export interface MakeUserResult {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  emailVerified: Date | null;
}

/**
 * Insert a user row and return its id + the password used.
 */
export async function makeUser(input: MakeUserInput = {}): Promise<MakeUserResult> {
  await ensureSchema();
  const email = (input.email ?? `user-${randomBytes(4).toString('hex')}@example.com`).toLowerCase();
  const password = input.password === null ? null : (input.password ?? 'correct horse battery staple');
  const passwordHash = password ? await bcrypt.hash(password, 4) : null; // cheap rounds for tests
  const emailVerified = input.verified ? new Date() : null;

  const [row] = await db
    .insert(schema.users)
    .values({
      email,
      name: input.name ?? null,
      image: input.image ?? null,
      passwordHash,
      emailVerified,
    })
    .returning({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      passwordHash: schema.users.passwordHash,
      emailVerified: schema.users.emailVerified,
    });

  if (!row) throw new Error('makeUser: insert returned no row');
  return row;
}

export interface MakeTokenInput {
  email: string;
  token?: string;
  /** ms offset from now. Positive = future, negative = expired. Default +1h. */
  expiresInMs?: number;
}

export interface MakeTokenResult {
  email: string;
  token: string;
  expires: Date;
}

export async function makeVerificationToken(input: MakeTokenInput): Promise<MakeTokenResult> {
  await ensureSchema();
  const token = input.token ?? randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + (input.expiresInMs ?? 60 * 60 * 1000));
  await db.insert(schema.verificationTokens).values({
    identifier: input.email.toLowerCase(),
    token,
    expires,
  });
  return { email: input.email.toLowerCase(), token, expires };
}

/**
 * Lookup helpers — saved for tests that need to assert side-effects.
 */
export async function findUserByEmail(email: string) {
  await ensureSchema();
  const [row] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()))
    .limit(1);
  return row;
}

export async function findTokensForEmail(email: string) {
  await ensureSchema();
  return db
    .select()
    .from(schema.verificationTokens)
    .where(eq(schema.verificationTokens.identifier, email.toLowerCase()));
}

/**
 * Raw count for the rare integration assertion that needs it.
 */
export async function countUsers(): Promise<number> {
  await ensureSchema();
  const result = await db.execute(sql`SELECT COUNT(*)::int AS c FROM users`);
  // pglite returns rows of unknown shape; coerce safely.
  const row = (result as { rows?: Array<{ c?: number }> }).rows?.[0];
  return row?.c ?? 0;
}

// -- Routine factories ------------------------------------------------------

export interface MakeRoutineInput {
  ownerUserId: string;
  name?: string;
  description?: string | null;
  timezone?: string;
  category?: string | null;
  location?: string | null;
  archivedAt?: Date | null;
}

export interface MakeRoutineResult {
  id: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  timezone: string;
  category: string | null;
  location: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export async function makeRoutine(input: MakeRoutineInput): Promise<MakeRoutineResult> {
  await ensureSchema();
  const [row] = await db
    .insert(schema.routines)
    .values({
      ownerUserId: input.ownerUserId,
      name: input.name ?? 'Test routine',
      description: input.description ?? null,
      timezone: input.timezone ?? 'UTC',
      category: input.category ?? null,
      location: input.location ?? null,
      archivedAt: input.archivedAt ?? null,
    })
    .returning();
  if (!row) throw new Error('makeRoutine: insert returned no row');
  return row as MakeRoutineResult;
}

export interface MakeStepInput {
  routineId: string;
  weekday: number;
  position?: number;
  title?: string;
}

export interface MakeStepResult {
  id: string;
  routineId: string;
  weekday: number;
  position: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Insert a step row. When `position` is omitted, auto-positions at the end of
 * the (routine, weekday) bucket by counting existing rows.
 */
export async function makeStep(input: MakeStepInput): Promise<MakeStepResult> {
  await ensureSchema();
  let position = input.position;
  if (position === undefined) {
    const result = await db.execute(
      sql`SELECT COUNT(*)::int AS c FROM routine_day_steps WHERE routine_id = ${input.routineId} AND weekday = ${input.weekday}`,
    );
    const row = (result as { rows?: Array<{ c?: number }> }).rows?.[0];
    position = row?.c ?? 0;
  }
  stepTitleCounter += 1;
  const title = input.title ?? `Test step ${stepTitleCounter}`;
  const [row] = await db
    .insert(schema.routineDaySteps)
    .values({
      routineId: input.routineId,
      weekday: input.weekday,
      position,
      title,
    })
    .returning();
  if (!row) throw new Error('makeStep: insert returned no row');
  return row as MakeStepResult;
}

export interface MakeCompletionInput {
  stepId: string;
  userId: string;
  /** Either a Date (any time, will be formatted as YYYY-MM-DD UTC) or YYYY-MM-DD string. */
  date: Date | string;
  completedAt?: Date;
  /** Optional override for routineId; otherwise resolved from the step row. */
  routineId?: string;
}

export interface MakeCompletionResult {
  id: string;
  routineId: string;
  stepId: string;
  userId: string;
  date: string;
  completedAt: Date;
}

function toYmd(d: Date | string): string {
  if (typeof d === 'string') return d;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function makeCompletion(
  input: MakeCompletionInput,
): Promise<MakeCompletionResult> {
  await ensureSchema();

  let routineId = input.routineId;
  if (!routineId) {
    const result = await db.execute(
      sql`SELECT routine_id AS rid FROM routine_day_steps WHERE id = ${input.stepId}`,
    );
    const row = (result as { rows?: Array<{ rid?: string }> }).rows?.[0];
    if (!row?.rid) {
      throw new Error(`makeCompletion: step ${input.stepId} not found`);
    }
    routineId = row.rid;
  }

  const dateStr = toYmd(input.date);
  const [row] = await db
    .insert(schema.routineStepCompletions)
    .values({
      routineId,
      stepId: input.stepId,
      userId: input.userId,
      date: dateStr,
      completedAt: input.completedAt ?? new Date(),
    })
    .returning();
  if (!row) throw new Error('makeCompletion: insert returned no row');
  return row as MakeCompletionResult;
}

/**
 * Lookup helpers for steps / completions.
 */
export async function findStepsByRoutineWeekday(routineId: string, weekday: number) {
  await ensureSchema();
  return db
    .select()
    .from(schema.routineDaySteps)
    .where(
      sql`${schema.routineDaySteps.routineId} = ${routineId} AND ${schema.routineDaySteps.weekday} = ${weekday}`,
    )
    .orderBy(schema.routineDaySteps.position);
}

export async function countCompletions(): Promise<number> {
  await ensureSchema();
  const result = await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM routine_step_completions`,
  );
  const row = (result as { rows?: Array<{ c?: number }> }).rows?.[0];
  return row?.c ?? 0;
}

// -- Habit factories --------------------------------------------------------

export interface MakeHabitInput {
  ownerUserId: string;
  name?: string;
  description?: string | null;
  timezone?: string;
  cadence?: HabitCadence;
  category?: string | null;
  location?: string | null;
  archivedAt?: Date | null;
  /** Optional override for createdAt — useful for streak math tests that need
   *  a habit "created in the past". Defaults to now() at DB level. */
  createdAt?: Date;
}

export interface MakeHabitResult {
  id: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  timezone: string;
  cadence: HabitCadence;
  category: string | null;
  location: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export async function makeHabit(input: MakeHabitInput): Promise<MakeHabitResult> {
  await ensureSchema();
  const values: Record<string, unknown> = {
    ownerUserId: input.ownerUserId,
    name: input.name ?? 'Test habit',
    description: input.description ?? null,
    timezone: input.timezone ?? 'UTC',
    cadence: input.cadence ?? { kind: 'daily' },
    category: input.category ?? null,
    location: input.location ?? null,
    archivedAt: input.archivedAt ?? null,
  };
  if (input.createdAt !== undefined) values.createdAt = input.createdAt;
  const [row] = await db
    .insert(schema.habits)
    .values(values as typeof schema.habits.$inferInsert)
    .returning();
  if (!row) throw new Error('makeHabit: insert returned no row');
  return row as MakeHabitResult;
}

export interface MakeHabitCompletionInput {
  habitId: string;
  userId: string;
  /** Either a Date (formatted as UTC YYYY-MM-DD) or a YYYY-MM-DD string. */
  date: Date | string;
  /** Defaults to now(). */
  completedAt?: Date;
}

export interface MakeHabitCompletionResult {
  id: string;
  habitId: string;
  userId: string;
  date: string;
  completedAt: Date;
}

export async function makeHabitCompletion(
  input: MakeHabitCompletionInput,
): Promise<MakeHabitCompletionResult> {
  await ensureSchema();
  const dateStr = toYmd(input.date);
  const [row] = await db
    .insert(schema.habitCompletions)
    .values({
      habitId: input.habitId,
      userId: input.userId,
      date: dateStr,
      completedAt: input.completedAt ?? new Date(),
    })
    .returning();
  if (!row) throw new Error('makeHabitCompletion: insert returned no row');
  return row as MakeHabitCompletionResult;
}

export async function countHabitCompletions(): Promise<number> {
  await ensureSchema();
  const result = await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM habit_completions`,
  );
  const row = (result as { rows?: Array<{ c?: number }> }).rows?.[0];
  return row?.c ?? 0;
}

export async function countHabits(): Promise<number> {
  await ensureSchema();
  const result = await db.execute(sql`SELECT COUNT(*)::int AS c FROM habits`);
  const row = (result as { rows?: Array<{ c?: number }> }).rows?.[0];
  return row?.c ?? 0;
}

// -- Push subscription factory ---------------------------------------------

export interface MakePushSubscriptionInput {
  userId: string;
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  userAgent?: string | null;
  lastSeenAt?: Date;
  createdAt?: Date;
}

export interface MakePushSubscriptionResult {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
}

/**
 * Insert a push_subscriptions row. The default endpoint is unique per call so
 * tests can create N devices without hitting the endpoint UNIQUE constraint.
 */
export async function makePushSubscription(
  input: MakePushSubscriptionInput,
): Promise<MakePushSubscriptionResult> {
  await ensureSchema();
  subEndpointCounter += 1;
  const endpoint =
    input.endpoint ??
    `https://fcm.googleapis.com/fcm/send/test-${randomBytes(8).toString('hex')}-${subEndpointCounter}`;
  const p256dh = input.p256dh ?? randomBytes(32).toString('base64url');
  const auth = input.auth ?? randomBytes(16).toString('base64url');
  const values: Record<string, unknown> = {
    userId: input.userId,
    endpoint,
    p256dh,
    auth,
    userAgent: input.userAgent ?? null,
  };
  if (input.lastSeenAt !== undefined) values.lastSeenAt = input.lastSeenAt;
  if (input.createdAt !== undefined) values.createdAt = input.createdAt;
  const [row] = await db
    .insert(schema.pushSubscriptions)
    .values(values as typeof schema.pushSubscriptions.$inferInsert)
    .returning();
  if (!row) throw new Error('makePushSubscription: insert returned no row');
  return row as MakePushSubscriptionResult;
}

export async function countPushSubscriptions(): Promise<number> {
  await ensureSchema();
  const result = await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM push_subscriptions`,
  );
  const row = (result as { rows?: Array<{ c?: number }> }).rows?.[0];
  return row?.c ?? 0;
}

// -- Notification schedule factory -----------------------------------------

export interface MakeNotificationScheduleInput {
  userId: string;
  routineId?: string | null;
  habitId?: string | null;
  time?: string;
  weekdays?: number[];
  enabled?: boolean;
}

export interface MakeNotificationScheduleResult {
  id: string;
  userId: string;
  routineId: string | null;
  habitId: string | null;
  time: string;
  weekdays: number[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Insert a notification_schedules row. Caller MUST supply exactly one of
 * routineId or habitId — the factory throws otherwise to avoid accidentally
 * violating the CHECK constraint (which would surface as a confusing DB error).
 */
export async function makeNotificationSchedule(
  input: MakeNotificationScheduleInput,
): Promise<MakeNotificationScheduleResult> {
  await ensureSchema();
  const hasRoutine = input.routineId !== undefined && input.routineId !== null;
  const hasHabit = input.habitId !== undefined && input.habitId !== null;
  if (hasRoutine === hasHabit) {
    throw new Error(
      'makeNotificationSchedule: supply exactly one of routineId or habitId.',
    );
  }
  const [row] = await db
    .insert(schema.notificationSchedules)
    .values({
      userId: input.userId,
      routineId: hasRoutine ? (input.routineId as string) : null,
      habitId: hasHabit ? (input.habitId as string) : null,
      time: input.time ?? '08:00',
      weekdays: input.weekdays ?? [0, 1, 2, 3, 4, 5, 6],
      enabled: input.enabled ?? true,
    })
    .returning();
  if (!row) throw new Error('makeNotificationSchedule: insert returned no row');
  return row as MakeNotificationScheduleResult;
}

export async function countNotificationSchedules(): Promise<number> {
  await ensureSchema();
  const result = await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM notification_schedules`,
  );
  const row = (result as { rows?: Array<{ c?: number }> }).rows?.[0];
  return row?.c ?? 0;
}
