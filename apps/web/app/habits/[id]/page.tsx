/**
 * Habit detail page — server component shell.
 *
 * Renders breadcrumb-style back link + the client island. The island holds
 * the inline-editable name/description, today-toggle, streak, calendar
 * heatmap, reminder schedules, and delete button.
 *
 * Visual target: `design/mockups/habit-detail.html` +
 * `design/screens/habits.jsx → HabitDetailMobile / HabitDetailDesktop`.
 *
 * Layout chrome is provided by the AppShell wrapper (bottom-nav + side-nav +
 * `.rf-wash` backdrop).
 */

import * as React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getHabitDetail } from '@/lib/habits/queries';
import { todayInTz } from '@/lib/habits/streaks';
import { IconChevronLeft } from '@/components/ui/icons';
import { HabitDetailClient } from './HabitDetailClient';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function HabitDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    redirect(`/login?from=/habits/${id}`);
  }

  const detail = await getHabitDetail(id, userId);
  if (!detail) {
    notFound();
  }

  const todayLocal = todayInTz(detail.timezone);

  // Project the server-side shape into a wire-friendly payload (Drizzle's
  // `Date` columns become ISO strings; the cadence stays as the typed union).
  const initial = {
    id: detail.id,
    name: detail.name,
    description: detail.description,
    timezone: detail.timezone,
    category: detail.category,
    location: detail.location,
    cadence: detail.cadence,
    currentStreak: detail.currentStreak,
    longestStreak: detail.longestStreak,
    totalCompletions: detail.totalCompletions,
    lastCompletedDate: detail.lastCompletedDate,
    completionsLast90Days: detail.completionsLast90Days,
    createdAt: detail.createdAt.toISOString(),
    todayLocal,
  };

  return (
    <main className="rf-page rf-page--narrow">
      <Link
        href="/habits"
        className="rf-btn rf-btn--ghost rf-btn--sm"
        style={{ marginBottom: 'var(--s-4)', textDecoration: 'none' }}
        aria-label="Back to habits"
      >
        <IconChevronLeft size={16} />
        Habits
      </Link>

      <HabitDetailClient initial={initial} />
    </main>
  );
}
