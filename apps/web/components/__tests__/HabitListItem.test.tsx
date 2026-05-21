// @vitest-environment jsdom
/**
 * HabitListItem tests.
 *
 * Per HabitListItem.tsx:
 *   - Row anatomy: a sibling <button role="checkbox"> + a <Link> wrapping the
 *     body (name + cadence meta) + a StreakBadge. The button cannot be nested
 *     inside the anchor (HTML rule); the source comment is explicit about this.
 *   - The link's accessible name = `${habit.name}, ${formatCadenceAccessible}`,
 *     and the link's href = `/habits/${id}`.
 *   - Cadence meta uses `formatCadence(cadence)` (compact form like "Daily" /
 *     "5 per week" / "Mon · Wed · Fri"), wrapped in a div with aria-hidden=true
 *     (the long-form lives in the link's aria-label).
 *   - The checkbox aria-label flips between
 *       false -> `Mark "${name}" done for today`
 *       true  -> `Mark "${name}" not done for today`
 *     and the aria-checked attribute flips accordingly.
 *   - Initial done state derives from `habit.lastCompletedDate === habit.todayLocal`.
 *   - Click optimistically flips local state and calls onToggleToday(id, next).
 *     When the callback rejects, the source reverts the optimistic flip.
 *   - While the callback is pending, the button has aria-busy="true" and is
 *     `disabled`.
 *   - The StreakBadge inside is size="sm" with showBestSuffix={false} (see the
 *     source); we assert via the badge's aria-label which the StreakBadge owns.
 *
 * Note on async handlers: we use a manually-resolved deferred promise to
 * exercise the pending → resolved transition; the source returns the button to
 * its idle state via `finally { setPending(false) }`.
 */

import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HabitListItem } from '@/components/ui/HabitListItem';
import type { HabitListItemHabit } from '@/components/ui/HabitListItem';

afterEach(() => {
  cleanup();
});

function makeHabit(
  overrides: Partial<HabitListItemHabit> = {},
): HabitListItemHabit {
  return {
    id: 'h-1',
    name: 'Drink water',
    cadence: { kind: 'daily' },
    currentStreak: 5,
    longestStreak: 12,
    todayLocal: '2026-05-17',
    lastCompletedDate: null,
    ...overrides,
  };
}

describe('HabitListItem — link, name & cadence', () => {
  it('renders the row link pointing at /habits/:id', () => {
    render(
      <HabitListItem
        habit={makeHabit({ id: 'habit-abc' })}
        onToggleToday={vi.fn(async () => {})}
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/habits/habit-abc');
  });

  it('exposes "<name>, <accessible cadence>" as the link accessible name', () => {
    render(
      <HabitListItem
        habit={makeHabit({ name: 'Drink water', cadence: { kind: 'daily' } })}
        onToggleToday={vi.fn(async () => {})}
      />,
    );
    expect(
      screen.getByRole('link', { name: /Drink water, Daily/ }),
    ).toBeInTheDocument();
  });

  it('renders the habit name as the visible title', () => {
    render(
      <HabitListItem
        habit={makeHabit({ name: 'Stretch' })}
        onToggleToday={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByText('Stretch')).toBeInTheDocument();
  });

  it('renders the compact cadence meta via formatCadence (specific weekdays)', () => {
    render(
      <HabitListItem
        habit={makeHabit({
          cadence: { kind: 'specific_weekdays', weekdays: [0, 2, 4] },
        })}
        onToggleToday={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByText('Mon · Wed · Fri')).toBeInTheDocument();
  });

  it('renders the compact cadence meta for a weekly_count habit ("5 per week")', () => {
    render(
      <HabitListItem
        habit={makeHabit({
          cadence: { kind: 'weekly_count', perWeek: 5, weekStart: 0 },
        })}
        onToggleToday={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByText('5 per week')).toBeInTheDocument();
  });
});

describe('HabitListItem — StreakBadge integration', () => {
  it('embeds a StreakBadge with the habit currentStreak surfaced via its aria-label', () => {
    render(
      <HabitListItem
        habit={makeHabit({ currentStreak: 7, longestStreak: 14 })}
        onToggleToday={vi.fn(async () => {})}
      />,
    );
    // showBestSuffix=false (set by HabitListItem), so the badge's aria-label
    // is the bare "Current streak: 7 days".
    expect(
      screen.getByRole('status', { name: 'Current streak: 7 days' }),
    ).toBeInTheDocument();
  });

  it('shows the zero-state badge for a 0 streak (matches StreakBadge zero-state copy)', () => {
    render(
      <HabitListItem
        habit={makeHabit({ currentStreak: 0, longestStreak: 0 })}
        onToggleToday={vi.fn(async () => {})}
      />,
    );
    expect(
      screen.getByRole('status', {
        name: /No current streak yet — start your streak/,
      }),
    ).toBeInTheDocument();
  });
});

describe('HabitListItem — checkbox initial state', () => {
  it('renders the checkbox unchecked when lastCompletedDate !== todayLocal', () => {
    render(
      <HabitListItem
        habit={makeHabit({
          name: 'Floss',
          todayLocal: '2026-05-17',
          lastCompletedDate: '2026-05-16',
        })}
        onToggleToday={vi.fn(async () => {})}
      />,
    );
    const checkbox = screen.getByRole('checkbox', {
      name: 'Mark "Floss" done for today',
    });
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
  });

  it('renders the checkbox checked when lastCompletedDate === todayLocal', () => {
    render(
      <HabitListItem
        habit={makeHabit({
          name: 'Floss',
          todayLocal: '2026-05-17',
          lastCompletedDate: '2026-05-17',
        })}
        onToggleToday={vi.fn(async () => {})}
      />,
    );
    const checkbox = screen.getByRole('checkbox', {
      name: 'Mark "Floss" not done for today',
    });
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  it('renders the checkbox unchecked when lastCompletedDate is null', () => {
    render(
      <HabitListItem
        habit={makeHabit({
          todayLocal: '2026-05-17',
          lastCompletedDate: null,
        })}
        onToggleToday={vi.fn(async () => {})}
      />,
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
  });
});

describe('HabitListItem — checkbox click behavior', () => {
  it('clicking calls onToggleToday(id, true) when previously not done', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn(async () => {});
    render(
      <HabitListItem
        habit={makeHabit({ id: 'h-7', lastCompletedDate: null })}
        onToggleToday={onToggle}
      />,
    );
    await user.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('h-7', true);
  });

  it('clicking when already done calls onToggleToday(id, false)', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn(async () => {});
    render(
      <HabitListItem
        habit={makeHabit({
          id: 'h-7',
          todayLocal: '2026-05-17',
          lastCompletedDate: '2026-05-17',
        })}
        onToggleToday={onToggle}
      />,
    );
    await user.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('h-7', false);
  });

  it('flips aria-checked and aria-label optimistically (before the promise resolves)', async () => {
    const user = userEvent.setup();
    // Hold the promise open so we can observe the pending state mid-flight.
    let resolve!: () => void;
    const onToggle = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    render(
      <HabitListItem
        habit={makeHabit({ name: 'Read', lastCompletedDate: null })}
        onToggleToday={onToggle}
      />,
    );
    await user.click(screen.getByRole('checkbox'));
    // The button has already re-rendered as "checked" (aria-label flipped).
    const checkbox = screen.getByRole('checkbox', {
      name: 'Mark "Read" not done for today',
    });
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    // Settle the promise and clean up.
    resolve();
    await waitFor(() => expect(checkbox).not.toBeDisabled());
  });

  it('sets aria-busy="true" while the toggle is pending', async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const onToggle = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    render(
      <HabitListItem
        habit={makeHabit()}
        onToggleToday={onToggle}
      />,
    );
    await user.click(screen.getByRole('checkbox'));
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-busy', 'true');
    expect(checkbox).toBeDisabled();
    // Resolve and confirm the busy flag clears.
    resolve();
    await waitFor(() => expect(checkbox).not.toHaveAttribute('aria-busy'));
    expect(checkbox).not.toBeDisabled();
  });

  it('reverts the optimistic flip when onToggleToday rejects', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn(async () => {
      throw new Error('boom');
    });
    render(
      <HabitListItem
        habit={makeHabit({
          name: 'Read',
          todayLocal: '2026-05-17',
          lastCompletedDate: null,
        })}
        onToggleToday={onToggle}
      />,
    );
    await user.click(screen.getByRole('checkbox'));
    // After the rejection settles, the checkbox should be back to unchecked.
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', {
          name: 'Mark "Read" done for today',
        }),
      ).toHaveAttribute('aria-checked', 'false'),
    );
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('ignores further clicks while a previous toggle is still pending', async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const onToggle = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    render(
      <HabitListItem habit={makeHabit()} onToggleToday={onToggle} />,
    );
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    // The button is now disabled (per the source); a second click should not
    // trigger another invocation of onToggleToday.
    await user.click(checkbox);
    expect(onToggle).toHaveBeenCalledTimes(1);
    // Clean up.
    resolve();
    await waitFor(() => expect(checkbox).not.toBeDisabled());
  });
});

describe('HabitListItem — DOM structure & a11y rules', () => {
  it('the checkbox is a SIBLING of the link (not nested inside it)', () => {
    // The source comment is explicit: a <button> cannot live inside an <a>
    // (HTML rule). The two affordances must be siblings inside the flex row.
    render(
      <HabitListItem
        habit={makeHabit()}
        onToggleToday={vi.fn(async () => {})}
      />,
    );
    const checkbox = screen.getByRole('checkbox');
    const link = screen.getByRole('link');
    // Neither should be a descendant of the other.
    expect(link.contains(checkbox)).toBe(false);
    expect(checkbox.contains(link)).toBe(false);
    // And they should share a common parent (the row).
    expect(checkbox.parentElement).toBe(link.parentElement);
  });
});

describe('HabitListItem — keyboard navigation', () => {
  it('the link is keyboard-focusable independently of the checkbox', () => {
    render(
      <HabitListItem
        habit={makeHabit()}
        onToggleToday={vi.fn(async () => {})}
      />,
    );
    const link = screen.getByRole('link');
    link.focus();
    expect(link).toHaveFocus();
  });

  it('the checkbox is independently keyboard-focusable (Tab-stoppable)', () => {
    render(
      <HabitListItem
        habit={makeHabit()}
        onToggleToday={vi.fn(async () => {})}
      />,
    );
    const checkbox = screen.getByRole('checkbox');
    checkbox.focus();
    expect(checkbox).toHaveFocus();
  });

  it('Space on a focused checkbox activates onToggleToday (native <button> semantics)', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn(async () => {});
    render(
      <HabitListItem
        habit={makeHabit({ id: 'h-1' })}
        onToggleToday={onToggle}
      />,
    );
    const checkbox = screen.getByRole('checkbox');
    checkbox.focus();
    await user.keyboard(' ');
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('h-1', true);
  });
});
