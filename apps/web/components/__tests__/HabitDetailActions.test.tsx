// @vitest-environment jsdom
/**
 * HabitDetailActions tests.
 *
 * Covers the duplicate-and-navigate flow:
 *   - Click "Duplicate" → POST /api/habits/:id/duplicate
 *   - Success (201 with `{ ok: true, habit: { id } }`) → router.push to /habits/{newId}
 *   - 401 → router.push to /login?from=/habits/{originalId}
 *   - Non-OK + non-401 → Alert banner appears
 *   - In-flight POST → button aria-busy=true (loading state)
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const routerPush = vi.fn();
const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

import { HabitDetailActions } from '@/components/ui/HabitDetailActions';

function mockFetchOnce(init: Partial<Response> & { json?: () => unknown }) {
  const res = {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: init.json ?? (async () => ({})),
  } as unknown as Response;
  (global as unknown as { fetch: typeof fetch }).fetch = vi
    .fn()
    .mockResolvedValueOnce(res) as unknown as typeof fetch;
}

function mockFetchPending(): {
  resolve: (value: Partial<Response> & { json?: () => unknown }) => void;
} {
  let resolver: (value: Response) => void = () => {};
  const promise = new Promise<Response>((res) => {
    resolver = res;
  });
  (global as unknown as { fetch: typeof fetch }).fetch = vi
    .fn()
    .mockReturnValueOnce(promise) as unknown as typeof fetch;
  return {
    resolve: (value) => {
      const res = {
        ok: value.ok ?? true,
        status: value.status ?? 200,
        json: value.json ?? (async () => ({})),
      } as unknown as Response;
      resolver(res);
    },
  };
}

beforeEach(() => {
  routerPush.mockReset();
  routerRefresh.mockReset();
});

afterEach(() => {
  cleanup();
  (global as unknown as { fetch: typeof fetch | undefined }).fetch = undefined;
});

describe('HabitDetailActions — rendering', () => {
  it('renders a "Duplicate" button', () => {
    render(<HabitDetailActions habitId="h1" habitName="Read" />);
    expect(
      screen.getByRole('button', { name: /duplicate habit read/i }),
    ).toBeInTheDocument();
  });

  it('uses the secondary variant (non-destructive)', () => {
    render(<HabitDetailActions habitId="h1" habitName="Read" />);
    const btn = screen.getByRole('button', { name: /duplicate habit read/i });
    expect(btn.className).toMatch(/variant-secondary/);
  });
});

describe('HabitDetailActions — duplicate flow', () => {
  it('POSTs to /api/habits/:id/duplicate on click', async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      json: async () => ({ ok: true, habit: { id: 'h-new' } }),
    });
    const user = userEvent.setup();
    render(<HabitDetailActions habitId="h1" habitName="Read" />);

    await user.click(
      screen.getByRole('button', { name: /duplicate habit read/i }),
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]!;
    expect(call[0]).toBe('/api/habits/h1/duplicate');
    expect(call[1]).toMatchObject({ method: 'POST' });
  });

  it('on success, calls router.push with the new habit id', async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      json: async () => ({ ok: true, habit: { id: 'h-new' } }),
    });
    const user = userEvent.setup();
    render(<HabitDetailActions habitId="h1" habitName="Read" />);

    await user.click(
      screen.getByRole('button', { name: /duplicate habit read/i }),
    );

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith('/habits/h-new'),
    );
  });

  it('on 401, redirects to /login with the original id in ?from=', async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, error: 'unauthorized' }),
    });
    const user = userEvent.setup();
    render(<HabitDetailActions habitId="h1" habitName="Read" />);

    await user.click(
      screen.getByRole('button', { name: /duplicate habit read/i }),
    );

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith('/login?from=/habits/h1'),
    );
  });

  it('on error response, surfaces the "Could not duplicate" Alert banner', async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: 'server_error' }),
    });
    const user = userEvent.setup();
    render(<HabitDetailActions habitId="h1" habitName="Read" />);

    await user.click(
      screen.getByRole('button', { name: /duplicate habit read/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /could not duplicate/i,
      ),
    );
    // Mature copy — no exclamation marks or emoji.
    expect(screen.getByRole('alert').textContent).not.toMatch(/!/);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('on a 200 with `{ ok: false }`, surfaces the error banner', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: false }),
    });
    const user = userEvent.setup();
    render(<HabitDetailActions habitId="h1" habitName="Read" />);

    await user.click(
      screen.getByRole('button', { name: /duplicate habit read/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /could not duplicate/i,
      ),
    );
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('shows aria-busy on the button while the POST is in-flight', async () => {
    const pending = mockFetchPending();
    const user = userEvent.setup();
    render(<HabitDetailActions habitId="h1" habitName="Read" />);

    const btn = screen.getByRole('button', { name: /duplicate habit read/i });
    await user.click(btn);

    await waitFor(() => expect(btn).toHaveAttribute('aria-busy', 'true'));

    pending.resolve({
      ok: true,
      status: 201,
      json: async () => ({ ok: true, habit: { id: 'h-new' } }),
    });
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith('/habits/h-new'),
    );
  });

  it('clicking again while a duplicate is in-flight does NOT fire a second POST', async () => {
    const pending = mockFetchPending();
    const user = userEvent.setup();
    render(<HabitDetailActions habitId="h1" habitName="Read" />);

    const btn = screen.getByRole('button', { name: /duplicate habit read/i });
    await user.click(btn);
    await user.click(btn);
    await user.click(btn);

    expect(global.fetch).toHaveBeenCalledTimes(1);

    pending.resolve({
      ok: true,
      status: 201,
      json: async () => ({ ok: true, habit: { id: 'h-new' } }),
    });
    await waitFor(() => expect(routerPush).toHaveBeenCalled());
  });
});
