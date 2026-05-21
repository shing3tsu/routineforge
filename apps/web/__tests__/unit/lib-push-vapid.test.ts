/**
 * Unit tests for lib/push/vapid.ts.
 *
 * Covers:
 *   - getVapidConfig / isVapidConfigured behaviour across env presence
 *   - applyVapid idempotency + re-application when env changes
 *   - subject must be mailto/https per RFC 8292
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock web-push so applyVapid doesn't actually touch the real setVapidDetails
// (which validates the keys cryptographically). We only care that it was called
// with the right args.
const setVapidDetailsMock = vi.fn();

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => setVapidDetailsMock(...args),
  },
  setVapidDetails: (...args: unknown[]) => setVapidDetailsMock(...args),
}));

import {
  getVapidConfig,
  isVapidConfigured,
  applyVapid,
  _resetVapidMemo,
} from '@/lib/push/vapid';

const PUBLIC_KEY = 'BPublicKeyPlaceholder1234567890abcdef';
const PRIVATE_KEY = 'PrivateKeyPlaceholderXYZ987';
const SUBJECT = 'mailto:test@example.com';

beforeEach(() => {
  // Wipe the memo so each test starts clean.
  _resetVapidMemo();
  setVapidDetailsMock.mockReset();
  vi.stubEnv('VAPID_PUBLIC_KEY', '');
  vi.stubEnv('VAPID_PRIVATE_KEY', '');
  vi.stubEnv('VAPID_SUBJECT', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// getVapidConfig
// ---------------------------------------------------------------------------

describe('getVapidConfig', () => {
  it('returns null when all three env vars are missing', () => {
    expect(getVapidConfig()).toBeNull();
  });

  it('returns null when VAPID_PUBLIC_KEY is missing', () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', PRIVATE_KEY);
    vi.stubEnv('VAPID_SUBJECT', SUBJECT);
    expect(getVapidConfig()).toBeNull();
  });

  it('returns null when VAPID_PRIVATE_KEY is missing', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', PUBLIC_KEY);
    vi.stubEnv('VAPID_SUBJECT', SUBJECT);
    expect(getVapidConfig()).toBeNull();
  });

  it('returns null when VAPID_SUBJECT is missing', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', PUBLIC_KEY);
    vi.stubEnv('VAPID_PRIVATE_KEY', PRIVATE_KEY);
    expect(getVapidConfig()).toBeNull();
  });

  it('returns null when subject is not mailto: or https:', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', PUBLIC_KEY);
    vi.stubEnv('VAPID_PRIVATE_KEY', PRIVATE_KEY);
    vi.stubEnv('VAPID_SUBJECT', 'admin@example.com');
    expect(getVapidConfig()).toBeNull();
  });

  it('returns config when all env vars are present + valid (mailto)', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', PUBLIC_KEY);
    vi.stubEnv('VAPID_PRIVATE_KEY', PRIVATE_KEY);
    vi.stubEnv('VAPID_SUBJECT', SUBJECT);
    const cfg = getVapidConfig();
    expect(cfg).toEqual({
      publicKey: PUBLIC_KEY,
      privateKey: PRIVATE_KEY,
      subject: SUBJECT,
    });
  });

  it('accepts an https:// subject', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', PUBLIC_KEY);
    vi.stubEnv('VAPID_PRIVATE_KEY', PRIVATE_KEY);
    vi.stubEnv('VAPID_SUBJECT', 'https://example.com/admin');
    const cfg = getVapidConfig();
    expect(cfg?.subject).toBe('https://example.com/admin');
  });

  it('trims whitespace around env values', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', `  ${PUBLIC_KEY}  `);
    vi.stubEnv('VAPID_PRIVATE_KEY', `  ${PRIVATE_KEY}  `);
    vi.stubEnv('VAPID_SUBJECT', `  ${SUBJECT}  `);
    const cfg = getVapidConfig();
    expect(cfg).toEqual({
      publicKey: PUBLIC_KEY,
      privateKey: PRIVATE_KEY,
      subject: SUBJECT,
    });
  });

  it('treats whitespace-only env values as missing', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '   ');
    vi.stubEnv('VAPID_PRIVATE_KEY', PRIVATE_KEY);
    vi.stubEnv('VAPID_SUBJECT', SUBJECT);
    expect(getVapidConfig()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isVapidConfigured
// ---------------------------------------------------------------------------

describe('isVapidConfigured', () => {
  it('is false when no env vars set', () => {
    expect(isVapidConfigured()).toBe(false);
  });

  it('is true when all env vars set + valid', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', PUBLIC_KEY);
    vi.stubEnv('VAPID_PRIVATE_KEY', PRIVATE_KEY);
    vi.stubEnv('VAPID_SUBJECT', SUBJECT);
    expect(isVapidConfigured()).toBe(true);
  });

  it('is false when subject is the wrong scheme', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', PUBLIC_KEY);
    vi.stubEnv('VAPID_PRIVATE_KEY', PRIVATE_KEY);
    vi.stubEnv('VAPID_SUBJECT', 'http://example.com/admin');
    expect(isVapidConfigured()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyVapid
// ---------------------------------------------------------------------------

describe('applyVapid', () => {
  it('returns false + does not call setVapidDetails when env is missing', () => {
    expect(applyVapid()).toBe(false);
    expect(setVapidDetailsMock).not.toHaveBeenCalled();
  });

  it('applies + memoizes: setVapidDetails called once on repeated calls', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', PUBLIC_KEY);
    vi.stubEnv('VAPID_PRIVATE_KEY', PRIVATE_KEY);
    vi.stubEnv('VAPID_SUBJECT', SUBJECT);

    expect(applyVapid()).toBe(true);
    expect(applyVapid()).toBe(true);
    expect(applyVapid()).toBe(true);

    expect(setVapidDetailsMock).toHaveBeenCalledTimes(1);
    expect(setVapidDetailsMock).toHaveBeenCalledWith(
      SUBJECT,
      PUBLIC_KEY,
      PRIVATE_KEY,
    );
  });

  it('re-applies when env values change (fingerprint cache busts)', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', PUBLIC_KEY);
    vi.stubEnv('VAPID_PRIVATE_KEY', PRIVATE_KEY);
    vi.stubEnv('VAPID_SUBJECT', SUBJECT);

    expect(applyVapid()).toBe(true);

    // Rotate the public key.
    vi.stubEnv('VAPID_PUBLIC_KEY', `${PUBLIC_KEY}-rotated`);
    expect(applyVapid()).toBe(true);

    expect(setVapidDetailsMock).toHaveBeenCalledTimes(2);
    expect(setVapidDetailsMock).toHaveBeenLastCalledWith(
      SUBJECT,
      `${PUBLIC_KEY}-rotated`,
      PRIVATE_KEY,
    );
  });

  it('returns false after env is cleared (and does not call setVapidDetails again)', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', PUBLIC_KEY);
    vi.stubEnv('VAPID_PRIVATE_KEY', PRIVATE_KEY);
    vi.stubEnv('VAPID_SUBJECT', SUBJECT);
    expect(applyVapid()).toBe(true);
    expect(setVapidDetailsMock).toHaveBeenCalledTimes(1);

    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    expect(applyVapid()).toBe(false);
    expect(setVapidDetailsMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// _resetVapidMemo (test-only escape hatch)
// ---------------------------------------------------------------------------

describe('_resetVapidMemo', () => {
  it('clears the memoization so the next applyVapid re-applies', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', PUBLIC_KEY);
    vi.stubEnv('VAPID_PRIVATE_KEY', PRIVATE_KEY);
    vi.stubEnv('VAPID_SUBJECT', SUBJECT);

    expect(applyVapid()).toBe(true);
    expect(applyVapid()).toBe(true);
    expect(setVapidDetailsMock).toHaveBeenCalledTimes(1);

    _resetVapidMemo();
    expect(applyVapid()).toBe(true);
    expect(setVapidDetailsMock).toHaveBeenCalledTimes(2);
  });
});
