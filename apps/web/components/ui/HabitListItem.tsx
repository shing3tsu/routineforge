/**
 * HabitListItem — single card in the /habits list.
 *
 * Refresh: rows are now card-shaped (`.rf-card`) with a sibling Checkbox
 * (`.rf-check rf-check--lg`) as the quick-action toggle, a Link wrapping
 * the body, and an inline StreakBadge.
 *
 * Anatomy (mirrors `.row` block in design/mockups/habits-list.html):
 *   - Left: Checkbox (sibling, not nested inside the Link) — toggles
 *     today's completion via `onToggleToday`.
 *   - Center: a Link wrapping the name + cadence meta. Tap navigates to
 *     /habits/[id].
 *   - Right: a StreakBadge.
 *
 * Why the toggle is a sibling `<button>` rather than nested inside the
 * link: a `<button>` cannot live inside a `<a>` per HTML rules; nesting
 * violates the accessibility model. Two siblings inside a flex row give
 * us both affordances cleanly.
 */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { Checkbox } from './Checkbox';
import { StreakBadge } from './StreakBadge';
import type { HabitCadence } from '@/db/schema';
import {
  formatCadence,
  formatCadenceAccessible,
} from '@/lib/habits/format';

export type HabitListItemHabit = {
  id: string;
  name: string;
  cadence: HabitCadence;
  currentStreak: number;
  longestStreak: number;
  /** Today in habit tz, 'YYYY-MM-DD'. Used to decide "checked off today". */
  todayLocal: string;
  /** Most recent completion date in habit tz, or null. */
  lastCompletedDate: string | null;
  category?: string | null;
  location?: string | null;
};

export type HabitListItemProps = {
  habit: HabitListItemHabit;
  /**
   * Async callback that POSTs/DELETEs the completion. The parent owns the
   * actual API call and decides whether to optimistically update vs. wait.
   * Returns the new "doneToday" state on resolve.
   */
  onToggleToday: (habitId: string, nextDone: boolean) => Promise<void>;
};

export function HabitListItem({ habit, onToggleToday }: HabitListItemProps) {
  const initiallyDone = habit.lastCompletedDate === habit.todayLocal;
  // Optimistic local state so the row reacts instantly. The parent eventually
  // calls `router.refresh()` to reconcile with the server-rendered state.
  const [done, setDone] = React.useState<boolean>(initiallyDone);
  const [pending, setPending] = React.useState<boolean>(false);
  const cadenceText = formatCadence(habit.cadence);
  const cadenceA11y = formatCadenceAccessible(habit.cadence);

  const handleToggle = async (nextDone: boolean) => {
    if (pending) return;
    setDone(nextDone); // optimistic
    setPending(true);
    try {
      await onToggleToday(habit.id, nextDone);
    } catch {
      // Revert on error. The parent is responsible for surfacing a banner.
      setDone(!nextDone);
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="rf-card rf-list-row"
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}
    >
      <Checkbox
        checked={done}
        onChange={handleToggle}
        size="lg"
        pending={pending}
        aria-label={
          done
            ? `Mark "${habit.name}" not done for today`
            : `Mark "${habit.name}" done for today`
        }
      />
      <Link
        href={`/habits/${habit.id}`}
        aria-label={`${habit.name}, ${cadenceA11y}`}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-3)',
          textDecoration: 'none',
          color: 'inherit',
          minWidth: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div
            style={{
              fontSize: 'var(--fs-lg)',
              fontWeight: 500,
              letterSpacing: 'var(--tr-snug)',
              color: done ? 'var(--c-text-secondary)' : 'var(--c-text-primary)',
              textDecoration: done ? 'line-through' : 'none',
              textDecorationColor: 'var(--c-text-muted)',
              textDecorationThickness: '1.5px',
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
        </div>

        <span style={{ flexShrink: 0 }}>
          <StreakBadge
            currentStreak={habit.currentStreak}
            longestStreak={habit.longestStreak}
            size="sm"
            showBestSuffix={false}
          />
        </span>
      </Link>
    </div>
  );
}
