/**
 * CalendarHeatmap — 90-day completion grid for the habit detail page.
 *
 * Consumes the global `.rf-heat` family from `design/base.css`:
 *   - `.rf-heat`                    — CSS grid of 13 columns × 7 rows
 *   - `.rf-heat__cell`              — single cell (radius 4, aspect 1:1)
 *   - `.rf-heat__cell[data-level]`  — 0/1/2/3 fill (color-mix ramps)
 *
 * Supplements (in apps/web/app/globals.css):
 *   - `.rf-heat__wrap`              — flex container w/ legend
 *   - `.rf-heat__legend`            — mono caps "less … more" row
 *   - `.rf-heat__legend-swatch`     — square sample for the legend
 *   - `.rf-heat__cell--today`       — 1.5px brand outline
 *   - `.rf-heat__cell--future`      — reduced opacity for unfilled future cells
 *   - `.rf-heat__cell--button`      — interactive variant (resets <button>
 *     defaults + adds focus-visible ring + hover intent preview)
 *   - `.rf-heat__cell--busy`        — opacity dip while a toggle is in flight
 *   - `.rf-heat__cell--error`       — brief danger-subtle flash on toggle reject
 *
 * For our binary completed/not-completed MVP data we use `data-level="3"` for
 * completed, no data-level for not-completed.
 *
 * What this dispatch covers:
 *   - Binary cells (completed vs. not).
 *   - Today's cell outlined with the brand colour.
 *   - Weekday axis + month labels (aria-hidden; decorative).
 *   - Accessibility: the whole grid is `role="grid"` with `aria-label` that
 *     summarises the total ("Last 90 days: 47 completed"); each cell has its
 *     own `aria-label` / `title` for hover-readable date + state.
 *   - Optional interactive mode (`onToggleDate`): cells become focusable
 *     <button>s that fire the callback. Past dates only — future + pre-minDate
 *     cells remain non-interactive (still rendered as buttons but `disabled`,
 *     so the keyboard tab order skips them naturally).
 *
 * What this dispatch does NOT cover:
 *   - Drag tooltips / popovers.
 *   - Multi-stop intensity gradients (level-1/2 mid stops).
 *   - Per-cell roving tabindex (each cell is its own tab stop; fine for ~91).
 *
 * Backward compatibility:
 *   - When `onToggleDate` is undefined, cells render as <div role="gridcell">
 *     exactly as before — no DOM-shape change for read-only callers.
 */
import * as React from 'react';

export type CalendarHeatmapProps = {
  /** Completed dates as 'YYYY-MM-DD'. Order is irrelevant (we de-dup). */
  completedDates: readonly string[];
  /** Number of weeks to display. Default 13 (~90 days). */
  weeks?: number;
  /**
   * Reference date as 'YYYY-MM-DD' (defaults to today in the runtime tz).
   * Pass the habit's tz-aware "today" string for accurate alignment.
   */
  asOfDate?: string;
  /** Optional id used to wire `aria-labelledby` if you want to share a label. */
  id?: string;
  className?: string;
  /**
   * If provided, each cell becomes a button that fires this callback when
   * activated. The callback receives the cell's date and its current
   * completion state (so the caller can decide POST vs DELETE). Future cells
   * and cells before `minDate` are rendered as disabled buttons (still
   * announced to AT but skipped by the tab order).
   *
   * Returning a Promise is supported — the caller is responsible for managing
   * the `pendingDates` / `errorDates` sets it passes back in.
   */
  onToggleDate?: (date: string, currentlyComplete: boolean) => void | Promise<void>;
  /**
   * Dates currently mid-toggle. Cells in this set render with `aria-busy="true"`
   * and a brief opacity dip. Only consulted when `onToggleDate` is provided.
   */
  pendingDates?: ReadonlySet<string>;
  /**
   * Dates whose most recent toggle rejected — these get a transient
   * danger-subtle background flash. The caller is responsible for clearing
   * entries after the flash window (~400ms).
   */
  errorDates?: ReadonlySet<string>;
  /**
   * Earliest date (inclusive) the user is allowed to toggle, as 'YYYY-MM-DD'.
   * Typically the habit's createdAt in habit-tz. Cells before this are
   * rendered as disabled buttons with an explanatory aria-label. Only
   * consulted when `onToggleDate` is provided.
   */
  minDate?: string;
};

const WEEKDAY_LABELS: ReadonlyArray<string> = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
];
const MONTH_LABELS: ReadonlyArray<string> = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function parseLocalDate(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map((v) => Number(v));
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

function formatLocalDate({
  y,
  m,
  d,
}: {
  y: number;
  m: number;
  d: number;
}): string {
  return (
    `${y}`.padStart(4, '0') +
    '-' +
    `${m}`.padStart(2, '0') +
    '-' +
    `${d}`.padStart(2, '0')
  );
}

function addDays(
  base: { y: number; m: number; d: number },
  days: number,
): { y: number; m: number; d: number } {
  const u = new Date(Date.UTC(base.y, base.m - 1, base.d, 12, 0, 0));
  u.setUTCDate(u.getUTCDate() + days);
  return { y: u.getUTCFullYear(), m: u.getUTCMonth() + 1, d: u.getUTCDate() };
}

function isoWeekday(base: { y: number; m: number; d: number }): number {
  const u = new Date(Date.UTC(base.y, base.m - 1, base.d, 12, 0, 0));
  const js = u.getUTCDay();
  return (js + 6) % 7;
}

function defaultTodayString(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

/**
 * Long-form, screen-reader friendly date label, e.g. "May 10, 2026".
 * Pure-string; doesn't rely on the runtime locale beyond the month list.
 */
function formatPrettyDate(dateStr: string): string {
  const { y, m, d } = parseLocalDate(dateStr);
  const month = MONTH_LABELS[m - 1] ?? '';
  return `${month} ${d}, ${y}`;
}

export function CalendarHeatmap({
  completedDates,
  weeks = 13,
  asOfDate,
  id,
  className,
  onToggleDate,
  pendingDates,
  errorDates,
  minDate,
}: CalendarHeatmapProps) {
  const today = asOfDate ?? defaultTodayString();
  const todayParts = parseLocalDate(today);
  const todayWd = isoWeekday(todayParts);

  // Build the grid: `weeks` columns × 7 rows. Today lands in the last column.
  const weekMondayOfToday = addDays(todayParts, -todayWd);
  const gridStart = addDays(weekMondayOfToday, -(weeks - 1) * 7);

  const completed = React.useMemo(
    () => new Set(completedDates),
    [completedDates],
  );

  let inWindow = 0;
  for (let i = 0; i < weeks * 7; i++) {
    const d = formatLocalDate(addDays(gridStart, i));
    if (completed.has(d)) inWindow++;
  }
  const summaryLabel = `Last ${weeks * 7} days: ${inWindow} completed`;

  // Build the cell matrix and month-label positions.
  const columns: Array<
    Array<{
      dateStr: string;
      isFuture: boolean;
      isToday: boolean;
      isCompleted: boolean;
      monthLabel?: string;
    }>
  > = [];

  for (let w = 0; w < weeks; w++) {
    const col: Array<{
      dateStr: string;
      isFuture: boolean;
      isToday: boolean;
      isCompleted: boolean;
      monthLabel?: string;
    }> = [];
    for (let dow = 0; dow < 7; dow++) {
      const parts = addDays(gridStart, w * 7 + dow);
      const dateStr = formatLocalDate(parts);
      const isToday = dateStr === today;
      const isFuture = dateStr > today;
      const isCompleted = completed.has(dateStr);
      let monthLabel: string | undefined;
      if (dow === 0) {
        for (let d = 0; d < 7; d++) {
          const inner = addDays(parts, d);
          if (inner.d === 1) {
            monthLabel = MONTH_LABELS[inner.m - 1];
            break;
          }
        }
        if (!monthLabel && w === 0) {
          monthLabel = MONTH_LABELS[parts.m - 1];
        }
      }
      col.push({ dateStr, isFuture, isToday, isCompleted, monthLabel });
    }
    columns.push(col);
  }

  // De-dup month labels.
  let lastShown: string | undefined;
  for (let i = 0; i < columns.length; i++) {
    const ml = columns[i]![0]!.monthLabel;
    if (ml && ml === lastShown) {
      columns[i]![0]!.monthLabel = undefined;
    } else if (ml) {
      lastShown = ml;
    }
  }

  const labelId = id ? `${id}-label` : undefined;
  const interactive = typeof onToggleDate === 'function';

  return (
    <div className={classes('rf-heat__wrap', className)}>
      <div className="visually-hidden" id={labelId}>
        {summaryLabel}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: 'var(--s-2)',
          alignItems: 'start',
        }}
      >
        {/* Weekday axis (decorative — aria-hidden). */}
        <div
          aria-hidden="true"
          style={{
            display: 'grid',
            gridTemplateRows: 'repeat(7, 12px)',
            gap: 4,
            paddingTop: 14,
          }}
        >
          {WEEKDAY_LABELS.map((wd, i) => (
            <span
              key={wd}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--c-text-muted)',
                lineHeight: '12px',
                textAlign: 'right',
                paddingRight: 4,
                userSelect: 'none',
                visibility: i % 2 === 1 ? 'hidden' : undefined,
              }}
            >
              {wd[0]}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Month labels row above the grid. */}
          <div
            aria-hidden="true"
            style={{
              display: 'grid',
              gridAutoFlow: 'column',
              gridAutoColumns: '12px',
              columnGap: 4,
              height: 12,
            }}
          >
            {columns.map((col, i) => (
              <span
                key={i}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--c-text-muted)',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                }}
              >
                {col[0]?.monthLabel ?? ''}
              </span>
            ))}
          </div>

          <div
            role="grid"
            aria-label={summaryLabel}
            aria-rowcount={7}
            aria-colcount={weeks}
            // Use a custom column-flow grid here (NOT the global .rf-heat
            // class) because .rf-heat is a 15-column row-flow layout in
            // base.css and our heatmap is week-column oriented. Cells still
            // use .rf-heat__cell so the data-level styling applies.
            style={{
              display: 'grid',
              gridAutoFlow: 'column',
              gridAutoColumns: '12px',
              columnGap: 4,
            }}
          >
            {columns.map((col, ci) => (
              <div
                key={ci}
                role="row"
                style={{
                  display: 'grid',
                  gridTemplateRows: 'repeat(7, 12px)',
                  rowGap: 4,
                }}
              >
                {col.map((cell, ri) => {
                  const beforeMin =
                    interactive && minDate ? cell.dateStr < minDate : false;
                  const isPending =
                    interactive && pendingDates
                      ? pendingDates.has(cell.dateStr)
                      : false;
                  const isError =
                    interactive && errorDates
                      ? errorDates.has(cell.dateStr)
                      : false;

                  // Short tooltip-friendly label (kept stable across modes for
                  // existing tests that match on it).
                  const shortAria = `${WEEKDAY_LABELS[ri]} ${cell.dateStr}: ${cell.isCompleted ? 'completed' : 'not completed'}${cell.isToday ? ' (today)' : ''}`;

                  // Long, action-oriented label used only in interactive
                  // mode. Tells the user what activating the cell will do —
                  // the wording the dispatch brief asks for.
                  const interactiveAria = (() => {
                    const pretty = formatPrettyDate(cell.dateStr);
                    if (cell.isFuture) {
                      return `${pretty}: not yet — cannot edit a future date.`;
                    }
                    if (beforeMin) {
                      return `${pretty}: before this habit existed — cannot edit.`;
                    }
                    if (cell.isCompleted) {
                      return `${pretty}: completed (activate to mark not done).`;
                    }
                    return `${pretty}: not completed (activate to mark done).`;
                  })();

                  const ariaLabel = interactive ? interactiveAria : shortAria;
                  // `title` keeps the compact form so hover tooltips remain
                  // unchanged for screen users (the existing tests assert
                  // title=aria-label in read-only mode, which still holds).
                  const titleText = interactive ? interactiveAria : shortAria;

                  const commonClass = classes(
                    'rf-heat__cell',
                    cell.isCompleted ? 'cellOn' : 'cellOff',
                    cell.isFuture && 'rf-heat__cell--future',
                    cell.isFuture && 'cellFuture',
                    cell.isToday && 'rf-heat__cell--today',
                    cell.isToday && 'cellToday',
                    interactive && 'rf-heat__cell--button',
                    isPending && 'rf-heat__cell--busy',
                    isError && 'rf-heat__cell--error',
                  );

                  if (!interactive) {
                    return (
                      <div
                        key={cell.dateStr}
                        role="gridcell"
                        aria-label={ariaLabel}
                        title={titleText}
                        data-level={cell.isCompleted ? 3 : undefined}
                        className={commonClass}
                        style={{ width: 12, height: 12 }}
                      />
                    );
                  }

                  const disabled = cell.isFuture || beforeMin;
                  return (
                    <button
                      key={cell.dateStr}
                      type="button"
                      role="gridcell"
                      aria-label={ariaLabel}
                      title={titleText}
                      data-level={cell.isCompleted ? 3 : undefined}
                      data-date={cell.dateStr}
                      data-pending={isPending ? 'true' : undefined}
                      aria-busy={isPending || undefined}
                      aria-pressed={cell.isCompleted}
                      aria-disabled={disabled || undefined}
                      disabled={disabled || isPending}
                      className={commonClass}
                      style={{ width: 12, height: 12 }}
                      onClick={() => {
                        if (disabled || isPending) return;
                        void onToggleDate!(cell.dateStr, cell.isCompleted);
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Decorative legend below. */}
      <div aria-hidden="true" className="rf-heat__legend">
        <span>Less</span>
        <span
          className="rf-heat__legend-swatch rf-heat__cell"
          aria-hidden="true"
        />
        <span
          className="rf-heat__legend-swatch rf-heat__cell"
          data-level={3}
          aria-hidden="true"
        />
        <span>More</span>
      </div>
    </div>
  );
}
