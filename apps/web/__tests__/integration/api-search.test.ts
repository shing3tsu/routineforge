/**
 * Integration tests — GET /api/search?q=<query>
 *
 * Unified free-text search across the signed-in user's routines AND habits.
 * See `apps/web/app/api/search/route.ts` for the contract; this file pins it
 * down end-to-end (route handler -> Drizzle queries -> JSON response).
 *
 * Coverage targets in this file:
 *
 *   1.  Auth — 401 when unauthenticated.
 *   2.  Missing `q`              → 200, empty results.
 *   3.  `q.length < 2`           → 200, empty results.
 *   4.  `q.length > 100`         → silently truncated; matches on first 100 chars.
 *   5.  Whitespace-only `q`      → 200, empty results.
 *   6.  Routine name match       → matchedField === 'name'.
 *   7.  Routine description match→ matchedField === 'description'.
 *   8.  Routine category match   → matchedField === 'category'.
 *   9.  Routine location match   → matchedField === 'location'.
 *   10. Habit name match         → matchedField === 'name'.
 *   11. Habit category match     → matchedField === 'category'.
 *   12. Habit location match     → matchedField === 'location'.
 *   13. Habit description NOT searched (contract intentionally skips it).
 *   14. Auth isolation — user A's search does not surface user B's rows.
 *   15. Case-insensitive — "yoga", "Yoga", "YOGA" all surface for q=yoga.
 *   16. Per-kind cap of 20.
 *   17. Bucket priority — name > category, then name ASC within bucket.
 *   18. Wildcard escape — literal `%` in a category is found by q=`50%`, and
 *       q=`5` does NOT also match `50%` via SQL wildcard injection.
 *
 * Conventions copied from `api-routines-crud.test.ts`:
 *   - `vi.mock('@/db', () => helpers)` swaps in the pglite-backed Drizzle client.
 *   - `vi.mock('@/auth', () => ({ auth: () => authMock() }))` lets each test
 *     decide whether a session exists. authMock defaults to "logged in as user A".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/db', async () => {
  const helpers = await import('@/__tests__/helpers/db');
  return { db: helpers.db, schema: helpers.schema };
});

const authMock = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => authMock(),
}));

import { GET as searchGET } from '@/app/api/search/route';
import {
  resetDb,
  makeUser,
  makeRoutine,
  makeHabit,
} from '@/__tests__/helpers/db';
import { getRequest } from '@/__tests__/helpers/request';

const VALID_TOKEN = 'test-owner-token-must-be-at-least-sixteen-chars';
const OWNER_EMAIL = 'owner@example.com';
const SEARCH_URL_BASE = 'http://localhost:3000/api/search';
const EMPTY_CTX = { params: Promise.resolve({}) } as const;

/** Helper that builds the full search URL with `q` URL-encoded. Always use this. */
function buildSearchUrl(q?: string): string {
  if (q === undefined) return SEARCH_URL_BASE;
  return `${SEARCH_URL_BASE}?q=${encodeURIComponent(q)}`;
}

/** Convenience: run the GET handler against a search URL with the current auth state. */
async function runSearch(q?: string) {
  return searchGET(getRequest({ url: buildSearchUrl(q) }), EMPTY_CTX);
}

type SearchResponseBody = {
  ok: boolean;
  query?: string;
  error?: string;
  results?: {
    routines: Array<{
      id: string;
      name: string;
      description: string | null;
      scheduleWeekdays: number[];
      category: string | null;
      location: string | null;
      matchedField: 'name' | 'description' | 'category' | 'location';
    }>;
    habits: Array<{
      id: string;
      name: string;
      cadence: unknown;
      currentStreak: number;
      longestStreak: number;
      category: string | null;
      location: string | null;
      matchedField: 'name' | 'category' | 'location';
    }>;
  };
};

let userId: string;
let otherId: string;

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  vi.stubEnv('OWNER_API_TOKEN', VALID_TOKEN);
  vi.stubEnv('OWNER_EMAIL', OWNER_EMAIL);
  const user = await makeUser({ email: 'alice@example.com', verified: true });
  const other = await makeUser({ email: 'bob@example.com', verified: true });
  userId = user.id;
  otherId = other.id;
  // Default authentication: user A (alice) is signed in.
  authMock.mockResolvedValue({ user: { id: userId } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// 1. Auth
// ---------------------------------------------------------------------------

describe('GET /api/search — auth', () => {
  it('returns 401 unauthenticated when no session and no Authorization header', async () => {
    // Override the default "alice is signed in" to simulate signed-out.
    authMock.mockResolvedValue(null);

    const res = await runSearch('anything');

    expect(res.status).toBe(401);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.ok).toBe(false);
    expect(body.error).toBe('unauthenticated');
  });
});

// ---------------------------------------------------------------------------
// 2-5. Lenient input semantics — missing / short / overlong / whitespace
// ---------------------------------------------------------------------------

describe('GET /api/search — lenient input handling', () => {
  it('200s with empty results when `q` is missing entirely', async () => {
    const res = await runSearch(undefined);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.ok).toBe(true);
    expect(body.results).toEqual({ routines: [], habits: [] });
  });

  it('200s with empty results when `q` is empty string', async () => {
    // Seed something that would otherwise match, to confirm short-circuit
    // really avoids the DB hit semantically (we get empty regardless).
    await makeRoutine({ ownerUserId: userId, name: 'A real routine' });

    const res = await runSearch('');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.ok).toBe(true);
    expect(body.results).toEqual({ routines: [], habits: [] });
  });

  it('200s with empty results when `q` is shorter than 2 chars (e.g. q=a)', async () => {
    // Seed a routine whose name starts with "a" so we can prove the short-q
    // branch does NOT run the search.
    await makeRoutine({ ownerUserId: userId, name: 'alpha' });

    const res = await runSearch('a');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.ok).toBe(true);
    expect(body.results).toEqual({ routines: [], habits: [] });
  });

  it('200s with empty results when `q` is whitespace-only', async () => {
    // Same shape as the empty-string case once the route trims input.
    await makeRoutine({ ownerUserId: userId, name: 'A real routine' });

    const res = await runSearch('   ');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.ok).toBe(true);
    expect(body.results).toEqual({ routines: [], habits: [] });
  });

  it('silently truncates `q` to 100 chars (does NOT 400 or fail)', async () => {
    // The truncation contract: q over 100 chars is silently sliced to its
    // first 100 chars before being fed to the ILIKE pattern. To prove this:
    //   - Seed a routine whose name is exactly the first 100 chars of `q`.
    //   - Build `q` as that 100-char prefix + 50 more chars not present in the name.
    //   - The truncated effectiveQuery must equal the routine name, so ILIKE
    //     `%name%` matches.
    //   - Without truncation, the unmodified 150-char q would NOT be a substring
    //     of the 100-char name, so the result would be empty.
    const name = 'A'.repeat(100);
    await makeRoutine({ ownerUserId: userId, name });

    // `q` is the routine name + 50 extra "B" chars — total length 150.
    const q = name + 'B'.repeat(50);
    expect(q.length).toBeGreaterThan(100);

    const res = await runSearch(q);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.ok).toBe(true);
    // The response `query` field is the truncated string.
    expect(body.query).toBe(q.slice(0, 100));
    expect(body.results!.routines).toHaveLength(1);
    expect(body.results!.routines[0]!.name).toBe(name);
  });
});

// ---------------------------------------------------------------------------
// 6-9. Routine field matching (name / description / category / location)
// ---------------------------------------------------------------------------

describe('GET /api/search — routine field matching', () => {
  it('matches on routine NAME and reports matchedField === "name"', async () => {
    await makeRoutine({ ownerUserId: userId, name: 'Morning Yoga' });

    const res = await runSearch('Yoga');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.results!.routines).toHaveLength(1);
    expect(body.results!.routines[0]!.name).toBe('Morning Yoga');
    expect(body.results!.routines[0]!.matchedField).toBe('name');
    expect(body.results!.habits).toHaveLength(0);
  });

  it('matches on routine DESCRIPTION and reports matchedField === "description"', async () => {
    await makeRoutine({
      ownerUserId: userId,
      name: 'Stretch session',
      description: 'warm-up stretches',
    });

    const res = await runSearch('warm-up');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.results!.routines).toHaveLength(1);
    expect(body.results!.routines[0]!.matchedField).toBe('description');
  });

  it('matches on routine CATEGORY and reports matchedField === "category"', async () => {
    await makeRoutine({
      ownerUserId: userId,
      name: 'Evening reset',
      category: 'Wellness',
    });

    const res = await runSearch('well');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.results!.routines).toHaveLength(1);
    expect(body.results!.routines[0]!.matchedField).toBe('category');
    expect(body.results!.routines[0]!.category).toBe('Wellness');
  });

  it('matches on routine LOCATION and reports matchedField === "location"', async () => {
    await makeRoutine({
      ownerUserId: userId,
      name: 'Lift heavy',
      location: 'Home Gym',
    });

    const res = await runSearch('gym');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.results!.routines).toHaveLength(1);
    expect(body.results!.routines[0]!.matchedField).toBe('location');
    expect(body.results!.routines[0]!.location).toBe('Home Gym');
  });
});

// ---------------------------------------------------------------------------
// 10-13. Habit field matching (name / category / location, NOT description)
// ---------------------------------------------------------------------------

describe('GET /api/search — habit field matching', () => {
  it('matches on habit NAME and reports matchedField === "name"', async () => {
    await makeHabit({ ownerUserId: userId, name: 'Drink water' });

    const res = await runSearch('water');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.results!.habits).toHaveLength(1);
    expect(body.results!.habits[0]!.name).toBe('Drink water');
    expect(body.results!.habits[0]!.matchedField).toBe('name');
    expect(body.results!.routines).toHaveLength(0);
  });

  it('matches on habit CATEGORY and reports matchedField === "category"', async () => {
    await makeHabit({
      ownerUserId: userId,
      name: 'Hydrate',
      category: 'Health',
    });

    const res = await runSearch('health');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.results!.habits).toHaveLength(1);
    expect(body.results!.habits[0]!.matchedField).toBe('category');
    expect(body.results!.habits[0]!.category).toBe('Health');
  });

  it('matches on habit LOCATION and reports matchedField === "location"', async () => {
    await makeHabit({
      ownerUserId: userId,
      name: 'Pushups',
      location: 'Bedroom',
    });

    const res = await runSearch('bedroom');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.results!.habits).toHaveLength(1);
    expect(body.results!.habits[0]!.matchedField).toBe('location');
    expect(body.results!.habits[0]!.location).toBe('Bedroom');
  });

  it('does NOT search habit description (contract intentionally skips it)', async () => {
    // The schema stores description, but the search query helper only ORs
    // name / category / location for habits. So a habit whose description
    // is the ONLY field containing the query string must NOT come back.
    await makeHabit({
      ownerUserId: userId,
      name: 'Meditate',
      description: 'ignore me when searching',
    });

    const res = await runSearch('ignore me');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.results!.habits).toEqual([]);
    expect(body.results!.routines).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 14. Auth isolation — cross-user search cannot leak rows.
// ---------------------------------------------------------------------------

describe('GET /api/search — auth isolation', () => {
  it("does not return another user's matching routines or habits", async () => {
    // Both users have a "Morning Yoga" routine and a "Drink water" habit so
    // the query string matches both — we must only see user A's.
    const aliceRoutine = await makeRoutine({
      ownerUserId: userId,
      name: 'Morning Yoga (Alice)',
    });
    await makeRoutine({ ownerUserId: otherId, name: 'Morning Yoga (Bob)' });

    const aliceHabit = await makeHabit({
      ownerUserId: userId,
      name: 'Drink water (Alice)',
    });
    await makeHabit({ ownerUserId: otherId, name: 'Drink water (Bob)' });

    const yogaRes = await runSearch('Yoga');
    const yogaBody = (await yogaRes.json()) as SearchResponseBody;
    expect(yogaBody.results!.routines).toHaveLength(1);
    expect(yogaBody.results!.routines[0]!.id).toBe(aliceRoutine.id);
    expect(yogaBody.results!.routines[0]!.name).toBe('Morning Yoga (Alice)');

    const waterRes = await runSearch('Drink water');
    const waterBody = (await waterRes.json()) as SearchResponseBody;
    expect(waterBody.results!.habits).toHaveLength(1);
    expect(waterBody.results!.habits[0]!.id).toBe(aliceHabit.id);
    expect(waterBody.results!.habits[0]!.name).toBe('Drink water (Alice)');
  });
});

// ---------------------------------------------------------------------------
// 15. Case insensitivity
// ---------------------------------------------------------------------------

describe('GET /api/search — case-insensitive matching', () => {
  it('matches across mixed cases — "yoga", "Yoga", "YOGA" all surface for q=yoga', async () => {
    await makeRoutine({ ownerUserId: userId, name: 'yoga' });
    await makeRoutine({ ownerUserId: userId, name: 'Yoga' });
    await makeRoutine({ ownerUserId: userId, name: 'YOGA' });

    const res = await runSearch('yoga');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.results!.routines).toHaveLength(3);
    // All three should be matchedField === 'name'.
    for (const r of body.results!.routines) {
      expect(r.matchedField).toBe('name');
    }
    // Names returned (any case) collected as a set:
    const names = body.results!.routines.map((r) => r.name).sort();
    expect(names).toEqual(['YOGA', 'Yoga', 'yoga'].sort());
  });
});

// ---------------------------------------------------------------------------
// 16. Per-kind cap of 20
// ---------------------------------------------------------------------------

describe('GET /api/search — per-kind result cap', () => {
  it('caps routine hits at 20 even when 25 match', async () => {
    // Seed 25 routines whose names all contain "Yoga".
    for (let i = 0; i < 25; i++) {
      // Pad the index so alphabetical ordering is stable (Yoga 01, ..., Yoga 25).
      const idx = String(i + 1).padStart(2, '0');
      await makeRoutine({ ownerUserId: userId, name: `Yoga ${idx}` });
    }

    const res = await runSearch('Yoga');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.results!.routines).toHaveLength(20);
    // All are name-bucket matches.
    for (const r of body.results!.routines) {
      expect(r.matchedField).toBe('name');
    }
  });
});

// ---------------------------------------------------------------------------
// 17. Ordering — name bucket surfaces before category bucket; alpha within bucket
// ---------------------------------------------------------------------------

describe('GET /api/search — result ordering', () => {
  it('name-bucket matches surface before category-bucket matches, alpha within bucket', async () => {
    // Two routines whose NAME contains the query, and one whose CATEGORY does.
    // We expect the name-bucket pair first (sorted alphabetically: "yoga A" before
    // "yoga B"), then the category-bucket hit.
    await makeRoutine({
      ownerUserId: userId,
      name: 'category-only',
      category: 'yoga',
    });
    await makeRoutine({ ownerUserId: userId, name: 'yoga B' });
    await makeRoutine({ ownerUserId: userId, name: 'yoga A' });

    const res = await runSearch('yoga');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.results!.routines).toHaveLength(3);

    expect(body.results!.routines[0]!.name).toBe('yoga A');
    expect(body.results!.routines[0]!.matchedField).toBe('name');

    expect(body.results!.routines[1]!.name).toBe('yoga B');
    expect(body.results!.routines[1]!.matchedField).toBe('name');

    expect(body.results!.routines[2]!.name).toBe('category-only');
    expect(body.results!.routines[2]!.matchedField).toBe('category');
  });
});

// ---------------------------------------------------------------------------
// 18. Wildcard escape — literal % match; q=5 must NOT also match "50%"
// ---------------------------------------------------------------------------

describe('GET /api/search — wildcard escape', () => {
  it('finds a category containing literal `50%` when q=`50%`', async () => {
    await makeRoutine({
      ownerUserId: userId,
      name: 'Discount routine',
      category: '50% off',
    });

    const res = await runSearch('50%');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    expect(body.results!.routines).toHaveLength(1);
    expect(body.results!.routines[0]!.matchedField).toBe('category');
    expect(body.results!.routines[0]!.category).toBe('50% off');
  });

  it('q with literal `%` does NOT behave as a SQL wildcard (escapeLike contract)', async () => {
    // The wildcard-injection failure mode: a `%` in `q` would normally be a
    // SQL `LIKE` wildcard meaning "match anything". `escapeLike` neutralises
    // user-supplied `%` so it only matches a literal `%` character.
    //
    // Test design:
    //   - Seed routine A with category "555" (three literal 5s; NO `%`).
    //   - Seed routine B with category "5%discount" (contains literal `5%`).
    //   - Query `5%` (length 2, clears the short-circuit threshold).
    //
    // With escape working: pattern is `%5\%%` → matches only "5%discount".
    // Without escape: pattern is `%5%%` (degenerate `%5%`) → also matches "555".
    //
    // So if the test sees BOTH routines come back, escapeLike is broken.
    await makeRoutine({
      ownerUserId: userId,
      name: 'no-percent',
      category: '555',
    });
    await makeRoutine({
      ownerUserId: userId,
      name: 'literal-percent',
      category: '5%discount',
    });

    const res = await runSearch('5%');

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponseBody;
    const matchedNames = body.results!.routines.map((r) => r.name).sort();
    // ONLY "literal-percent" should match — "no-percent" must be filtered out
    // because its category contains "555" but NOT the literal "5%" substring.
    expect(matchedNames).toEqual(['literal-percent']);
  });
});
