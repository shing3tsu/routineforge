/**
 * Integration tests — POST /api/push/dispatch-tick (cron entrypoint).
 *
 *   - Owner-token only (NOT withUser).
 *   - 401 when missing / wrong token.
 *   - Right token + due schedule → fired; verifies web-push.sendNotification was called.
 *   - Right token + 410 sender → deleted.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

const sendNotificationMock = vi.fn();
const setVapidDetailsMock = vi.fn();
vi.mock('web-push', () => ({
  default: {
    sendNotification: (...args: unknown[]) => sendNotificationMock(...args),
    setVapidDetails: (...args: unknown[]) => setVapidDetailsMock(...args),
  },
  sendNotification: (...args: unknown[]) => sendNotificationMock(...args),
  setVapidDetails: (...args: unknown[]) => setVapidDetailsMock(...args),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/push/dispatch-tick/route';
import { _resetVapidMemo } from '@/lib/push/vapid';
import {
  resetDb,
  makeUser,
  makeRoutine,
  makePushSubscription,
  makeNotificationSchedule,
  countPushSubscriptions,
} from '@/__tests__/helpers/db';

const URL = 'http://localhost:3000/api/push/dispatch-tick';
const VALID_TOKEN = 'test-owner-token-must-be-at-least-sixteen-chars';
const VAPID_PUBLIC = 'BVapidPublicKey1234567890abcdef';
const VAPID_PRIVATE = 'VapidPrivateKey1234567890';
const VAPID_SUBJECT = 'mailto:test@example.com';

function gone(): Error & { statusCode: number; body: string; message: string } {
  return Object.assign(new Error('Gone'), {
    statusCode: 410,
    body: 'Push subscription not found',
    message: 'Gone',
  });
}

function makeReq(token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  return new NextRequest(URL, { method: 'POST', headers });
}

beforeEach(async () => {
  await resetDb();
  sendNotificationMock.mockReset();
  sendNotificationMock.mockResolvedValue(undefined);
  setVapidDetailsMock.mockReset();
  _resetVapidMemo();
  vi.stubEnv('OWNER_API_TOKEN', VALID_TOKEN);
  vi.stubEnv('VAPID_PUBLIC_KEY', VAPID_PUBLIC);
  vi.stubEnv('VAPID_PRIVATE_KEY', VAPID_PRIVATE);
  vi.stubEnv('VAPID_SUBJECT', VAPID_SUBJECT);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/push/dispatch-tick — auth', () => {
  it('returns 401 unauthorized when no Authorization header', async () => {
    const res = await POST(makeReq(undefined));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('unauthorized');
  });

  it('returns 401 unauthorized when token is wrong', async () => {
    const res = await POST(
      makeReq('test-owner-token-must-be-at-least-sixteen-chos'),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthorized');
  });

  it('returns 401 unauthorized when OWNER_API_TOKEN is unset on the server', async () => {
    vi.stubEnv('OWNER_API_TOKEN', '');
    const res = await POST(makeReq(VALID_TOKEN));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/push/dispatch-tick — happy path', () => {
  it('returns 200 with all-zero counts when there are no due schedules', async () => {
    const res = await POST(makeReq(VALID_TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checked).toBe(0);
    expect(body.fired).toBe(0);
    expect(body.deleted).toBe(0);
    expect(body.errors).toBe(0);
  });

  it('returns checked/fired counts when a schedule is due + dispatches the push', async () => {
    // Set up a schedule due in UTC at the current minute.
    // We rely on the dispatcher reading new Date() inside dispatchTick. Build
    // a schedule that fires every weekday with the current minute as `time` so
    // the integration test is robust to "any time of day".
    const user = await makeUser({ email: 'u@example.com' });
    const routine = await makeRoutine({
      ownerUserId: user.id,
      timezone: 'UTC',
      name: 'Test routine',
    });
    await makePushSubscription({
      userId: user.id,
      endpoint: 'https://fcm.googleapis.com/fcm/send/integration-1',
    });

    // Compute the current HH:MM in UTC.
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const time = fmt.format(now);

    await makeNotificationSchedule({
      userId: user.id,
      routineId: routine.id,
      time,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    });

    const res = await POST(makeReq(VALID_TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checked).toBe(1);
    expect(body.fired).toBe(1);
    expect(body.deleted).toBe(0);
    expect(body.errors).toBe(0);

    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const [pushSub, json] = sendNotificationMock.mock.calls[0]!;
    expect(pushSub.endpoint).toBe(
      'https://fcm.googleapis.com/fcm/send/integration-1',
    );
    const payload = JSON.parse(json as string);
    expect(payload.subjectType).toBe('routine');
    expect(payload.subjectId).toBe(routine.id);
    expect(payload.title).toBe('Test routine');
  });

  it('reports deleted: 1 when the sender returns 410 Gone', async () => {
    const user = await makeUser({ email: 'u@example.com' });
    const routine = await makeRoutine({ ownerUserId: user.id, timezone: 'UTC' });
    await makePushSubscription({
      userId: user.id,
      endpoint: 'https://fcm.googleapis.com/fcm/send/dead-x',
    });
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const time = fmt.format(now);
    await makeNotificationSchedule({
      userId: user.id,
      routineId: routine.id,
      time,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    });

    sendNotificationMock.mockRejectedValueOnce(gone());
    expect(await countPushSubscriptions()).toBe(1);

    const res = await POST(makeReq(VALID_TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fired).toBe(0);
    expect(body.deleted).toBe(1);
    expect(body.errors).toBe(0);
    expect(await countPushSubscriptions()).toBe(0);
  });

  it('returns 200 with checked=0, fired=0 when VAPID is unconfigured', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    _resetVapidMemo();
    const res = await POST(makeReq(VALID_TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checked).toBe(0);
    expect(body.fired).toBe(0);
    expect(body.deleted).toBe(0);
    expect(body.errors).toBe(0);
  });
});
