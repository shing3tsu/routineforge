/**
 * Unit tests for `lib/export/index.ts`.
 *
 * Coverage matrix:
 *   - exportOwnerData
 *     - returns the expected shape across all tables
 *     - excludes password hashes, OAuth tokens, sessions, verificationTokens
 *     - never returns push subscription keys
 *   - importOwnerData
 *     - replace mode: deletes existing owner data then inserts payload
 *     - merge mode: skips duplicate ids
 *     - dryRun: true → no DB writes, counts reported
 *     - version mismatch → owner_mismatch / version_mismatch error
 *     - owner-id mismatch (hand-crafted payload) → rejected
 *   - export → import round-trip is idempotent
 *
 * All tests run against the pglite-backed test helper db (vi.mock('@/db', ...)).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  users,
  accounts,
  routines,
  routineDaySteps,
  routineStepCompletions,
  habits,
  habitCompletions,
  pushSubscriptions,
  notificationSchedules,
  verificationTokens,
} from '@/db/schema';
import {
  exportOwnerData,
  importOwnerData,
  EXPORT_VERSION,
  type ExportPayload,
} from '@/lib/export';
import {
  resetDb,
  makeUser,
  makeRoutine,
  makeStep,
  makeCompletion,
  makeHabit,
  makeHabitCompletion,
  makeNotificationSchedule,
  makePushSubscription,
  makeVerificationToken,
  countCompletions,
  countHabitCompletions,
  countHabits,
  countNotificationSchedules,
  countPushSubscriptions,
} from '@/__tests__/helpers/db';

beforeEach(async () => {
  await resetDb();
});

// ---------------------------------------------------------------------------
// exportOwnerData
// ---------------------------------------------------------------------------

describe('exportOwnerData', () => {
  it('returns the owner row and excludes password hashes', async () => {
    const user = await makeUser({
      email: 'owner@example.com',
      password: 'a-real-password',
      verified: true,
    });

    const payload = await exportOwnerData(user.id);

    expect(payload.version).toBe(EXPORT_VERSION);
    expect(payload.scope).toBe('mine');
    expect(payload.users).toHaveLength(1);
    const exportedUser = payload.users[0]!;
    expect(exportedUser.id).toBe(user.id);
    expect(exportedUser.email).toBe('owner@example.com');
    // CRITICAL: passwordHash must not be present in the exported user row.
    expect(exportedUser).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(payload)).not.toContain('passwordHash');
    // Also: the actual bcrypt hash value must not appear (defence in depth —
    // even if a future maintainer adds passwordHash back, this assert flags it).
    expect(JSON.stringify(payload)).not.toMatch(/\$2[aby]\$/);
  });

  it('always returns empty arrays for verificationTokens, sessions, and pushSubscriptions', async () => {
    const user = await makeUser();
    // Populate sensitive tables — they should NOT show up in the export.
    await makeVerificationToken({ email: user.email, token: 'a'.repeat(64) });
    await makePushSubscription({ userId: user.id });

    const payload = await exportOwnerData(user.id);

    expect(payload.verificationTokens).toEqual([]);
    expect(payload.sessions).toEqual([]);
    expect(payload.pushSubscriptions).toEqual([]);
  });

  it('excludes OAuth token columns on the accounts table', async () => {
    const user = await makeUser();
    // Insert a fake oauth account row with all the secrets populated.
    await db.insert(accounts).values({
      userId: user.id,
      type: 'oauth',
      provider: 'google',
      providerAccountId: 'google-sub-12345',
      refresh_token: 'SECRET-REFRESH',
      access_token: 'SECRET-ACCESS',
      id_token: 'SECRET-ID',
      session_state: 'SECRET-SESSION-STATE',
      expires_at: 1700000000,
      token_type: 'Bearer',
      scope: 'openid email profile',
    });

    const payload = await exportOwnerData(user.id);
    expect(payload.accounts).toHaveLength(1);
    const acct = payload.accounts[0]!;
    expect(acct.provider).toBe('google');
    expect(acct.providerAccountId).toBe('google-sub-12345');
    // CRITICAL: none of the OAuth secret columns should leak.
    expect(acct).not.toHaveProperty('refresh_token');
    expect(acct).not.toHaveProperty('access_token');
    expect(acct).not.toHaveProperty('id_token');
    expect(acct).not.toHaveProperty('session_state');
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toContain('SECRET-REFRESH');
    expect(serialised).not.toContain('SECRET-ACCESS');
    expect(serialised).not.toContain('SECRET-ID');
    expect(serialised).not.toContain('SECRET-SESSION-STATE');
  });

  it('exports routines + their day steps + completions for the owner', async () => {
    const user = await makeUser();
    const routine = await makeRoutine({ ownerUserId: user.id, name: 'AM' });
    const step = await makeStep({
      routineId: routine.id,
      weekday: 0,
      title: 'Brush teeth',
    });
    await makeCompletion({
      stepId: step.id,
      userId: user.id,
      date: '2026-05-19',
    });

    const payload = await exportOwnerData(user.id);

    expect(payload.routines).toHaveLength(1);
    expect(payload.routines[0]!.id).toBe(routine.id);
    expect(payload.routines[0]!.name).toBe('AM');
    expect(payload.routineDaySteps).toHaveLength(1);
    expect(payload.routineDaySteps[0]!.title).toBe('Brush teeth');
    expect(payload.routineStepCompletions).toHaveLength(1);
    expect(payload.routineStepCompletions[0]!.date).toBe('2026-05-19');
  });

  it('exports routine category + location fields', async () => {
    const user = await makeUser();
    await makeRoutine({
      ownerUserId: user.id,
      name: 'Tagged routine',
      category: 'Wellness',
      location: 'home',
    });

    const payload = await exportOwnerData(user.id);
    expect(payload.routines).toHaveLength(1);
    expect(payload.routines[0]!.category).toBe('Wellness');
    expect(payload.routines[0]!.location).toBe('home');
  });

  it('exports habits + completions + schedules', async () => {
    const user = await makeUser();
    const habit = await makeHabit({
      ownerUserId: user.id,
      name: 'Read 10 pages',
      cadence: { kind: 'daily' },
    });
    await makeHabitCompletion({
      habitId: habit.id,
      userId: user.id,
      date: '2026-05-19',
    });
    await makeNotificationSchedule({
      userId: user.id,
      habitId: habit.id,
      time: '21:00',
      weekdays: [0, 1, 2, 3, 4],
    });

    const payload = await exportOwnerData(user.id);

    expect(payload.habits).toHaveLength(1);
    expect(payload.habits[0]!.name).toBe('Read 10 pages');
    expect(payload.habits[0]!.cadence).toEqual({ kind: 'daily' });
    expect(payload.habitCompletions).toHaveLength(1);
    expect(payload.notificationSchedules).toHaveLength(1);
    expect(payload.notificationSchedules[0]!.time).toBe('21:00');
    expect(payload.notificationSchedules[0]!.weekdays).toEqual([0, 1, 2, 3, 4]);
  });

  it('exports habit category + location fields', async () => {
    const user = await makeUser();
    await makeHabit({
      ownerUserId: user.id,
      name: 'Tagged habit',
      cadence: { kind: 'daily' },
      category: 'Wellness',
      location: 'home',
    });

    const payload = await exportOwnerData(user.id);
    expect(payload.habits).toHaveLength(1);
    expect(payload.habits[0]!.category).toBe('Wellness');
    expect(payload.habits[0]!.location).toBe('home');
  });

  it('does not include other users\' data', async () => {
    const owner = await makeUser({ email: 'owner@example.com' });
    const stranger = await makeUser({ email: 'stranger@example.com' });
    await makeRoutine({ ownerUserId: stranger.id, name: 'Stranger routine' });
    await makeHabit({ ownerUserId: stranger.id, name: 'Stranger habit' });

    const payload = await exportOwnerData(owner.id);

    expect(payload.users).toHaveLength(1);
    expect(payload.users[0]!.id).toBe(owner.id);
    expect(payload.routines).toHaveLength(0);
    expect(payload.habits).toHaveLength(0);
  });

  it('throws on scope="all" (not yet implemented)', async () => {
    const user = await makeUser();
    await expect(exportOwnerData(user.id, { scope: 'all' })).rejects.toThrow(
      /scope.*not supported/,
    );
  });
});

// ---------------------------------------------------------------------------
// importOwnerData
// ---------------------------------------------------------------------------

describe('importOwnerData', () => {
  /** Build a minimal payload owned by `userId`. */
  function payloadFor(userId: string): ExportPayload {
    return {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      scope: 'mine',
      users: [
        {
          id: userId,
          email: 'whoever@example.com',
          name: null,
          image: null,
          emailVerified: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      accounts: [],
      verificationTokens: [],
      sessions: [],
      routines: [],
      routineDaySteps: [],
      routineStepCompletions: [],
      habits: [],
      habitCompletions: [],
      pushSubscriptions: [],
      notificationSchedules: [],
    };
  }

  it('rejects payloads with a different version', async () => {
    const owner = await makeUser();
    const payload = payloadFor(owner.id) as unknown as Record<string, unknown>;
    payload.version = 99;

    const result = await importOwnerData(owner.id, payload, {
      mode: 'replace',
      dryRun: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('version_mismatch');
  });

  it('rejects payloads that contain a row owned by a third party', async () => {
    const owner = await makeUser();
    const sourceUserId = '11111111-1111-1111-1111-111111111111';
    const otherUserId = '22222222-2222-2222-2222-222222222222';
    const payload = payloadFor(sourceUserId);
    payload.routines.push({
      id: '33333333-3333-3333-3333-333333333333',
      ownerUserId: otherUserId, // ← references a different user
      name: 'Sneaky',
      description: null,
      timezone: 'UTC',
      category: null,
      location: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    const result = await importOwnerData(owner.id, payload, {
      mode: 'replace',
      dryRun: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('owner_mismatch');
  });

  it('rejects payloads missing the user row', async () => {
    const owner = await makeUser();
    const payload = payloadFor(owner.id);
    payload.users = [];

    const result = await importOwnerData(owner.id, payload, {
      mode: 'replace',
      dryRun: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('owner_mismatch');
  });

  it('dryRun: true reports counts and does NOT write to the database', async () => {
    const owner = await makeUser({ email: 'owner@example.com' });
    const sourceUserId = '11111111-1111-1111-1111-111111111111';
    const payload = payloadFor(sourceUserId);
    payload.routines.push({
      id: '33333333-3333-3333-3333-333333333333',
      ownerUserId: sourceUserId,
      name: 'Dry routine',
      description: null,
      timezone: 'UTC',
      category: null,
      location: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    const result = await importOwnerData(owner.id, payload, {
      mode: 'replace',
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dryRun).toBe(true);
      expect(result.counts.routines).toBe(1);
    }

    // No rows should have been inserted.
    const all = await db.select().from(routines);
    expect(all).toHaveLength(0);
  });

  it('replace mode: deletes existing owner data and inserts payload', async () => {
    const owner = await makeUser({ email: 'owner@example.com' });

    // Seed pre-existing data that REPLACE should wipe.
    const existing = await makeRoutine({
      ownerUserId: owner.id,
      name: 'OLD routine',
    });
    await makeStep({
      routineId: existing.id,
      weekday: 0,
      title: 'old step',
    });
    const existingHabit = await makeHabit({
      ownerUserId: owner.id,
      name: 'OLD habit',
    });
    await makeHabitCompletion({
      habitId: existingHabit.id,
      userId: owner.id,
      date: '2026-05-18',
    });
    await makeNotificationSchedule({
      userId: owner.id,
      habitId: existingHabit.id,
    });

    // Build a payload owned by some "source" user id (which can be the same
    // or different from owner.id — the library rebinds to owner.id either way).
    const sourceUserId = '11111111-1111-1111-1111-111111111111';
    const payload = payloadFor(sourceUserId);
    payload.routines.push({
      id: '33333333-3333-3333-3333-333333333333',
      ownerUserId: sourceUserId,
      name: 'NEW routine',
      description: null,
      timezone: 'UTC',
      category: null,
      location: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });
    payload.routineDaySteps.push({
      id: '44444444-4444-4444-4444-444444444444',
      routineId: '33333333-3333-3333-3333-333333333333',
      weekday: 0,
      position: 0,
      title: 'new step',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await importOwnerData(owner.id, payload, {
      mode: 'replace',
      dryRun: false,
    });
    expect(result.ok).toBe(true);

    // OLD routine + habit + schedule should be gone.
    const remainingRoutines = await db
      .select()
      .from(routines)
      .where(eq(routines.ownerUserId, owner.id));
    expect(remainingRoutines).toHaveLength(1);
    expect(remainingRoutines[0]!.name).toBe('NEW routine');
    expect(remainingRoutines[0]!.ownerUserId).toBe(owner.id);

    expect(await countHabits()).toBe(0);
    expect(await countHabitCompletions()).toBe(0);
    expect(await countNotificationSchedules()).toBe(0);
  });

  it('merge mode: skips rows with duplicate ids', async () => {
    const owner = await makeUser({ email: 'owner@example.com' });
    const existing = await makeRoutine({
      ownerUserId: owner.id,
      name: 'Pre-existing',
    });

    const sourceUserId = '11111111-1111-1111-1111-111111111111';
    const payload = payloadFor(sourceUserId);
    // Same id as `existing` → merge mode should skip.
    payload.routines.push({
      id: existing.id,
      ownerUserId: sourceUserId,
      name: 'Should not overwrite',
      description: null,
      timezone: 'UTC',
      category: null,
      location: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });
    // A NEW routine that doesn't conflict.
    payload.routines.push({
      id: '99999999-9999-9999-9999-999999999999',
      ownerUserId: sourceUserId,
      name: 'Fresh import',
      description: null,
      timezone: 'UTC',
      category: null,
      location: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    const result = await importOwnerData(owner.id, payload, {
      mode: 'merge',
      dryRun: false,
    });
    expect(result.ok).toBe(true);

    const all = await db
      .select()
      .from(routines)
      .where(eq(routines.ownerUserId, owner.id));
    expect(all).toHaveLength(2);
    const names = all.map((r) => r.name).sort();
    expect(names).toEqual(['Fresh import', 'Pre-existing']);
  });

  it('round-trip: export → import (replace) is idempotent', async () => {
    const owner = await makeUser({ email: 'owner@example.com' });

    // Seed a representative slice of data.
    const routine = await makeRoutine({ ownerUserId: owner.id, name: 'AM' });
    const step = await makeStep({
      routineId: routine.id,
      weekday: 0,
      title: 'Push-ups',
    });
    await makeCompletion({
      stepId: step.id,
      userId: owner.id,
      date: '2026-05-19',
    });
    const habit = await makeHabit({
      ownerUserId: owner.id,
      name: 'Read',
      cadence: { kind: 'daily' },
    });
    await makeHabitCompletion({
      habitId: habit.id,
      userId: owner.id,
      date: '2026-05-19',
    });
    await makeNotificationSchedule({
      userId: owner.id,
      habitId: habit.id,
      time: '21:00',
      weekdays: [0, 1, 2, 3, 4],
    });

    // 1) Export.
    const payload = await exportOwnerData(owner.id);

    // 2) Round-trip through JSON to simulate the HTTP path (Dates → strings).
    const wireFormat = JSON.parse(JSON.stringify(payload));

    // 3) Import in replace mode against the same DB — should be a no-op net.
    const importResult = await importOwnerData(owner.id, wireFormat, {
      mode: 'replace',
      dryRun: false,
    });
    expect(importResult.ok).toBe(true);

    // 4) Re-export and assert the data matches.
    const reExported = await exportOwnerData(owner.id);

    // Stable comparison: drop the (always-different) exportedAt timestamp.
    const stripTs = (p: typeof payload) => ({ ...p, exportedAt: '' });
    expect(stripTs(reExported)).toMatchObject({
      routines: payload.routines.map((r) => ({ id: r.id, name: r.name })),
      habits: payload.habits.map((h) => ({ id: h.id, name: h.name })),
      routineDaySteps: payload.routineDaySteps.map((s) => ({ id: s.id, title: s.title })),
    });
    expect(reExported.routineStepCompletions).toHaveLength(1);
    expect(reExported.habitCompletions).toHaveLength(1);
    expect(reExported.notificationSchedules).toHaveLength(1);

    // 5) And the row counts are stable on a second import.
    const importResult2 = await importOwnerData(owner.id, wireFormat, {
      mode: 'replace',
      dryRun: false,
    });
    expect(importResult2.ok).toBe(true);
    expect(await countCompletions()).toBe(1);
    expect(await countHabitCompletions()).toBe(1);
    expect(await countNotificationSchedules()).toBe(1);
  });

  it('round-trip preserves routine + habit category/location across replace import', async () => {
    const owner = await makeUser({ email: 'owner@example.com' });
    await makeRoutine({
      ownerUserId: owner.id,
      name: 'Tagged routine',
      category: 'Wellness',
      location: 'home',
    });
    await makeHabit({
      ownerUserId: owner.id,
      name: 'Tagged habit',
      cadence: { kind: 'daily' },
      category: 'Wellness',
      location: 'home',
    });

    const payload = await exportOwnerData(owner.id);
    const wire = JSON.parse(JSON.stringify(payload));

    const importResult = await importOwnerData(owner.id, wire, {
      mode: 'replace',
      dryRun: false,
    });
    expect(importResult.ok).toBe(true);

    const reExported = await exportOwnerData(owner.id);
    expect(reExported.routines).toHaveLength(1);
    expect(reExported.routines[0]!.category).toBe('Wellness');
    expect(reExported.routines[0]!.location).toBe('home');
    expect(reExported.habits).toHaveLength(1);
    expect(reExported.habits[0]!.category).toBe('Wellness');
    expect(reExported.habits[0]!.location).toBe('home');
  });

  it('accepts a payload missing category/location (backward-compatible read)', async () => {
    // A payload built before the schema added category/location should still
    // import cleanly — the validator marks the fields optional + nullable so
    // older backups don't need a forced upgrade.
    const owner = await makeUser({ email: 'owner@example.com' });
    const sourceUserId = '11111111-1111-1111-1111-111111111111';
    const payload = payloadFor(sourceUserId);
    // Note: deliberately do NOT add category/location on the routine row.
    payload.routines.push({
      id: '33333333-3333-3333-3333-333333333333',
      ownerUserId: sourceUserId,
      name: 'Legacy routine',
      description: null,
      timezone: 'UTC',
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    } as (typeof payload.routines)[number]);

    const result = await importOwnerData(owner.id, payload, {
      mode: 'replace',
      dryRun: false,
    });
    expect(result.ok).toBe(true);

    const all = await db
      .select()
      .from(routines)
      .where(eq(routines.ownerUserId, owner.id));
    expect(all).toHaveLength(1);
    expect(all[0]!.category).toBeNull();
    expect(all[0]!.location).toBeNull();
  });

  it('import does not insert verificationTokens, sessions, or pushSubscriptions even if present', async () => {
    const owner = await makeUser({ email: 'owner@example.com' });
    const sourceUserId = '11111111-1111-1111-1111-111111111111';
    const payload = payloadFor(sourceUserId);
    // A well-crafted payload would have empty arrays here. A malicious one
    // might try to populate them. We assert the schema rejects non-empty
    // entries via the `.max(0)` constraint on the zod schema.
    const malicious = JSON.parse(JSON.stringify(payload));
    malicious.verificationTokens = [{ identifier: 'x', token: 'y' }];
    const result = await importOwnerData(owner.id, malicious, {
      mode: 'replace',
      dryRun: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('validation_error');

    // Defence in depth: even a successful import does NOT touch these tables.
    const tokenRows = await db.select().from(verificationTokens);
    expect(tokenRows).toHaveLength(0);
    expect(await countPushSubscriptions()).toBe(0);
  });
});
