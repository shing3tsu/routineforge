// @vitest-environment jsdom
/**
 * SearchClient tests.
 *
 * Pins down the debounced fetch flow, the prompt / loading / error / empty
 * states, the `matchedField` pill rendering, and the global Cmd/Ctrl+K
 * focus shortcut.
 *
 * Timing strategy: the component debounces 250ms via `setTimeout`. We use
 * real timers (fake-timers + userEvent.type interact poorly under Vitest 4),
 * drive input updates with `fireEvent.change` (one synthetic event ≈ one
 * React render), and rely on `waitFor` (default ~1s) to let the debounce
 * window elapse before asserting. With 250ms debounce + ~ms fetch resolves,
 * each test finishes in well under the global testTimeout.
 */

import * as React from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react';

import { SearchClient } from '@/app/search/SearchClient';

// ─────────────────────────────────────────────────────────────────────
// Fetch mocking helpers
// ─────────────────────────────────────────────────────────────────────

type FetchMock = ReturnType<typeof vi.fn>;

function setFetch(impl: (...args: unknown[]) => unknown): FetchMock {
  const mock = vi.fn(impl) as FetchMock;
  (global as unknown as { fetch: typeof fetch }).fetch =
    mock as unknown as typeof fetch;
  return mock;
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

// A small sample payload modelling the `GET /api/search` response.
const SAMPLE_RESULTS = {
  ok: true as const,
  query: 'yo',
  results: {
    routines: [
      {
        id: 'r-1',
        name: 'Yoga flow',
        description: 'morning stretch',
        scheduleWeekdays: [0, 2, 4],
        category: 'Wellness',
        location: null,
        matchedField: 'name' as const,
      },
    ],
    habits: [
      {
        id: 'h-1',
        name: 'Yoga five minutes',
        cadence: { kind: 'daily' as const },
        currentStreak: 3,
        longestStreak: 9,
        category: null,
        location: 'living room',
        matchedField: 'location' as const,
      },
    ],
  },
};

function typeInto(input: HTMLInputElement, text: string): void {
  fireEvent.change(input, { target: { value: text } });
}

afterEach(() => {
  cleanup();
  (global as unknown as { fetch: typeof fetch | undefined }).fetch = undefined;
});

// Default timeout for waitFor that crosses the 250ms debounce comfortably,
// even on a slow CI box.
const WAIT = { timeout: 2000 };

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('SearchClient — empty / short input', () => {
  it('renders the quiet prompt when the input is empty and never fetches', () => {
    const fetchMock = setFetch(() => {
      throw new Error('fetch should not be called for empty input');
    });
    render(<SearchClient />);
    expect(screen.getByTestId('search-prompt')).toHaveTextContent(
      'type to search across your routines and habits.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still shows the prompt (no fetch) when the user types a single character', async () => {
    const fetchMock = setFetch(() =>
      Promise.resolve(jsonResponse(SAMPLE_RESULTS)),
    );
    render(<SearchClient />);

    const input = screen.getByLabelText(
      'Search routines and habits',
    ) as HTMLInputElement;
    typeInto(input, 'y');
    // Wait long enough for the debounce timer to have fired if it were going to.
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByTestId('search-prompt')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('SearchClient — debounced fetch', () => {
  it('fires a fetch after the debounce window with ?q=<encoded>', async () => {
    const fetchMock = setFetch(() =>
      Promise.resolve(jsonResponse(SAMPLE_RESULTS)),
    );
    render(<SearchClient />);

    const input = screen.getByLabelText(
      'Search routines and habits',
    ) as HTMLInputElement;
    typeInto(input, 'yo');

    await waitFor(
      () => expect(fetchMock).toHaveBeenCalledTimes(1),
      WAIT,
    );
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('/api/search?q=yo');
  });

  it('encodes special characters in the query', async () => {
    const fetchMock = setFetch(() =>
      Promise.resolve(jsonResponse(SAMPLE_RESULTS)),
    );
    render(<SearchClient />);
    const input = screen.getByLabelText(
      'Search routines and habits',
    ) as HTMLInputElement;
    typeInto(input, 'a&b');

    await waitFor(
      () => expect(fetchMock).toHaveBeenCalledTimes(1),
      WAIT,
    );
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/search?q=a%26b');
  });

  it('coalesces rapid edits — only the final value fires a request', async () => {
    const fetchMock = setFetch(() =>
      Promise.resolve(jsonResponse(SAMPLE_RESULTS)),
    );
    render(<SearchClient />);
    const input = screen.getByLabelText(
      'Search routines and habits',
    ) as HTMLInputElement;
    // Simulate "rapid typing" by setting the value four times in quick
    // succession (each updates the React state synchronously inside a single
    // microtask cluster — the prior debounce timer is cleared before it can
    // fire).
    typeInto(input, 'y');
    typeInto(input, 'yo');
    typeInto(input, 'yog');
    typeInto(input, 'yoga');

    await waitFor(
      () => expect(fetchMock).toHaveBeenCalledTimes(1),
      WAIT,
    );
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/search?q=yoga');
  });
});

describe('SearchClient — loading state', () => {
  it('renders the quiet "searching…" hint while the fetch is in flight', async () => {
    let resolver: (r: Response) => void = () => {};
    const pending = new Promise<Response>((r) => {
      resolver = r;
    });
    setFetch(() => pending);

    render(<SearchClient />);
    const input = screen.getByLabelText(
      'Search routines and habits',
    ) as HTMLInputElement;
    typeInto(input, 'yo');

    await waitFor(
      () => expect(screen.getByText('searching…')).toBeInTheDocument(),
      WAIT,
    );

    // Resolve the in-flight request and confirm the hint goes away.
    await act(async () => {
      resolver(jsonResponse(SAMPLE_RESULTS));
      await Promise.resolve();
    });
    await waitFor(
      () => expect(screen.queryByText('searching…')).not.toBeInTheDocument(),
      WAIT,
    );
  });
});

describe('SearchClient — results rendering', () => {
  it('renders routines and habits in two sections with matched-field pills', async () => {
    setFetch(() => Promise.resolve(jsonResponse(SAMPLE_RESULTS)));
    render(<SearchClient />);
    const input = screen.getByLabelText(
      'Search routines and habits',
    ) as HTMLInputElement;
    typeInto(input, 'yo');

    await waitFor(
      () => expect(screen.getByText('Yoga flow')).toBeInTheDocument(),
      WAIT,
    );

    expect(
      screen.getByRole('heading', { name: 'routines' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'habits' })).toBeInTheDocument();

    const pills = screen.getAllByTestId('matched-field-pill');
    expect(pills.length).toBe(2);
    expect(pills[0]).toHaveTextContent('matched: name');
    expect(pills[1]).toHaveTextContent('matched: location');
  });

  it('hides the routines section header when zero routines but habits exist', async () => {
    setFetch(() =>
      Promise.resolve(
        jsonResponse({
          ok: true,
          query: 'yo',
          results: {
            routines: [],
            habits: SAMPLE_RESULTS.results.habits,
          },
        }),
      ),
    );
    render(<SearchClient />);
    const input = screen.getByLabelText(
      'Search routines and habits',
    ) as HTMLInputElement;
    typeInto(input, 'yo');

    await waitFor(
      () => expect(screen.getByText('Yoga five minutes')).toBeInTheDocument(),
      WAIT,
    );
    expect(
      screen.queryByRole('heading', { name: 'routines' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'habits' }),
    ).toBeInTheDocument();
  });
});

describe('SearchClient — no matches', () => {
  it('shows "no matches." when both buckets come back empty for a 2+ char query', async () => {
    setFetch(() =>
      Promise.resolve(
        jsonResponse({
          ok: true,
          query: 'zz',
          results: { routines: [], habits: [] },
        }),
      ),
    );
    render(<SearchClient />);
    const input = screen.getByLabelText(
      'Search routines and habits',
    ) as HTMLInputElement;
    typeInto(input, 'zz');

    await waitFor(
      () =>
        expect(screen.getByTestId('search-no-matches')).toHaveTextContent(
          'no matches.',
        ),
      WAIT,
    );
    expect(screen.queryByTestId('search-prompt')).not.toBeInTheDocument();
  });
});

describe('SearchClient — error state', () => {
  it('renders an Alert banner when the fetch fails', async () => {
    setFetch(() =>
      Promise.resolve(jsonResponse({ error: 'server_unavailable' }, false, 500)),
    );
    render(<SearchClient />);
    const input = screen.getByLabelText(
      'Search routines and habits',
    ) as HTMLInputElement;
    typeInto(input, 'yo');

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    }, WAIT);
  });
});

describe('SearchClient — Cmd/Ctrl+K shortcut', () => {
  it('focuses the search input when Ctrl+K is pressed', () => {
    setFetch(() => Promise.resolve(jsonResponse(SAMPLE_RESULTS)));
    render(<SearchClient />);
    const input = screen.getByLabelText(
      'Search routines and habits',
    ) as HTMLInputElement;

    // Blur the input first (it autoFocuses on mount).
    input.blur();
    expect(document.activeElement).not.toBe(input);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
      );
    });

    expect(document.activeElement).toBe(input);
  });

  it('also responds to Cmd (metaKey)+K on macOS-style keyboards', () => {
    setFetch(() => Promise.resolve(jsonResponse(SAMPLE_RESULTS)));
    render(<SearchClient />);
    const input = screen.getByLabelText(
      'Search routines and habits',
    ) as HTMLInputElement;
    input.blur();

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
      );
    });

    expect(document.activeElement).toBe(input);
  });
});
