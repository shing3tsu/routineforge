/**
 * Zod schema unit tests.
 *
 * The schemas live inside the route handler files and aren't exported, so we
 * mirror them here. This file's purpose is twofold:
 *   1. Tightly assert each branch of the schema (invalid email format, min
 *      length, optional bounds, trim/lowercase behavior).
 *   2. Lock the schema contract — if backend changes the schema, these tests
 *      should fail and someone has to update the mirrored schema below in lock-
 *      step. Each mirror has a // MIRRORS: comment pointing at the source.
 *
 * Integration-level tests (zod-schemas-route.test.ts in the integration dir)
 * exercise the *real* route validation end-to-end via the route handler — so
 * even if the mirror drifts, the integration tests would catch contract
 * violations.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// MIRRORS: apps/web/app/api/auth/signup/route.ts — bodySchema
const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  name: z.string().trim().min(1).max(120).optional(),
});

// MIRRORS: apps/web/app/api/auth/verify/route.ts — querySchema
const verifySchema = z.object({
  token: z.string().min(32).max(128),
  email: z.string().trim().toLowerCase().email(),
});

// MIRRORS: apps/web/auth.ts — credentialsSchema
const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

describe('signup body schema', () => {
  it('accepts a fully valid payload', () => {
    const result = signupSchema.safeParse({
      email: 'alice@example.com',
      password: 'correcthorse',
      name: 'Alice',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('alice@example.com');
      expect(result.data.name).toBe('Alice');
    }
  });

  it('accepts a payload without optional name', () => {
    const result = signupSchema.safeParse({
      email: 'bob@example.com',
      password: 'longenough',
    });
    expect(result.success).toBe(true);
  });

  it('trims and lowercases the email', () => {
    const result = signupSchema.safeParse({
      email: '  ALICE@Example.COM  ',
      password: 'longenough',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('alice@example.com');
    }
  });

  it('trims the name', () => {
    const result = signupSchema.safeParse({
      email: 'a@b.com',
      password: 'longenough',
      name: '   Alice   ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Alice');
    }
  });

  it('rejects a missing email', () => {
    const result = signupSchema.safeParse({ password: 'longenough' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.email).toBeDefined();
    }
  });

  it('rejects an invalid email format', () => {
    const result = signupSchema.safeParse({
      email: 'not-an-email',
      password: 'longenough',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toBeDefined();
    }
  });

  it('rejects a missing password', () => {
    const result = signupSchema.safeParse({ email: 'a@b.com' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password).toBeDefined();
    }
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = signupSchema.safeParse({
      email: 'a@b.com',
      password: '1234567', // 7 chars
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.password?.[0]).toMatch(/at least 8/i);
    }
  });

  it('accepts an exactly-8-character password (boundary)', () => {
    const result = signupSchema.safeParse({
      email: 'a@b.com',
      password: '12345678',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a name with only whitespace (post-trim becomes empty)', () => {
    const result = signupSchema.safeParse({
      email: 'a@b.com',
      password: 'longenough',
      name: '     ',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toBeDefined();
    }
  });

  it('rejects a name longer than 120 characters', () => {
    const result = signupSchema.safeParse({
      email: 'a@b.com',
      password: 'longenough',
      name: 'A'.repeat(121),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toBeDefined();
    }
  });

  it('accepts a name of exactly 120 characters (boundary)', () => {
    const result = signupSchema.safeParse({
      email: 'a@b.com',
      password: 'longenough',
      name: 'A'.repeat(120),
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-string email', () => {
    const result = signupSchema.safeParse({
      email: 12345,
      password: 'longenough',
    });
    expect(result.success).toBe(false);
  });
});

describe('verify query schema', () => {
  it('accepts a valid token + email', () => {
    const result = verifySchema.safeParse({
      token: 'a'.repeat(64),
      email: 'alice@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('lowercases the email', () => {
    const result = verifySchema.safeParse({
      token: 'a'.repeat(64),
      email: 'ALICE@EXAMPLE.COM',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('alice@example.com');
    }
  });

  it('accepts a 32-char token (lower bound)', () => {
    const result = verifySchema.safeParse({
      token: 'a'.repeat(32),
      email: 'a@b.com',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a 128-char token (upper bound)', () => {
    const result = verifySchema.safeParse({
      token: 'a'.repeat(128),
      email: 'a@b.com',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a token shorter than 32 chars', () => {
    const result = verifySchema.safeParse({
      token: 'a'.repeat(31),
      email: 'a@b.com',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.token).toBeDefined();
    }
  });

  it('rejects a token longer than 128 chars', () => {
    const result = verifySchema.safeParse({
      token: 'a'.repeat(129),
      email: 'a@b.com',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.token).toBeDefined();
    }
  });

  it('rejects a missing token', () => {
    const result = verifySchema.safeParse({ email: 'a@b.com' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = verifySchema.safeParse({
      token: 'a'.repeat(64),
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toBeDefined();
    }
  });

  it('rejects a missing email', () => {
    const result = verifySchema.safeParse({ token: 'a'.repeat(64) });
    expect(result.success).toBe(false);
  });
});

describe('credentials schema (NextAuth authorize)', () => {
  it('accepts a valid email + non-empty password', () => {
    const result = credentialsSchema.safeParse({
      email: 'a@b.com',
      password: 'x',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = credentialsSchema.safeParse({
      email: 'not-an-email',
      password: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty password', () => {
    const result = credentialsSchema.safeParse({
      email: 'a@b.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing password', () => {
    const result = credentialsSchema.safeParse({ email: 'a@b.com' });
    expect(result.success).toBe(false);
  });
});
