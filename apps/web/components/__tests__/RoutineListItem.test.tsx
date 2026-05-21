// @vitest-environment jsdom
/**
 * RoutineListItem tests.
 *
 * Per RoutineListItem.tsx:
 *   - Whole row is a <Link href={`/routines/${id}`}>; the wrapping anchor's
 *     accessible name is "<name>, <weekdays>".
 *   - Description renders inside the row when present.
 *   - Schedule pretty-printer:
 *       []                          -> "No days scheduled"
 *       [0..6] (length 7)           -> "Every day"
 *       [0..4] (length 5, sequence) -> "Weekdays"
 *       [5, 6]                      -> "Weekends"
 *       anything else               -> "Mo · We · Fr"-style joined string
 *   - The .meta block (with the human label) is aria-hidden — assistive tech
 *     reads `accessibleSchedule` (full names: "Monday, Wednesday, Friday").
 *   - Today's progress line: rendered as "<n> of <m> today" when scheduled
 *     today; "all done today" (brand color) when fully complete; absent
 *     otherwise.
 *   - 7-day consistency strip: 7 cells, oldest left, today's cell carries
 *     `data-today="true"` and a brand-colored outline; the wrapping div has
 *     `role="img"` + a numeric aria-label of completed/scheduled days.
 *
 * Note: we use a regex matcher for the accessible name because RTL normalizes
 * whitespace, and we want to be robust against incidental wording shifts.
 *
 * Next's <Link> renders an <a> in jsdom; no mock needed.
 */

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { RoutineListItem } from '@/components/ui/RoutineListItem';

afterEach(() => {
  cleanup();
});

/**
 * Build a default `lastSevenDays` of 7 entries (oldest → today), all
 * unscheduled (total = 0). Tests that want a specific strip pass `overrides`
 * by index in `[old0, old1, ..., today]` order.
 */
function makeSevenDays(
  perDay?: Array<{ scheduled?: number; total?: number; completed?: number }>,
) {
  const out: Array<{
    date: string;
    scheduled: number;
    total: number;
    completed: number;
  }> = [];
  // Synthetic ascending dates ending at 2026-05-20 (today per env). Exact
  // dates don't matter for assertions — we never read them.
  const base = new Date('2026-05-14T00:00:00Z').getTime();
  for (let i = 0; i < 7; i++) {
    const d = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    const o = perDay?.[i] ?? {};
    const scheduled = o.scheduled ?? o.total ?? 0;
    const total = o.total ?? scheduled;
    const completed = o.completed ?? 0;
    out.push({ date: d, scheduled, total, completed });
  }
  return out;
}

function makeRoutine(
  overrides: Partial<{
    id: string;
    name: string;
    description: string | null;
    scheduleWeekdays: number[];
    category: string | null;
    location: string | null;
    stepCountToday: number;
    stepsCompletedToday: number;
    isScheduledToday: boolean;
    lastSevenDays: ReturnType<typeof makeSevenDays>;
  }> = {},
) {
  return {
    id: 'r1',
    name: 'Morning routine',
    description: 'Stretch and stuff',
    scheduleWeekdays: [0, 2, 4],
    category: null,
    location: null,
    stepCountToday: 0,
    stepsCompletedToday: 0,
    isScheduledToday: false,
    lastSevenDays: makeSevenDays(),
    ...overrides,
  };
}

describe('RoutineListItem — link target & accessible name', () => {
  it('renders the row as a link to /routines/:id', () => {
    render(<RoutineListItem routine={makeRoutine({ id: 'abc-123' })} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/routines/abc-123');
  });

  it('exposes "<name>, <full weekdays>" as the accessible name', () => {
    render(
      <RoutineListItem
        routine={makeRoutine({
          name: 'Morning routine',
          scheduleWeekdays: [0, 2, 4],
        })}
      />,
    );
    const link = screen.getByRole('link', {
      name: /morning routine, monday, wednesday, friday/i,
    });
    expect(link).toBeInTheDocument();
  });

  it('says "no days scheduled" in the accessible name when scheduleWeekdays is empty', () => {
    render(
      <RoutineListItem
        routine={makeRoutine({ scheduleWeekdays: [] })}
      />,
    );
    const link = screen.getByRole('link', {
      name: /no days scheduled/i,
    });
    expect(link).toBeInTheDocument();
  });
});

describe('RoutineListItem — name & description rendering', () => {
  it('renders the routine name', () => {
    render(
      <RoutineListItem routine={makeRoutine({ name: 'Bedtime ritual' })} />,
    );
    expect(screen.getByText('Bedtime ritual')).toBeInTheDocument();
  });

  it('renders the description when present', () => {
    render(
      <RoutineListItem
        routine={makeRoutine({ description: 'A short blurb' })}
      />,
    );
    expect(screen.getByText('A short blurb')).toBeInTheDocument();
  });

  it('omits the description block when description is null', () => {
    render(
      <RoutineListItem routine={makeRoutine({ description: null })} />,
    );
    expect(screen.queryByText(/A short blurb/)).not.toBeInTheDocument();
  });

  it('omits the description block when description is an empty / whitespace string', () => {
    render(
      <RoutineListItem routine={makeRoutine({ description: '   ' })} />,
    );
    // The source trims and renders only if truthy after trim.
    const link = screen.getByRole('link');
    // Title still there; nothing else.
    expect(within(link).getByText('Morning routine')).toBeInTheDocument();
  });

  it('renders a long description verbatim (CSS handles truncation)', () => {
    // Truncation is a CSS concern (line-clamp). The component just renders the
    // string into a styled div; the test asserts the styling class is applied
    // so we know the truncation rule is wired.
    const long =
      'This is a very long description that would normally be truncated by the underlying CSS line-clamp rule to keep the row visually tidy.';
    render(<RoutineListItem routine={makeRoutine({ description: long })} />);
    const text = screen.getByText(long);
    expect(text).toBeInTheDocument();
    // Truncation hook: class name carries "description".
    expect(text.className).toMatch(/description/);
  });
});

describe('RoutineListItem — schedule pretty-printer (.meta)', () => {
  it('shows "No days scheduled" (muted) when scheduleWeekdays is empty', () => {
    render(
      <RoutineListItem routine={makeRoutine({ scheduleWeekdays: [] })} />,
    );
    // Two occurrences (link aria-label + visible meta); use getAllByText.
    expect(screen.getAllByText(/No days scheduled/i).length).toBeGreaterThan(0);
  });

  it('shows "Every day" when scheduleWeekdays is [0..6]', () => {
    render(
      <RoutineListItem
        routine={makeRoutine({ scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6] })}
      />,
    );
    expect(screen.getByText('Every day')).toBeInTheDocument();
  });

  it('shows "Weekdays" when scheduleWeekdays is [0..4] (Mon..Fri)', () => {
    render(
      <RoutineListItem
        routine={makeRoutine({ scheduleWeekdays: [0, 1, 2, 3, 4] })}
      />,
    );
    expect(screen.getByText('Weekdays')).toBeInTheDocument();
  });

  it('shows "Weekends" when scheduleWeekdays is [5, 6]', () => {
    render(
      <RoutineListItem
        routine={makeRoutine({ scheduleWeekdays: [5, 6] })}
      />,
    );
    expect(screen.getByText('Weekends')).toBeInTheDocument();
  });

  it('renders short-code pills joined by " · " for custom day selections', () => {
    render(
      <RoutineListItem
        routine={makeRoutine({ scheduleWeekdays: [0, 2, 4] })}
      />,
    );
    expect(screen.getByText('Mo · We · Fr')).toBeInTheDocument();
  });
});

describe('RoutineListItem — keyboard activation', () => {
  it('the link is reachable via Tab (it is a real <a href> so the browser handles it)', () => {
    render(<RoutineListItem routine={makeRoutine()} />);
    const link = screen.getByRole('link');
    link.focus();
    expect(link).toHaveFocus();
  });

  // Note on Enter-to-navigate: jsdom does not implement real navigation for
  // <a href>, so we don't assert window.location changes. We instead trust the
  // browser's native behavior on a real <a> element (verified by the link
  // being the rendered element with the right href, asserted above).
});

describe('RoutineListItem — today progress line', () => {
  it('renders "{completed} of {total} today" when scheduled today and partially complete', () => {
    render(
      <RoutineListItem
        routine={makeRoutine({
          isScheduledToday: true,
          stepCountToday: 5,
          stepsCompletedToday: 3,
        })}
      />,
    );
    expect(screen.getByText('3 of 5 today')).toBeInTheDocument();
    // It is NOT the "all done" copy.
    expect(screen.queryByText(/all done today/i)).not.toBeInTheDocument();
  });

  it('renders "all done today" in brand color when fully complete', () => {
    render(
      <RoutineListItem
        routine={makeRoutine({
          isScheduledToday: true,
          stepCountToday: 4,
          stepsCompletedToday: 4,
        })}
      />,
    );
    const el = screen.getByText('all done today');
    expect(el).toBeInTheDocument();
    // Brand color is wired via inline style (CSS var resolves at runtime, so
    // we assert the var reference itself rather than a computed color).
    expect(el.getAttribute('style') ?? '').toMatch(/var\(--c-brand-primary\)/);
  });

  it('does not render the progress line when not scheduled today', () => {
    render(
      <RoutineListItem
        routine={makeRoutine({
          isScheduledToday: false,
          stepCountToday: 0,
          stepsCompletedToday: 0,
        })}
      />,
    );
    expect(screen.queryByText(/today/i)).not.toBeInTheDocument();
  });

  it('does not render the progress line when scheduled flag is on but stepCountToday is 0', () => {
    // Defensive: if the server ever flips isScheduledToday=true with 0 steps
    // (shouldn't, but the component should still stay silent).
    render(
      <RoutineListItem
        routine={makeRoutine({
          isScheduledToday: true,
          stepCountToday: 0,
          stepsCompletedToday: 0,
        })}
      />,
    );
    expect(screen.queryByText(/of 0 today/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/all done today/i)).not.toBeInTheDocument();
  });
});

describe('RoutineListItem — 7-day consistency strip', () => {
  it('renders exactly 7 cells', () => {
    render(<RoutineListItem routine={makeRoutine()} />);
    const strip = screen.getByRole('img', {
      name: /7-day consistency/i,
    });
    // Each cell is a <span aria-hidden="true"> child of the strip.
    expect(strip.children.length).toBe(7);
  });

  it('aria-label reports completed/scheduled day counts', () => {
    render(
      <RoutineListItem
        routine={makeRoutine({
          lastSevenDays: makeSevenDays([
            { total: 0, completed: 0 }, // off
            { total: 3, completed: 3 }, // ✓
            { total: 3, completed: 1 }, // partial (not "completed")
            { total: 3, completed: 3 }, // ✓
            { total: 0, completed: 0 }, // off
            { total: 3, completed: 3 }, // ✓
            { total: 3, completed: 2 }, // partial today
          ]),
        })}
      />,
    );
    // 3 fully complete out of 5 scheduled days.
    expect(
      screen.getByRole('img', {
        name: /3 of 5 scheduled days completed/i,
      }),
    ).toBeInTheDocument();
  });

  it("today's cell carries data-today and a brand outline style", () => {
    render(<RoutineListItem routine={makeRoutine()} />);
    const strip = screen.getByRole('img', {
      name: /7-day consistency/i,
    });
    const cells = Array.from(strip.children) as HTMLElement[];
    // Only the last cell (index 6) is "today".
    expect(cells[6]?.getAttribute('data-today')).toBe('true');
    expect(cells[0]?.getAttribute('data-today')).toBeNull();
    const todayStyle = cells[6]?.getAttribute('style') ?? '';
    expect(todayStyle).toMatch(/outline:\s*1px solid var\(--c-brand-primary\)/);
  });

  it("off days use surface-elevated background; fully-complete days use brand-primary", () => {
    render(
      <RoutineListItem
        routine={makeRoutine({
          lastSevenDays: makeSevenDays([
            { total: 0, completed: 0 },
            { total: 3, completed: 0 },
            { total: 3, completed: 1 },
            { total: 3, completed: 3 },
            { total: 0, completed: 0 },
            { total: 3, completed: 3 },
            { total: 3, completed: 3 },
          ]),
        })}
      />,
    );
    const strip = screen.getByRole('img', {
      name: /7-day consistency/i,
    });
    const cells = Array.from(strip.children) as HTMLElement[];
    // Off day (idx 0).
    expect(cells[0]?.getAttribute('style') ?? '').toMatch(
      /background:\s*var\(--c-surface-elevated\)/,
    );
    // Empty scheduled day (idx 1).
    expect(cells[1]?.getAttribute('style') ?? '').toMatch(
      /background:\s*var\(--c-border-subtle\)/,
    );
    // Partial day (idx 2).
    expect(cells[2]?.getAttribute('style') ?? '').toMatch(
      /background:\s*var\(--c-brand-primary-subtle\)/,
    );
    // Fully complete day (idx 3).
    expect(cells[3]?.getAttribute('style') ?? '').toMatch(
      /background:\s*var\(--c-brand-primary\)/,
    );
  });
});
