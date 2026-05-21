/**
 * Drizzle schema for RoutineForge.
 *
 * Includes the four NextAuth-compatible tables (users, accounts, sessions,
 * verificationTokens). Application tables (routines, habits, etc.) will be added
 * in their respective dispatches.
 *
 * Naming: snake_case for column names in SQL, camelCase for the JS property names.
 * NextAuth expects exact column names on the accounts/sessions/verificationTokens
 * tables — see https://authjs.dev/getting-started/adapters/drizzle — hence the
 * explicit second-arg names below.
 */

import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  primaryKey,
  smallint,
  date,
  uniqueIndex,
  index,
  jsonb,
  boolean,
  check,
} from 'drizzle-orm/pg-core';

// --- Users ------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  // NextAuth uses `emailVerified` — kept as that exact property name.
  emailVerified: timestamp('email_verified', { withTimezone: true, mode: 'date' }),
  // Hashed password for the Credentials provider. Null for users who only use OAuth.
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .default(sql`now()`),
});

// --- OAuth accounts (NextAuth) ---------------------------------------------

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<'oauth' | 'oidc' | 'email' | 'webauthn'>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  }),
);

// --- Sessions (optional — kept for forward flexibility, JWT strategy is default) ---

export const sessions = pgTable('sessions', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: uuid('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
});

// --- Verification tokens (email verification + magic links) ----------------

export const verificationTokens = pgTable(
  'verificationTokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);

// --- Relations -------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

// --- Routines --------------------------------------------------------------
//
// A `routine` is a per-user named collection of per-weekday step lists.
//
// Per-weekday step lists are modelled as rows on `routine_day_steps` keyed by
// (routine_id, weekday, position). Weekday encoding is ISO-style 0..6 where
// **0=Monday, 6=Sunday**. A weekday with ZERO rows = the routine is OFF that
// day (no "rest day" flag needed; absence is the signal).
//
// `archivedAt` is a soft-delete: non-null = hidden from list views. Hard
// delete is reserved for admin maintenance.

export const routines = pgTable(
  'routines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    // IANA timezone (e.g. 'America/Los_Angeles'). Validated at the route layer.
    timezone: text('timezone').notNull(),
    // Free-text grouping label (e.g. "Wellness", "Work"). Nullable = uncategorized.
    // 50-char cap enforced at the validation layer. No indexing yet — the
    // expected list size (per user) makes a sequential scan trivial; revisit
    // if filtered list views become hot paths.
    category: text('category'),
    // Free-text location label (e.g. "home", "gym", "office"). Nullable = no
    // location. NOT a geofence — purely a contextual string. Same 50-char cap.
    location: text('location'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    // Soft delete. Null = active.
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    ownerIdx: index('routines_owner_user_id_idx').on(t.ownerUserId),
  }),
);

// --- Routine day-steps -----------------------------------------------------
//
// Composite ordering: (routine_id, weekday, position). Position is unique
// within a (routine, weekday); on delete we **compact** subsequent positions
// (i.e. fill the gap) — see lib/routines/steps.ts for the helper. Compaction
// chosen over gap-tolerance because it gives the UI a stable, predictable
// numbering with no edge cases for "what does position 7 mean if 4 is gone".

export const routineDaySteps = pgTable(
  'routine_day_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    routineId: uuid('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),
    // 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun (ISO).
    weekday: smallint('weekday').notNull(),
    // Zero-based position within (routine, weekday). `integer` (not `smallint`)
    // because the two-pass shift helpers in lib/routines/steps.ts bump
    // positions by TEMP_OFFSET = 1_000_000 mid-transaction, well beyond
    // smallint's 32_767 ceiling. See `routine_day_steps_routine_weekday_position_unique`.
    position: integer('position').notNull(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    routineWeekdayIdx: index('routine_day_steps_routine_weekday_idx').on(
      t.routineId,
      t.weekday,
    ),
    // Position is unique per (routine, weekday) — prevents duplicate slots.
    positionUnique: uniqueIndex('routine_day_steps_routine_weekday_position_unique').on(
      t.routineId,
      t.weekday,
      t.position,
    ),
  }),
);

// --- Routine step completions ----------------------------------------------
//
// **Row exists = the step is completed for that (user, routine, date).**
// Absence = not completed. `date` is the LOCAL date (no timezone) in the
// routine's IANA timezone — computed at the route layer.
//
// Unique constraint on (step_id, user_id, date) prevents accidental duplicates
// from rapid double-taps / replays.

export const routineStepCompletions = pgTable(
  'routine_step_completions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    routineId: uuid('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),
    stepId: uuid('step_id')
      .notNull()
      .references(() => routineDaySteps.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Local date in routine.timezone; e.g. '2026-05-17'.
    date: date('date').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    stepUserDateUnique: uniqueIndex(
      'routine_step_completions_step_user_date_unique',
    ).on(t.stepId, t.userId, t.date),
    routineDateIdx: index('routine_step_completions_routine_date_idx').on(
      t.routineId,
      t.date,
    ),
  }),
);

// --- Routine relations -----------------------------------------------------

export const routinesRelations = relations(routines, ({ one, many }) => ({
  owner: one(users, { fields: [routines.ownerUserId], references: [users.id] }),
  daySteps: many(routineDaySteps),
  completions: many(routineStepCompletions),
}));

export const routineDayStepsRelations = relations(
  routineDaySteps,
  ({ one, many }) => ({
    routine: one(routines, {
      fields: [routineDaySteps.routineId],
      references: [routines.id],
    }),
    completions: many(routineStepCompletions),
  }),
);

export const routineStepCompletionsRelations = relations(
  routineStepCompletions,
  ({ one }) => ({
    routine: one(routines, {
      fields: [routineStepCompletions.routineId],
      references: [routines.id],
    }),
    step: one(routineDaySteps, {
      fields: [routineStepCompletions.stepId],
      references: [routineDaySteps.id],
    }),
    user: one(users, {
      fields: [routineStepCompletions.userId],
      references: [users.id],
    }),
  }),
);

// --- Habits ----------------------------------------------------------------
//
// A `habit` is a per-user recurring thing the user wants to do on a cadence.
//
// **Cadence** is a discriminated union stored as JSONB. Three kinds:
//
//   - `{ kind: 'daily' }` — due every day.
//   - `{ kind: 'weekly_count', perWeek: 1..7, weekStart: 0..6 }` — due N times
//     per week; user picks which days as they go. `weekStart` defines the week
//     boundary (0=Monday by default; matches the rest of the codebase's ISO
//     weekday encoding).
//   - `{ kind: 'specific_weekdays', weekdays: number[] }` — due on these
//     weekdays only (subset of 0..6, ISO 0=Monday).
//
// Validated at the route layer via the zod discriminated union in
// `lib/validation/habits.ts` — never trust raw JSON from the DB at runtime,
// but the type below is the canonical TS shape.
//
// `archivedAt` is a soft-delete (non-null = hidden from list views). Mirrors
// the routines convention.

export type HabitCadence =
  | { kind: 'daily' }
  | { kind: 'weekly_count'; perWeek: number; weekStart: number }
  | { kind: 'specific_weekdays'; weekdays: number[] };

export const habits = pgTable(
  'habits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    // IANA timezone (e.g. 'America/Los_Angeles'). All streak / "today" math
    // happens in this timezone. Validated at the route layer.
    timezone: text('timezone').notNull(),
    // Discriminated union — see HabitCadence above. Stored as JSONB so we can
    // query / index later if needed.
    cadence: jsonb('cadence').$type<HabitCadence>().notNull(),
    // Free-text grouping label, mirrors routines.category. Nullable = uncategorized.
    // 50-char cap enforced at the validation layer.
    category: text('category'),
    // Free-text location label, mirrors routines.location. Nullable = no location.
    // 50-char cap enforced at the validation layer.
    location: text('location'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    // Soft delete. Null = active.
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    ownerIdx: index('habits_owner_user_id_idx').on(t.ownerUserId),
  }),
);

// --- Habit completions -----------------------------------------------------
//
// **Row exists = the habit is completed for that (user, date).** Absence =
// not completed. `date` is the LOCAL date (no timezone) in the habit's IANA
// timezone — computed at the route layer.
//
// Unique constraint on (habit_id, user_id, date) makes mark-as-done
// idempotent and prevents rapid double-taps from creating duplicates.

export const habitCompletions = pgTable(
  'habit_completions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    habitId: uuid('habit_id')
      .notNull()
      .references(() => habits.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Local date in habit.timezone; e.g. '2026-05-17'.
    date: date('date').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    habitUserDateUnique: uniqueIndex(
      'habit_completions_habit_user_date_unique',
    ).on(t.habitId, t.userId, t.date),
    habitDateIdx: index('habit_completions_habit_date_idx').on(t.habitId, t.date),
  }),
);

// --- Habit relations -------------------------------------------------------

export const habitsRelations = relations(habits, ({ one, many }) => ({
  owner: one(users, { fields: [habits.ownerUserId], references: [users.id] }),
  completions: many(habitCompletions),
}));

export const habitCompletionsRelations = relations(
  habitCompletions,
  ({ one }) => ({
    habit: one(habits, {
      fields: [habitCompletions.habitId],
      references: [habits.id],
    }),
    user: one(users, {
      fields: [habitCompletions.userId],
      references: [users.id],
    }),
  }),
);

// --- Push subscriptions ----------------------------------------------------
//
// One row per (user, browser endpoint). The browser-issued `endpoint` URL is
// globally unique (it's a long opaque path under fcm.googleapis.com /
// updates.push.services.mozilla.com / etc.) so it's a natural primary key for
// dedup. We add a unique index on `endpoint` to make upsert-by-endpoint cheap
// and to enforce one row per device.
//
// `p256dh` + `auth` are the ECDSA + HMAC keys produced by the browser's
// `pushManager.subscribe({ userVisibleOnly: true })`. Stored verbatim
// (base64url strings); `web-push` expects them in this shape.
//
// `lastSeenAt` is bumped on every upsert so we can later garbage-collect
// long-dormant subscriptions (not in this dispatch).

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Browser-issued push endpoint URL. Unique across all rows globally — the
    // browser guarantees this is opaque + unique per subscription.
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    // Optional UA string for the account "Devices: 2" display. Captured at
    // subscribe-time on the client.
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    endpointUnique: uniqueIndex('push_subscriptions_endpoint_unique').on(t.endpoint),
    userIdx: index('push_subscriptions_user_id_idx').on(t.userId),
  }),
);

// --- Notification schedules ------------------------------------------------
//
// One shape; polymorphic via CHECK constraint: exactly one of (routineId,
// habitId) must be non-null. This keeps queries simple (single table to
// scan in the dispatcher) and lets us add new subject kinds without
// schema work — just a new nullable FK + an updated CHECK.
//
// `time` is stored as plain "HH:MM" text. The dispatcher resolves it to the
// subject's IANA timezone (routine.timezone / habit.timezone) at fire time so
// that DST flips are handled by the same `Intl.DateTimeFormat` machinery we
// use elsewhere.
//
// `weekdays` is a JSONB array of ISO 0..6 integers (0=Mon..6=Sun). JSONB
// rather than `integer[]` so the column shape is portable to non-Postgres
// targets and so we don't need a separate Drizzle pg-array type import.
//
// `enabled` defaults to true; setting false pauses the schedule without
// deleting it.

export const notificationSchedules = pgTable(
  'notification_schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    routineId: uuid('routine_id').references(() => routines.id, {
      onDelete: 'cascade',
    }),
    habitId: uuid('habit_id').references(() => habits.id, {
      onDelete: 'cascade',
    }),
    // "HH:MM" 24-hour local time. Validated as /^([01]\d|2[0-3]):([0-5]\d)$/
    // at the route layer.
    time: text('time').notNull(),
    // Subset of 0..6 ISO weekdays.
    weekdays: jsonb('weekdays').$type<number[]>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    // Exactly one subject FK is non-null. SQL-side guard so a stray client
    // can't slip both / neither.
    subjectXorCheck: check(
      'notification_schedules_subject_xor_check',
      sql`(
        (${t.routineId} IS NOT NULL AND ${t.habitId} IS NULL)
        OR
        (${t.routineId} IS NULL AND ${t.habitId} IS NOT NULL)
      )`,
    ),
    userIdx: index('notification_schedules_user_id_idx').on(t.userId),
    routineIdx: index('notification_schedules_routine_id_idx').on(t.routineId),
    habitIdx: index('notification_schedules_habit_id_idx').on(t.habitId),
    // The dispatcher scans `enabled = true` rows every minute — bias the index
    // for that hot path.
    enabledIdx: index('notification_schedules_enabled_idx').on(t.enabled),
  }),
);

// --- Push relations --------------------------------------------------------

export const pushSubscriptionsRelations = relations(
  pushSubscriptions,
  ({ one }) => ({
    user: one(users, {
      fields: [pushSubscriptions.userId],
      references: [users.id],
    }),
  }),
);

export const notificationSchedulesRelations = relations(
  notificationSchedules,
  ({ one }) => ({
    user: one(users, {
      fields: [notificationSchedules.userId],
      references: [users.id],
    }),
    routine: one(routines, {
      fields: [notificationSchedules.routineId],
      references: [routines.id],
    }),
    habit: one(habits, {
      fields: [notificationSchedules.habitId],
      references: [habits.id],
    }),
  }),
);

// --- Inferred types --------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type VerificationToken = typeof verificationTokens.$inferSelect;

export type Routine = typeof routines.$inferSelect;
export type NewRoutine = typeof routines.$inferInsert;
export type RoutineDayStep = typeof routineDaySteps.$inferSelect;
export type NewRoutineDayStep = typeof routineDaySteps.$inferInsert;
export type RoutineStepCompletion = typeof routineStepCompletions.$inferSelect;
export type NewRoutineStepCompletion = typeof routineStepCompletions.$inferInsert;

export type Habit = typeof habits.$inferSelect;
export type NewHabit = typeof habits.$inferInsert;
export type HabitCompletion = typeof habitCompletions.$inferSelect;
export type NewHabitCompletion = typeof habitCompletions.$inferInsert;

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type NotificationSchedule = typeof notificationSchedules.$inferSelect;
export type NewNotificationSchedule = typeof notificationSchedules.$inferInsert;
