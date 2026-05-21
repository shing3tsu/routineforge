/**
 * RoutineListItem — single card in the /routines list.
 *
 * Refresh per the new soft-engineered design: rows are now self-contained
 * cards (`.rf-card`) with the routine name, description, and weekday pills
 * (`WeekdayChips` in a read-only fashion via the same `.rf-chip` system)
 * inside. The whole card is a Link to `/routines/:id`.
 *
 * Today + 7-day polish: below the meta row, the card surfaces (a) today's
 * progress as "{completed} of {total} today" (or "all done today" in brand
 * color when fully complete), and (b) a 7-day consistency strip of 7 small
 * blocks colored by completion ratio. Both come from data already returned
 * by `listRoutinesForUser` — no extra round-trips.
 *
 * Mockup target: `design/mockups/routines-list.html`.
 */
import * as React from 'react';
import Link from 'next/link';
import { IconChevronRight } from './icons';

const WEEKDAY_SHORT: ReadonlyArray<string> = [
  'Mo',
  'Tu',
  'We',
  'Th',
  'Fr',
  'Sa',
  'Su',
];
const WEEKDAY_FULL: ReadonlyArray<string> = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/**
 * One day's stat in the 7-day consistency strip.
 *
 * Mirrors the {@link RoutineDayStat} shape from `lib/routines/queries.ts`,
 * inlined here so the component doesn't pull a server-only type. `scheduled`
 * is included for completeness/parity with the server type but unused: the
 * UI only reads `total` and `completed`.
 */
export type RoutineDayStat = {
  date: string;
  scheduled: number;
  total: number;
  completed: number;
};

export type RoutineListItemProps = {
  routine: {
    id: string;
    name: string;
    description: string | null;
    scheduleWeekdays: number[];
    category?: string | null;
    location?: string | null;
    stepCountToday: number;
    stepsCompletedToday: number;
    isScheduledToday: boolean;
    lastSevenDays: RoutineDayStat[];
  };
};

function describeWeekdays(scheduleWeekdays: number[]): string {
  if (scheduleWeekdays.length === 0) return 'No days scheduled';
  if (scheduleWeekdays.length === 7) return 'Every day';
  if (
    scheduleWeekdays.length === 5 &&
    scheduleWeekdays.every((v, i) => v === i)
  ) {
    return 'Weekdays';
  }
  if (
    scheduleWeekdays.length === 2 &&
    scheduleWeekdays[0] === 5 &&
    scheduleWeekdays[1] === 6
  ) {
    return 'Weekends';
  }
  return scheduleWeekdays.map((d) => WEEKDAY_SHORT[d]).join(' · ');
}

/**
 * Resolve the background / outline for a single 7-day strip cell.
 *
 * Rules (see dispatch spec):
 *   - total === 0 (off day):        hairline muted, surface-elevated + subtle border
 *   - total > 0, completed === 0:   border-subtle (empty scheduled day)
 *   - total > 0, partial:           brand-primary-subtle
 *   - total > 0, fully complete:    brand-primary
 *
 * Today's cell additionally renders a subtle outline (caller passes
 * `isToday`).
 */
function cellStyleFor(
  stat: RoutineDayStat,
  isToday: boolean,
): React.CSSProperties {
  const base: React.CSSProperties = {
    width: 10,
    height: 16,
    borderRadius: 'var(--r-sm)',
    flexShrink: 0,
  };
  if (stat.total === 0) {
    base.background = 'var(--c-surface-elevated)';
    base.border = '1px solid var(--c-border-subtle)';
  } else if (stat.completed === 0) {
    base.background = 'var(--c-border-subtle)';
  } else if (stat.completed < stat.total) {
    base.background = 'var(--c-brand-primary-subtle)';
  } else {
    base.background = 'var(--c-brand-primary)';
  }
  if (isToday) {
    base.outline = '1px solid var(--c-brand-primary)';
    base.outlineOffset = 1;
  }
  return base;
}

export function RoutineListItem({ routine }: RoutineListItemProps) {
  const description = routine.description?.trim() ?? '';
  const meta = describeWeekdays(routine.scheduleWeekdays);
  const accessibleSchedule =
    routine.scheduleWeekdays.length === 0
      ? 'no days scheduled'
      : routine.scheduleWeekdays.map((d) => WEEKDAY_FULL[d]).join(', ');

  // Today progress visibility: only when scheduled today AND there is at
  // least one step. Anything else stays silent (calmer than rendering a
  // "not scheduled today" line).
  const showProgress =
    routine.isScheduledToday && routine.stepCountToday > 0;
  const allDone =
    showProgress &&
    routine.stepsCompletedToday === routine.stepCountToday &&
    routine.stepCountToday > 0;

  // 7-day strip a11y label: count scheduled days and how many of those are
  // fully completed (numerator/denominator).
  const scheduledDays = routine.lastSevenDays.filter((d) => d.total > 0);
  const completedScheduledDays = scheduledDays.filter(
    (d) => d.completed >= d.total,
  ).length;
  const stripAriaLabel = `7-day consistency: ${completedScheduledDays} of ${scheduledDays.length} scheduled days completed`;

  return (
    <Link
      href={`/routines/${routine.id}`}
      className="rf-card rf-list-row"
      aria-label={`${routine.name}, ${accessibleSchedule}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-2)',
        }}
      >
        <div
          style={{
            fontSize: 'var(--fs-lg)',
            fontWeight: 500,
            letterSpacing: 'var(--tr-snug)',
            color: 'var(--c-text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {routine.name}
        </div>
        {description ? (
          <div
            // `description` is a compat class kept for the existing
            // RoutineListItem test (asserts /description/ via className).
            className="description"
            style={{
              fontSize: 'var(--fs-sm)',
              color: 'var(--c-text-secondary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {description}
          </div>
        ) : null}
        <div
          aria-hidden="true"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--fs-xs)',
            color: 'var(--c-text-muted)',
            letterSpacing: 'var(--tr-wider)',
            textTransform: 'uppercase',
            marginTop: 2,
            display: 'flex',
            gap: 'var(--s-2)',
            flexWrap: 'wrap',
            alignItems: 'baseline',
          }}
        >
          {routine.category ? (
            <span
              style={{
                color: 'var(--c-brand-primary)',
                padding: '2px 8px',
                borderRadius: 'var(--r-full)',
                background: 'var(--c-brand-primary-subtle)',
              }}
            >
              {routine.category}
            </span>
          ) : null}
          {routine.scheduleWeekdays.length === 0 ? (
            <span style={{ fontStyle: 'italic' }}>No days scheduled</span>
          ) : (
            <span>{meta}</span>
          )}
          {routine.location ? <span>· {routine.location}</span> : null}
        </div>
        {showProgress ? (
          <div
            // Sentence-case, lowercase tone — matches the streak-milestone copy.
            // Mono uppercase styling matches the meta row above for visual
            // consistency; the visible text itself stays lowercase per the
            // calmer tone of the design system.
            className="rf-list-row__progress"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--fs-xs)',
              letterSpacing: 'var(--tr-wider)',
              textTransform: 'uppercase',
              color: allDone
                ? 'var(--c-brand-primary)'
                : 'var(--c-text-secondary)',
            }}
          >
            {allDone
              ? 'all done today'
              : `${routine.stepsCompletedToday} of ${routine.stepCountToday} today`}
          </div>
        ) : null}
        <div
          className="rf-list-row__strip"
          role="img"
          aria-label={stripAriaLabel}
          style={{
            display: 'flex',
            gap: 'var(--s-1)',
            alignItems: 'center',
            // Leave a hair of room so the today-outline doesn't clip against
            // the surrounding card padding.
            paddingTop: 2,
            paddingBottom: 2,
          }}
        >
          {routine.lastSevenDays.map((stat, idx) => {
            const isToday = idx === routine.lastSevenDays.length - 1;
            return (
              <span
                key={stat.date}
                data-today={isToday ? 'true' : undefined}
                aria-hidden="true"
                style={cellStyleFor(stat, isToday)}
              />
            );
          })}
        </div>
      </div>
      <div
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--c-text-muted)',
          flexShrink: 0,
          marginLeft: 'var(--s-3)',
        }}
      >
        <IconChevronRight size={18} />
      </div>
    </Link>
  );
}
