/**
 * Shared helpers for the duplicate endpoints (routines + habits).
 *
 * The only piece they share is the "(copy)" suffix logic, which must respect
 * the 100-char column cap. Both routines.name and habits.name are enforced at
 * 100 chars by their zod validators (lib/validation/routines.ts and
 * lib/validation/habits.ts) — keep the cap in sync if those change.
 */

/** The text appended to the original name when duplicating. */
export const COPY_SUFFIX = ' (copy)';

/**
 * Max length of `name` across routines + habits, mirrored from
 * `createRoutineSchema.name.max(100)` / `createHabitSchema.name.max(100)`.
 *
 * Centralised so the duplicate route can guarantee its output passes the same
 * validation rule the create routes would apply.
 */
export const NAME_MAX = 100;

/**
 * Build the duplicated name: `{name} (copy)`, truncated so the total length is
 * at most {@link NAME_MAX} characters.
 *
 * Strategy: if appending the suffix would overflow, trim characters off the
 * *original* name first so the " (copy)" tail is always preserved. Users care
 * more about identifying their clone than about preserving the last few chars
 * of a name that was already at the boundary.
 *
 * Examples (NAME_MAX = 100, suffix = ' (copy)' / 7 chars):
 *   - "Morning"                -> "Morning (copy)"
 *   - "A".repeat(95)           -> "A".repeat(93) + " (copy)"  (total = 100)
 *   - "A".repeat(100)          -> "A".repeat(93) + " (copy)"  (total = 100)
 *   - "A".repeat(93)           -> "A".repeat(93) + " (copy)"  (total = 100)
 */
export function buildCopyName(originalName: string): string {
  const headRoom = NAME_MAX - COPY_SUFFIX.length;
  if (originalName.length <= headRoom) {
    return `${originalName}${COPY_SUFFIX}`;
  }
  return `${originalName.slice(0, headRoom)}${COPY_SUFFIX}`;
}
