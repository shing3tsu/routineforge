/**
 * Unit tests — `buildCopyName` from `lib/duplicate.ts`.
 *
 * The duplicate endpoints share this helper; lock it down independent of the
 * route-level integration tests so regressions surface fast.
 */

import { describe, it, expect } from 'vitest';
import { buildCopyName, COPY_SUFFIX, NAME_MAX } from '@/lib/duplicate';

describe('buildCopyName', () => {
  it('appends " (copy)" when the result fits within NAME_MAX', () => {
    expect(buildCopyName('Morning')).toBe('Morning (copy)');
  });

  it('handles the empty-string edge case (still gets a suffix)', () => {
    // The route validates non-empty names before reaching the DB; the helper
    // doesn't gate on that. Just be sure it doesn't crash.
    expect(buildCopyName('')).toBe(' (copy)');
  });

  it('respects NAME_MAX exactly when name fits with no truncation', () => {
    const fits = 'C'.repeat(NAME_MAX - COPY_SUFFIX.length);
    const out = buildCopyName(fits);
    expect(out.length).toBe(NAME_MAX);
    expect(out).toBe(fits + COPY_SUFFIX);
  });

  it('truncates the original to keep total length at NAME_MAX', () => {
    const over = 'A'.repeat(NAME_MAX); // exactly at the cap
    const out = buildCopyName(over);
    expect(out.length).toBe(NAME_MAX);
    expect(out.endsWith(COPY_SUFFIX)).toBe(true);
    expect(out).toBe('A'.repeat(NAME_MAX - COPY_SUFFIX.length) + COPY_SUFFIX);
  });

  it('truncates names that are 1 char past the headroom', () => {
    // Headroom = NAME_MAX - suffix.length. One char over → shave 1 from the
    // original.
    const over = 'B'.repeat(NAME_MAX - COPY_SUFFIX.length + 1);
    const out = buildCopyName(over);
    expect(out.length).toBe(NAME_MAX);
    expect(out).toBe('B'.repeat(NAME_MAX - COPY_SUFFIX.length) + COPY_SUFFIX);
  });

  it('does not double-suffix already-copied names (cloning a clone)', () => {
    // Users can hit Duplicate on a routine they already cloned. The helper
    // doesn't try to dedup the suffix — that's deliberate (the user is making
    // ANOTHER copy, "(copy) (copy)" is fine and obvious).
    expect(buildCopyName('Morning (copy)')).toBe('Morning (copy) (copy)');
  });

  it('never returns a string longer than NAME_MAX', () => {
    for (const len of [0, 1, 50, 92, 93, 94, 99, 100, 200, 1000]) {
      const name = 'x'.repeat(len);
      expect(buildCopyName(name).length).toBeLessThanOrEqual(NAME_MAX);
    }
  });
});
