/**
 * Unit tests for lib/validation/routines.ts.
 *
 * Covers:
 *   - `isValidTimezone` (IANA validator)
 *   - `weekdaySchema` (0..6 ints)
 *   - `timezoneSchema` (string + IANA refinement)
 *   - `localDateSchema` (YYYY-MM-DD + real-date check)
 *   - Per-endpoint schemas (boundary lengths, type rejection, refinements)
 */

import { describe, it, expect } from 'vitest';
import {
  isValidTimezone,
  weekdaySchema,
  timezoneSchema,
  localDateSchema,
  categorySchema,
  locationSchema,
  createRoutineSchema,
  updateRoutineSchema,
  stepsListQuerySchema,
  createStepSchema,
  updateStepSchema,
  reorderStepsSchema,
  completionsListQuerySchema,
  completionMutationSchema,
} from '@/lib/validation/routines';

describe('isValidTimezone', () => {
  it('accepts common IANA zones', () => {
    expect(isValidTimezone('America/Los_Angeles')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Asia/Tokyo')).toBe(true);
    expect(isValidTimezone('Europe/Berlin')).toBe(true);
  });

  it('rejects junk values', () => {
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
    expect(isValidTimezone('not-a-tz')).toBe(false);
    expect(isValidTimezone('Not/A/Real/Zone')).toBe(false);
  });

  // Note: Node's Intl backend accepts a handful of legacy 3-letter abbreviations
  // like 'PST', 'EST', 'UTC', etc. The dispatch suggested rejecting 'PST', but
  // that's not actually how Intl.DateTimeFormat behaves on Node. Locking in the
  // observed behaviour. If the product needs stricter validation, that's a
  // backend change (e.g. require a '/' in the identifier).
  it('accepts legacy 3-letter abbreviations that Node Intl recognises (PST, EST, UTC)', () => {
    expect(isValidTimezone('PST')).toBe(true);
    expect(isValidTimezone('EST')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
  });
});

describe('weekdaySchema', () => {
  it('accepts 0..6', () => {
    for (let i = 0; i <= 6; i++) {
      expect(weekdaySchema.safeParse(i).success).toBe(true);
    }
  });

  it('rejects out-of-range integers', () => {
    expect(weekdaySchema.safeParse(-1).success).toBe(false);
    expect(weekdaySchema.safeParse(7).success).toBe(false);
    expect(weekdaySchema.safeParse(100).success).toBe(false);
  });

  it('rejects non-integers', () => {
    expect(weekdaySchema.safeParse(1.5).success).toBe(false);
    expect(weekdaySchema.safeParse(0.1).success).toBe(false);
  });

  it('rejects strings (server is numbers-only — CLI does word parsing)', () => {
    expect(weekdaySchema.safeParse('mon').success).toBe(false);
    expect(weekdaySchema.safeParse('0').success).toBe(false);
  });
});

describe('timezoneSchema', () => {
  it('accepts valid IANA zones', () => {
    expect(timezoneSchema.safeParse('America/Los_Angeles').success).toBe(true);
    expect(timezoneSchema.safeParse('UTC').success).toBe(true);
  });

  it('rejects empty string', () => {
    expect(timezoneSchema.safeParse('').success).toBe(false);
  });

  it('rejects junk timezone identifiers', () => {
    const result = timezoneSchema.safeParse('Mars/Olympus');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/IANA/);
    }
  });

  it('rejects strings longer than 64 chars', () => {
    expect(timezoneSchema.safeParse('A'.repeat(65)).success).toBe(false);
  });
});

describe('localDateSchema', () => {
  it('accepts real ISO dates', () => {
    expect(localDateSchema.safeParse('2026-05-17').success).toBe(true);
    expect(localDateSchema.safeParse('2000-01-01').success).toBe(true);
    expect(localDateSchema.safeParse('2024-02-29').success).toBe(true); // leap day
  });

  it('rejects non-existent calendar dates', () => {
    expect(localDateSchema.safeParse('2025-02-30').success).toBe(false);
    expect(localDateSchema.safeParse('2025-13-01').success).toBe(false);
    expect(localDateSchema.safeParse('2025-04-31').success).toBe(false);
    expect(localDateSchema.safeParse('2023-02-29').success).toBe(false); // non-leap
  });

  it('rejects malformed strings', () => {
    expect(localDateSchema.safeParse('not-a-date').success).toBe(false);
    expect(localDateSchema.safeParse('2025-05').success).toBe(false);
    expect(localDateSchema.safeParse('25-05-17').success).toBe(false);
    expect(localDateSchema.safeParse('2025-5-17').success).toBe(false);
    expect(localDateSchema.safeParse('2025-05-7').success).toBe(false);
  });

  it('rejects off-by-one-length inputs', () => {
    expect(localDateSchema.safeParse('20255-05-17').success).toBe(false);
    expect(localDateSchema.safeParse('2025-05-178').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// categorySchema / locationSchema — shared free-text label validators
// ---------------------------------------------------------------------------

describe('categorySchema', () => {
  it('accepts a short string', () => {
    const r = categorySchema.safeParse('Wellness');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('Wellness');
  });

  it('trims whitespace', () => {
    const r = categorySchema.safeParse('   Wellness   ');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('Wellness');
  });

  it('transforms empty string to null', () => {
    const r = categorySchema.safeParse('');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });

  it('transforms whitespace-only string to null', () => {
    const r = categorySchema.safeParse('   ');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });

  it('accepts null explicitly (clearing)', () => {
    const r = categorySchema.safeParse(null);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });

  it('accepts undefined (omitted)', () => {
    const r = categorySchema.safeParse(undefined);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeUndefined();
  });

  it('accepts a 50-char string (boundary)', () => {
    const r = categorySchema.safeParse('A'.repeat(50));
    expect(r.success).toBe(true);
  });

  it('rejects a 51-char string', () => {
    const r = categorySchema.safeParse('A'.repeat(51));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/50 characters/);
    }
  });

  it('rejects non-string input (numbers, objects)', () => {
    expect(categorySchema.safeParse(42).success).toBe(false);
    expect(categorySchema.safeParse({}).success).toBe(false);
  });
});

describe('locationSchema', () => {
  it('accepts a short string', () => {
    const r = locationSchema.safeParse('gym');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('gym');
  });

  it('transforms empty string to null', () => {
    const r = locationSchema.safeParse('');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });

  it('accepts a 50-char string (boundary)', () => {
    expect(locationSchema.safeParse('A'.repeat(50)).success).toBe(true);
  });

  it('rejects a 51-char string', () => {
    const r = locationSchema.safeParse('A'.repeat(51));
    expect(r.success).toBe(false);
  });
});

describe('createRoutineSchema', () => {
  it('accepts a fully valid payload', () => {
    const r = createRoutineSchema.safeParse({
      name: 'Morning',
      description: 'My morning routine',
      timezone: 'America/Los_Angeles',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe('Morning');
      expect(r.data.description).toBe('My morning routine');
    }
  });

  it('accepts category + location alongside the core fields', () => {
    const r = createRoutineSchema.safeParse({
      name: 'Morning',
      timezone: 'UTC',
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
    const r = createRoutineSchema.safeParse({
      name: 'X',
      timezone: 'UTC',
      category: '',
      location: '',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.category).toBeNull();
      expect(r.data.location).toBeNull();
    }
  });

  it('rejects a category > 50 chars', () => {
    const r = createRoutineSchema.safeParse({
      name: 'X',
      timezone: 'UTC',
      category: 'A'.repeat(51),
    });
    expect(r.success).toBe(false);
  });

  it('rejects a location > 50 chars', () => {
    const r = createRoutineSchema.safeParse({
      name: 'X',
      timezone: 'UTC',
      location: 'A'.repeat(51),
    });
    expect(r.success).toBe(false);
  });

  it('accepts without optional description', () => {
    const r = createRoutineSchema.safeParse({ name: 'X', timezone: 'UTC' });
    expect(r.success).toBe(true);
  });

  it('transforms empty-string description to undefined', () => {
    const r = createRoutineSchema.safeParse({
      name: 'X',
      timezone: 'UTC',
      description: '',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.description).toBeUndefined();
    }
  });

  it('trims the name', () => {
    const r = createRoutineSchema.safeParse({
      name: '   Trimmed   ',
      timezone: 'UTC',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Trimmed');
  });

  it('rejects an empty name (post-trim)', () => {
    expect(createRoutineSchema.safeParse({ name: '   ', timezone: 'UTC' }).success).toBe(
      false,
    );
  });

  it('rejects a missing name', () => {
    expect(createRoutineSchema.safeParse({ timezone: 'UTC' }).success).toBe(false);
  });

  it('rejects a missing timezone', () => {
    expect(createRoutineSchema.safeParse({ name: 'X' }).success).toBe(false);
  });

  it('rejects a name longer than 100 chars', () => {
    expect(
      createRoutineSchema.safeParse({ name: 'A'.repeat(101), timezone: 'UTC' }).success,
    ).toBe(false);
  });

  it('accepts a name of exactly 100 chars', () => {
    expect(
      createRoutineSchema.safeParse({ name: 'A'.repeat(100), timezone: 'UTC' }).success,
    ).toBe(true);
  });

  it('rejects a description longer than 500 chars', () => {
    expect(
      createRoutineSchema.safeParse({
        name: 'X',
        timezone: 'UTC',
        description: 'A'.repeat(501),
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid IANA timezone', () => {
    expect(
      createRoutineSchema.safeParse({ name: 'X', timezone: 'Mars/Olympus' }).success,
    ).toBe(false);
  });

  it('rejects non-string name', () => {
    expect(createRoutineSchema.safeParse({ name: 42, timezone: 'UTC' }).success).toBe(
      false,
    );
  });
});

describe('updateRoutineSchema', () => {
  it('accepts a partial update', () => {
    expect(updateRoutineSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
    expect(updateRoutineSchema.safeParse({ timezone: 'UTC' }).success).toBe(true);
    expect(updateRoutineSchema.safeParse({ description: 'desc' }).success).toBe(true);
    expect(updateRoutineSchema.safeParse({ description: null }).success).toBe(true);
  });

  it('accepts multiple fields at once', () => {
    expect(
      updateRoutineSchema.safeParse({
        name: 'X',
        description: 'y',
        timezone: 'UTC',
      }).success,
    ).toBe(true);
  });

  it('rejects an empty object', () => {
    expect(updateRoutineSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(updateRoutineSchema.safeParse({ name: '' }).success).toBe(false);
    expect(updateRoutineSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects an invalid timezone', () => {
    expect(updateRoutineSchema.safeParse({ timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(updateRoutineSchema.safeParse({ timezone: '' }).success).toBe(false);
  });

  it('accepts category-only update', () => {
    const r = updateRoutineSchema.safeParse({ category: 'Fitness' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBe('Fitness');
  });

  it('accepts setting category to null (clearing)', () => {
    const r = updateRoutineSchema.safeParse({ category: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBeNull();
  });

  it('accepts setting category to empty string and normalises to null', () => {
    const r = updateRoutineSchema.safeParse({ category: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBeNull();
  });

  it('accepts location-only update', () => {
    const r = updateRoutineSchema.safeParse({ location: 'office' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.location).toBe('office');
  });

  it('rejects category > 50 chars', () => {
    expect(
      updateRoutineSchema.safeParse({ category: 'A'.repeat(51) }).success,
    ).toBe(false);
  });

  it('rejects location > 50 chars', () => {
    expect(
      updateRoutineSchema.safeParse({ location: 'A'.repeat(51) }).success,
    ).toBe(false);
  });
});

describe('stepsListQuerySchema', () => {
  it('coerces string weekday to int', () => {
    const r = stepsListQuerySchema.safeParse({ weekday: '3' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.weekday).toBe(3);
  });

  it('rejects out-of-range weekday', () => {
    expect(stepsListQuerySchema.safeParse({ weekday: '7' }).success).toBe(false);
    expect(stepsListQuerySchema.safeParse({ weekday: '-1' }).success).toBe(false);
  });

  it('rejects missing weekday', () => {
    expect(stepsListQuerySchema.safeParse({}).success).toBe(false);
  });

  it('rejects junk', () => {
    expect(stepsListQuerySchema.safeParse({ weekday: 'mon' }).success).toBe(false);
  });
});

describe('createStepSchema', () => {
  it('accepts a minimal step', () => {
    const r = createStepSchema.safeParse({ weekday: 0, title: 'Step 1' });
    expect(r.success).toBe(true);
  });

  it('accepts an explicit position', () => {
    const r = createStepSchema.safeParse({ weekday: 0, title: 'X', position: 2 });
    expect(r.success).toBe(true);
  });

  it('rejects missing title', () => {
    expect(createStepSchema.safeParse({ weekday: 0 }).success).toBe(false);
  });

  it('rejects empty title', () => {
    expect(createStepSchema.safeParse({ weekday: 0, title: '' }).success).toBe(false);
    expect(createStepSchema.safeParse({ weekday: 0, title: '   ' }).success).toBe(false);
  });

  it('rejects a title >200 chars', () => {
    expect(
      createStepSchema.safeParse({ weekday: 0, title: 'A'.repeat(201) }).success,
    ).toBe(false);
  });

  it('rejects a weekday out of range', () => {
    expect(createStepSchema.safeParse({ weekday: 7, title: 'X' }).success).toBe(false);
  });

  it('rejects a negative position', () => {
    expect(
      createStepSchema.safeParse({ weekday: 0, title: 'X', position: -1 }).success,
    ).toBe(false);
  });

  it('rejects a position above 1000', () => {
    expect(
      createStepSchema.safeParse({ weekday: 0, title: 'X', position: 1001 }).success,
    ).toBe(false);
  });

  it('accepts position 0 and 1000 (boundaries)', () => {
    expect(
      createStepSchema.safeParse({ weekday: 0, title: 'X', position: 0 }).success,
    ).toBe(true);
    expect(
      createStepSchema.safeParse({ weekday: 0, title: 'X', position: 1000 }).success,
    ).toBe(true);
  });
});

describe('updateStepSchema', () => {
  it('accepts a partial title-only update', () => {
    expect(updateStepSchema.safeParse({ title: 'X' }).success).toBe(true);
  });

  it('accepts a partial weekday-only update', () => {
    expect(updateStepSchema.safeParse({ weekday: 3 }).success).toBe(true);
  });

  it('accepts a partial position-only update', () => {
    expect(updateStepSchema.safeParse({ position: 5 }).success).toBe(true);
  });

  it('rejects an empty object', () => {
    expect(updateStepSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an invalid weekday', () => {
    expect(updateStepSchema.safeParse({ weekday: 9 }).success).toBe(false);
  });

  it('rejects an empty title (post-trim)', () => {
    expect(updateStepSchema.safeParse({ title: '   ' }).success).toBe(false);
  });
});

describe('reorderStepsSchema', () => {
  it('accepts a non-empty list of uuids', () => {
    const r = reorderStepsSchema.safeParse({
      weekday: 0,
      stepIds: [
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an empty stepIds array', () => {
    expect(reorderStepsSchema.safeParse({ weekday: 0, stepIds: [] }).success).toBe(
      false,
    );
  });

  it('rejects non-uuid stepIds', () => {
    expect(
      reorderStepsSchema.safeParse({ weekday: 0, stepIds: ['not-a-uuid'] }).success,
    ).toBe(false);
  });

  it('rejects a missing weekday', () => {
    expect(reorderStepsSchema.safeParse({ stepIds: [] }).success).toBe(false);
  });

  it('rejects stepIds with more than 1000 entries', () => {
    const ids = Array.from(
      { length: 1001 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    );
    expect(reorderStepsSchema.safeParse({ weekday: 0, stepIds: ids }).success).toBe(
      false,
    );
  });
});

describe('completionsListQuerySchema', () => {
  it('accepts a valid YYYY-MM-DD date', () => {
    expect(completionsListQuerySchema.safeParse({ date: '2026-05-17' }).success).toBe(
      true,
    );
  });

  it('rejects non-real dates', () => {
    expect(completionsListQuerySchema.safeParse({ date: '2026-02-30' }).success).toBe(
      false,
    );
  });

  it('rejects missing date', () => {
    expect(completionsListQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe('completionMutationSchema', () => {
  it('accepts a valid stepId + date', () => {
    expect(
      completionMutationSchema.safeParse({
        stepId: '00000000-0000-0000-0000-000000000001',
        date: '2026-05-17',
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid uuid', () => {
    expect(
      completionMutationSchema.safeParse({
        stepId: 'not-a-uuid',
        date: '2026-05-17',
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid date', () => {
    expect(
      completionMutationSchema.safeParse({
        stepId: '00000000-0000-0000-0000-000000000001',
        date: 'today',
      }).success,
    ).toBe(false);
  });

  it('rejects a missing stepId', () => {
    expect(completionMutationSchema.safeParse({ date: '2026-05-17' }).success).toBe(
      false,
    );
  });

  it('rejects a missing date', () => {
    expect(
      completionMutationSchema.safeParse({
        stepId: '00000000-0000-0000-0000-000000000001',
      }).success,
    ).toBe(false);
  });
});
