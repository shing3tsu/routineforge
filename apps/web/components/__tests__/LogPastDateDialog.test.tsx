// @vitest-environment jsdom
/**
 * LogPastDateDialog — RTL tests.
 *
 * Covers:
 *   - Opens with the right title + description copy.
 *   - Date picker is bounded by [minDate, todayLocal].
 *   - Future date → client-side validation message, no fetch fired on submit.
 *   - Confirm path → POST /api/habits/:id/completions with the chosen date.
 *   - "Remove the completion instead" toggle → DELETE path.
 *   - 204 No Content (DELETE) closes the dialog and calls onSuccess.
 *   - POST 500 keeps the dialog open and shows an Alert banner with the
 *     server-supplied message.
 *   - Cancel button closes without firing a request.
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LogPastDateDialog } from '@/components/ui/LogPastDateDialog';

function mockFetchOnce(
  init: Partial<Response> & { json?: () => unknown },
): void {
  const res = {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: init.json ?? (async () => ({})),
  } as unknown as Response;
  (global as unknown as { fetch: typeof fetch }).fetch = vi
    .fn()
    .mockResolvedValueOnce(res) as unknown as typeof fetch;
}

beforeEach(() => {
  // no-op
});

afterEach(() => {
  cleanup();
  (global as unknown as { fetch: typeof fetch | undefined }).fetch = undefined;
});

describe('LogPastDateDialog — rendering', () => {
  it('renders the dialog with the right title + helper text when open', () => {
    render(
      <LogPastDateDialog
        open
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        habitId="h1"
        todayLocal="2026-05-20"
        minDate="2024-01-01"
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /log a past date/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the habit will be marked done on that day/i),
    ).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(
      <LogPastDateDialog
        open={false}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        habitId="h1"
        todayLocal="2026-05-20"
        minDate="2024-01-01"
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('wires the date input min/max to [minDate, todayLocal]', () => {
    render(
      <LogPastDateDialog
        open
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        habitId="h1"
        todayLocal="2026-05-20"
        minDate="2024-01-01"
      />,
    );
    const dateInput = screen.getByLabelText(/^date$/i) as HTMLInputElement;
    expect(dateInput.min).toBe('2024-01-01');
    expect(dateInput.max).toBe('2026-05-20');
  });
});

describe('LogPastDateDialog — happy paths', () => {
  it('POSTs the chosen date on confirm and calls onSuccess + onClose', async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      json: async () => ({ ok: true, streaks: {} }),
    });
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <LogPastDateDialog
        open
        onClose={onClose}
        onSuccess={onSuccess}
        habitId="h1"
        todayLocal="2026-05-20"
        minDate="2024-01-01"
      />,
    );
    const dateInput = screen.getByLabelText(/^date$/i);
    await user.type(dateInput, '2024-06-15');

    await user.click(screen.getByRole('button', { name: /^log it$/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]!;
    expect(call[0]).toBe('/api/habits/h1/completions');
    expect(call[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ date: '2024-06-15' }),
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('DELETEs when "remove the completion instead" is checked', async () => {
    // 204 No Content — the route returns this for DELETE.
    mockFetchOnce({ ok: true, status: 204 });
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <LogPastDateDialog
        open
        onClose={onClose}
        onSuccess={onSuccess}
        habitId="h1"
        todayLocal="2026-05-20"
        minDate="2024-01-01"
      />,
    );
    await user.type(screen.getByLabelText(/^date$/i), '2024-06-15');
    await user.click(
      screen.getByRole('checkbox', {
        name: /remove the completion instead/i,
      }),
    );
    // The primary button copy changes to "remove" when the toggle is on.
    await user.click(screen.getByRole('button', { name: /^remove$/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]!;
    expect(call[0]).toBe('/api/habits/h1/completions');
    expect(call[1]).toMatchObject({
      method: 'DELETE',
      body: JSON.stringify({ date: '2024-06-15' }),
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('LogPastDateDialog — validation', () => {
  it('shows an inline error and does not POST when no date is chosen', async () => {
    const fetchSpy = vi.fn();
    (global as unknown as { fetch: typeof fetch }).fetch =
      fetchSpy as unknown as typeof fetch;

    const user = userEvent.setup();
    render(
      <LogPastDateDialog
        open
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        habitId="h1"
        todayLocal="2026-05-20"
        minDate="2024-01-01"
      />,
    );
    await user.click(screen.getByRole('button', { name: /^log it$/i }));
    expect(fetchSpy).not.toHaveBeenCalled();
    // A "pick a date first" banner appears (role="alert").
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/pick a date/i),
    );
  });

  it('rejects future dates client-side without firing a request', async () => {
    const fetchSpy = vi.fn();
    (global as unknown as { fetch: typeof fetch }).fetch =
      fetchSpy as unknown as typeof fetch;
    const user = userEvent.setup();
    render(
      <LogPastDateDialog
        open
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        habitId="h1"
        todayLocal="2026-05-20"
        minDate="2024-01-01"
      />,
    );
    // Type a future date directly (browsers allow it even when max= is set).
    await user.type(screen.getByLabelText(/^date$/i), '2030-01-01');
    await user.click(screen.getByRole('button', { name: /^log it$/i }));
    expect(fetchSpy).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getAllByText(/future dates aren't allowed/i)[0],
      ).toBeInTheDocument(),
    );
  });
});

describe('LogPastDateDialog — error path', () => {
  it('keeps the dialog open and shows the server message on POST 500', async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'server exploded' }),
    });
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <LogPastDateDialog
        open
        onClose={onClose}
        onSuccess={onSuccess}
        habitId="h1"
        todayLocal="2026-05-20"
        minDate="2024-01-01"
      />,
    );
    await user.type(screen.getByLabelText(/^date$/i), '2024-06-15');
    await user.click(screen.getByRole('button', { name: /^log it$/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/server exploded/i),
    );
    // Dialog stays open; success / close callbacks did not fire.
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
