/**
 * SearchResultRow — lightweight list rows for the unified `/search` page.
 *
 * The `/api/search` endpoint returns a flat per-hit payload (no `stepCountToday`,
 * `lastSevenDays`, `todayLocal`, etc.) — the rich `<RoutineListItem>` and
 * `<HabitListItem>` need those fields and would crash if we passed `search`
 * hits to them. Rather than weaken those components, this module ships two
 * search-only variants that show ONLY what the search response carries:
 *
 *   - name
 *   - meta row (category pill · weekday string OR cadence · location)
 *   - a small mono-uppercase "matched: <field>" pill near the meta row
 *     (so the user understands why this row surfaced)
 *
 * Visual chrome (.rf-card / .rf-list-row / pill styling) and tokens are reused
 * exactly so the search rows feel native next to the canonical list views.
 *
 * Both rows are simple anchors — no client interactivity (the inline habit
 * toggle is intentionally omitted on the search results page; the user can
 * tap through to the detail view to act on the item).
 */
import * as React from 'react';
import Link from 'next/link';
import { IconChevronRight } from './icons';
import type { HabitCadence } from '@/db/schema';
import { formatCadence, formatCadenceAccessible } from '@/lib/habits/format';

const WEEKDAY_SHORT: ReadonlyArray<string> = [
  'Mo',
  'Tu',
  'We',
  'Th',
  'Fr',
  'Sa',
  'Su',
];

function describeWeekdays(scheduleWeekdays: number[]): string {
  if (scheduleWeekdays.length === 0) return 'no days scheduled';
  if (scheduleWeekdays.length === 7) return 'every day';
  if (
    scheduleWeekdays.length === 5 &&
    scheduleWeekdays.every((v, i) => v === i)
  ) {
    return 'weekdays';
  }
  if (
    scheduleWeekdays.length === 2 &&
    scheduleWeekdays[0] === 5 &&
    scheduleWeekdays[1] === 6
  ) {
    return 'weekends';
  }
  return scheduleWeekdays.map((d) => WEEKDAY_SHORT[d]).join(' · ');
}

// ─────────────────────────────────────────────────────────────────────
// Shared "matched: <field>" pill
// ─────────────────────────────────────────────────────────────────────

export type MatchedFieldPillProps = {
  field: string;
};

/**
 * Small mono-uppercase pill that tells the user why this result surfaced.
 * Styled like the existing category pill (subtle brand bg, brand-primary text)
 * so it reads as a sibling badge rather than a new shape language.
 */
export function MatchedFieldPill({ field }: MatchedFieldPillProps) {
  return (
    <span
      data-testid="matched-field-pill"
      style={{
        color: 'var(--c-brand-primary)',
        padding: '2px 8px',
        borderRadius: 'var(--r-full)',
        background: 'var(--c-brand-primary-subtle)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--fs-xs)',
        letterSpacing: 'var(--tr-wider)',
        textTransform: 'uppercase',
      }}
    >
      matched: {field}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Routine row (search variant)
// ─────────────────────────────────────────────────────────────────────

export type SearchRoutineRowProps = {
  routine: {
    id: string;
    name: string;
    description: string | null;
    scheduleWeekdays: number[];
    category: string | null;
    location: string | null;
    matchedField: 'name' | 'description' | 'category' | 'location';
  };
};

export function SearchRoutineRow({ routine }: SearchRoutineRowProps) {
  const description = routine.description?.trim() ?? '';
  const meta = describeWeekdays(routine.scheduleWeekdays);

  return (
    <Link
      href={`/routines/${routine.id}`}
      className="rf-card rf-list-row"
      aria-label={`${routine.name}, matched ${routine.matchedField}`}
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
            <span style={{ fontStyle: 'italic' }}>no days scheduled</span>
          ) : (
            <span>{meta}</span>
          )}
          {routine.location ? <span>· {routine.location}</span> : null}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 'var(--s-2)',
            flexWrap: 'wrap',
            alignItems: 'baseline',
          }}
        >
          <MatchedFieldPill field={routine.matchedField} />
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

// ─────────────────────────────────────────────────────────────────────
// Habit row (search variant)
// ─────────────────────────────────────────────────────────────────────

export type SearchHabitRowProps = {
  habit: {
    id: string;
    name: string;
    cadence: HabitCadence;
    category: string | null;
    location: string | null;
    matchedField: 'name' | 'category' | 'location';
  };
};

export function SearchHabitRow({ habit }: SearchHabitRowProps) {
  const cadenceText = formatCadence(habit.cadence);
  const cadenceA11y = formatCadenceAccessible(habit.cadence);

  return (
    <Link
      href={`/habits/${habit.id}`}
      className="rf-card rf-list-row"
      aria-label={`${habit.name}, ${cadenceA11y}, matched ${habit.matchedField}`}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        alignItems: 'flex-start',
      }}
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
          {habit.name}
        </div>
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
          {habit.category ? (
            <span
              style={{
                color: 'var(--c-brand-primary)',
                padding: '2px 8px',
                borderRadius: 'var(--r-full)',
                background: 'var(--c-brand-primary-subtle)',
              }}
            >
              {habit.category}
            </span>
          ) : null}
          <span>{cadenceText}</span>
          {habit.location ? <span>· {habit.location}</span> : null}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 'var(--s-2)',
            flexWrap: 'wrap',
            alignItems: 'baseline',
          }}
        >
          <MatchedFieldPill field={habit.matchedField} />
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
          alignSelf: 'center',
        }}
      >
        <IconChevronRight size={18} />
      </div>
    </Link>
  );
}
