/**
 * Zod schema + normaliser for the unified search endpoint (`GET /api/search`).
 *
 * The endpoint deliberately uses **lenient** input handling rather than
 * strict-reject: missing `q` and short `q` both succeed with empty results,
 * and over-long `q` is truncated to 100 chars rather than rejected. This is
 * the "Google-bar" feel — typing one char shouldn't 400 the response while
 * the user is mid-type.
 *
 * Why a normaliser instead of inline parsing: the route handler stays a thin
 * "validate-and-call-helper" shape, and the same normalisation rules can be
 * unit-tested in isolation.
 */

import { z } from 'zod';

/**
 * Result of normalising a query string param into a shape the search helpers
 * can use directly. `effectiveQuery` is the trimmed + truncated string; the
 * `shortCircuit` flag is true when the input was missing / blank / too short
 * (caller should respond with empty results without hitting the DB).
 */
export type NormalisedSearchQuery = {
  /** What the client originally sent, trimmed (or empty string when missing). */
  query: string;
  /** What to actually search with — trimmed, truncated to 100 chars. */
  effectiveQuery: string;
  /** True when the query is too short (< 2 chars) — caller should skip the DB hit. */
  shortCircuit: boolean;
};

/** Max length we'll feed into `ILIKE '%${q}%'`. Inputs over this are truncated. */
export const SEARCH_QUERY_MAX_LENGTH = 100;
/** Below this length we don't bother searching (avoids one-char noise). */
export const SEARCH_QUERY_MIN_LENGTH = 2;

/**
 * Zod schema for the raw `?q=...` query param.
 *
 * The endpoint treats "missing" the same as "empty string", so we just accept
 * any string (or null/undefined). All real semantics live in
 * `normaliseSearchQuery` below.
 */
export const searchQuerySchema = z
  .object({
    q: z
      .string()
      .max(10_000, 'Query is unreasonably long.') // hard ceiling vs. abuse; we still truncate to 100 below
      .optional(),
  })
  .strict()
  // .strict() rejects extra params; this keeps the endpoint contract honest.
  // If a future iteration adds e.g. `?type=routine`, we extend the schema.
  ;

/**
 * Apply the lenient rules to the raw input. Pure function — no I/O.
 *
 * Order of operations:
 *   1. Default a missing value to empty string.
 *   2. Trim. (Whitespace-only input is treated as empty.)
 *   3. If length < 2 → shortCircuit = true.
 *   4. If length > 100 → truncate to 100. (Don't reject.)
 */
export function normaliseSearchQuery(input: { q?: string }): NormalisedSearchQuery {
  const raw = (input.q ?? '').trim();
  if (raw.length < SEARCH_QUERY_MIN_LENGTH) {
    return { query: raw, effectiveQuery: raw, shortCircuit: true };
  }
  const effectiveQuery =
    raw.length > SEARCH_QUERY_MAX_LENGTH ? raw.slice(0, SEARCH_QUERY_MAX_LENGTH) : raw;
  return { query: raw, effectiveQuery, shortCircuit: false };
}
