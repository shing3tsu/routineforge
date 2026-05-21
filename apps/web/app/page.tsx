/**
 * Home page — the **today view** for signed-in users; landing card for guests.
 *
 * Server component. The signed-in branch fetches today's routines (per-tz) and
 * today's habits, then hands them to the client `TodayView` island so the
 * optimistic toggles can call the existing /api/{routines,habits}/:id/completions
 * endpoints.
 *
 * Visual target: `design/mockups/today.html` + `design/screens/today.jsx`.
 *
 *   - Mobile: hero numeral ("things left for today") at the top, followed by
 *     the first unfinished routine as a hero card, followed by compact
 *     subsequent routines, then a habits list. The shell (`<AppShell>` in
 *     `layout.tsx`) provides the bottom-nav.
 *   - Desktop: same content laid out in a 1.4fr/1fr grid (routines / habits).
 *
 * Auth: when no session, render the existing landing card. We don't redirect
 * to /login because the landing IS the marketing surface — the user gets to
 * choose whether to sign up or log in from there.
 */

import * as React from 'react';
import Link from 'next/link';
import { auth } from '@/auth';
import { BrandLockup } from '@/components/ui/BrandLockup';
import { listTodaysRoutinesForUser } from '@/lib/routines/queries';
import { listTodaysHabitsForUser } from '@/lib/habits/queries';
import { TodayView } from '@/components/today/TodayView';

export const dynamic = 'force-dynamic';

function shortWeekday(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' })
    .format(d)
    .toUpperCase();
}

function shortMonth(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short' })
    .format(d)
    .toUpperCase();
}

function dayOfMonth(d: Date): string {
  return String(d.getDate()).padStart(2, '0');
}

export default async function HomePage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  // ---------------- Signed-out: landing card ----------------
  if (!userId) {
    return (
      <main
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--s-8) var(--s-5)',
        }}
      >
        <div
          style={{
            maxWidth: 440,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 'var(--s-6)',
          }}
        >
          <BrandLockup />
          <h1
            style={{
              fontSize: 'var(--fs-4xl)',
              fontWeight: 600,
              letterSpacing: 'var(--tr-tight)',
              lineHeight: 1.15,
              margin: 0,
              color: 'var(--c-text-primary)',
            }}
          >
            Routines you actually follow.
            <br />
            Habits that actually stick.
          </h1>
          <div style={{ display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
            <Link
              href="/signup"
              className="rf-btn rf-btn--primary rf-btn--lg"
              style={{ minWidth: 140, textDecoration: 'none' }}
            >
              Sign up
            </Link>
            <Link
              href="/login"
              className="rf-btn rf-btn--secondary rf-btn--lg"
              style={{ minWidth: 140, textDecoration: 'none' }}
            >
              Log in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ---------------- Signed-in: today view ----------------
  const [todaysRoutines, todaysHabits] = await Promise.all([
    listTodaysRoutinesForUser(userId),
    listTodaysHabitsForUser(userId),
  ]);

  // Strip Drizzle row types down to the client-friendly shape.
  const routinesForClient = todaysRoutines.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    todayLocal: r.todayLocal,
    steps: r.steps.map((s) => ({
      id: s.id,
      title: s.title,
      position: s.position,
      completed: s.completed,
    })),
  }));
  const habitsForClient = todaysHabits.map((h) => ({
    id: h.id,
    name: h.name,
    cadence: h.cadence,
    todayLocal: h.todayLocal,
    completedToday: h.completedToday,
    currentStreak: h.currentStreak,
    longestStreak: h.longestStreak,
    weekCompletedCount: h.weekCompletedCount,
    weekTarget: h.weekTarget,
  }));

  const today = new Date();
  const dateEyebrow = `${shortWeekday(today)} · ${dayOfMonth(today)} ${shortMonth(today)}`;

  return (
    <div className="rf-page">
      <TodayView
        routines={routinesForClient}
        habits={habitsForClient}
        dateEyebrow={dateEyebrow}
      />
    </div>
  );
}
