/**
 * Zod schemas for the push notification API.
 *
 * Validation rules:
 *
 * - `endpoint` is the browser-issued push URL. We don't constrain the host
 *   (FCM, Mozilla, Apple all have different domains) but require a valid
 *   `https:` URL of reasonable length.
 * - `time` is strict "HH:MM" 24h. The dispatcher does exact string compare
 *   against the local minute (formatted via `Intl.DateTimeFormat`) so any
 *   format drift would break firing.
 * - `weekdays` is a non-empty subset of 0..6 (ISO; 0=Mon..6=Sun, matching the
 *   rest of the codebase). De-duped + sorted ascending so DB rows are stable
 *   and downstream `.includes()` checks have a canonical input.
 */

import { z } from 'zod';

// --- Shared primitives ------------------------------------------------------

/** ISO weekday — 0=Mon..6=Sun. Reused across subscription + schedule shapes. */
export const weekdaySchema = z
  .number({ invalid_type_error: 'Weekday must be a number 0..6 (0=Mon, 6=Sun).' })
  .int()
  .min(0)
  .max(6);

/** "HH:MM" 24-hour clock. */
export const timeOfDaySchema = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):([0-5]\d)$/,
    'time must be "HH:MM" 24-hour (e.g. "07:30").',
  );

/** Weekdays array — non-empty, deduped + sorted ascending after parse. */
export const weekdaysListSchema = z
  .array(weekdaySchema)
  .min(1, 'weekdays must contain at least one day.')
  .max(7)
  .transform((arr) => Array.from(new Set(arr)).sort((a, b) => a - b));

/** Subject discriminator for schedule create/list. */
export const subjectTypeSchema = z.enum(['routine', 'habit']);
export type SubjectType = z.infer<typeof subjectTypeSchema>;

// --- Subscriptions ----------------------------------------------------------

/**
 * Browser `PushSubscription.toJSON()` shape. We accept it verbatim from the
 * client — the service worker / `pushManager.subscribe()` produces exactly
 * this shape, and `web-push` expects it back.
 *
 * Endpoint URL: must be `https:`. Mozilla / FCM / Apple all use https
 * endpoints; rejecting non-https avoids a class of mistakes (eg. dev pasting
 * an http URL by hand).
 */
export const subscribePushSchema = z.object({
  endpoint: z
    .string()
    .url('endpoint must be a valid URL.')
    .max(2048)
    .refine(
      (s) => s.startsWith('https://'),
      'endpoint must be an https URL.',
    ),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
  userAgent: z.string().max(512).optional(),
});
export type SubscribePushBody = z.infer<typeof subscribePushSchema>;

/** Body for DELETE /api/push/subscriptions — by endpoint only. */
export const unsubscribePushSchema = z.object({
  endpoint: z
    .string()
    .url('endpoint must be a valid URL.')
    .max(2048),
});
export type UnsubscribePushBody = z.infer<typeof unsubscribePushSchema>;

// --- Schedules --------------------------------------------------------------

/**
 * Query for GET /api/push/schedules. Both params optional — when both are
 * absent, returns ALL schedules for the current user (used by the account /
 * audit screens).
 */
export const schedulesListQuerySchema = z
  .object({
    subjectType: subjectTypeSchema.optional(),
    subjectId: z.string().uuid().optional(),
  })
  .refine(
    (q) => (q.subjectType === undefined) === (q.subjectId === undefined),
    'Either both subjectType and subjectId must be provided, or neither.',
  );
export type SchedulesListQuery = z.infer<typeof schedulesListQuerySchema>;

export const createScheduleSchema = z.object({
  subjectType: subjectTypeSchema,
  subjectId: z.string().uuid('subjectId must be a uuid.'),
  time: timeOfDaySchema,
  weekdays: weekdaysListSchema,
  enabled: z.boolean().optional(),
});
export type CreateScheduleBody = z.infer<typeof createScheduleSchema>;

export const updateScheduleSchema = z
  .object({
    time: timeOfDaySchema.optional(),
    weekdays: weekdaysListSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided.',
  );
export type UpdateScheduleBody = z.infer<typeof updateScheduleSchema>;
