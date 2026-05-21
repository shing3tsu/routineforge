/**
 * Habits list — server component.
 *
 * Visual target: `design/mockups/habits-list.html` +
 * `design/screens/habits.jsx → HabitsMobile / HabitsDesktop`.
 *
 * Anatomy:
 *   - Eyebrow ("your habits") + h1 ("Habits") + meta count ("done today").
 *   - List of `<HabitListItem>` rows (each a Card row).
 *   - "+ New habit" affordance: top-right desktop CTA + mobile FAB.
 *   - Empty state with primary CTA.
 *
 * The list is rendered through `<HabitsListClient>` so the optimistic
 * toggle (mark today done) can call /api/habits/:id/completions and
 * router.refresh() to reconcile server-rendered streaks.
 *
 * Auth: redirect to /login if no session (defense-in-depth; middleware
 * already gates most paths).
 */

import * as React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listHabitRowsForUser } from '@/lib/habits/queries';
import { Card } from '@/components/ui/Card';
import { IconPlus } from '@/components/ui/icons';
import { HabitsListClient } from './HabitsListClient';

export const dynamic = 'force-dynamic';

export default async function HabitsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    redirect('/login?from=/habits');
  }

  const rows = await listHabitRowsForUser(userId);
  const doneToday = rows.filter(
    (h) => h.lastCompletedDate && h.lastCompletedDate === h.todayLocal,
  ).length;

  // Strip the row down to the fields HabitListItem needs.
  const habitsForClient = rows.map((h) => ({
    id: h.id,
    name: h.name,
    cadence: h.cadence,
    currentStreak: h.currentStreak,
    longestStreak: h.longestStreak,
    todayLocal: h.todayLocal,
    lastCompletedDate: h.lastCompletedDate,
  }));

  return (
    <main className="rf-page">
      <div className="rf-page-head">
        <div>
          <div className="rf-eyebrow">your habits</div>
          <h1 className="rf-h1">Habits</h1>
          <p className="rf-page-head__meta">
            <span className="mono">{doneToday}</span> of{' '}
            <span className="mono">{rows.length}</span> done today
          </p>
        </div>
        <Link
          href="/habits/new"
          className="rf-btn rf-btn--primary rf-btn--md"
          style={{ textDecoration: 'none' }}
        >
          <IconPlus size={18} />
          New habit
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--s-8) var(--s-4)' }}>
          <div className="rf-eyebrow" style={{ marginBottom: 'var(--s-2)' }}>
            nothing yet
          </div>
          <h2
            id="habits-empty-heading"
            style={{
              margin: '0 0 var(--s-3) 0',
              fontSize: 'var(--fs-2xl)',
              fontWeight: 600,
              letterSpacing: 'var(--tr-tight)',
              color: 'var(--c-text-primary)',
            }}
          >
            No habits yet
          </h2>
          <p
            style={{
              margin: '0 auto var(--s-5) auto',
              maxWidth: '48ch',
              fontSize: 'var(--fs-base)',
              color: 'var(--c-text-secondary)',
              lineHeight: 1.5,
            }}
          >
            Pick something small you&apos;d like to repeat. A daily glass of
            water, ten pages of reading, two minutes of stretching — anything.
          </p>
          <Link
            href="/habits/new"
            className="rf-btn rf-btn--primary rf-btn--lg"
            style={{ minWidth: 220, textDecoration: 'none' }}
          >
            <IconPlus size={18} />
            Add your first habit
          </Link>
        </Card>
      ) : (
        <section aria-labelledby="habits-list-heading">
          <h2 id="habits-list-heading" className="visually-hidden">
            Your habits
          </h2>
          <HabitsListClient habits={habitsForClient} />
        </section>
      )}

      {/* Mobile FAB. Hidden on ≥900px via .rf-fab media query. */}
      {rows.length > 0 ? (
        <Link
          href="/habits/new"
          className="rf-fab"
          aria-label="New habit"
        >
          <IconPlus size={20} />
          New
        </Link>
      ) : null}
    </main>
  );
}
