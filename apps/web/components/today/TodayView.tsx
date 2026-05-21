/**
 * TodayView — THE centerpiece of the redesign.
 *
 * Visual target: `design/mockups/today.html` + `design/screens/today.jsx`.
 *
 * Anatomy (mobile, top→bottom):
 *   - Eyebrow: weekday · DD MON (e.g. "WED · 27 MAY").
 *   - Hero numeral: 72px mono digit = count of unfinished items today.
 *   - Subtitle: "things left for today" (or "thing left", or "all done. enjoy.").
 *   - Progress dots: 7-dot run, filled per (overall done / overall total).
 *   - HERO routine card: first unfinished routine, expanded with all steps as
 *     32px CheckRows. Tapping a row optimistically toggles the step.
 *   - Compact follow-up cards: subsequent unfinished routines render as
 *     name + first 2 steps + "+N more" affordance linking to /routines/:id.
 *   - Completed routines: shown collapsed at the bottom with a single check.
 *   - Habits section: eyebrow + a card containing one HabitRow per due habit.
 *
 * Desktop (≥900px): same content laid out in a 1.4fr/1fr grid (routines on
 * the left, habits on the right) inside a 880px max-width column.
 *
 * Empty states:
 *   - No routines + no habits → "Nothing scheduled today." + CTA.
 *   - All routines + all habits done → "All done. Enjoy the rest of your day."
 *
 * Offline awareness: subscribes to the browser's online/offline state via
 * `useOnline`. When offline:
 *   - Shows a warning Alert at the top.
 *   - Toggles remain interactive. Each tap is applied optimistically AND
 *     enqueued via `lib/pwa/offlineQueue` so it survives a reload.
 *   - Rows with a queued write display a subtle mono `queued` caption.
 * On the offline → online transition, `flushQueue` is invoked and a small
 * Alert reports the outcome ("Syncing N changes…" → "Synced.") which then
 * fades after 2s.
 */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { CheckRow } from '@/components/ui/CheckRow';
import { Checkbox } from '@/components/ui/Checkbox';
import { StreakBadge } from '@/components/ui/StreakBadge';
import { useOnline } from '@/lib/pwa/useOnline';
import { enqueue, flushQueue, readQueue } from '@/lib/pwa/offlineQueue';
import { formatWeekProgress } from '@/lib/habits/format';
import type { HabitCadence } from '@/db/schema';

// ---------- types ----------

type Step = {
  id: string;
  title: string;
  position: number;
  completed: boolean;
};

export type TodayViewRoutine = {
  id: string;
  name: string;
  description: string | null;
  todayLocal: string;
  steps: Step[];
};

export type TodayViewHabit = {
  id: string;
  name: string;
  cadence: HabitCadence;
  todayLocal: string;
  completedToday: boolean;
  currentStreak: number;
  longestStreak: number;
  weekCompletedCount?: number;
  weekTarget?: number;
};

export type TodayViewProps = {
  routines: TodayViewRoutine[];
  habits: TodayViewHabit[];
  /** Mono uppercase eyebrow above the hero numeral. Server-rendered. */
  dateEyebrow: string;
};

// ---------- helpers ----------

function routineDoneCount(steps: Step[], localState: Record<string, boolean>): number {
  let done = 0;
  for (const s of steps) {
    if (localState[s.id] ?? s.completed) done += 1;
  }
  return done;
}

// Inline acknowledgement copy paired with the StreakBadge ring-pulse when a
// habit's currentStreak crosses 7 / 30 / 100. Restrained on purpose — see
// design/README.md ("neutral streak UX", "no streak punishment"). No
// exclamation marks, no emoji, no "Great job!" energy; just a quiet, specific
// note that names the number and what it means.
const MILESTONE_MESSAGES: Record<7 | 30 | 100, string> = {
  7: 'a week. quiet consistency.',
  30: 'thirty days. a real pattern.',
  100: 'one hundred days. you are not who you were.',
};

// Total visible time for the inline milestone message, in ms. The CSS class
// `.rf-celebrate--milestone-message` runs a 280ms fade-in followed by a
// 320ms fade-out scheduled at 4500ms, ending at 4820ms. The JS unmount runs
// just after to clear React state. Kept slightly longer than the longest
// ring-pulse (1500ms for the 100-day milestone) so the reader has time to
// actually read the line after the animation settles.
const MILESTONE_MESSAGE_TIMEOUT_MS = 5000;

// ---------- TodayView ----------

export function TodayView({ routines, habits, dateEyebrow }: TodayViewProps) {
  const router = useRouter();
  const online = useOnline();
  const [error, setError] = React.useState<string | null>(null);

  // Day-clear celebration — fires once when the total things-left transitions
  // from N>0 to 0. Holds for ~1s so the warm wash overlay completes.
  // We toggle `.rf-celebrate--day-clear` on the nearest `.rf-wash` ancestor
  // (provided by AppShell), so the CSS pseudo-element overlay paints over
  // the whole watercolor backdrop, not just the TodayView content.
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const prevThingsLeftRef = React.useRef<number | null>(null);
  // We track both the timer and the element we set the class on, so
  // unmount cleanup can synchronously remove the class without re-querying
  // the DOM (the parent could already be detached).
  const dayClearTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dayClearElRef = React.useRef<Element | null>(null);
  React.useEffect(() => {
    return () => {
      if (dayClearTimerRef.current != null) {
        clearTimeout(dayClearTimerRef.current);
        dayClearTimerRef.current = null;
      }
      const el = dayClearElRef.current;
      if (el) {
        el.classList.remove('rf-celebrate--day-clear');
        dayClearElRef.current = null;
      }
    };
  }, []);

  // Per-step optimistic state. Map of stepId -> completed.
  // Seeded purely from server-rendered data on first render; the queue
  // overlay happens in a post-mount effect (see below) so SSR + first
  // hydration paint match exactly.
  const [stepState, setStepState] = React.useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {};
    for (const r of routines) for (const s of r.steps) seed[s.id] = s.completed;
    return seed;
  });
  const [pendingSteps, setPendingSteps] = React.useState<Set<string>>(() => new Set());
  // Steps that have a write sitting in the offline queue. Drives the
  // small "queued" caption next to the row label; cleared as each entry
  // flushes successfully.
  const [queuedSteps, setQueuedSteps] = React.useState<Set<string>>(() => new Set());

  // Per-habit optimistic state.
  const [habitState, setHabitState] = React.useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {};
    for (const h of habits) seed[h.id] = h.completedToday;
    return seed;
  });
  const [pendingHabits, setPendingHabits] = React.useState<Set<string>>(() => new Set());
  const [queuedHabits, setQueuedHabits] = React.useState<Set<string>>(() => new Set());

  // Mount-time queue overlay. The queue is browser-only (localStorage), so
  // we can only read it in an effect — running this on the server would
  // be nonsensical and would also produce a hydration mismatch. We apply
  // both the intended state (so a reload while offline preserves the
  // pending check) and populate the queued-id sets so the row markers
  // render. Runs once on mount.
  React.useEffect(() => {
    const q = readQueue();
    if (q.length === 0) return;
    const stepIds = new Set<string>();
    const habitIds = new Set<string>();
    const stepOverlay: Record<string, boolean> = {};
    const habitOverlay: Record<string, boolean> = {};
    for (const entry of q) {
      if (entry.kind === 'routine.step.toggle') {
        stepIds.add(entry.stepId);
        stepOverlay[entry.stepId] = entry.done;
      } else {
        habitIds.add(entry.habitId);
        habitOverlay[entry.habitId] = entry.done;
      }
    }
    if (stepIds.size > 0) {
      setQueuedSteps(stepIds);
      setStepState((s) => ({ ...s, ...stepOverlay }));
    }
    if (habitIds.size > 0) {
      setQueuedHabits(habitIds);
      setHabitState((s) => ({ ...s, ...habitOverlay }));
    }
    // The intentional empty deps: run exactly once at mount. We don't
    // want this re-running on every router.refresh() because that would
    // re-overlay long-since-flushed entries onto stale state. The
    // separate online→flush effect handles post-mount queue changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-seed when server-rendered lists change (e.g. after router.refresh()).
  // After a successful flush we trigger router.refresh() so the server
  // becomes the source of truth again; that's exactly when we want to
  // throw away the optimistic overlay and accept whatever the server
  // returned.
  React.useEffect(() => {
    const seed: Record<string, boolean> = {};
    for (const r of routines) for (const s of r.steps) seed[s.id] = s.completed;
    setStepState(seed);
  }, [routines]);
  React.useEffect(() => {
    const seed: Record<string, boolean> = {};
    for (const h of habits) seed[h.id] = h.completedToday;
    setHabitState(seed);
  }, [habits]);

  // ---- computed totals ----
  const routineDone = routines.reduce(
    (n, r) => n + routineDoneCount(r.steps, stepState),
    0,
  );
  const routineTotal = routines.reduce((n, r) => n + r.steps.length, 0);
  const habitDone = habits.reduce((n, h) => n + ((habitState[h.id] ?? h.completedToday) ? 1 : 0), 0);
  const habitTotal = habits.length;

  const totalDone = routineDone + habitDone;
  const totalAll = routineTotal + habitTotal;
  const totalLeft = Math.max(0, totalAll - totalDone);
  const allDone = totalAll > 0 && totalLeft === 0;
  const nothing = totalAll === 0;

  // Detect transition from "things left" -> 0 to fire the day-clear
  // ambient celebration. We only fire when prev was a positive number,
  // so initial mount in an already-empty state does NOT animate.
  React.useEffect(() => {
    const prev = prevThingsLeftRef.current;
    if (prev != null && prev > 0 && totalLeft === 0 && totalAll > 0) {
      const wash = rootRef.current?.closest('.rf-wash');
      if (wash) {
        wash.classList.add('rf-celebrate--day-clear');
        dayClearElRef.current = wash;
        if (dayClearTimerRef.current != null) clearTimeout(dayClearTimerRef.current);
        dayClearTimerRef.current = setTimeout(() => {
          wash.classList.remove('rf-celebrate--day-clear');
          dayClearTimerRef.current = null;
          dayClearElRef.current = null;
        }, 1000);
      }
    }
    prevThingsLeftRef.current = totalLeft;
  }, [totalLeft, totalAll]);

  // The hero numeral and subtitle re-mount via a `key` derived from the
  // displayed digit / copy. That triggers the CSS animation defined on
  // `.rf-celebrate--num-morph` / `--subtitle-morph` whenever the value
  // changes (incl. the "all done" 0). No JS timer required.
  const heroNum = nothing ? '0' : allDone ? '0' : String(totalLeft);
  const heroCap = nothing
    ? 'nothing scheduled today.'
    : allDone
      ? 'all done. enjoy.'
      : totalLeft === 1
        ? 'thing left for today'
        : 'things left for today';

  // Routines split: hero is the first incomplete routine, then incomplete
  // follow-ups, then completed routines at the bottom.
  const isRoutineComplete = (r: TodayViewRoutine): boolean => {
    if (r.steps.length === 0) return false;
    return routineDoneCount(r.steps, stepState) === r.steps.length;
  };
  const incompleteRoutines = routines.filter((r) => !isRoutineComplete(r));
  const completedRoutines = routines.filter((r) => isRoutineComplete(r));
  const heroRoutine = incompleteRoutines[0] ?? null;
  const followUps = incompleteRoutines.slice(1);

  // ---- per-step toggle ----
  const toggleStep = React.useCallback(
    async (routineId: string, todayLocal: string, stepId: string) => {
      if (pendingSteps.has(stepId)) return;
      const prev = stepState[stepId] ?? false;
      const next = !prev;

      // Optimistic — applied in both branches.
      setStepState((s) => ({ ...s, [stepId]: next }));

      if (!online) {
        // Offline: enqueue the desired state and mark the row as
        // queued. `enqueue` dedups by target so rapid retoggles before
        // reconnect collapse to a single replay write.
        enqueue({
          kind: 'routine.step.toggle',
          routineId,
          stepId,
          date: todayLocal,
          done: next,
          queuedAt: Date.now(),
        });
        setQueuedSteps((p) => {
          const x = new Set(p);
          x.add(stepId);
          return x;
        });
        return;
      }

      setPendingSteps((p) => {
        const x = new Set(p);
        x.add(stepId);
        return x;
      });

      try {
        const res = await fetch(`/api/routines/${routineId}/completions`, {
          method: next ? 'POST' : 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepId, date: todayLocal }),
        });
        if (!res.ok && res.status !== 204) {
          const data = (await res.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(data?.message ?? 'Could not update step.');
        }
        router.refresh();
      } catch (e) {
        setStepState((s) => ({ ...s, [stepId]: prev }));
        setError(e instanceof Error ? e.message : 'Could not update step.');
      } finally {
        setPendingSteps((p) => {
          const x = new Set(p);
          x.delete(stepId);
          return x;
        });
      }
    },
    [online, pendingSteps, router, stepState],
  );

  // ---- per-habit toggle ----
  const toggleHabit = React.useCallback(
    async (habit: TodayViewHabit) => {
      if (pendingHabits.has(habit.id)) return;
      const prev = habitState[habit.id] ?? false;
      const next = !prev;

      setHabitState((s) => ({ ...s, [habit.id]: next }));

      if (!online) {
        enqueue({
          kind: 'habit.toggle',
          habitId: habit.id,
          date: habit.todayLocal,
          done: next,
          queuedAt: Date.now(),
        });
        setQueuedHabits((p) => {
          const x = new Set(p);
          x.add(habit.id);
          return x;
        });
        return;
      }

      setPendingHabits((p) => {
        const x = new Set(p);
        x.add(habit.id);
        return x;
      });

      try {
        const res = await fetch(`/api/habits/${habit.id}/completions`, {
          method: next ? 'POST' : 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: habit.todayLocal }),
        });
        if (!res.ok && res.status !== 204) {
          const data = (await res.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(data?.message ?? 'Could not update habit.');
        }
        router.refresh();
      } catch (e) {
        setHabitState((s) => ({ ...s, [habit.id]: prev }));
        setError(e instanceof Error ? e.message : 'Could not update habit.');
      } finally {
        setPendingHabits((p) => {
          const x = new Set(p);
          x.delete(habit.id);
          return x;
        });
      }
    },
    [habitState, online, pendingHabits, router],
  );

  // ---- offline → online: flush the queue ----
  //
  // A small status banner reports the sync. Three phases:
  //   'syncing'      — flush in flight, show "Syncing N changes…"
  //   'synced'       — flush done with at least one ok write, brief
  //                    success Alert that auto-dismisses after 2s
  //   null           — no banner
  // We deliberately don't show a banner when the queue was empty: there
  // was nothing the user did that needed acknowledgement.
  const [syncStatus, setSyncStatus] = React.useState<
    | { phase: 'syncing'; pending: number }
    | { phase: 'synced'; ok: number; failed: number }
    | null
  >(null);
  // Track whether we already issued the most recent "offline" notice so
  // the online→ effect only fires on a genuine transition, not on every
  // re-render while online === true.
  const wasOnlineRef = React.useRef<boolean>(online);
  const syncedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    return () => {
      if (syncedTimerRef.current != null) {
        clearTimeout(syncedTimerRef.current);
        syncedTimerRef.current = null;
      }
    };
  }, []);
  React.useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = online;
    if (!online || wasOnline) return;
    // Online transition. Snapshot the queue size FIRST so we can show an
    // accurate "Syncing N…" message even though `flushQueue` mutates the
    // queue as it goes.
    const queued = readQueue();
    if (queued.length === 0) return;
    setSyncStatus({ phase: 'syncing', pending: queued.length });
    let cancelled = false;
    (async () => {
      const result = await flushQueue();
      if (cancelled) return;
      // Whatever the queue says NOW is the residual — anything not in
      // it has been processed (success OR drop). Clear queued-id markers
      // for ids no longer present.
      const remaining = readQueue();
      const remainingStepIds = new Set<string>();
      const remainingHabitIds = new Set<string>();
      for (const e of remaining) {
        if (e.kind === 'routine.step.toggle') remainingStepIds.add(e.stepId);
        else remainingHabitIds.add(e.habitId);
      }
      setQueuedSteps(remainingStepIds);
      setQueuedHabits(remainingHabitIds);
      // Pull authoritative server state back into the view. Done after
      // the queue residual is updated so the seed effect (which fires
      // when `routines`/`habits` change) doesn't clobber any 'keep'
      // entries that are genuinely still pending.
      router.refresh();
      setSyncStatus({ phase: 'synced', ok: result.ok, failed: result.failed });
      if (syncedTimerRef.current != null) clearTimeout(syncedTimerRef.current);
      syncedTimerRef.current = setTimeout(() => {
        setSyncStatus(null);
        syncedTimerRef.current = null;
      }, 2000);
    })();
    return () => {
      cancelled = true;
    };
  }, [online, router]);

  // ---- offline / sync / error banners ----
  // The offline notice is intentionally calm. We now queue writes
  // locally and replay them on reconnect, so the user can keep
  // checking things off — the banner just lets them know nothing is
  // lost.
  const banners = (
    <>
      {!online ? (
        <div style={{ marginBottom: 'var(--s-4)' }}>
          <Alert variant="warning" role="status">
            You&apos;re offline. Check-ins are saved here and will sync when
            you reconnect.
          </Alert>
        </div>
      ) : null}
      {syncStatus?.phase === 'syncing' ? (
        <div style={{ marginBottom: 'var(--s-4)' }}>
          <Alert variant="info" role="status">
            Syncing {syncStatus.pending}{' '}
            {syncStatus.pending === 1 ? 'change' : 'changes'}&hellip;
          </Alert>
        </div>
      ) : null}
      {syncStatus?.phase === 'synced' ? (
        <div style={{ marginBottom: 'var(--s-4)' }}>
          <Alert variant="success" role="status">
            {syncStatus.failed > 0
              ? `Synced. ${syncStatus.failed} ${syncStatus.failed === 1 ? 'change' : 'changes'} couldn't be applied.`
              : 'Synced.'}
          </Alert>
        </div>
      ) : null}
      {error ? (
        <div style={{ marginBottom: 'var(--s-4)' }}>
          <Alert variant="danger" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      ) : null}
    </>
  );

  // ---- hero numeral block ----
  const hero = (
    <section aria-labelledby="today-hero-heading" style={{ marginBottom: 'var(--s-6)' }}>
      <div className="rf-eyebrow" style={{ marginBottom: 'var(--s-2)' }}>
        {dateEyebrow}
      </div>
      <h1 id="today-hero-heading" className="visually-hidden">
        Today
      </h1>
      <div className="rf-today-hero">
        {/* Numeral and subtitle remount on each value change (key={heroNum}
            / key={heroCap}) so the CSS keyframe runs without us having to
            manage timers in React state. */}
        <div
          key={heroNum}
          className="rf-today-hero__num rf-celebrate--num-morph"
          aria-live="polite"
        >
          {heroNum}
        </div>
        <div
          key={heroCap}
          className="rf-today-hero__cap rf-celebrate--subtitle-morph"
        >
          {heroCap}
        </div>
      </div>
      {totalAll > 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-3)',
            marginTop: 'var(--s-4)',
          }}
        >
          <ProgressDots done={totalDone} total={Math.min(totalAll, 7)} totalAll={totalAll} />
          <span
            className="mono rf-eyebrow"
            aria-label={`${totalDone} of ${totalAll} done`}
          >
            {totalDone} of {totalAll} done
          </span>
        </div>
      ) : null}
    </section>
  );

  // ---- routines column ----
  const routinesCol = (
    <section aria-labelledby="today-routines-heading">
      <h2 id="today-routines-heading" className="visually-hidden">
        Routines
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        {heroRoutine ? (
          <HeroRoutineCard
            routine={heroRoutine}
            stepState={stepState}
            pendingSteps={pendingSteps}
            queuedSteps={queuedSteps}
            onToggle={toggleStep}
          />
        ) : null}
        {followUps.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                followUps.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 'var(--s-3)',
            }}
          >
            {followUps.map((r) => (
              <CompactRoutineCard
                key={r.id}
                routine={r}
                stepState={stepState}
              />
            ))}
          </div>
        ) : null}
        {completedRoutines.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
            {completedRoutines.map((r) => (
              <CompletedRoutineRow key={r.id} routine={r} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );

  // ---- habits column ----
  const habitsCol = habitTotal > 0 ? (
    <section aria-labelledby="today-habits-heading">
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          margin: '0 var(--s-1) var(--s-2) var(--s-1)',
        }}
      >
        <h2 id="today-habits-heading" className="rf-eyebrow">
          Habits
        </h2>
        <span className="mono rf-eyebrow" aria-label={`${habitDone} of ${habitTotal} done`}>
          {habitDone}/{habitTotal}
        </span>
      </div>
      <Card style={{ padding: 'var(--s-2) var(--s-1)' }}>
        {habits.map((h, i) => (
          <div
            key={h.id}
            style={{
              borderBottom:
                i < habits.length - 1 ? '1px solid var(--c-border-subtle)' : 'none',
            }}
          >
            <TodayHabitRow
              habit={h}
              checked={habitState[h.id] ?? h.completedToday}
              pending={pendingHabits.has(h.id)}
              queued={queuedHabits.has(h.id)}
              onToggle={() => void toggleHabit(h)}
            />
          </div>
        ))}
      </Card>
    </section>
  ) : null;

  // `display: contents` keeps the wrapper out of the visual layout while
  // giving us a stable DOM anchor for `.closest('.rf-wash')`, which the
  // day-clear celebration uses to find AppShell's wash container.
  const rootStyle: React.CSSProperties = { display: 'contents' };

  // ---- empty / all-done states ----
  if (nothing) {
    return (
      <div ref={rootRef} style={rootStyle}>
        {banners}
        {hero}
        <EmptyTodayCard />
      </div>
    );
  }

  if (allDone) {
    return (
      <div ref={rootRef} style={rootStyle}>
        {banners}
        {hero}
        <AllDoneCard />
        {/* Still render the completed lists so the user can verify what they
            checked off — collapsed visual treatment. */}
        <div style={{ marginTop: 'var(--s-6)', display: 'grid', gap: 'var(--s-4)' }}>
          {routineTotal > 0 ? routinesCol : null}
          {habitsCol}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} style={rootStyle}>
      {banners}
      {hero}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 'var(--s-6)',
        }}
        data-today-grid="true"
      >
        {/* Routines col always renders; habits col is conditional. The CSS
            below promotes us to a 2-col grid on desktop when both exist. */}
        {routineTotal > 0 ? routinesCol : null}
        {habitsCol}
      </div>
      <DesktopGridStyle hasBoth={routineTotal > 0 && habitTotal > 0} />
    </div>
  );
}

// ---------- HeroRoutineCard ----------

type HeroProps = {
  routine: TodayViewRoutine;
  stepState: Record<string, boolean>;
  pendingSteps: Set<string>;
  /** Step ids with a write sitting in the offline queue. */
  queuedSteps: Set<string>;
  onToggle: (routineId: string, todayLocal: string, stepId: string) => void;
};

function HeroRoutineCard({
  routine,
  stepState,
  pendingSteps,
  queuedSteps,
  onToggle,
}: HeroProps) {
  const done = routineDoneCount(routine.steps, stepState);
  const total = routine.steps.length;

  // "Just completed" celebration: when the LAST unchecked step flips on,
  // apply `.rf-celebrate--routine-done` for one animation cycle. The class
  // is removed after 500ms so the next completion can re-fire cleanly.
  const [justCompleted, setJustCompleted] = React.useState(false);
  const prevDoneRef = React.useRef<number>(done);
  const justCompletedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  React.useEffect(() => {
    return () => {
      if (justCompletedTimerRef.current != null) {
        clearTimeout(justCompletedTimerRef.current);
      }
    };
  }, []);
  React.useEffect(() => {
    const prev = prevDoneRef.current;
    if (total > 0 && prev < total && done === total) {
      setJustCompleted(true);
      if (justCompletedTimerRef.current != null) {
        clearTimeout(justCompletedTimerRef.current);
      }
      justCompletedTimerRef.current = setTimeout(() => setJustCompleted(false), 500);
    }
    prevDoneRef.current = done;
  }, [done, total]);

  return (
    <Card
      variant="hero"
      style={{ position: 'relative' }}
      className={justCompleted ? 'rf-celebrate--routine-done' : undefined}
      data-just-completed={justCompleted || undefined}
      aria-label={`${routine.name} routine`}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-3)',
          marginBottom: 'var(--s-4)',
        }}
      >
        <div className="rf-eyebrow" style={{ flex: 1, minWidth: 0 }}>
          {routine.name}
        </div>
        <span
          className="mono"
          style={{
            fontSize: 'var(--fs-xs)',
            color: done === total ? 'var(--c-success)' : 'var(--c-text-muted)',
            letterSpacing: 'var(--tr-tight)',
          }}
          aria-label={`${done} of ${total} done`}
        >
          {done}/{total}
          {done === total ? ' done' : ''}
        </span>
      </header>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-1)',
          margin: '0 calc(var(--s-3) * -1)',
        }}
      >
        {routine.steps.map((s) => {
          const checked = stepState[s.id] ?? s.completed;
          const pending = pendingSteps.has(s.id);
          const queued = queuedSteps.has(s.id);
          return (
            <CheckRow
              key={s.id}
              label={s.title}
              checked={checked}
              size="xl"
              // Pending (in-flight network call) still disables the row,
              // but offline-queued state is INTERACTIVE — the user can
              // retoggle and the queue will collapse the retoggle into
              // the latest intent.
              disabled={pending}
              onChange={() => onToggle(routine.id, routine.todayLocal, s.id)}
              meta={
                queued ? (
                  <span
                    className="mono rf-eyebrow"
                    style={{ color: 'var(--c-text-muted)' }}
                    aria-label="queued offline, will sync when reconnected"
                  >
                    queued
                  </span>
                ) : undefined
              }
            />
          );
        })}
      </div>
    </Card>
  );
}

// ---------- CompactRoutineCard ----------

function CompactRoutineCard({
  routine,
  stepState,
}: {
  routine: TodayViewRoutine;
  stepState: Record<string, boolean>;
}) {
  const done = routineDoneCount(routine.steps, stepState);
  const total = routine.steps.length;
  const previewSteps = routine.steps.slice(0, 2);
  const more = Math.max(0, total - previewSteps.length);
  return (
    <Link
      href={`/routines/${routine.id}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      aria-label={`${routine.name} — open routine`}
    >
      <Card>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-3)',
            marginBottom: 'var(--s-3)',
          }}
        >
          <div className="rf-eyebrow" style={{ flex: 1, minWidth: 0 }}>
            {routine.name}
          </div>
          <span
            className="mono"
            style={{
              fontSize: 'var(--fs-xs)',
              color: 'var(--c-text-muted)',
              letterSpacing: 'var(--tr-tight)',
            }}
          >
            {done}/{total}
          </span>
        </header>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s-1)',
          }}
        >
          {previewSteps.map((s) => {
            const checked = stepState[s.id] ?? s.completed;
            return (
              <li
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--s-3)',
                  fontSize: 'var(--fs-base)',
                  color: checked ? 'var(--c-text-muted)' : 'var(--c-text-primary)',
                  textDecoration: checked ? 'line-through' : 'none',
                  textDecorationColor: 'var(--c-text-muted)',
                }}
              >
                <Checkbox
                  checked={checked}
                  onChange={() => {
                    /* compact preview is read-only; user opens detail to edit */
                  }}
                  size="sm"
                  disabled
                  aria-label={`${s.title} (open routine to edit)`}
                />
                <span>{s.title}</span>
              </li>
            );
          })}
          {more > 0 ? (
            <li
              style={{
                marginTop: 'var(--s-2)',
                fontSize: 'var(--fs-sm)',
                color: 'var(--c-text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--s-2)',
              }}
            >
              + {more} more · open
            </li>
          ) : null}
        </ul>
      </Card>
    </Link>
  );
}

// ---------- CompletedRoutineRow ----------

function CompletedRoutineRow({ routine }: { routine: TodayViewRoutine }) {
  return (
    <Card
      variant="sunken"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-3)',
        padding: 'var(--s-3) var(--s-4)',
      }}
    >
      <Checkbox
        checked
        onChange={() => {
          /* collapsed acknowledgement; user reopens detail to undo */
        }}
        size="sm"
        disabled
        aria-label={`${routine.name} done`}
      />
      <span
        style={{
          flex: 1,
          fontSize: 'var(--fs-base)',
          color: 'var(--c-text-muted)',
          textDecoration: 'line-through',
        }}
      >
        {routine.name}
      </span>
      <Link
        href={`/routines/${routine.id}`}
        className="rf-eyebrow"
        style={{
          textDecoration: 'none',
          color: 'var(--c-text-muted)',
        }}
      >
        Open
      </Link>
    </Card>
  );
}

// ---------- TodayHabitRow ----------

function TodayHabitRow({
  habit,
  checked,
  pending,
  queued,
  onToggle,
}: {
  habit: TodayViewHabit;
  checked: boolean;
  pending: boolean;
  /** True when there's an offline write sitting in the local queue for this habit. */
  queued: boolean;
  onToggle: () => void;
}) {
  // Treat pending (in-flight) as "disabled" but offline-queued state is
  // interactive — retoggling collapses to the latest intent via the
  // queue's dedup. The Checkbox itself still uses `pending` for spinner.
  const disabled = pending;
  // Only weekly_count habits get a sub-label here. `daily` and
  // `specific_weekdays` rows lean on checkbox + StreakBadge to convey state;
  // the today view already pre-filters specific_weekdays to due days, so the
  // cadence string would be redundant. Reserve the sub-line for actual
  // running progress info (the brief: "Show fractions, not percentages").
  const weekly =
    habit.cadence.kind === 'weekly_count'
      ? formatWeekProgress(
          habit.weekCompletedCount ?? 0,
          habit.weekTarget ?? habit.cadence.perWeek,
        )
      : null;

  // "Just completed" celebration — fires on the upward transition only
  // (false -> true). Down-transitions (undoing a check) deliberately do
  // NOT animate, per the design ethos of celebrating effort without
  // punishing or commenting on undoing it.
  const [justCompleted, setJustCompleted] = React.useState(false);
  const prevCheckedRef = React.useRef<boolean>(checked);
  const justCompletedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  React.useEffect(() => {
    return () => {
      if (justCompletedTimerRef.current != null) {
        clearTimeout(justCompletedTimerRef.current);
      }
    };
  }, []);
  React.useEffect(() => {
    const prev = prevCheckedRef.current;
    if (!prev && checked) {
      setJustCompleted(true);
      if (justCompletedTimerRef.current != null) {
        clearTimeout(justCompletedTimerRef.current);
      }
      justCompletedTimerRef.current = setTimeout(() => setJustCompleted(false), 420);
    }
    prevCheckedRef.current = checked;
  }, [checked]);

  // Milestone celebration — fires when `currentStreak` crosses 7, 30, or
  // 100 as a result of the completion that just happened. Up-transitions
  // only (we only set state when the streak increases); a streak reset
  // to 0 deliberately does not animate, matching the "no streak
  // punishment" rule. If multiple milestones are crossed in one update
  // (defensive — a single user check can only +1 streak, but a server
  // refresh could rehydrate from a different value), fire only the
  // highest crossed: 100 > 30 > 7.
  //
  // `prevStreakRef` starts at `null` so initial mount does not animate
  // for users who already have a 50-day streak on first paint. The ref
  // is updated to the current streak at the END of the effect.
  //
  // The inline message that accompanies the ring-pulse lives in its own
  // state with its own timer — the badge ring fades by 1500ms at most
  // (the 100-day variant), but the message stays for ~5s so the reader
  // has time to actually read the words. Both timers are cleared on
  // unmount.
  const [milestoneClass, setMilestoneClass] = React.useState<string>('');
  const [milestoneMessage, setMilestoneMessage] = React.useState<string>('');
  const prevStreakRef = React.useRef<number | null>(null);
  const milestoneTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const milestoneMessageTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  React.useEffect(() => {
    return () => {
      if (milestoneTimerRef.current != null) {
        clearTimeout(milestoneTimerRef.current);
      }
      if (milestoneMessageTimerRef.current != null) {
        clearTimeout(milestoneMessageTimerRef.current);
      }
    };
  }, []);
  React.useEffect(() => {
    const prev = prevStreakRef.current;
    const next = habit.currentStreak;
    if (prev !== null && next > prev) {
      let cls = '';
      let durationMs = 0;
      let crossed: 7 | 30 | 100 | null = null;
      if (prev < 100 && next >= 100) {
        cls = 'rf-celebrate--milestone-100';
        durationMs = 1500;
        crossed = 100;
      } else if (prev < 30 && next >= 30) {
        cls = 'rf-celebrate--milestone-30';
        durationMs = 1100;
        crossed = 30;
      } else if (prev < 7 && next >= 7) {
        cls = 'rf-celebrate--milestone-7';
        durationMs = 700;
        crossed = 7;
      }
      if (cls && crossed != null) {
        setMilestoneClass(cls);
        if (milestoneTimerRef.current != null) {
          clearTimeout(milestoneTimerRef.current);
        }
        milestoneTimerRef.current = setTimeout(
          () => setMilestoneClass(''),
          durationMs,
        );
        // Inline message — separate timer so it can outlive the ring
        // pulse. ~5s on screen, matching the CSS fade-out timing.
        setMilestoneMessage(MILESTONE_MESSAGES[crossed]);
        if (milestoneMessageTimerRef.current != null) {
          clearTimeout(milestoneMessageTimerRef.current);
        }
        milestoneMessageTimerRef.current = setTimeout(
          () => setMilestoneMessage(''),
          MILESTONE_MESSAGE_TIMEOUT_MS,
        );
      }
    }
    prevStreakRef.current = next;
  }, [habit.currentStreak]);

  const rowClass = justCompleted
    ? 'rf-checkrow rf-celebrate--habit-tint'
    : 'rf-checkrow';

  // Compose the StreakBadge classes: the habit-pop animates the inner
  // numeral's transform; the milestone class (if any) animates the
  // pill's box-shadow (+ background-color for the 100-day variant). They
  // target different CSS properties, so they layer without conflict.
  const streakBadgeClass =
    [justCompleted ? 'rf-celebrate--habit-pop' : null, milestoneClass]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div
      className={rowClass}
      data-done={checked || undefined}
      onClick={() => {
        if (!disabled && !pending) onToggle();
      }}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer', minHeight: 60 }}
      role="group"
      aria-label={habit.name}
    >
      <Checkbox
        checked={checked}
        onChange={() => onToggle()}
        size="lg"
        disabled={disabled}
        pending={pending}
        aria-label={
          checked
            ? `Mark "${habit.name}" not done for today`
            : `Mark "${habit.name}" done for today`
        }
      />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <span
          className="rf-checkrow__label"
          style={{
            fontSize: 'var(--fs-lg)',
            letterSpacing: 'var(--tr-snug)',
            color: checked ? 'var(--c-text-muted)' : 'var(--c-text-primary)',
            textDecoration: checked ? 'line-through' : 'none',
            textDecorationColor: 'var(--c-text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {habit.name}
        </span>
        {weekly ? (
          // Stacked under the name (more readable on mobile per design
          // ethos — see design/README.md). Numerals are mono via the
          // `.mono` class; the connective "of"/"this week" stay sans for
          // readability. When the week is complete, the numerals adopt
          // `--c-success` — no badge, no checkmark, calm acknowledgement.
          <span
            style={{
              fontSize: 'var(--fs-sm)',
              color: 'var(--c-text-muted)',
              lineHeight: 1.3,
            }}
            aria-label={`${weekly.count} of ${weekly.target} this week`}
          >
            <span
              className="mono"
              style={{
                color: weekly.complete ? 'var(--c-success)' : undefined,
              }}
            >
              {weekly.count}
            </span>
            {' of '}
            <span
              className="mono"
              style={{
                color: weekly.complete ? 'var(--c-success)' : undefined,
              }}
            >
              {weekly.target}
            </span>
            {' this week'}
          </span>
        ) : null}
      </div>
      {queued ? (
        // Small mono caption flagging that this row's check is queued
        // locally and waiting for reconnect. Matches the design ethos:
        // calm, no spinner, no warning chrome. Sits between the text
        // block and the StreakBadge so it doesn't fight either for
        // visual weight.
        <span
          className="mono rf-eyebrow"
          style={{ color: 'var(--c-text-muted)', marginRight: 'var(--s-2)' }}
          aria-label="queued offline, will sync when reconnected"
        >
          queued
        </span>
      ) : null}
      {milestoneMessage ? (
        // Inline acknowledgement when a milestone is crossed. Sits beside
        // the StreakBadge so the message and the ring-pulse animation
        // share a visual anchor. `role="status"` already implies
        // `aria-live="polite"`, but we keep aria-live explicit for
        // belt-and-braces screen-reader support. Plain text — no
        // punctuation that reads weird out loud.
        <span
          className="rf-celebrate--milestone-message"
          role="status"
          aria-live="polite"
          style={{ marginRight: 'var(--s-2)' }}
        >
          {milestoneMessage}
        </span>
      ) : null}
      <StreakBadge
        currentStreak={habit.currentStreak}
        longestStreak={habit.longestStreak}
        size="sm"
        showBestSuffix={false}
        className={streakBadgeClass}
      />
    </div>
  );
}

// ---------- ProgressDots ----------

function ProgressDots({
  done,
  total,
  totalAll,
}: {
  done: number;
  total: number;
  totalAll: number;
}) {
  // Show up to 7 dots, scaled proportionally if totalAll > 7.
  const dotCount = Math.max(1, Math.min(7, total));
  // Compute how many should be filled by ratio of done/totalAll
  const filled = totalAll === 0 ? 0 : Math.round((done / totalAll) * dotCount);
  return (
    <div className="rf-dots" aria-hidden="true">
      {Array.from({ length: dotCount }).map((_, i) => (
        <span key={i} className="rf-dots__dot" data-on={i < filled ? 'true' : undefined} />
      ))}
    </div>
  );
}

// ---------- EmptyTodayCard ----------

function EmptyTodayCard() {
  return (
    <Card style={{ textAlign: 'center', padding: 'var(--s-8) var(--s-4)' }}>
      <div className="rf-eyebrow" style={{ marginBottom: 'var(--s-2)' }}>
        nothing yet
      </div>
      <h2
        style={{
          margin: '0 0 var(--s-3) 0',
          fontSize: 'var(--fs-2xl)',
          fontWeight: 600,
          letterSpacing: 'var(--tr-tight)',
          color: 'var(--c-text-primary)',
        }}
      >
        Nothing scheduled today.
      </h2>
      <p
        style={{
          margin: '0 auto var(--s-5) auto',
          maxWidth: '40ch',
          fontSize: 'var(--fs-base)',
          color: 'var(--c-text-secondary)',
          lineHeight: 1.5,
        }}
      >
        Start with something small. A morning skincare. A 10-minute stretch. A
        glass of water at 10am.
      </p>
      <div
        style={{
          display: 'inline-flex',
          gap: 'var(--s-3)',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <Link
          href="/routines/new"
          className="rf-btn rf-btn--primary rf-btn--md"
          style={{ textDecoration: 'none' }}
        >
          + New routine
        </Link>
        <Link
          href="/habits/new"
          className="rf-btn rf-btn--secondary rf-btn--md"
          style={{ textDecoration: 'none' }}
        >
          + New habit
        </Link>
      </div>
    </Card>
  );
}

// ---------- AllDoneCard ----------

function AllDoneCard() {
  return (
    <Card variant="hero" style={{ textAlign: 'center' }}>
      <div className="rf-eyebrow" style={{ marginBottom: 'var(--s-2)' }}>
        all done
      </div>
      <h2
        style={{
          margin: 0,
          fontSize: 'var(--fs-2xl)',
          fontWeight: 600,
          letterSpacing: 'var(--tr-tight)',
          color: 'var(--c-text-primary)',
        }}
      >
        Enjoy the rest of your day.
      </h2>
    </Card>
  );
}

// ---------- DesktopGridStyle ----------
// Inline 2-col grid for desktop. Kept here instead of globals.css so it only
// applies to the today view's data-today-grid container.

function DesktopGridStyle({ hasBoth }: { hasBoth: boolean }) {
  if (!hasBoth) return null;
  return (
    <style>{`
      @media (min-width: 900px) {
        [data-today-grid="true"] {
          grid-template-columns: 1.4fr 1fr;
          align-items: start;
          max-width: 1000px;
        }
      }
    `}</style>
  );
}
