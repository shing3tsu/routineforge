/**
 * Routines list — server component.
 *
 * Visual target: `design/mockups/routines-list.html` +
 * `design/screens/routines.jsx → RoutinesMobile / RoutinesDesktop`.
 *
 * Anatomy:
 *   - Eyebrow ("your library") + h1 ("Routines") + meta count.
 *   - List of `<RoutineListItem>` rows (each a Card row by primitive).
 *   - "+ New routine" affordance: a top-right desktop CTA AND a floating
 *     pill button on mobile (`.rf-fab`).
 *   - Empty state with primary CTA.
 *
 * Auth: redirect to /login if no session (defense-in-depth; middleware
 * already gates most paths).
 */

import * as React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listRoutinesForUser } from '@/lib/routines/queries';
import { Card } from '@/components/ui/Card';
import { RoutineListItem } from '@/components/ui/RoutineListItem';
import { IconPlus } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';

export default async function RoutinesPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    redirect('/login?from=/routines');
  }

  const routines = await listRoutinesForUser(userId);

  return (
    <main className="rf-page">
      <div className="rf-page-head">
        <div>
          <div className="rf-eyebrow">your library</div>
          <h1 className="rf-h1">Routines</h1>
          <p className="rf-page-head__meta">
            <span className="mono">{routines.length}</span>{' '}
            {routines.length === 1 ? 'routine' : 'routines'}
          </p>
        </div>
        <Link
          href="/routines/new"
          className="rf-btn rf-btn--primary rf-btn--md"
          style={{ textDecoration: 'none' }}
        >
          <IconPlus size={18} />
          New routine
        </Link>
      </div>

      {routines.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--s-8) var(--s-4)' }}>
          <div className="rf-eyebrow" style={{ marginBottom: 'var(--s-2)' }}>
            nothing yet
          </div>
          <h2
            id="routines-empty-heading"
            style={{
              margin: '0 0 var(--s-3) 0',
              fontSize: 'var(--fs-2xl)',
              fontWeight: 600,
              letterSpacing: 'var(--tr-tight)',
              color: 'var(--c-text-primary)',
            }}
          >
            No routines yet
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
            Create your first routine to get started. You can add steps for
            each weekday and build the rhythm that works for you.
          </p>
          <Link
            href="/routines/new"
            className="rf-btn rf-btn--primary rf-btn--lg"
            style={{ minWidth: 220, textDecoration: 'none' }}
          >
            <IconPlus size={18} />
            Create your first routine
          </Link>
        </Card>
      ) : (
        <section aria-labelledby="routines-list-heading">
          <h2 id="routines-list-heading" className="visually-hidden">
            Your routines
          </h2>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--s-3)',
            }}
            role="list"
          >
            {routines.map((r) => (
              <li key={r.id}>
                <RoutineListItem routine={r} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Mobile FAB. Hidden on ≥900px via .rf-fab media query. */}
      {routines.length > 0 ? (
        <Link
          href="/routines/new"
          className="rf-fab"
          aria-label="New routine"
        >
          <IconPlus size={20} />
          New
        </Link>
      ) : null}
    </main>
  );
}
