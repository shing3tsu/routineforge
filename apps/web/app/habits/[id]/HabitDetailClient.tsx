/**
 * Habit detail — client island.
 *
 * Owns:
 *   - Inline-editable name & description (commits on blur via PATCH).
 *   - The "Today" toggle (POST/DELETE completion for today's date in habit tz).
 *   - Delete habit (with native confirm — Dialog primitive still deferred).
 *
 * Visual target: `design/mockups/habit-detail.html` +
 * `design/screens/habits.jsx → HabitDetailMobile / HabitDetailDesktop`.
 *
 * Composition:
 *   - Hero `<Card variant="hero">` with the streak numeral + "Mark today done" CTA.
 *   - 3-up stat grid (Current / Longest / Total) using `.rf-stat`.
 *   - 90-day `<CalendarHeatmap>` in a Card.
 *   - Notifications via `<SubjectSchedules>`.
 *   - Danger zone.
 */
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CalendarHeatmap } from '@/components/ui/CalendarHeatmap';
import { Dialog } from '@/components/ui/Dialog';
import { HabitDetailActions } from '@/components/ui/HabitDetailActions';
import { IconCheck } from '@/components/ui/icons';
import { InlineEditField } from '@/components/ui/InlineEditField';
import { LogPastDateDialog } from '@/components/ui/LogPastDateDialog';
import { SubjectSchedules } from '@/components/push/SubjectSchedules';
import type { HabitCadence } from '@/db/schema';
import {
  formatCadence,
  formatCadenceAccessible,
  isCadenceDueOnWeekday,
} from '@/lib/habits/format';

type InitialHabit = {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  category: string | null;
  location: string | null;
  cadence: HabitCadence;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  lastCompletedDate: string | null;
  completionsLast90Days: string[];
  createdAt: string;
  /** Today as 'YYYY-MM-DD' in habit tz, pre-computed by the server. */
  todayLocal: string;
};

export type HabitDetailClientProps = {
  initial: InitialHabit;
};

/**
 * 0=Mon..6=Sun for a 'YYYY-MM-DD' string. Mirror of `isoWeekdayInTz` but
 * client-safe (no `'server-only'` import).
 */
function isoWeekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map((v) => Number(v));
  const u = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
  const js = u.getUTCDay();
  return (js + 6) % 7; // 0=Mon..6=Sun
}

/**
 * Format an ISO timestamp into a YYYY-MM-DD local-date string in the given
 * IANA timezone. Client-safe mirror of `formatLocalDateInTz` from streaks.ts
 * (which is `'server-only'`). Used to gate cells before `createdAt`.
 */
function localDateInTz(iso: string, timezone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(new Date(iso));
  } catch {
    // Fallback: take the date portion of the ISO string. Drifts by ≤1 day if
    // the tz is malformed; acceptable for a gating heuristic.
    return iso.slice(0, 10);
  }
}

// Inline-input styling (same idiom as RoutineDetailClient).
const titleInputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  background: 'transparent',
  border: 'none',
  borderBottom: '1.5px solid transparent',
  fontFamily: 'inherit',
  fontSize: 'var(--fs-4xl)',
  fontWeight: 600,
  letterSpacing: 'var(--tr-tight)',
  lineHeight: 1.1,
  color: 'var(--c-text-primary)',
  padding: '4px 0',
  outline: 'none',
  transition: 'border-color var(--d-quick) var(--e-standard)',
};

const descInputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 'var(--s-3)',
  background: 'transparent',
  border: 'none',
  borderBottom: '1.5px solid transparent',
  resize: 'vertical',
  fontFamily: 'inherit',
  fontSize: 'var(--fs-base)',
  lineHeight: 1.5,
  color: 'var(--c-text-secondary)',
  padding: '4px 0',
  outline: 'none',
  transition: 'border-color var(--d-quick) var(--e-standard)',
};

export function HabitDetailClient({ initial }: HabitDetailClientProps) {
  const router = useRouter();

  // Local mirror of editable fields.
  const [name, setName] = React.useState(initial.name);
  const [description, setDescription] = React.useState(initial.description ?? '');

  // Today-completion local state. Initialised from server snapshot.
  const initiallyDone = initial.lastCompletedDate === initial.todayLocal;
  const [doneToday, setDoneToday] = React.useState<boolean>(initiallyDone);
  const [togglePending, setTogglePending] = React.useState<boolean>(false);

  // Streak fields — local copy.
  const [streaks, setStreaks] = React.useState({
    currentStreak: initial.currentStreak,
    longestStreak: initial.longestStreak,
    totalCompletions: initial.totalCompletions,
    lastCompletedDate: initial.lastCompletedDate,
  });

  // 90-day grid: local copy.
  const [completedDates, setCompletedDates] = React.useState<string[]>(
    initial.completionsLast90Days,
  );

  // Per-date pending + error sets for heatmap interactivity. Both contain
  // 'YYYY-MM-DD' strings. Pending → aria-busy + opacity dip. Error → brief
  // danger-subtle flash; entries are auto-cleared after ~600ms so the cell
  // returns to its normal visual.
  const [pendingDates, setPendingDates] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [errorDates, setErrorDates] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  // Earliest editable date — habit creation date in the habit's tz. Cells
  // before this are disabled (per dispatch decision (a)).
  const minEditableDate = React.useMemo(
    () => localDateInTz(initial.createdAt, initial.timezone),
    [initial.createdAt, initial.timezone],
  );

  const [banner, setBanner] = React.useState<{
    variant: 'success' | 'danger';
    message: string;
  } | null>(null);

  // Auto-dismiss the toggle-error banner after 3s. Other banners (name/desc
  // errors, delete error) are dismissed by user action.
  const bannerRef = React.useRef(banner);
  bannerRef.current = banner;
  React.useEffect(() => {
    if (!banner || banner.variant !== 'danger') return;
    const t = setTimeout(() => {
      // Only clear if it's still the same banner — don't stomp on a newer one.
      setBanner((curr) => (curr === bannerRef.current ? null : curr));
    }, 3000);
    return () => clearTimeout(t);
  }, [banner]);

  const [deleting, setDeleting] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  // "Log a past date" dialog — backfill (or remove) a completion for a
  // date older than the 90-day heatmap window. The heatmap edit path
  // already covers in-window edits; this dialog is the escape hatch for
  // older dates.
  const [pastDateDialogOpen, setPastDateDialogOpen] = React.useState(false);

  // -------------------------------------------------------------------------
  // Cadence summary (read-only — editing cadence is deferred)
  // -------------------------------------------------------------------------
  const cadenceText = formatCadence(initial.cadence);
  const cadenceA11y = formatCadenceAccessible(initial.cadence);

  const todayWeekday = React.useMemo(
    () => isoWeekdayOf(initial.todayLocal),
    [initial.todayLocal],
  );
  const todayIsDue = isCadenceDueOnWeekday(initial.cadence, todayWeekday);

  // Sensible defaults for the per-habit reminder form, derived from cadence.
  const scheduleDefaultWeekdays = React.useMemo<number[]>(() => {
    switch (initial.cadence.kind) {
      case 'daily':
        return [0, 1, 2, 3, 4, 5, 6];
      case 'specific_weekdays':
        return initial.cadence.weekdays.slice().sort((a, b) => a - b);
      case 'weekly_count':
      default:
        return [];
    }
  }, [initial.cadence]);
  const isWeeklyCount = initial.cadence.kind === 'weekly_count';

  // -------------------------------------------------------------------------
  // Inline edit
  // -------------------------------------------------------------------------
  const patchHabit = React.useCallback(
    async (
      patch: Partial<{
        name: string;
        description: string | null;
        category: string | null;
        location: string | null;
      }>,
    ) => {
      const res = await fetch(`/api/habits/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(data?.message ?? 'Update failed.');
      }
    },
    [initial.id],
  );

  // Inline-edit save handlers for category / location (mirror routine
  // detail). On success → router.refresh() so the SSR snapshot picks up
  // the change. On failure → push a banner + re-throw so the field
  // component reverts its local draft.
  const onCategorySave = React.useCallback(
    async (next: string | null) => {
      try {
        await patchHabit({ category: next });
        router.refresh();
      } catch (e) {
        setBanner({
          variant: 'danger',
          message:
            e instanceof Error ? e.message : 'Could not update category.',
        });
        throw e;
      }
    },
    [patchHabit, router],
  );

  const onLocationSave = React.useCallback(
    async (next: string | null) => {
      try {
        await patchHabit({ location: next });
        router.refresh();
      } catch (e) {
        setBanner({
          variant: 'danger',
          message:
            e instanceof Error ? e.message : 'Could not update location.',
        });
        throw e;
      }
    },
    [patchHabit, router],
  );

  const onNameBlur = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setName(initial.name);
      setBanner({ variant: 'danger', message: 'Name cannot be empty.' });
      return;
    }
    if (trimmed === initial.name) return;
    try {
      await patchHabit({ name: trimmed });
      setName(trimmed);
      router.refresh();
    } catch (e) {
      setName(initial.name);
      setBanner({
        variant: 'danger',
        message: e instanceof Error ? e.message : 'Could not update name.',
      });
    }
  };

  const onDescriptionBlur = async () => {
    const trimmed = description.trim();
    const existing = initial.description ?? '';
    if (trimmed === existing.trim()) return;
    try {
      await patchHabit({
        description: trimmed.length === 0 ? null : trimmed,
      });
      router.refresh();
    } catch (e) {
      setDescription(existing);
      setBanner({
        variant: 'danger',
        message:
          e instanceof Error ? e.message : 'Could not update description.',
      });
    }
  };

  // -------------------------------------------------------------------------
  // Toggle today
  // -------------------------------------------------------------------------
  const handleToggleToday = async () => {
    if (togglePending) return;
    const next = !doneToday;
    setDoneToday(next);
    setTogglePending(true);
    setCompletedDates((prev) => {
      const set = new Set(prev);
      if (next) set.add(initial.todayLocal);
      else set.delete(initial.todayLocal);
      return [...set].sort();
    });
    try {
      const url = `/api/habits/${initial.id}/completions`;
      const res = await fetch(url, {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: initial.todayLocal }),
      });
      if (res.status === 204) {
        router.refresh();
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(data?.message ?? 'Could not update completion.');
      }
      const data = (await res.json().catch(() => null)) as
        | {
            ok: boolean;
            streaks?: {
              currentStreak: number;
              longestStreak: number;
              totalCompletions: number;
              lastCompletedDate: string | null;
            };
          }
        | null;
      if (data?.streaks) {
        setStreaks(data.streaks);
      } else {
        router.refresh();
      }
    } catch (e) {
      setDoneToday(!next);
      setCompletedDates((prev) => {
        const set = new Set(prev);
        if (!next) set.add(initial.todayLocal);
        else set.delete(initial.todayLocal);
        return [...set].sort();
      });
      setBanner({
        variant: 'danger',
        message:
          e instanceof Error ? e.message : 'Could not update completion.',
      });
    } finally {
      setTogglePending(false);
    }
  };

  // -------------------------------------------------------------------------
  // Toggle an arbitrary past date from the heatmap.
  //
  // Optimistic-update strategy:
  //   - Flip `completedDates` immediately.
  //   - Mark the date as pending so the cell renders busy.
  //   - POST or DELETE the canonical endpoint.
  //   - POST → response includes the recomputed streaks; merge them and call
  //     router.refresh() so server-rendered surfaces (stats grid is local but
  //     SubjectSchedules + future server-derived bits stay fresh).
  //   - DELETE → 204 no body; rely on router.refresh() to resync streaks.
  //   - On error → revert, surface inline Alert, briefly flash the cell red.
  // -------------------------------------------------------------------------
  const handleToggleDate = React.useCallback(
    async (date: string, currentlyComplete: boolean) => {
      // Guard re-entry on the same date — the cell is `disabled` while
      // pending, but the keyboard "Enter held" + race is possible.
      if (pendingDates.has(date)) return;

      // Refuse pre-creation dates defensively even though the cell is
      // disabled in the UI — protects against programmatic callers.
      if (date < minEditableDate) return;

      const next = !currentlyComplete;

      // Optimistic completion list.
      setCompletedDates((prev) => {
        const set = new Set(prev);
        if (next) set.add(date);
        else set.delete(date);
        return [...set].sort();
      });

      // If we're touching today, keep the hero CTA's `doneToday` state in
      // sync — otherwise it'd lag behind the heatmap.
      if (date === initial.todayLocal) {
        setDoneToday(next);
      }

      setPendingDates((prev) => {
        const set = new Set(prev);
        set.add(date);
        return set;
      });

      try {
        const url = `/api/habits/${initial.id}/completions`;
        const res = await fetch(url, {
          method: next ? 'POST' : 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date }),
        });

        if (res.status === 204) {
          // DELETE — no body. Trigger a server refresh so streaks resync.
          router.refresh();
          return;
        }

        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(data?.message ?? 'Could not save change.');
        }

        // POST — response includes streaks.
        const data = (await res.json().catch(() => null)) as
          | {
              ok: boolean;
              streaks?: {
                currentStreak: number;
                longestStreak: number;
                totalCompletions: number;
                lastCompletedDate: string | null;
              };
            }
          | null;
        if (data?.streaks) {
          setStreaks(data.streaks);
          router.refresh();
        } else {
          router.refresh();
        }
      } catch (e) {
        // Revert the optimistic state.
        setCompletedDates((prev) => {
          const set = new Set(prev);
          if (!next) set.add(date);
          else set.delete(date);
          return [...set].sort();
        });
        if (date === initial.todayLocal) {
          setDoneToday(!next);
        }
        // Flash the cell red briefly.
        setErrorDates((prev) => {
          const set = new Set(prev);
          set.add(date);
          return set;
        });
        setTimeout(() => {
          setErrorDates((prev) => {
            if (!prev.has(date)) return prev;
            const set = new Set(prev);
            set.delete(date);
            return set;
          });
        }, 600);
        setBanner({
          variant: 'danger',
          message:
            e instanceof Error ? e.message : "Couldn't save change. Try again.",
        });
      } finally {
        setPendingDates((prev) => {
          if (!prev.has(date)) return prev;
          const set = new Set(prev);
          set.delete(date);
          return set;
        });
      }
    },
    [initial.id, initial.todayLocal, minEditableDate, pendingDates, router],
  );

  // -------------------------------------------------------------------------
  // Delete habit
  // -------------------------------------------------------------------------
  // Confirmation runs through the Dialog primitive — the trigger opens the
  // dialog, the dialog's primary action fires the DELETE. Dialog stays
  // open while pending so the user can't dismiss mid-flight.
  const handleDeleteHabit = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/habits/${initial.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Could not delete habit.');
      }
      // Close the dialog before navigating so the body-scroll-lock
      // cleanup runs before the page unmounts.
      setDeleteDialogOpen(false);
      router.push('/habits');
    } catch (e) {
      setBanner({
        variant: 'danger',
        message: e instanceof Error ? e.message : 'Could not delete habit.',
      });
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <>
      <header style={{ marginBottom: 'var(--s-5)' }}>
        <div className="rf-eyebrow" style={{ marginBottom: 'var(--s-2)' }}>
          habit · {cadenceText.toLowerCase()}
        </div>
        <input
          style={titleInputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={onNameBlur}
          aria-label="Habit name"
          maxLength={100}
        />
        <textarea
          style={descInputStyle}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={onDescriptionBlur}
          aria-label="Habit description"
          maxLength={500}
          placeholder="Add a short description (optional)"
          rows={2}
        />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--s-4)',
            marginTop: 'var(--s-3)',
          }}
        >
          <InlineEditField
            value={initial.category}
            onSave={onCategorySave}
            label="Category"
            emptyPlaceholder="+ add category"
            data-testid="habit-category-field"
          />
          <InlineEditField
            value={initial.location}
            onSave={onLocationSave}
            label="Location"
            emptyPlaceholder="+ add location"
            data-testid="habit-location-field"
          />
        </div>
      </header>

      {banner ? (
        <div style={{ marginBottom: 'var(--s-4)' }}>
          <Alert variant={banner.variant} onDismiss={() => setBanner(null)}>
            {banner.message}
          </Alert>
        </div>
      ) : null}

      {/* HERO streak block — matches `design/screens/habits.jsx → HabitDetailMobile`.
          Large mono numeral + "Mark today done" CTA below it. When the habit isn't
          due today per cadence, the CTA is replaced by a "not scheduled" note. */}
      <Card variant="hero" style={{ textAlign: 'center' }}>
        <div className="rf-eyebrow">current streak</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            gap: 'var(--s-3)',
            marginTop: 'var(--s-3)',
          }}
        >
          <span
            className="num"
            style={{
              fontSize: 'var(--fs-7xl)',
              fontWeight: 600,
              letterSpacing: '-0.04em',
              lineHeight: 1,
              color: 'var(--c-text-primary)',
            }}
            aria-label={`${streaks.currentStreak} day${streaks.currentStreak === 1 ? '' : 's'} streak`}
          >
            {streaks.currentStreak}
          </span>
          <span
            style={{
              fontSize: 'var(--fs-xl)',
              color: 'var(--c-text-secondary)',
            }}
          >
            day{streaks.currentStreak === 1 ? '' : 's'}
          </span>
        </div>
        <div style={{ marginTop: 'var(--s-5)' }}>
          {todayIsDue ? (
            <Button
              variant={doneToday ? 'secondary' : 'primary'}
              size="lg"
              onClick={handleToggleToday}
              loading={togglePending}
              aria-pressed={doneToday}
              aria-label={
                doneToday
                  ? 'Mark today not done'
                  : 'Mark today done'
              }
              style={{ minWidth: 200 }}
            >
              <IconCheck size={18} />
              {doneToday ? 'Done for today' : 'Mark today done'}
            </Button>
          ) : (
            <div
              style={{
                fontSize: 'var(--fs-sm)',
                color: 'var(--c-text-muted)',
              }}
            >
              Not scheduled for today. Cadence: {cadenceA11y}.
            </div>
          )}
        </div>
      </Card>

      {/* 3-up stat grid */}
      <section
        aria-label="Streak stats"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 'var(--s-3)',
          marginTop: 'var(--s-4)',
        }}
      >
        <Card className="rf-stat">
          <div className="rf-stat__v">{streaks.currentStreak}</div>
          <div className="rf-stat__l">Current</div>
        </Card>
        <Card className="rf-stat">
          <div className="rf-stat__v">{streaks.longestStreak}</div>
          <div className="rf-stat__l">Longest</div>
        </Card>
        <Card className="rf-stat">
          <div className="rf-stat__v">{streaks.totalCompletions}</div>
          <div className="rf-stat__l">Total</div>
        </Card>
      </section>

      <section
        aria-labelledby="heatmap-h"
        style={{ marginTop: 'var(--s-5)' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            margin: '0 var(--s-1) var(--s-3) var(--s-1)',
          }}
        >
          <h2 id="heatmap-h" className="rf-eyebrow">
            Last 90 days
          </h2>
          <span className="mono rf-eyebrow">
            {completedDates.length} done
          </span>
        </div>
        <Card>
          <CalendarHeatmap
            completedDates={completedDates}
            weeks={13}
            asOfDate={initial.todayLocal}
            onToggleDate={handleToggleDate}
            pendingDates={pendingDates}
            errorDates={errorDates}
            minDate={minEditableDate}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: 'var(--s-3)',
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPastDateDialogOpen(true)}
              data-testid="log-past-date-trigger"
            >
              log a past date
            </Button>
          </div>
        </Card>
      </section>

      <div style={{ marginTop: 'var(--s-5)' }}>
        <SubjectSchedules
          subjectType="habit"
          subjectId={initial.id}
          defaultWeekdays={scheduleDefaultWeekdays}
          weeklyCountHint={isWeeklyCount}
        />
      </div>

      {/* Non-destructive actions (Duplicate) sit ABOVE the danger zone so
          destructive Delete is visually last. */}
      <HabitDetailActions habitId={initial.id} habitName={name} />

      <section
        aria-labelledby="danger-h"
        style={{ marginTop: 'var(--s-5)' }}
      >
        <Card>
          <div className="rf-eyebrow" style={{ marginBottom: 'var(--s-3)' }}>
            <h2 id="danger-h" style={{ all: 'inherit', margin: 0 }}>
              Danger zone
            </h2>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--s-3)',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 'var(--fs-base)',
                  fontWeight: 500,
                  color: 'var(--c-text-primary)',
                }}
              >
                Delete this habit
              </div>
              <div
                style={{
                  fontSize: 'var(--fs-xs)',
                  color: 'var(--c-text-muted)',
                  marginTop: 2,
                  lineHeight: 1.5,
                }}
              >
                Archives the habit. Its completion history is preserved but it
                won&apos;t appear in your list anymore.
              </div>
            </div>
            <div>
              <Button
                variant="danger"
                onClick={() => setDeleteDialogOpen(true)}
                loading={deleting}
              >
                Delete habit
              </Button>
            </div>
          </div>
        </Card>
      </section>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => {
          if (deleting) return;
          setDeleteDialogOpen(false);
        }}
        title="Delete habit?"
        description="This will remove the habit. Your streak history and total completions will be lost."
        destructive
        primaryAction={{
          label: 'Delete habit',
          onClick: handleDeleteHabit,
          pending: deleting,
        }}
      />

      <LogPastDateDialog
        open={pastDateDialogOpen}
        onClose={() => setPastDateDialogOpen(false)}
        onSuccess={() => router.refresh()}
        habitId={initial.id}
        todayLocal={initial.todayLocal}
        minDate={minEditableDate}
      />
    </>
  );
}
