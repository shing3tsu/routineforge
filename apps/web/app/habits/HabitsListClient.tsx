/**
 * HabitsListClient — small client island around the list rows.
 *
 * The page itself is a server component that fetches habits via
 * `listHabitRowsForUser`. We hand the array down here so the per-row
 * quick-action checkbox (mark today done / undone) can call the
 * habit-completions API and then trigger a `router.refresh()` to reconcile
 * server-rendered streaks.
 *
 * Optimistic update lives inside `<HabitListItem>` itself; this wrapper owns
 * the fetch + the banner-level error surface.
 */
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import {
  HabitListItem,
  type HabitListItemHabit,
} from '@/components/ui/HabitListItem';

export type HabitsListClientProps = {
  habits: HabitListItemHabit[];
};

export function HabitsListClient({ habits }: HabitsListClientProps) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  const handleToggleToday = React.useCallback(
    async (habitId: string, nextDone: boolean) => {
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;
      const url = `/api/habits/${habitId}/completions`;
      const opts: RequestInit = {
        method: nextDone ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: habit.todayLocal }),
      };
      try {
        const res = await fetch(url, opts);
        if (!res.ok && res.status !== 204) {
          const data = (await res.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(data?.message ?? 'Could not update completion.');
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update completion.');
        throw e; // let the row revert its optimistic state
      }
    },
    [habits, router],
  );

  return (
    <>
      {error ? (
        <div style={{ marginBottom: 'var(--s-4)' }}>
          <Alert variant="danger" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      ) : null}
      <ul
        role="list"
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-3)',
        }}
      >
        {habits.map((h) => (
          <li key={h.id}>
            <HabitListItem habit={h} onToggleToday={handleToggleToday} />
          </li>
        ))}
      </ul>
    </>
  );
}
