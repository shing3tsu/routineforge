/**
 * Zod schemas + helpers for the habits API.
 *
 * Mirrors the structure of `lib/validation/routines.ts` — keep route handlers
 * thin and let zod do the heavy lifting.
 *
 * Weekday encoding: 0=Mon, 1=Tue, ..., 6=Sun (ISO). Same as routines.
 *
 * **Cadence** is a discriminated union. The three kinds:
 *
 *   - `{ kind: 'daily' }` — due every day.
 *   - `{ kind: 'weekly_count', perWeek: 1..7, weekStart: 0..6 }` — due N times
 *     per week; user picks which days. `weekStart` defines the week boundary
 *     (default 0 = Monday).
 *   - `{ kind: 'specific_weekdays', weekdays: number[] }` — due on these
 *     weekdays only (subset of 0..6, ISO 0=Monday). Must be non-empty + unique.
 *
 * IANA timezone validation + localDateSchema are reused from the routines
 * validation file (single source of truth — no duplication).
 */

import { z } from 'zod';
import {
  categorySchema,
  isValidTimezone,
  localDateSchema,
  locationSchema,
  timezoneSchema,
  weekdaySchema,
} from './routines';

// Re-export for callers that want one import.
export {
  categorySchema,
  isValidTimezone,
  localDateSchema,
  locationSchema,
  timezoneSchema,
  weekdaySchema,
};

// --- Cadence ---------------------------------------------------------------

const dailyCadenceSchema = z.object({
  kind: z.literal('daily'),
});

const weeklyCountCadenceSchema = z.object({
  kind: z.literal('weekly_count'),
  perWeek: z
    .number({ invalid_type_error: 'perWeek must be a number 1..7.' })
    .int()
    .min(1)
    .max(7),
  // 0..6, ISO; default Monday. Zod default makes the field optional in input
  // and always present in the parsed output.
  weekStart: weekdaySchema.default(0),
});

const specificWeekdaysCadenceSchema = z.object({
  kind: z.literal('specific_weekdays'),
  weekdays: z
    .array(weekdaySchema)
    .min(1, 'weekdays must contain at least one day.')
    .max(7)
    .refine(
      (arr) => new Set(arr).size === arr.length,
      'weekdays must not contain duplicates.',
    )
    // Canonicalise: sort ascending so downstream comparisons are stable.
    .transform((arr) => [...arr].sort((a, b) => a - b)),
});

/**
 * Discriminated union for the three cadence kinds. The `kind` field is the
 * discriminator (zod picks the right branch by reading it).
 */
export const cadenceSchema = z.discriminatedUnion('kind', [
  dailyCadenceSchema,
  weeklyCountCadenceSchema,
  specificWeekdaysCadenceSchema,
]);
export type Cadence = z.infer<typeof cadenceSchema>;

// --- Habits ----------------------------------------------------------------

export const createHabitSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100),
  // Empty string is normalised to `undefined` so the route stores NULL rather
  // than an empty string. Matches the routines convention.
  description: z
    .string()
    .trim()
    .max(500)
    .transform((s) => (s.length === 0 ? undefined : s))
    .optional(),
  timezone: timezoneSchema,
  cadence: cadenceSchema,
  // Free-text category + location labels — see lib/validation/routines.ts for
  // the shared schema. Same shape for both create + update: optional + nullable
  // + empty-string → null.
  category: categorySchema,
  location: locationSchema,
});
export type CreateHabitBody = z.infer<typeof createHabitSchema>;

export const updateHabitSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional(),
    timezone: timezoneSchema.optional(),
    cadence: cadenceSchema.optional(),
    category: categorySchema,
    location: locationSchema,
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided.',
  );
export type UpdateHabitBody = z.infer<typeof updateHabitSchema>;

// --- Completions -----------------------------------------------------------

export const habitCompletionMutationSchema = z.object({
  date: localDateSchema,
});
export type HabitCompletionMutationBody = z.infer<
  typeof habitCompletionMutationSchema
>;
