/**
 * Unit tests for lib/habits/format.ts — pure display formatters.
 *
 * These are used by client + server components alike (the module deliberately
 * does NOT import 'server-only' so the same labels work both sides).
 */

import { describe, it, expect } from 'vitest';
import {
  formatCadence,
  formatCadenceAccessible,
  isCadenceDueOnWeekday,
} from '@/lib/habits/format';
import type { HabitCadence } from '@/db/schema';

// ---------------------------------------------------------------------------
// formatCadence
// ---------------------------------------------------------------------------

describe('formatCadence', () => {
  it('daily → "Daily"', () => {
    expect(formatCadence({ kind: 'daily' })).toBe('Daily');
  });

  it('weekly_count → "N per week"', () => {
    expect(
      formatCadence({ kind: 'weekly_count', perWeek: 5, weekStart: 0 }),
    ).toBe('5 per week');
    expect(
      formatCadence({ kind: 'weekly_count', perWeek: 1, weekStart: 0 }),
    ).toBe('1 per week');
    expect(
      formatCadence({ kind: 'weekly_count', perWeek: 7, weekStart: 6 }),
    ).toBe('7 per week');
  });

  it('specific_weekdays Mon/Wed/Fri → "Mon · Wed · Fri"', () => {
    expect(
      formatCadence({ kind: 'specific_weekdays', weekdays: [0, 2, 4] }),
    ).toBe('Mon · Wed · Fri');
  });

  it('specific_weekdays weekdays-only (0..4) → "Weekdays"', () => {
    expect(
      formatCadence({ kind: 'specific_weekdays', weekdays: [0, 1, 2, 3, 4] }),
    ).toBe('Weekdays');
  });

  it('specific_weekdays weekend-only (5,6) → "Weekends"', () => {
    expect(
      formatCadence({ kind: 'specific_weekdays', weekdays: [5, 6] }),
    ).toBe('Weekends');
  });

  it('specific_weekdays all 7 → "Every day"', () => {
    expect(
      formatCadence({
        kind: 'specific_weekdays',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      }),
    ).toBe('Every day');
  });

  it('specific_weekdays unsorted input — sorts internally before pattern matching', () => {
    expect(
      formatCadence({ kind: 'specific_weekdays', weekdays: [4, 2, 0] }),
    ).toBe('Mon · Wed · Fri');
    expect(
      formatCadence({ kind: 'specific_weekdays', weekdays: [4, 3, 2, 1, 0] }),
    ).toBe('Weekdays');
    expect(
      formatCadence({ kind: 'specific_weekdays', weekdays: [6, 5] }),
    ).toBe('Weekends');
  });

  it('specific_weekdays single day → "Tue" (or appropriate short name)', () => {
    expect(
      formatCadence({ kind: 'specific_weekdays', weekdays: [1] }),
    ).toBe('Tue');
    expect(
      formatCadence({ kind: 'specific_weekdays', weekdays: [6] }),
    ).toBe('Sun');
  });

  it('specific_weekdays partial weekend (Sat only) → just "Sat" not "Weekends"', () => {
    expect(
      formatCadence({ kind: 'specific_weekdays', weekdays: [5] }),
    ).toBe('Sat');
  });

  it('specific_weekdays empty array (edge — validation forbids but handle gracefully)', () => {
    // Validation prevents this at the API boundary, but the formatter should
    // not crash if someone hands it an empty array.
    expect(
      formatCadence({ kind: 'specific_weekdays', weekdays: [] }),
    ).toBe('No days');
  });
});

// ---------------------------------------------------------------------------
// formatCadenceAccessible
// ---------------------------------------------------------------------------

describe('formatCadenceAccessible', () => {
  it('daily → "Daily"', () => {
    expect(formatCadenceAccessible({ kind: 'daily' })).toBe('Daily');
  });

  it('weekly_count → "N times per week"', () => {
    expect(
      formatCadenceAccessible({
        kind: 'weekly_count',
        perWeek: 3,
        weekStart: 0,
      }),
    ).toBe('3 times per week');
  });

  it('specific_weekdays → comma-separated full names', () => {
    expect(
      formatCadenceAccessible({
        kind: 'specific_weekdays',
        weekdays: [0, 2, 4],
      }),
    ).toBe('Monday, Wednesday, Friday');
  });

  it('specific_weekdays all 7 → "Every day"', () => {
    expect(
      formatCadenceAccessible({
        kind: 'specific_weekdays',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      }),
    ).toBe('Every day');
  });

  it('specific_weekdays empty → "No days scheduled"', () => {
    expect(
      formatCadenceAccessible({
        kind: 'specific_weekdays',
        weekdays: [],
      }),
    ).toBe('No days scheduled');
  });

  it('sorts weekdays ascending before formatting', () => {
    expect(
      formatCadenceAccessible({
        kind: 'specific_weekdays',
        weekdays: [4, 0, 2],
      }),
    ).toBe('Monday, Wednesday, Friday');
  });
});

// ---------------------------------------------------------------------------
// isCadenceDueOnWeekday
// ---------------------------------------------------------------------------

describe('isCadenceDueOnWeekday', () => {
  it('daily — always true', () => {
    const cadence: HabitCadence = { kind: 'daily' };
    for (let wd = 0; wd <= 6; wd++) {
      expect(isCadenceDueOnWeekday(cadence, wd)).toBe(true);
    }
  });

  it('weekly_count — always true (every day is eligible)', () => {
    const cadence: HabitCadence = {
      kind: 'weekly_count',
      perWeek: 3,
      weekStart: 0,
    };
    for (let wd = 0; wd <= 6; wd++) {
      expect(isCadenceDueOnWeekday(cadence, wd)).toBe(true);
    }
  });

  it('specific_weekdays — true only for listed weekdays', () => {
    const cadence: HabitCadence = {
      kind: 'specific_weekdays',
      weekdays: [0, 2, 4],
    };
    expect(isCadenceDueOnWeekday(cadence, 0)).toBe(true); // Mon
    expect(isCadenceDueOnWeekday(cadence, 1)).toBe(false); // Tue
    expect(isCadenceDueOnWeekday(cadence, 2)).toBe(true); // Wed
    expect(isCadenceDueOnWeekday(cadence, 3)).toBe(false); // Thu
    expect(isCadenceDueOnWeekday(cadence, 4)).toBe(true); // Fri
    expect(isCadenceDueOnWeekday(cadence, 5)).toBe(false); // Sat
    expect(isCadenceDueOnWeekday(cadence, 6)).toBe(false); // Sun
  });

  it('specific_weekdays empty list — never true', () => {
    const cadence: HabitCadence = {
      kind: 'specific_weekdays',
      weekdays: [],
    };
    for (let wd = 0; wd <= 6; wd++) {
      expect(isCadenceDueOnWeekday(cadence, wd)).toBe(false);
    }
  });
});
