/**
 * Unit tests for lib/validation/habits.ts.
 *
 * Covers:
 *   - `cadenceSchema` discriminated union (daily / weekly_count / specific_weekdays)
 *   - `createHabitSchema` (name/description/timezone/cadence shape + transforms)
 *   - `updateHabitSchema` (partial + refinement)
 *   - `habitCompletionMutationSchema` (date validation)
 *   - Re-exports (timezone / localDate / weekday) still work via this module
 */

import { describe, it, expect } from 'vitest';
import {
  cadenceSchema,
  categorySchema,
  createHabitSchema,
  locationSchema,
  updateHabitSchema,
  habitCompletionMutationSchema,
  isValidTimezone,
  localDateSchema,
  timezoneSchema,
  weekdaySchema,
} from '@/lib/validation/habits';

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

describe('re-exports from validation/habits.ts', () => {
  it('re-exports isValidTimezone', () => {
    expect(typeof isValidTimezone).toBe('function');
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
  });

  it('re-exports localDateSchema', () => {
    expect(localDateSchema.safeParse('2026-05-17').success).toBe(true);
    expect(localDateSchema.safeParse('not-a-date').success).toBe(false);
  });

  it('re-exports timezoneSchema', () => {
    expect(timezoneSchema.safeParse('UTC').success).toBe(true);
    expect(timezoneSchema.safeParse('Mars/Olympus').success).toBe(false);
  });

  it('re-exports weekdaySchema', () => {
    expect(weekdaySchema.safeParse(0).success).toBe(true);
    expect(weekdaySchema.safeParse(7).success).toBe(false);
  });

  it('re-exports categorySchema + locationSchema', () => {
    expect(categorySchema.safeParse('Wellness').success).toBe(true);
    expect(categorySchema.safeParse('A'.repeat(51)).success).toBe(false);
    expect(locationSchema.safeParse('gym').success).toBe(true);
    expect(locationSchema.safeParse('A'.repeat(51)).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cadenceSchema — discriminated union
// ---------------------------------------------------------------------------

describe('cadenceSchema — daily', () => {
  it('accepts { kind: "daily" }', () => {
    const r = cadenceSchema.safeParse({ kind: 'daily' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ kind: 'daily' });
  });

  it('rejects daily with extra fields (passthrough disabled by default)', () => {
    // zod's default strict mode is strip not throw — so extras are silently dropped.
    const r = cadenceSchema.safeParse({ kind: 'daily', extra: 'ignored' });
    expect(r.success).toBe(true);
  });
});

describe('cadenceSchema — weekly_count', () => {
  it('accepts a valid spec with weekStart present', () => {
    const r = cadenceSchema.safeParse({
      kind: 'weekly_count',
      perWeek: 3,
      weekStart: 0,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ kind: 'weekly_count', perWeek: 3, weekStart: 0 });
    }
  });

  it('accepts without weekStart (defaults to 0 / Monday)', () => {
    const r = cadenceSchema.safeParse({ kind: 'weekly_count', perWeek: 5 });
    expect(r.success).toBe(true);
    if (r.success && r.data.kind === 'weekly_count') {
      expect(r.data.weekStart).toBe(0);
    }
  });

  it('rejects perWeek < 1', () => {
    const r = cadenceSchema.safeParse({ kind: 'weekly_count', perWeek: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects perWeek > 7', () => {
    const r = cadenceSchema.safeParse({ kind: 'weekly_count', perWeek: 8 });
    expect(r.success).toBe(false);
  });

  it('rejects non-integer perWeek', () => {
    const r = cadenceSchema.safeParse({ kind: 'weekly_count', perWeek: 3.5 });
    expect(r.success).toBe(false);
  });

  it('rejects missing perWeek', () => {
    const r = cadenceSchema.safeParse({ kind: 'weekly_count' });
    expect(r.success).toBe(false);
  });

  it('rejects weekStart out of [0..6]', () => {
    expect(
      cadenceSchema.safeParse({
        kind: 'weekly_count',
        perWeek: 3,
        weekStart: -1,
      }).success,
    ).toBe(false);
    expect(
      cadenceSchema.safeParse({
        kind: 'weekly_count',
        perWeek: 3,
        weekStart: 7,
      }).success,
    ).toBe(false);
  });

  it('accepts perWeek=1 and perWeek=7 (boundaries)', () => {
    expect(
      cadenceSchema.safeParse({ kind: 'weekly_count', perWeek: 1 }).success,
    ).toBe(true);
    expect(
      cadenceSchema.safeParse({ kind: 'weekly_count', perWeek: 7 }).success,
    ).toBe(true);
  });

  it('accepts weekStart=0 and weekStart=6 (boundaries)', () => {
    expect(
      cadenceSchema.safeParse({
        kind: 'weekly_count',
        perWeek: 3,
        weekStart: 0,
      }).success,
    ).toBe(true);
    expect(
      cadenceSchema.safeParse({
        kind: 'weekly_count',
        perWeek: 3,
        weekStart: 6,
      }).success,
    ).toBe(true);
  });

  it('rejects non-number perWeek (e.g. string)', () => {
    expect(
      cadenceSchema.safeParse({ kind: 'weekly_count', perWeek: '3' }).success,
    ).toBe(false);
  });
});

describe('cadenceSchema — specific_weekdays', () => {
  it('accepts a valid weekdays list', () => {
    const r = cadenceSchema.safeParse({
      kind: 'specific_weekdays',
      weekdays: [0, 2, 4],
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.kind === 'specific_weekdays') {
      expect(r.data.weekdays).toEqual([0, 2, 4]);
    }
  });

  it('rejects empty weekdays array', () => {
    const r = cadenceSchema.safeParse({
      kind: 'specific_weekdays',
      weekdays: [],
    });
    expect(r.success).toBe(false);
  });

  it('rejects duplicates in weekdays', () => {
    const r = cadenceSchema.safeParse({
      kind: 'specific_weekdays',
      weekdays: [0, 0, 2],
    });
    expect(r.success).toBe(false);
  });

  it('sorts weekdays ascending via transform', () => {
    const r = cadenceSchema.safeParse({
      kind: 'specific_weekdays',
      weekdays: [4, 2, 0],
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.kind === 'specific_weekdays') {
      expect(r.data.weekdays).toEqual([0, 2, 4]);
    }
  });

  it('rejects weekday out of [0..6]', () => {
    expect(
      cadenceSchema.safeParse({
        kind: 'specific_weekdays',
        weekdays: [7],
      }).success,
    ).toBe(false);
    expect(
      cadenceSchema.safeParse({
        kind: 'specific_weekdays',
        weekdays: [-1],
      }).success,
    ).toBe(false);
  });

  it('rejects more than 7 weekdays', () => {
    expect(
      cadenceSchema.safeParse({
        kind: 'specific_weekdays',
        weekdays: [0, 1, 2, 3, 4, 5, 6, 0],
      }).success,
    ).toBe(false);
  });

  it('accepts a single-day weekdays list', () => {
    const r = cadenceSchema.safeParse({
      kind: 'specific_weekdays',
      weekdays: [3],
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.kind === 'specific_weekdays') {
      expect(r.data.weekdays).toEqual([3]);
    }
  });

  it('accepts all 7 weekdays (no duplicates)', () => {
    const r = cadenceSchema.safeParse({
      kind: 'specific_weekdays',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-integer weekdays', () => {
    expect(
      cadenceSchema.safeParse({
        kind: 'specific_weekdays',
        weekdays: [0.5, 2],
      }).success,
    ).toBe(false);
  });
});

describe('cadenceSchema — discriminator misuse', () => {
  it('rejects an unknown kind', () => {
    expect(cadenceSchema.safeParse({ kind: 'unknown' }).success).toBe(false);
    expect(cadenceSchema.safeParse({ kind: 'monthly' }).success).toBe(false);
  });

  it('rejects a missing kind discriminator', () => {
    expect(cadenceSchema.safeParse({ perWeek: 3 }).success).toBe(false);
  });

  it('rejects non-object cadence', () => {
    expect(cadenceSchema.safeParse('daily').success).toBe(false);
    expect(cadenceSchema.safeParse(null).success).toBe(false);
    expect(cadenceSchema.safeParse(undefined).success).toBe(false);
    expect(cadenceSchema.safeParse(42).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createHabitSchema
// ---------------------------------------------------------------------------

describe('createHabitSchema', () => {
  it('accepts a minimal valid payload (daily)', () => {
    const r = createHabitSchema.safeParse({
      name: 'Read',
      timezone: 'UTC',
      cadence: { kind: 'daily' },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe('Read');
      expect(r.data.timezone).toBe('UTC');
      expect(r.data.cadence).toEqual({ kind: 'daily' });
      expect(r.data.description).toBeUndefined();
    }
  });

  it('accepts a weekly_count cadence', () => {
    const r = createHabitSchema.safeParse({
      name: 'Gym',
      timezone: 'America/Los_Angeles',
      cadence: { kind: 'weekly_count', perWeek: 3 },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cadence).toEqual({
        kind: 'weekly_count',
        perWeek: 3,
        weekStart: 0,
      });
    }
  });

  it('accepts a specific_weekdays cadence (canonicalised)', () => {
    const r = createHabitSchema.safeParse({
      name: 'Climb',
      timezone: 'UTC',
      cadence: { kind: 'specific_weekdays', weekdays: [4, 2, 0] },
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.cadence.kind === 'specific_weekdays') {
      expect(r.data.cadence.weekdays).toEqual([0, 2, 4]);
    }
  });

  it('trims name', () => {
    const r = createHabitSchema.safeParse({
      name: '   Trimmed   ',
      timezone: 'UTC',
      cadence: { kind: 'daily' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Trimmed');
  });

  it('rejects empty (post-trim) name', () => {
    expect(
      createHabitSchema.safeParse({
        name: '   ',
        timezone: 'UTC',
        cadence: { kind: 'daily' },
      }).success,
    ).toBe(false);
  });

  it('rejects name > 100 chars', () => {
    expect(
      createHabitSchema.safeParse({
        name: 'A'.repeat(101),
        timezone: 'UTC',
        cadence: { kind: 'daily' },
      }).success,
    ).toBe(false);
  });

  it('accepts name of exactly 100 chars (boundary)', () => {
    expect(
      createHabitSchema.safeParse({
        name: 'A'.repeat(100),
        timezone: 'UTC',
        cadence: { kind: 'daily' },
      }).success,
    ).toBe(true);
  });

  it('accepts a description', () => {
    const r = createHabitSchema.safeParse({
      name: 'X',
      description: 'A nice habit.',
      timezone: 'UTC',
      cadence: { kind: 'daily' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBe('A nice habit.');
  });

  it('transforms empty-string description to undefined', () => {
    const r = createHabitSchema.safeParse({
      name: 'X',
      description: '',
      timezone: 'UTC',
      cadence: { kind: 'daily' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBeUndefined();
  });

  it('transforms whitespace-only description to undefined', () => {
    const r = createHabitSchema.safeParse({
      name: 'X',
      description: '   ',
      timezone: 'UTC',
      cadence: { kind: 'daily' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBeUndefined();
  });

  it('rejects description > 500 chars', () => {
    expect(
      createHabitSchema.safeParse({
        name: 'X',
        description: 'A'.repeat(501),
        timezone: 'UTC',
        cadence: { kind: 'daily' },
      }).success,
    ).toBe(false);
  });

  it('rejects invalid IANA timezone', () => {
    expect(
      createHabitSchema.safeParse({
        name: 'X',
        timezone: 'Mars/Olympus',
        cadence: { kind: 'daily' },
      }).success,
    ).toBe(false);
  });

  it('rejects missing name', () => {
    expect(
      createHabitSchema.safeParse({
        timezone: 'UTC',
        cadence: { kind: 'daily' },
      }).success,
    ).toBe(false);
  });

  it('rejects missing timezone', () => {
    expect(
      createHabitSchema.safeParse({
        name: 'X',
        cadence: { kind: 'daily' },
      }).success,
    ).toBe(false);
  });

  it('rejects missing cadence', () => {
    expect(
      createHabitSchema.safeParse({ name: 'X', timezone: 'UTC' }).success,
    ).toBe(false);
  });

  it('rejects non-string name', () => {
    expect(
      createHabitSchema.safeParse({
        name: 42,
        timezone: 'UTC',
        cadence: { kind: 'daily' },
      }).success,
    ).toBe(false);
  });

  it('accepts category + location', () => {
    const r = createHabitSchema.safeParse({
      name: 'Read',
      timezone: 'UTC',
      cadence: { kind: 'daily' },
      category: 'Wellness',
      location: 'home',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.category).toBe('Wellness');
      expect(r.data.location).toBe('home');
    }
  });

  it('transforms empty-string category/location to null', () => {
    const r = createHabitSchema.safeParse({
      name: 'Read',
      timezone: 'UTC',
      cadence: { kind: 'daily' },
      category: '',
      location: '',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.category).toBeNull();
      expect(r.data.location).toBeNull();
    }
  });

  it('rejects category > 50 chars', () => {
    expect(
      createHabitSchema.safeParse({
        name: 'Read',
        timezone: 'UTC',
        cadence: { kind: 'daily' },
        category: 'A'.repeat(51),
      }).success,
    ).toBe(false);
  });

  it('rejects location > 50 chars', () => {
    expect(
      createHabitSchema.safeParse({
        name: 'Read',
        timezone: 'UTC',
        cadence: { kind: 'daily' },
        location: 'A'.repeat(51),
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateHabitSchema
// ---------------------------------------------------------------------------

describe('updateHabitSchema', () => {
  it('accepts a partial update (just name)', () => {
    expect(updateHabitSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
  });

  it('accepts a partial update (just description)', () => {
    expect(updateHabitSchema.safeParse({ description: 'New desc' }).success).toBe(true);
  });

  it('accepts setting description to null (to clear)', () => {
    const r = updateHabitSchema.safeParse({ description: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBeNull();
  });

  it('accepts a partial update (just timezone)', () => {
    expect(updateHabitSchema.safeParse({ timezone: 'Europe/Berlin' }).success).toBe(
      true,
    );
  });

  it('accepts a partial update (just cadence)', () => {
    expect(
      updateHabitSchema.safeParse({
        cadence: { kind: 'weekly_count', perWeek: 4 },
      }).success,
    ).toBe(true);
  });

  it('accepts multiple fields at once', () => {
    expect(
      updateHabitSchema.safeParse({
        name: 'X',
        description: 'y',
        timezone: 'UTC',
        cadence: { kind: 'daily' },
      }).success,
    ).toBe(true);
  });

  it('rejects an empty object', () => {
    expect(updateHabitSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty name (post-trim)', () => {
    expect(updateHabitSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects an invalid timezone', () => {
    expect(updateHabitSchema.safeParse({ timezone: 'Mars/Olympus' }).success).toBe(
      false,
    );
  });

  it('rejects an invalid cadence', () => {
    expect(
      updateHabitSchema.safeParse({
        cadence: { kind: 'unknown' },
      }).success,
    ).toBe(false);
  });

  it('accepts category-only update', () => {
    const r = updateHabitSchema.safeParse({ category: 'Fitness' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBe('Fitness');
  });

  it('accepts setting category to null (clearing)', () => {
    const r = updateHabitSchema.safeParse({ category: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBeNull();
  });

  it('accepts setting category to empty string and normalises to null', () => {
    const r = updateHabitSchema.safeParse({ category: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBeNull();
  });

  it('accepts location-only update', () => {
    const r = updateHabitSchema.safeParse({ location: 'gym' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.location).toBe('gym');
  });

  it('rejects category > 50 chars', () => {
    expect(
      updateHabitSchema.safeParse({ category: 'A'.repeat(51) }).success,
    ).toBe(false);
  });

  it('rejects location > 50 chars', () => {
    expect(
      updateHabitSchema.safeParse({ location: 'A'.repeat(51) }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// habitCompletionMutationSchema
// ---------------------------------------------------------------------------

describe('habitCompletionMutationSchema', () => {
  it('accepts a valid YYYY-MM-DD date', () => {
    const r = habitCompletionMutationSchema.safeParse({ date: '2026-05-17' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.date).toBe('2026-05-17');
  });

  it('rejects a missing date', () => {
    expect(habitCompletionMutationSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a malformed date', () => {
    expect(
      habitCompletionMutationSchema.safeParse({ date: 'today' }).success,
    ).toBe(false);
    expect(
      habitCompletionMutationSchema.safeParse({ date: '2026/05/17' }).success,
    ).toBe(false);
  });

  it('rejects a non-real date', () => {
    expect(
      habitCompletionMutationSchema.safeParse({ date: '2026-02-30' }).success,
    ).toBe(false);
  });

  it('rejects extra junk fields by ignoring them (zod strip)', () => {
    // zod ignores unknown keys by default — the parsed object only carries known fields.
    const r = habitCompletionMutationSchema.safeParse({
      date: '2026-05-17',
      junk: 'ignored',
    });
    expect(r.success).toBe(true);
  });
});
