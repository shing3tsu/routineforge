/**
 * Routine detail page — server component shell.
 *
 * Renders the breadcrumb-style back link + the client island (which holds the
 * inline-editable name/description, schedule chips, DayStepEditor, reminder
 * schedules, and delete button).
 *
 * Visual target: `design/mockups/routine-detail.html` +
 * `design/screens/routines.jsx → RoutineDetailMobile / RoutineDetailDesktop`.
 *
 * Layout chrome is provided by the AppShell wrapper (bottom-nav + side-nav +
 * `.rf-wash` backdrop). Per the design the page content sits inside `.rf-page`
 * with the narrow max-width modifier.
 */

import * as React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getRoutineForUser } from '@/lib/routines/queries';
import { IconChevronLeft } from '@/components/ui/icons';
import { RoutineDetailClient } from './RoutineDetailClient';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function RoutineDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    redirect(`/login?from=/routines/${id}`);
  }

  const routine = await getRoutineForUser(id, userId);
  if (!routine) {
    notFound();
  }

  return (
    <main className="rf-page rf-page--narrow">
      <Link
        href="/routines"
        className="rf-btn rf-btn--ghost rf-btn--sm"
        style={{ marginBottom: 'var(--s-4)', textDecoration: 'none' }}
        aria-label="Back to routines"
      >
        <IconChevronLeft size={16} />
        Routines
      </Link>

      <RoutineDetailClient routine={routine} />
    </main>
  );
}
