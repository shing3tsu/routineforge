/**
 * Integration tests — GET /api/push/vapid-public-key (PUBLIC).
 *
 * Behaviour:
 *   - 200 with `{ key }` when VAPID is configured.
 *   - 503 with structured error when missing.
 *   - Cache-Control header set to 1h immutable.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// web-push is imported by the lib/push/vapid module via dispatcher; we stub it
// to avoid surprises (the public-key endpoint itself doesn't call setVapidDetails
// so this is belt+braces).
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

import { GET } from '@/app/api/push/vapid-public-key/route';
import { _resetVapidMemo } from '@/lib/push/vapid';

const VAPID_PUBLIC = 'BVapidPublicKey1234567890abcdef';
const VAPID_PRIVATE = 'VapidPrivateKey1234567890';
const VAPID_SUBJECT = 'mailto:test@example.com';

beforeEach(() => {
  _resetVapidMemo();
  vi.stubEnv('VAPID_PUBLIC_KEY', '');
  vi.stubEnv('VAPID_PRIVATE_KEY', '');
  vi.stubEnv('VAPID_SUBJECT', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/push/vapid-public-key', () => {
  it('returns 200 with the public key when VAPID is configured', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', VAPID_PUBLIC);
    vi.stubEnv('VAPID_PRIVATE_KEY', VAPID_PRIVATE);
    vi.stubEnv('VAPID_SUBJECT', VAPID_SUBJECT);

    const res = GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.key).toBe(VAPID_PUBLIC);
  });

  it('sets Cache-Control: public, max-age=3600 immutable when configured', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', VAPID_PUBLIC);
    vi.stubEnv('VAPID_PRIVATE_KEY', VAPID_PRIVATE);
    vi.stubEnv('VAPID_SUBJECT', VAPID_SUBJECT);

    const res = GET();
    const cc = res.headers.get('cache-control');
    expect(cc).toBeTruthy();
    expect(cc).toMatch(/public/);
    expect(cc).toMatch(/max-age=3600/);
    expect(cc).toMatch(/immutable/);
  });

  it('returns 503 push_not_configured when VAPID env is missing', async () => {
    const res = GET();
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('push_not_configured');
    expect(body.message).toMatch(/not configured/i);
  });

  it('returns 503 when only one of the three env vars is set', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', VAPID_PUBLIC);
    const res = GET();
    expect(res.status).toBe(503);
  });

  it('returns 503 when the subject scheme is invalid', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', VAPID_PUBLIC);
    vi.stubEnv('VAPID_PRIVATE_KEY', VAPID_PRIVATE);
    vi.stubEnv('VAPID_SUBJECT', 'tel:+1234567890');
    const res = GET();
    expect(res.status).toBe(503);
  });
});
