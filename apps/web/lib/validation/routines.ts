/**
 * Zod schemas + helpers for the routines API.
 *
 * Every endpoint imports its body / query schema from this file so the shapes
 * stay in one place. Keep route handlers thin and let zod do the heavy lifting.
 *
 * Weekday encoding: 0=Mon, 1=Tue, ..., 6=Sun (ISO).
 *
 * Timezone validation uses Intl.DateTimeFormat — supported in all modern Node
 * versions; throws on unknown IANA zones so we wrap with a refinement.
 */

import { z } from 'zod';

/** True if `tz` is a valid IANA timezone identifier per the host's tz data. */
export function isValidTimezone(tz: string): boolean {
  try {
    // Intl.DateTimeFormat throws RangeError for unknown zones.
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const weekdaySchema = z
  .number({ invalid_type_error: 'Weekday must be a number 0..6 (0=Mon, 6=Sun).' })
  .int()
  .min(0)
  .max(6);

export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimezone, {
    message: 'Must be a valid IANA timezone (e.g. America/Los_Angeles).',
  });

/** A YYYY-MM-DD local date. Server stores this verbatim (no tz conversion). */
export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date.')
  .refine((s) => {
    const [yStr, mStr, dStr] = s.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    // Round-trip through Date to reject e.g. 2026-02-31. Use UTC so DST never
    // shifts the comparison.
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }, 'Date is not a real calendar date.');

// --- Category / location ---------------------------------------------------
//
// Both fields are short free-text labels (e.g. "Wellness", "gym"). They are
// **optional and nullable** so the same schema is used for both create (where
// `undefined` means "leave unset") and update (where `null` explicitly clears
// the value). The empty-string → null preprocessor matches the description
// convention: UI forms submit `''` for cleared inputs, but the database column
// is meant to hold either a real label or NULL — never `''`.
//
// 50-char cap is enforced here at the validation layer (the DB column is
// `text` so no SQL-side limit). Trim runs before the length check.

export const categorySchema = z
  .string()
  .trim()
  .max(50, 'category must be 50 characters or fewer.')
  .transform((s) => (s.length === 0 ? null : s))
  .nullable()
  .optional();

export const locationSchema = z
  .string()
  .trim()
  .max(50, 'location must be 50 characters or fewer.')
  .transform((s) => (s.length === 0 ? null : s))
  .nullable()
  .optional();

// --- Routines ---------------------------------------------------------------

export const createRoutineSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100),
  // Empty string is normalised to `undefined` so the route stores NULL rather
  // than an empty string. UI forms commonly submit '' for unset fields.
  description: z
    .string()
    .trim()
    .max(500)
    .transform((s) => (s.length === 0 ? undefined : s))
    .optional(),
  timezone: timezoneSchema,
  category: categorySchema,
  location: locationSchema,
});
export type CreateRoutineBody = z.infer<typeof createRoutineSchema>;

export const updateRoutineSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional(),
    timezone: timezoneSchema.optional(),
    category: categorySchema,
    location: locationSchema,
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided.',
  );
export type UpdateRoutineBody = z.infer<typeof updateRoutineSchema>;

// --- Day steps --------------------------------------------------------------

export const stepsListQuerySchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
});

export const createStepSchema = z.object({
  weekday: weekdaySchema,
  title: z.string().trim().min(1, 'Title is required.').max(200),
  // Zero-based. If omitted, the route appends.
  position: z.number().int().min(0).max(1000).optional(),
});
export type CreateStepBody = z.infer<typeof createStepSchema>;

export const updateStepSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    weekday: weekdaySchema.optional(),
    position: z.number().int().min(0).max(1000).optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided.',
  );
export type UpdateStepBody = z.infer<typeof updateStepSchema>;

export const reorderStepsSchema = z.object({
  weekday: weekdaySchema,
  stepIds: z.array(z.string().uuid()).min(1).max(1000),
});
export type ReorderStepsBody = z.infer<typeof reorderStepsSchema>;

// --- Completions ------------------------------------------------------------

export const completionsListQuerySchema = z.object({
  date: localDateSchema,
});

export const completionMutationSchema = z.object({
  stepId: z.string().uuid(),
  date: localDateSchema,
});
export type CompletionMutationBody = z.infer<typeof completionMutationSchema>;
