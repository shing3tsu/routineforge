/**
 * SearchClient — client island for `/search`.
 *
 * The page itself stays a server component (auth gate, eyebrow + h1). All
 * interactivity lives here:
 *
 *   - Debounced (250ms) fetch against `GET /api/search?q=<encoded>`.
 *   - Quiet "searching…" loading text while a request is in flight.
 *   - Empty / < 2-char input shows a calm prompt; no API call is fired.
 *   - Results split into two sections: routines, then habits. Sections with
 *     zero matches hide their header entirely (calm).
 *   - When BOTH buckets are empty AND the user has typed ≥ 2 chars, render
 *     a centred "no matches." line.
 *   - Fetch failure renders a dismissable Alert above the results.
 *   - Cmd/Ctrl+K refocuses the search input (the page's own layout listens
 *     globally so the binding still works while the input is unfocused).
 *
 * Result rows use the lightweight `<SearchRoutineRow>` / `<SearchHabitRow>`
 * variants from `@/components/ui/SearchResultRow` — the rich
 * `<RoutineListItem>` / `<HabitListItem>` need fields the search API does
 * not return (stepCountToday, lastSevenDays, todayLocal), so wrapping them
 * here would crash. The variants share the same `.rf-card` chrome and pill
 * tokens, so the two views feel native side-by-side.
 *
 * Debounce semantics:
 *   - Each keystroke schedules a 250ms timer; the previous timer is cleared.
 *   - When the timer fires, an `AbortController` cancels any in-flight request
 *     so we never display stale results from a slow earlier query.
 *   - The latest query value is tracked in a ref so the fetcher can guard
 *     against rendering results that no longer match what the user has typed
 *     (defence-in-depth on top of AbortController, which catches the network
 *     leg but not the post-await JSON parse if it races against state change).
 */
'use client';

import * as React from 'react';
import { TextField } from '@/components/ui/TextField';
import { Alert } from '@/components/ui/Alert';
import { IconSearch } from '@/components/ui/icons';
import {
  SearchRoutineRow,
  SearchHabitRow,
} from '@/components/ui/SearchResultRow';
import type { HabitCadence } from '@/db/schema';

// ---------------------------------------------------------------------------
// API response types — mirror `lib/search/queries.ts` (and the route handler)
// without importing the server-only module.
// ---------------------------------------------------------------------------

type RoutineHit = {
  id: string;
  name: string;
  description: string | null;
  scheduleWeekdays: number[];
  category: string | null;
  location: string | null;
  matchedField: 'name' | 'description' | 'category' | 'location';
};

type HabitHit = {
  id: string;
  name: string;
  cadence: HabitCadence;
  currentStreak: number;
  longestStreak: number;
  category: string | null;
  location: string | null;
  matchedField: 'name' | 'category' | 'location';
};

type SearchResponse = {
  ok: boolean;
  query: string;
  results: {
    routines: RoutineHit[];
    habits: HabitHit[];
  };
};

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

export function SearchClient() {
  const [value, setValue] = React.useState<string>('');
  const [results, setResults] = React.useState<{
    routines: RoutineHit[];
    habits: HabitHit[];
  } | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  // Track which query the latest results correspond to, so we can decide when
  // to render "no matches" (the user has typed ≥ MIN_CHARS chars AND the
  // response we're showing is for the CURRENT input).
  const [resultsForQuery, setResultsForQuery] = React.useState<string>('');

  // Refs for the debounce timer + abort controller + the latest query.
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const latestQueryRef = React.useRef<string>('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Cleanup on unmount: cancel any pending timer + abort the in-flight fetch.
  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Global Cmd/Ctrl+K listener — focuses the input from anywhere on the page.
  // We intentionally do NOT skip when another input has focus: the user
  // explicitly asked for Cmd+K to jump to search, and the binding is rare
  // enough not to clash with text-editing inputs (Cmd+K is "insert link" in
  // some editors, but the /search page has no such inputs besides this one).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmdK =
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !e.altKey;
      if (!isCmdK) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The debounced fetch effect: whenever `value` changes, schedule a fetch
  // for it after DEBOUNCE_MS. Empty / short inputs short-circuit to a cleared
  // state with no network hit.
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    const trimmed = value.trim();
    latestQueryRef.current = trimmed;

    if (trimmed.length < MIN_CHARS) {
      // Reset to the calm initial state.
      setResults(null);
      setResultsForQuery('');
      setLoading(false);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);

      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
        // Server actions cache by default; this is a GET we want fresh every
        // time the user adjusts the query.
        cache: 'no-store',
      })
        .then(async (res) => {
          if (!res.ok) {
            // Try to surface a server-provided message; fall back to a calm one.
            const data = (await res.json().catch(() => null)) as
              | { error?: string; message?: string }
              | null;
            throw new Error(
              data?.message ?? data?.error ?? 'could not search right now.',
            );
          }
          return (await res.json()) as SearchResponse;
        })
        .then((body) => {
          // Race-guard: only commit if the response is still for the current
          // query (a faster later keystroke may have raced past us).
          if (latestQueryRef.current !== trimmed) return;
          setResults(body.results);
          setResultsForQuery(trimmed);
          setLoading(false);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            // Superseded by a newer query; not a real error.
            return;
          }
          if (latestQueryRef.current !== trimmed) return;
          setError(
            err instanceof Error
              ? err.message
              : 'could not search right now.',
          );
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const trimmed = value.trim();
  const tooShort = trimmed.length < MIN_CHARS;
  const hasResults =
    !!results &&
    (results.routines.length > 0 || results.habits.length > 0);
  // "no matches" is only correct when:
  //   - we are NOT mid-typing past the debounce (loading === false)
  //   - we are NOT showing an error
  //   - the user HAS typed ≥ MIN_CHARS chars
  //   - results are present (i.e. a response came back) AND match the current input
  //   - both buckets are empty
  const showNoMatches =
    !loading &&
    !error &&
    !tooShort &&
    results !== null &&
    resultsForQuery === trimmed &&
    results.routines.length === 0 &&
    results.habits.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
      <TextField
        ref={inputRef}
        label="Search routines and habits"
        hideLabel
        placeholder="search your routines and habits…"
        autoComplete="off"
        spellCheck={false}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        leading={<IconSearch size={18} aria-hidden />}
        // `data-search-input` is a stable test hook + lets the global Cmd+K
        // listener find this input even if a third party clones the DOM.
        data-search-input
        // Hint slot doubles as the quiet loading line so the input chrome
        // doesn't jump when "searching…" appears.
        hint={loading ? 'searching…' : undefined}
      />

      {error ? (
        <Alert variant="danger" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {tooShort ? (
        <p
          data-testid="search-prompt"
          style={{
            color: 'var(--c-text-muted)',
            fontSize: 'var(--fs-sm)',
            textAlign: 'center',
            margin: 0,
            padding: 'var(--s-6) 0',
          }}
        >
          type to search across your routines and habits.
        </p>
      ) : null}

      {!tooShort && hasResults && results ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s-6)',
          }}
        >
          {results.routines.length > 0 ? (
            <section aria-labelledby="search-routines-heading">
              <h2
                id="search-routines-heading"
                className="rf-eyebrow"
                style={{ marginBottom: 'var(--s-3)' }}
              >
                routines
              </h2>
              <ul
                role="list"
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--s-3)',
                }}
              >
                {results.routines.map((r) => (
                  <li key={r.id}>
                    <SearchRoutineRow routine={r} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {results.habits.length > 0 ? (
            <section aria-labelledby="search-habits-heading">
              <h2
                id="search-habits-heading"
                className="rf-eyebrow"
                style={{ marginBottom: 'var(--s-3)' }}
              >
                habits
              </h2>
              <ul
                role="list"
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--s-3)',
                }}
              >
                {results.habits.map((h) => (
                  <li key={h.id}>
                    <SearchHabitRow habit={h} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {showNoMatches ? (
        <p
          data-testid="search-no-matches"
          style={{
            color: 'var(--c-text-muted)',
            fontSize: 'var(--fs-sm)',
            textAlign: 'center',
            margin: 0,
            padding: 'var(--s-6) 0',
          }}
        >
          no matches.
        </p>
      ) : null}
    </div>
  );
}
