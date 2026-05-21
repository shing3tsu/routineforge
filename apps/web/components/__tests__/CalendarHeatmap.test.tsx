// @vitest-environment jsdom
/**
 * CalendarHeatmap tests.
 *
 * Per CalendarHeatmap.tsx:
 *   - Grid is `weeks` columns × 7 rows; default weeks=13 yields 91 cells.
 *   - Container has role="grid" with aria-label = "Last {weeks*7} days: {N}
 *     completed" (and a visually-hidden duplicate of the same string above).
 *   - Each cell has role="gridcell" with both `aria-label` and `title` set to
 *     "{Weekday-short} {YYYY-MM-DD}: {completed | not completed}( (today))?".
 *   - asOfDate pins "today"; cells whose date string > today are .cellFuture
 *     (rendered with reduced opacity).
 *   - Today's cell gets the .cellToday class (1.5px outline).
 *   - Completed cells get the .cellOn class; non-completed get .cellOff.
 *   - Weekday axis on the left is aria-hidden=true with seven Mon..Sun cells
 *     (single-letter visible labels; odd rows hidden via inline style).
 *   - Month labels float above the grid; columns where the label would repeat
 *     the previous shown month are blanked.
 *   - Legend at the bottom is aria-hidden=true and shows "Less … More".
 *
 * Class assertions use regex matching against CSS-modules-hashed class names.
 * Date pinning: pass `asOfDate` so we get deterministic columns regardless of
 * the test runner's wall clock.
 */

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { CalendarHeatmap } from '@/components/ui/CalendarHeatmap';

afterEach(() => {
  cleanup();
});

describe('CalendarHeatmap — grid shape & default sizing', () => {
  it('renders 91 cells (13 weeks × 7 days) by default', () => {
    render(
      <CalendarHeatmap completedDates={[]} asOfDate="2026-05-17" />,
    );
    const grid = screen.getByRole('grid');
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(91);
  });

  it('respects a custom `weeks` prop (8 weeks → 56 cells)', () => {
    render(
      <CalendarHeatmap
        completedDates={[]}
        asOfDate="2026-05-17"
        weeks={8}
      />,
    );
    const grid = screen.getByRole('grid');
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(56);
  });

  it('lays out 7 rows (one per weekday)', () => {
    render(
      <CalendarHeatmap completedDates={[]} asOfDate="2026-05-17" weeks={4} />,
    );
    // Each column is a row group in the source (role="row" with 7 gridcells).
    // We assert by reading aria-rowcount on the grid container, which the
    // source pins to 7.
    const grid = screen.getByRole('grid');
    expect(grid).toHaveAttribute('aria-rowcount', '7');
  });

  it('reports the column count via aria-colcount', () => {
    render(
      <CalendarHeatmap completedDates={[]} asOfDate="2026-05-17" weeks={6} />,
    );
    expect(screen.getByRole('grid')).toHaveAttribute('aria-colcount', '6');
  });
});

describe('CalendarHeatmap — cell fill / completion state', () => {
  it('no cells are filled (.cellOn) when completedDates is empty', () => {
    render(
      <CalendarHeatmap completedDates={[]} asOfDate="2026-05-17" />,
    );
    const grid = screen.getByRole('grid');
    const onCells = within(grid)
      .getAllByRole('gridcell')
      .filter((c) => /cellOn/.test(c.className));
    expect(onCells).toHaveLength(0);
  });

  it('marks today as completed when completedDates includes today only', () => {
    render(
      <CalendarHeatmap
        completedDates={['2026-05-17']}
        asOfDate="2026-05-17"
      />,
    );
    const grid = screen.getByRole('grid');
    const onCells = within(grid)
      .getAllByRole('gridcell')
      .filter((c) => /cellOn/.test(c.className));
    expect(onCells).toHaveLength(1);
    // And that single .cellOn corresponds to today's date label.
    expect(onCells[0]?.getAttribute('aria-label')).toContain('2026-05-17');
    expect(onCells[0]?.getAttribute('aria-label')).toContain('completed');
  });

  it('non-completed cells render the .cellOff class', () => {
    render(
      <CalendarHeatmap completedDates={[]} asOfDate="2026-05-17" />,
    );
    const grid = screen.getByRole('grid');
    // Every cell should carry the .cellOff class when nothing is completed.
    const cells = within(grid).getAllByRole('gridcell');
    cells.forEach((c) => expect(c.className).toMatch(/cellOff/));
  });

  it('de-duplicates the completedDates input (same date listed twice still = 1 cellOn)', () => {
    render(
      <CalendarHeatmap
        completedDates={['2026-05-17', '2026-05-17']}
        asOfDate="2026-05-17"
      />,
    );
    const grid = screen.getByRole('grid');
    const onCells = within(grid)
      .getAllByRole('gridcell')
      .filter((c) => /cellOn/.test(c.className));
    expect(onCells).toHaveLength(1);
  });
});

describe('CalendarHeatmap — today highlight', () => {
  it("today's cell carries the .cellToday class", () => {
    render(
      <CalendarHeatmap
        completedDates={[]}
        asOfDate="2026-05-17"
      />,
    );
    const grid = screen.getByRole('grid');
    const todayCells = within(grid)
      .getAllByRole('gridcell')
      .filter((c) => /cellToday/.test(c.className));
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0]?.getAttribute('aria-label')).toMatch(/\(today\)/);
  });

  it("today's aria-label includes the (today) marker", () => {
    render(
      <CalendarHeatmap
        completedDates={[]}
        asOfDate="2026-05-17"
      />,
    );
    // The label is "{Weekday} 2026-05-17: not completed (today)" — Sunday May 17 2026.
    const todayCell = screen.getByLabelText(/2026-05-17.*\(today\)/);
    expect(todayCell).toBeInTheDocument();
  });
});

describe('CalendarHeatmap — future cells', () => {
  it('cells past asOfDate get the .cellFuture class (muted opacity)', () => {
    render(
      <CalendarHeatmap
        completedDates={[]}
        // Pin "today" to a Monday so future cells exist in the last column.
        asOfDate="2026-05-11"
      />,
    );
    const grid = screen.getByRole('grid');
    const futureCells = within(grid)
      .getAllByRole('gridcell')
      .filter((c) => /cellFuture/.test(c.className));
    // The last column runs Mon..Sun; with asOfDate=Mon, Tue..Sun (6 days)
    // sit in the future within the displayed window.
    expect(futureCells.length).toBe(6);
  });

  it('cells before today (and not today) do NOT carry the .cellFuture class', () => {
    render(
      <CalendarHeatmap
        completedDates={[]}
        asOfDate="2026-05-17"
      />,
    );
    // Sunday 2026-05-17 is the last day of the column; nothing is in the
    // future. So zero .cellFuture cells should appear.
    const grid = screen.getByRole('grid');
    const futureCells = within(grid)
      .getAllByRole('gridcell')
      .filter((c) => /cellFuture/.test(c.className));
    expect(futureCells).toHaveLength(0);
  });
});

describe('CalendarHeatmap — summary label & a11y', () => {
  it('the grid container exposes the summary as aria-label ("Last 91 days: 0 completed")', () => {
    render(
      <CalendarHeatmap completedDates={[]} asOfDate="2026-05-17" />,
    );
    const grid = screen.getByRole('grid');
    expect(grid).toHaveAttribute('aria-label', 'Last 91 days: 0 completed');
  });

  it('summary counts only completions inside the displayed window', () => {
    // Today is 2026-05-17. The grid spans 13 weeks back. So a 2024-01-01
    // date is OUTSIDE the window and must not be counted in the summary.
    render(
      <CalendarHeatmap
        completedDates={['2026-05-17', '2024-01-01']}
        asOfDate="2026-05-17"
      />,
    );
    expect(screen.getByRole('grid')).toHaveAttribute(
      'aria-label',
      'Last 91 days: 1 completed',
    );
  });

  it('summary phrasing for a custom weeks count (8 → 56 days)', () => {
    render(
      <CalendarHeatmap
        completedDates={[]}
        asOfDate="2026-05-17"
        weeks={8}
      />,
    );
    expect(screen.getByRole('grid')).toHaveAttribute(
      'aria-label',
      'Last 56 days: 0 completed',
    );
  });

  it('counts multiple in-window completions correctly in the summary', () => {
    render(
      <CalendarHeatmap
        completedDates={['2026-05-17', '2026-05-16', '2026-05-15']}
        asOfDate="2026-05-17"
      />,
    );
    expect(screen.getByRole('grid')).toHaveAttribute(
      'aria-label',
      'Last 91 days: 3 completed',
    );
  });
});

describe('CalendarHeatmap — cell-level a11y labels', () => {
  it('each cell has an aria-label of the form "{Weekday} {YYYY-MM-DD}: {state}"', () => {
    render(
      <CalendarHeatmap
        completedDates={['2026-05-17']}
        asOfDate="2026-05-17"
      />,
    );
    // 2026-05-17 is a Sunday.
    const cell = screen.getByLabelText(/Sun 2026-05-17: completed/);
    expect(cell).toBeInTheDocument();
  });

  it('non-completed cells say "not completed" in the aria-label', () => {
    render(
      <CalendarHeatmap completedDates={[]} asOfDate="2026-05-17" />,
    );
    // Saturday 2026-05-16 is in the window and not completed.
    const cell = screen.getByLabelText(/Sat 2026-05-16: not completed/);
    expect(cell).toBeInTheDocument();
  });

  it('mirrors the aria-label onto the native title attribute (hover tooltip)', () => {
    render(
      <CalendarHeatmap
        completedDates={['2026-05-17']}
        asOfDate="2026-05-17"
      />,
    );
    const cell = screen.getByLabelText(/Sun 2026-05-17: completed/);
    expect(cell.getAttribute('title')).toBe(cell.getAttribute('aria-label'));
  });
});

describe('CalendarHeatmap — month labels', () => {
  it('renders at least one month label per visible month boundary', () => {
    render(
      <CalendarHeatmap
        completedDates={[]}
        asOfDate="2026-05-17"
      />,
    );
    // 13 weeks back from 2026-05-17 lands inside February 2026. So Feb, Mar,
    // Apr, May should all be represented in the month strip.
    // We rely on each abbreviation appearing in the DOM at least once.
    ['Feb', 'Mar', 'Apr', 'May'].forEach((m) => {
      expect(screen.getByText(m)).toBeInTheDocument();
    });
  });

  it('de-duplicates adjacent month labels (no repeated "May May May")', () => {
    render(
      <CalendarHeatmap
        completedDates={[]}
        asOfDate="2026-05-17"
      />,
    );
    // After de-dup, each month abbreviation that does appear should appear
    // exactly once in the months strip.
    const mayMatches = screen.getAllByText('May');
    expect(mayMatches).toHaveLength(1);
    const aprMatches = screen.getAllByText('Apr');
    expect(aprMatches).toHaveLength(1);
  });
});

describe('CalendarHeatmap — weekday axis', () => {
  it('renders the weekday axis along the left (single-letter visible labels)', () => {
    const { container } = render(
      <CalendarHeatmap
        completedDates={[]}
        asOfDate="2026-05-17"
        weeks={4}
      />,
    );
    // The axis is aria-hidden=true so it's hidden from AT; query the DOM
    // directly. The source emits the first letter of each label and hides
    // odd rows visually.
    const axis = container.querySelector('[aria-hidden="true"]');
    expect(axis).not.toBeNull();
    // M, T, W, T, F, S, S — first letters; appear concatenated in the axis.
    // We assert by reading the axis text content stripped of whitespace.
    const text = axis?.textContent?.replace(/\s+/g, '') ?? '';
    expect(text).toContain('M');
    expect(text).toContain('W');
    expect(text).toContain('F');
  });
});

describe('CalendarHeatmap — legend', () => {
  it('renders a legend with "Less" and "More" copy', () => {
    render(
      <CalendarHeatmap
        completedDates={[]}
        asOfDate="2026-05-17"
      />,
    );
    expect(screen.getByText('Less')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
  });
});

describe('CalendarHeatmap — custom className & id pass-through', () => {
  it('forwards a custom className to the root', () => {
    const { container } = render(
      <CalendarHeatmap
        completedDates={[]}
        asOfDate="2026-05-17"
        className="my-heatmap"
      />,
    );
    const root = container.firstElementChild;
    expect(root?.className ?? '').toMatch(/my-heatmap/);
  });

  it('wires the hidden summary with id={id}-label when id is provided', () => {
    const { container } = render(
      <CalendarHeatmap
        completedDates={[]}
        asOfDate="2026-05-17"
        id="streak-graph"
      />,
    );
    const labelEl = container.querySelector('#streak-graph-label');
    expect(labelEl).not.toBeNull();
    expect(labelEl?.textContent).toBe('Last 91 days: 0 completed');
  });
});
