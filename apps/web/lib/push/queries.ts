/**
 * Server-only Drizzle queries for push subscriptions + notification schedules.
 *
 * Route handlers stay thin by composing these helpers. Returns plain row
 * shapes (matching `db/schema.ts` inferred types) unless a specific projection
 * is needed (e.g. listing subscriptions WITHOUT secret keys).
 */

import 'server-only';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import {
  notificationSchedules,
  pushSubscriptions,
  routines,
  habits,
  type NotificationSchedule,
  type PushSubscription,
} from '@/db/schema';
import type { SubjectType } from '@/lib/validation/push';

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/**
 * Shape exposed by GET /api/push/subscriptions. Excludes the secret push
 * keys (p256dh / auth) and the endpoint URL — those are sensitive and only
 * the dispatcher / the originating browser need them.
 */
export type SubscriptionSummary = {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
};

/**
 * Upsert a subscription by endpoint. If the same endpoint already exists
 * (potentially from a different user — e.g. account switch on the same
 * browser), it's re-attached to the current user.
 *
 * `lastSeenAt` is bumped on every call so the dispatcher and the account
 * "Devices" UI can show recency.
 *
 * Returns the canonical row (post-upsert).
 */
export async function upsertSubscription(args: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<PushSubscription> {
  const now = new Date();
  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      userId: args.userId,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent ?? null,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        // Re-bind to the current user on conflict (handles account-switch
        // on the same device + key rotation when the browser regenerates).
        userId: args.userId,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent ?? null,
        lastSeenAt: now,
      },
    })
    .returning();
  // `.returning()` on insert-with-on-conflict guarantees a row.
  return row as PushSubscription;
}

/**
 * Delete a subscription by endpoint, but only if it belongs to the given
 * user. Returns the number of rows deleted (0 or 1). Idempotent.
 */
export async function deleteSubscriptionForUser(
  userId: string,
  endpoint: string,
): Promise<number> {
  const result = await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    )
    .returning({ id: pushSubscriptions.id });
  return result.length;
}

/**
 * List the user's subscriptions for display on the account page.
 *
 * Returns the safe `SubscriptionSummary` shape — never the endpoint URL or
 * the push keys (those are secrets that should not round-trip to the client).
 */
export async function listSubscriptionsForUser(
  userId: string,
): Promise<SubscriptionSummary[]> {
  const rows = await db
    .select({
      id: pushSubscriptions.id,
      userAgent: pushSubscriptions.userAgent,
      createdAt: pushSubscriptions.createdAt,
      lastSeenAt: pushSubscriptions.lastSeenAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(asc(pushSubscriptions.createdAt));
  return rows.map((r) => ({
    id: r.id,
    userAgent: r.userAgent,
    createdAt: r.createdAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Schedule ownership
// ---------------------------------------------------------------------------

/**
 * True if the (subjectType, subjectId) is owned by `userId` and is not
 * archived. Used at schedule-create time to reject schedules for things the
 * caller doesn't own.
 *
 * We deliberately don't surface "doesn't exist" vs "not yours" — caller
 * collapses both into a 404 to avoid id-leakage (mirrors routines/habits).
 */
export async function userOwnsSubject(
  userId: string,
  subjectType: SubjectType,
  subjectId: string,
): Promise<boolean> {
  if (subjectType === 'routine') {
    const [row] = await db
      .select({ id: routines.id })
      .from(routines)
      .where(
        and(
          eq(routines.id, subjectId),
          eq(routines.ownerUserId, userId),
          isNull(routines.archivedAt),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
  const [row] = await db
    .select({ id: habits.id })
    .from(habits)
    .where(
      and(
        eq(habits.id, subjectId),
        eq(habits.ownerUserId, userId),
        isNull(habits.archivedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// Schedules CRUD
// ---------------------------------------------------------------------------

/**
 * Wire-shape schedule row. Routine/habit ids are surfaced separately rather
 * than collapsed into a `subject` discriminated union so the client can
 * cheaply filter by either; the polymorphic-table design pays for itself
 * here.
 */
export type ScheduleResponse = {
  id: string;
  routineId: string | null;
  habitId: string | null;
  time: string;
  weekdays: number[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

function toResponse(row: NotificationSchedule): ScheduleResponse {
  return {
    id: row.id,
    routineId: row.routineId,
    habitId: row.habitId,
    time: row.time,
    weekdays: row.weekdays,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * List schedules for a user. When `subjectType + subjectId` are provided,
 * restricts to that subject; otherwise returns all.
 */
export async function listSchedulesForUser(
  userId: string,
  filter?: { subjectType: SubjectType; subjectId: string },
): Promise<ScheduleResponse[]> {
  const conditions = [eq(notificationSchedules.userId, userId)];
  if (filter) {
    if (filter.subjectType === 'routine') {
      conditions.push(eq(notificationSchedules.routineId, filter.subjectId));
    } else {
      conditions.push(eq(notificationSchedules.habitId, filter.subjectId));
    }
  }
  const rows = await db
    .select()
    .from(notificationSchedules)
    .where(and(...conditions))
    .orderBy(asc(notificationSchedules.createdAt));
  return rows.map(toResponse);
}

/** Find one schedule owned by the user; null otherwise. */
export async function findScheduleForUser(
  scheduleId: string,
  userId: string,
): Promise<NotificationSchedule | null> {
  const [row] = await db
    .select()
    .from(notificationSchedules)
    .where(
      and(
        eq(notificationSchedules.id, scheduleId),
        eq(notificationSchedules.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Insert one schedule. Caller must have already verified subject ownership. */
export async function insertSchedule(args: {
  userId: string;
  subjectType: SubjectType;
  subjectId: string;
  time: string;
  weekdays: number[];
  enabled: boolean;
}): Promise<ScheduleResponse> {
  const [row] = await db
    .insert(notificationSchedules)
    .values({
      userId: args.userId,
      routineId: args.subjectType === 'routine' ? args.subjectId : null,
      habitId: args.subjectType === 'habit' ? args.subjectId : null,
      time: args.time,
      weekdays: args.weekdays,
      enabled: args.enabled,
    })
    .returning();
  return toResponse(row as NotificationSchedule);
}

/**
 * Patch one schedule. Caller has already verified ownership (see
 * `findScheduleForUser`). At least one field must be in `patch`.
 */
export async function updateScheduleById(
  scheduleId: string,
  patch: { time?: string; weekdays?: number[]; enabled?: boolean },
): Promise<ScheduleResponse> {
  const now = new Date();
  const [row] = await db
    .update(notificationSchedules)
    .set({ ...patch, updatedAt: now })
    .where(eq(notificationSchedules.id, scheduleId))
    .returning();
  return toResponse(row as NotificationSchedule);
}

/** Delete one schedule. Always succeeds (idempotent). */
export async function deleteScheduleForUser(
  scheduleId: string,
  userId: string,
): Promise<number> {
  const result = await db
    .delete(notificationSchedules)
    .where(
      and(
        eq(notificationSchedules.id, scheduleId),
        eq(notificationSchedules.userId, userId),
      ),
    )
    .returning({ id: notificationSchedules.id });
  return result.length;
}

