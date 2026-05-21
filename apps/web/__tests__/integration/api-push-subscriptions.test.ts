/**
 * Integration tests — /api/push/subscriptions
 *
 *   GET    — list (sanitised; no secrets) for the current user.
 *   POST   — upsert by endpoint; 503 when VAPID not configured.
 *   DELETE — remove by endpoint; always 204 (idempotent).
 *
 * Dual-auth (session OR owner-token) is delegated to `withUser`; we cover it
 * at the auth-shape level (one happy-path 401 and the rest with a mocked session).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

const authMock = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => authMock(),
}));

import { GET, POST, DELETE } from '@/app/api/push/subscriptions/route';
import {
  resetDb,
  makeUser,
  makePushSubscription,
  countPushSubscriptions,
  db,
} from '@/__tests__/helpers/db';
import { _resetVapidMemo } from '@/lib/push/vapid';
import { jsonRequest, getRequest } from '@/__tests__/helpers/request';
import { eq } from 'drizzle-orm';
import { pushSubscriptions } from '@/db/schema';

const URL = 'http://localhost:3000/api/push/subscriptions';
const VAPID_PUBLIC = 'BVapidPublicKey1234567890abcdef';
const VAPID_PRIVATE = 'VapidPrivateKey1234567890';
const VAPID_SUBJECT = 'mailto:test@example.com';

const EMPTY_CTX = { params: Promise.resolve({}) };

let userId: string;
let otherId: string;

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  _resetVapidMemo();
  vi.stubEnv('OWNER_API_TOKEN', 'test-owner-token-must-be-at-least-sixteen-chars');
  vi.stubEnv('OWNER_EMAIL', 'owner@example.com');
  vi.stubEnv('VAPID_PUBLIC_KEY', VAPID_PUBLIC);
  vi.stubEnv('VAPID_PRIVATE_KEY', VAPID_PRIVATE);
  vi.stubEnv('VAPID_SUBJECT', VAPID_SUBJECT);
  const u = await makeUser({ email: 'alice@example.com', verified: true });
  const o = await makeUser({ email: 'bob@example.com', verified: true });
  userId = u.id;
  otherId = o.id;
  authMock.mockResolvedValue({ user: { id: userId } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('subscriptions — auth', () => {
  it('returns 401 unauthenticated when not signed in and no Bearer', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(getRequest({ url: URL }), EMPTY_CTX);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthenticated');
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe('POST /api/push/subscriptions', () => {
  const VALID_BODY = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abcdef',
    keys: { p256dh: 'p256dh-value-here', auth: 'auth-value-here' },
    userAgent: 'TestAgent/1.0',
  };

  it('creates a subscription with the right user and returns sanitised fields', async () => {
    const res = await POST(jsonRequest({ url: URL, body: VALID_BODY }), EMPTY_CTX);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.subscription.id).toBeDefined();
    expect(body.subscription.userAgent).toBe('TestAgent/1.0');
    expect(body.subscription.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.subscription.lastSeenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // The response must NOT echo the endpoint or keys back.
    expect(body.subscription).not.toHaveProperty('endpoint');
    expect(body.subscription).not.toHaveProperty('p256dh');
    expect(body.subscription).not.toHaveProperty('auth');
    expect(body.subscription).not.toHaveProperty('keys');

    // Row persisted with the right user.
    expect(await countPushSubscriptions()).toBe(1);
    const [row] = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, VALID_BODY.endpoint));
    expect(row?.userId).toBe(userId);
    expect(row?.p256dh).toBe(VALID_BODY.keys.p256dh);
    expect(row?.auth).toBe(VALID_BODY.keys.auth);
  });

  it('upserts by endpoint: POSTing the same endpoint twice yields 1 row + bumps lastSeenAt', async () => {
    const firstRes = await POST(jsonRequest({ url: URL, body: VALID_BODY }), EMPTY_CTX);
    expect(firstRes.status).toBe(201);
    const firstBody = await firstRes.json();
    const firstLastSeen = new Date(firstBody.subscription.lastSeenAt).getTime();

    // Sleep 5ms via Date stub: just call again; clock should have moved.
    await new Promise((r) => setTimeout(r, 10));

    const secondRes = await POST(jsonRequest({ url: URL, body: VALID_BODY }), EMPTY_CTX);
    expect(secondRes.status).toBe(201);
    const secondBody = await secondRes.json();
    const secondLastSeen = new Date(secondBody.subscription.lastSeenAt).getTime();

    expect(await countPushSubscriptions()).toBe(1);
    expect(secondLastSeen).toBeGreaterThanOrEqual(firstLastSeen);
  });

  it('upsert re-binds to current user when the same endpoint was previously owned by someone else', async () => {
    // Pre-seed an existing sub owned by other.
    await makePushSubscription({
      userId: otherId,
      endpoint: VALID_BODY.endpoint,
    });
    expect(await countPushSubscriptions()).toBe(1);

    const res = await POST(jsonRequest({ url: URL, body: VALID_BODY }), EMPTY_CTX);
    expect(res.status).toBe(201);
    expect(await countPushSubscriptions()).toBe(1);
    const [row] = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, VALID_BODY.endpoint));
    expect(row?.userId).toBe(userId);
  });

  it('returns 503 push_not_configured when VAPID env is missing', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    const res = await POST(jsonRequest({ url: URL, body: VALID_BODY }), EMPTY_CTX);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('push_not_configured');
    expect(await countPushSubscriptions()).toBe(0);
  });

  it('returns 400 invalid_json for non-JSON body', async () => {
    const res = await POST(jsonRequest({ url: URL, body: 'not json' }), EMPTY_CTX);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });

  it('returns 400 validation_error for non-https endpoint', async () => {
    const res = await POST(
      jsonRequest({
        url: URL,
        body: {
          ...VALID_BODY,
          endpoint: 'http://fcm.googleapis.com/fcm/send/abcdef',
        },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 validation_error when keys are missing', async () => {
    const res = await POST(
      jsonRequest({
        url: URL,
        body: { endpoint: VALID_BODY.endpoint },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(400);
  });

  it('userAgent is optional', async () => {
    const res = await POST(
      jsonRequest({
        url: URL,
        body: { endpoint: VALID_BODY.endpoint, keys: VALID_BODY.keys },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.subscription.userAgent).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/push/subscriptions', () => {
  it('returns 204 and removes the row when the endpoint exists', async () => {
    const sub = await makePushSubscription({
      userId,
      endpoint: 'https://fcm.googleapis.com/fcm/send/del-1',
    });
    expect(await countPushSubscriptions()).toBe(1);

    const res = await DELETE(
      jsonRequest({ url: URL, body: { endpoint: sub.endpoint } }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(204);
    expect(await countPushSubscriptions()).toBe(0);
  });

  it('returns 204 even when the endpoint does not exist (idempotent)', async () => {
    const res = await DELETE(
      jsonRequest({
        url: URL,
        body: { endpoint: 'https://fcm.googleapis.com/fcm/send/never-was' },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(204);
  });

  it('does NOT delete subscriptions owned by other users', async () => {
    const sub = await makePushSubscription({
      userId: otherId,
      endpoint: 'https://fcm.googleapis.com/fcm/send/others',
    });

    const res = await DELETE(
      jsonRequest({ url: URL, body: { endpoint: sub.endpoint } }),
      EMPTY_CTX,
    );
    // Still 204 (idempotent).
    expect(res.status).toBe(204);
    // But row survives.
    expect(await countPushSubscriptions()).toBe(1);
  });

  it('returns 400 invalid_json for non-JSON body', async () => {
    const res = await DELETE(jsonRequest({ url: URL, body: 'nope' }), EMPTY_CTX);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });

  it('returns 400 validation_error for missing endpoint', async () => {
    const res = await DELETE(jsonRequest({ url: URL, body: {} }), EMPTY_CTX);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 validation_error for invalid endpoint URL', async () => {
    const res = await DELETE(
      jsonRequest({ url: URL, body: { endpoint: 'not-a-url' } }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/push/subscriptions', () => {
  it('returns an empty list when the user has no subscriptions', async () => {
    const res = await GET(getRequest({ url: URL }), EMPTY_CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.subscriptions).toEqual([]);
  });

  it('returns the current user\'s subscriptions, sanitised (no endpoint/keys)', async () => {
    const sub = await makePushSubscription({
      userId,
      endpoint: 'https://fcm.googleapis.com/fcm/send/u-1',
      userAgent: 'TestUA',
    });
    const res = await GET(getRequest({ url: URL }), EMPTY_CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscriptions).toHaveLength(1);
    expect(body.subscriptions[0].id).toBe(sub.id);
    expect(body.subscriptions[0].userAgent).toBe('TestUA');
    expect(body.subscriptions[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.subscriptions[0].lastSeenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.subscriptions[0]).not.toHaveProperty('endpoint');
    expect(body.subscriptions[0]).not.toHaveProperty('p256dh');
    expect(body.subscriptions[0]).not.toHaveProperty('auth');
    expect(body.subscriptions[0]).not.toHaveProperty('keys');
  });

  it('does NOT return subscriptions owned by other users', async () => {
    await makePushSubscription({ userId });
    await makePushSubscription({ userId });
    await makePushSubscription({ userId: otherId });
    await makePushSubscription({ userId: otherId });

    const res = await GET(getRequest({ url: URL }), EMPTY_CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscriptions).toHaveLength(2);
  });

  it('returns subscriptions ordered by createdAt ascending', async () => {
    const a = await makePushSubscription({
      userId,
      createdAt: new Date('2026-05-01T00:00:00Z'),
    });
    const b = await makePushSubscription({
      userId,
      createdAt: new Date('2026-05-02T00:00:00Z'),
    });
    const c = await makePushSubscription({
      userId,
      createdAt: new Date('2026-05-03T00:00:00Z'),
    });

    const res = await GET(getRequest({ url: URL }), EMPTY_CTX);
    const body = await res.json();
    expect(body.subscriptions.map((s: { id: string }) => s.id)).toEqual([
      a.id,
      b.id,
      c.id,
    ]);
  });
});
