/**
 * Unit tests for lib/validation/push.ts.
 *
 * Covers:
 *   - `weekdaySchema`, `timeOfDaySchema`, `weekdaysListSchema` primitives
 *   - `subscribePushSchema` / `unsubscribePushSchema`
 *   - `schedulesListQuerySchema` / `createScheduleSchema` / `updateScheduleSchema`
 */

import { describe, it, expect } from 'vitest';
import {
  weekdaySchema,
  timeOfDaySchema,
  weekdaysListSchema,
  subjectTypeSchema,
  subscribePushSchema,
  unsubscribePushSchema,
  schedulesListQuerySchema,
  createScheduleSchema,
  updateScheduleSchema,
} from '@/lib/validation/push';

// ---------------------------------------------------------------------------
// weekdaySchema
// ---------------------------------------------------------------------------

describe('weekdaySchema', () => {
  it('accepts integers 0..6', () => {
    for (let i = 0; i <= 6; i++) {
      expect(weekdaySchema.safeParse(i).success).toBe(true);
    }
  });

  it('rejects -1 and 7', () => {
    expect(weekdaySchema.safeParse(-1).success).toBe(false);
    expect(weekdaySchema.safeParse(7).success).toBe(false);
  });

  it('rejects non-integers', () => {
    expect(weekdaySchema.safeParse(0.5).success).toBe(false);
    expect(weekdaySchema.safeParse(2.7).success).toBe(false);
  });

  it('rejects non-numbers', () => {
    expect(weekdaySchema.safeParse('0').success).toBe(false);
    expect(weekdaySchema.safeParse(null).success).toBe(false);
    expect(weekdaySchema.safeParse(undefined).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// timeOfDaySchema
// ---------------------------------------------------------------------------

describe('timeOfDaySchema', () => {
  it('accepts well-formed "HH:MM" 24-hour strings', () => {
    expect(timeOfDaySchema.safeParse('00:00').success).toBe(true);
    expect(timeOfDaySchema.safeParse('07:30').success).toBe(true);
    expect(timeOfDaySchema.safeParse('12:00').success).toBe(true);
    expect(timeOfDaySchema.safeParse('23:59').success).toBe(true);
    expect(timeOfDaySchema.safeParse('19:05').success).toBe(true);
  });

  it('rejects "24:00" (24 is not a valid hour)', () => {
    expect(timeOfDaySchema.safeParse('24:00').success).toBe(false);
  });

  it('rejects unpadded hours like "9:30"', () => {
    expect(timeOfDaySchema.safeParse('9:30').success).toBe(false);
  });

  it('rejects unpadded minutes like "09:5"', () => {
    expect(timeOfDaySchema.safeParse('09:5').success).toBe(false);
  });

  it('rejects out-of-range minutes (e.g. "00:60")', () => {
    expect(timeOfDaySchema.safeParse('00:60').success).toBe(false);
    expect(timeOfDaySchema.safeParse('12:99').success).toBe(false);
  });

  it('rejects empty / clearly malformed strings', () => {
    expect(timeOfDaySchema.safeParse('').success).toBe(false);
    expect(timeOfDaySchema.safeParse('abc').success).toBe(false);
    expect(timeOfDaySchema.safeParse('07-30').success).toBe(false);
    expect(timeOfDaySchema.safeParse('07:30:00').success).toBe(false);
  });

  it('rejects negative hours', () => {
    expect(timeOfDaySchema.safeParse('-1:00').success).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(timeOfDaySchema.safeParse(730).success).toBe(false);
    expect(timeOfDaySchema.safeParse(null).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// weekdaysListSchema (with transform)
// ---------------------------------------------------------------------------

describe('weekdaysListSchema', () => {
  it('accepts a sorted list', () => {
    const r = weekdaysListSchema.safeParse([0, 2, 4]);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual([0, 2, 4]);
  });

  it('dedupes and sorts ascending via transform', () => {
    const r = weekdaysListSchema.safeParse([6, 0, 4, 0, 2, 6]);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual([0, 2, 4, 6]);
  });

  it('rejects empty array (non-empty constraint)', () => {
    expect(weekdaysListSchema.safeParse([]).success).toBe(false);
  });

  it('accepts a single-day list', () => {
    const r = weekdaysListSchema.safeParse([3]);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual([3]);
  });

  it('accepts all 7 weekdays', () => {
    const r = weekdaysListSchema.safeParse([0, 1, 2, 3, 4, 5, 6]);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('accepts more than 7 raw entries when deduped to <= 7', () => {
    // Raw length 8 fails `max(7)` even though deduped would be 1. This is by
    // design: max is checked pre-transform.
    expect(
      weekdaysListSchema.safeParse([0, 0, 0, 0, 0, 0, 0, 0]).success,
    ).toBe(false);
  });

  it('rejects weekday out of range', () => {
    expect(weekdaysListSchema.safeParse([7]).success).toBe(false);
    expect(weekdaysListSchema.safeParse([0, -1, 2]).success).toBe(false);
  });

  it('rejects non-integers in the array', () => {
    expect(weekdaysListSchema.safeParse([0.5]).success).toBe(false);
  });

  it('rejects non-array', () => {
    expect(weekdaysListSchema.safeParse('0,1,2').success).toBe(false);
    expect(weekdaysListSchema.safeParse(0).success).toBe(false);
    expect(weekdaysListSchema.safeParse(null).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// subjectTypeSchema
// ---------------------------------------------------------------------------

describe('subjectTypeSchema', () => {
  it('accepts "routine" and "habit"', () => {
    expect(subjectTypeSchema.safeParse('routine').success).toBe(true);
    expect(subjectTypeSchema.safeParse('habit').success).toBe(true);
  });

  it('rejects other values', () => {
    expect(subjectTypeSchema.safeParse('routines').success).toBe(false);
    expect(subjectTypeSchema.safeParse('Routine').success).toBe(false);
    expect(subjectTypeSchema.safeParse('').success).toBe(false);
    expect(subjectTypeSchema.safeParse(null).success).toBe(false);
    expect(subjectTypeSchema.safeParse(undefined).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// subscribePushSchema
// ---------------------------------------------------------------------------

describe('subscribePushSchema', () => {
  const VALID = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: 'p256dh-base64url-value', auth: 'auth-base64url-value' },
  };

  it('accepts a minimal valid payload (no userAgent)', () => {
    const r = subscribePushSchema.safeParse(VALID);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.endpoint).toBe(VALID.endpoint);
      expect(r.data.keys.p256dh).toBe(VALID.keys.p256dh);
      expect(r.data.keys.auth).toBe(VALID.keys.auth);
      expect(r.data.userAgent).toBeUndefined();
    }
  });

  it('accepts a payload with userAgent', () => {
    const r = subscribePushSchema.safeParse({
      ...VALID,
      userAgent: 'Mozilla/5.0 (Macintosh; ...) Chrome/120',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.userAgent).toMatch(/Mozilla/);
  });

  it('rejects a non-https endpoint', () => {
    expect(
      subscribePushSchema.safeParse({
        ...VALID,
        endpoint: 'http://fcm.googleapis.com/fcm/send/abc',
      }).success,
    ).toBe(false);
  });

  it('rejects a non-URL endpoint', () => {
    expect(
      subscribePushSchema.safeParse({ ...VALID, endpoint: 'not-a-url' })
        .success,
    ).toBe(false);
  });

  it('rejects endpoint > 2048 chars', () => {
    const longPath = '/' + 'a'.repeat(2100);
    expect(
      subscribePushSchema.safeParse({
        ...VALID,
        endpoint: `https://example.com${longPath}`,
      }).success,
    ).toBe(false);
  });

  it('rejects missing endpoint', () => {
    expect(
      subscribePushSchema.safeParse({
        keys: VALID.keys,
      }).success,
    ).toBe(false);
  });

  it('rejects missing keys object', () => {
    expect(
      subscribePushSchema.safeParse({ endpoint: VALID.endpoint }).success,
    ).toBe(false);
  });

  it('rejects empty p256dh', () => {
    expect(
      subscribePushSchema.safeParse({
        ...VALID,
        keys: { p256dh: '', auth: 'something' },
      }).success,
    ).toBe(false);
  });

  it('rejects empty auth', () => {
    expect(
      subscribePushSchema.safeParse({
        ...VALID,
        keys: { p256dh: 'something', auth: '' },
      }).success,
    ).toBe(false);
  });

  it('rejects p256dh > 512 chars', () => {
    expect(
      subscribePushSchema.safeParse({
        ...VALID,
        keys: { p256dh: 'a'.repeat(513), auth: 'ok' },
      }).success,
    ).toBe(false);
  });

  it('rejects userAgent > 512 chars', () => {
    expect(
      subscribePushSchema.safeParse({
        ...VALID,
        userAgent: 'x'.repeat(513),
      }).success,
    ).toBe(false);
  });

  it('rejects non-object payload', () => {
    expect(subscribePushSchema.safeParse(null).success).toBe(false);
    expect(subscribePushSchema.safeParse('hello').success).toBe(false);
    expect(subscribePushSchema.safeParse(42).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// unsubscribePushSchema
// ---------------------------------------------------------------------------

describe('unsubscribePushSchema', () => {
  it('accepts a valid URL endpoint (any scheme)', () => {
    expect(
      unsubscribePushSchema.safeParse({
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      }).success,
    ).toBe(true);
    // Documented intentional gap: the unsubscribe path does NOT enforce https
    // so a user can clean up a stale entry.
    expect(
      unsubscribePushSchema.safeParse({
        endpoint: 'http://fcm.googleapis.com/fcm/send/abc',
      }).success,
    ).toBe(true);
  });

  it('rejects non-URL endpoint', () => {
    expect(
      unsubscribePushSchema.safeParse({ endpoint: 'not-a-url' }).success,
    ).toBe(false);
  });

  it('rejects missing endpoint', () => {
    expect(unsubscribePushSchema.safeParse({}).success).toBe(false);
  });

  it('rejects endpoint > 2048 chars', () => {
    expect(
      unsubscribePushSchema.safeParse({
        endpoint: `https://example.com/${'a'.repeat(2100)}`,
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// schedulesListQuerySchema
// ---------------------------------------------------------------------------

describe('schedulesListQuerySchema', () => {
  it('accepts empty (neither field)', () => {
    expect(schedulesListQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts both fields together', () => {
    const r = schedulesListQuerySchema.safeParse({
      subjectType: 'routine',
      subjectId: '00000000-0000-0000-0000-000000000001',
    });
    expect(r.success).toBe(true);
  });

  it('rejects subjectType without subjectId', () => {
    expect(
      schedulesListQuerySchema.safeParse({ subjectType: 'routine' }).success,
    ).toBe(false);
  });

  it('rejects subjectId without subjectType', () => {
    expect(
      schedulesListQuerySchema.safeParse({
        subjectId: '00000000-0000-0000-0000-000000000001',
      }).success,
    ).toBe(false);
  });

  it('rejects invalid subjectType', () => {
    expect(
      schedulesListQuerySchema.safeParse({
        subjectType: 'unknown',
        subjectId: '00000000-0000-0000-0000-000000000001',
      }).success,
    ).toBe(false);
  });

  it('rejects malformed UUID subjectId', () => {
    expect(
      schedulesListQuerySchema.safeParse({
        subjectType: 'routine',
        subjectId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createScheduleSchema
// ---------------------------------------------------------------------------

describe('createScheduleSchema', () => {
  const VALID = {
    subjectType: 'routine' as const,
    subjectId: '00000000-0000-0000-0000-000000000001',
    time: '07:30',
    weekdays: [0, 2, 4],
  };

  it('accepts a minimal valid payload', () => {
    const r = createScheduleSchema.safeParse(VALID);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.subjectType).toBe('routine');
      expect(r.data.time).toBe('07:30');
      expect(r.data.weekdays).toEqual([0, 2, 4]);
      expect(r.data.enabled).toBeUndefined();
    }
  });

  it('accepts enabled: true / false explicitly', () => {
    const t = createScheduleSchema.safeParse({ ...VALID, enabled: true });
    expect(t.success).toBe(true);
    if (t.success) expect(t.data.enabled).toBe(true);

    const f = createScheduleSchema.safeParse({ ...VALID, enabled: false });
    expect(f.success).toBe(true);
    if (f.success) expect(f.data.enabled).toBe(false);
  });

  it('accepts subjectType "habit"', () => {
    expect(
      createScheduleSchema.safeParse({ ...VALID, subjectType: 'habit' }).success,
    ).toBe(true);
  });

  it('dedupes + sorts weekdays via the list transform', () => {
    const r = createScheduleSchema.safeParse({
      ...VALID,
      weekdays: [6, 0, 4, 0, 6],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.weekdays).toEqual([0, 4, 6]);
  });

  it('rejects empty weekdays', () => {
    expect(
      createScheduleSchema.safeParse({ ...VALID, weekdays: [] }).success,
    ).toBe(false);
  });

  it('rejects weekday out of range', () => {
    expect(
      createScheduleSchema.safeParse({ ...VALID, weekdays: [7] }).success,
    ).toBe(false);
  });

  it('rejects bad time format', () => {
    expect(
      createScheduleSchema.safeParse({ ...VALID, time: '9:30' }).success,
    ).toBe(false);
    expect(
      createScheduleSchema.safeParse({ ...VALID, time: '24:00' }).success,
    ).toBe(false);
  });

  it('rejects malformed uuid', () => {
    expect(
      createScheduleSchema.safeParse({ ...VALID, subjectId: 'nope' }).success,
    ).toBe(false);
  });

  it('rejects missing fields', () => {
    const { subjectType: _st, ...noType } = VALID;
    expect(createScheduleSchema.safeParse(noType).success).toBe(false);
    const { subjectId: _si, ...noId } = VALID;
    expect(createScheduleSchema.safeParse(noId).success).toBe(false);
    const { time: _t, ...noTime } = VALID;
    expect(createScheduleSchema.safeParse(noTime).success).toBe(false);
    const { weekdays: _w, ...noWd } = VALID;
    expect(createScheduleSchema.safeParse(noWd).success).toBe(false);
  });

  it('rejects unknown subjectType', () => {
    expect(
      createScheduleSchema.safeParse({
        ...VALID,
        subjectType: 'project' as unknown as 'routine',
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateScheduleSchema
// ---------------------------------------------------------------------------

describe('updateScheduleSchema', () => {
  it('accepts a partial: time only', () => {
    const r = updateScheduleSchema.safeParse({ time: '08:00' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.time).toBe('08:00');
  });

  it('accepts a partial: weekdays only', () => {
    const r = updateScheduleSchema.safeParse({ weekdays: [0, 2, 4] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.weekdays).toEqual([0, 2, 4]);
  });

  it('accepts a partial: enabled only (true)', () => {
    const r = updateScheduleSchema.safeParse({ enabled: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.enabled).toBe(true);
  });

  it('accepts a partial: enabled only (false)', () => {
    const r = updateScheduleSchema.safeParse({ enabled: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.enabled).toBe(false);
  });

  it('accepts multiple fields at once', () => {
    const r = updateScheduleSchema.safeParse({
      time: '08:00',
      weekdays: [1, 3],
      enabled: false,
    });
    expect(r.success).toBe(true);
  });

  it('rejects an empty body (refine requires >=1 field)', () => {
    expect(updateScheduleSchema.safeParse({}).success).toBe(false);
  });

  it('rejects bad time', () => {
    expect(
      updateScheduleSchema.safeParse({ time: '9:30' }).success,
    ).toBe(false);
  });

  it('rejects bad weekdays', () => {
    expect(
      updateScheduleSchema.safeParse({ weekdays: [] }).success,
    ).toBe(false);
    expect(
      updateScheduleSchema.safeParse({ weekdays: [9] }).success,
    ).toBe(false);
  });

  it('dedupes + sorts weekdays via the list transform', () => {
    const r = updateScheduleSchema.safeParse({ weekdays: [4, 0, 0, 2] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.weekdays).toEqual([0, 2, 4]);
  });
});
