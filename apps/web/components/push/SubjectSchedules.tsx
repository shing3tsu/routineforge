/**
 * SubjectSchedules — per-routine / per-habit notification schedules.
 *
 * Owns one card on a detail page (routine OR habit). Lists existing schedules
 * for `(subjectType, subjectId)` via GET /api/push/schedules, lets the user
 * toggle each on/off, delete one, or add a new one (time + weekday picker).
 *
 * The "enable notifications on this device" nudge appears above the list
 * when the user hasn't subscribed locally — schedules created here are
 * *globally* useful (the dispatcher runs server-side) but obviously won't
 * push to *this* device without a local subscription.
 *
 * Why a single client island (vs. row-per-row): the list is small (rarely
 * more than 3-5 schedules per subject), and the mutual-state — banner,
 * pending flag — is simpler when one component owns everything.
 *
 * Weekday encoding throughout: 0=Mon..6=Sun (matches `lib/validation/push.ts`
 * and the rest of the codebase).
 */
'use client';

import * as React from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { WeekdayChips } from '@/components/ui/WeekdayChips';
import {
  getCurrentSubscription,
  isPushSupported,
} from '@/lib/push/client';
import styles from './SubjectSchedules.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Schedule = {
  id: string;
  routineId: string | null;
  habitId: string | null;
  time: string;
  weekdays: number[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SubjectType = 'routine' | 'habit';

export type SubjectSchedulesProps = {
  subjectType: SubjectType;
  subjectId: string;
  /**
   * Default weekdays for the "Add notification" form, honouring the cadence
   * for habits:
   *   - daily              -> [0,1,2,3,4,5,6]
   *   - specific_weekdays  -> cadence.weekdays
   *   - weekly_count       -> []  (caller passes empty; we show a hint)
   * Routines don't have a cadence — pass [] or the routine's
   * `scheduleWeekdays` if you want a sensible default.
   */
  defaultWeekdays: number[];
  /**
   * When true, the add-form hints that no weekdays are pre-selected because
   * this is a `weekly_count` habit. (No-op if false / when caller passes
   * defaults.)
   */
  weeklyCountHint?: boolean;
};

type Banner = { variant: 'success' | 'danger' | 'info'; message: string };

// ---------------------------------------------------------------------------
// Weekday label rendering
// ---------------------------------------------------------------------------

const WEEKDAY_SHORT: ReadonlyArray<string> = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
];

/**
 * Render the schedule's weekdays as a humane label. Special-cases:
 *   - all 7 days   -> "Every day"
 *   - Mon..Fri only -> "Weekdays"
 *   - Sat, Sun only -> "Weekends"
 */
function formatWeekdays(days: number[]): string {
  if (days.length === 0) return 'No days';
  const set = new Set(days);
  if (set.size === 7) return 'Every day';
  if (set.size === 5 && [0, 1, 2, 3, 4].every((d) => set.has(d))) {
    return 'Weekdays';
  }
  if (set.size === 2 && set.has(5) && set.has(6)) return 'Weekends';
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_SHORT[d] ?? '?')
    .join(', ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SubjectSchedules({
  subjectType,
  subjectId,
  defaultWeekdays,
  weeklyCountHint = false,
}: SubjectSchedulesProps) {
  const [schedules, setSchedules] = React.useState<Schedule[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [banner, setBanner] = React.useState<Banner | null>(null);
  const [pending, setPending] = React.useState<boolean>(false);

  // "Has the user enabled push on this device?" — drives the nudge banner.
  const [localSubscribed, setLocalSubscribed] = React.useState<boolean>(false);
  const [supported, setSupported] = React.useState<boolean>(true);

  // Add-form state.
  const [formOpen, setFormOpen] = React.useState<boolean>(false);
  const [formTime, setFormTime] = React.useState<string>('09:00');
  const [formDays, setFormDays] = React.useState<number[]>([]);

  // -------------------------------------------------------------------------
  // Initial load
  // -------------------------------------------------------------------------
  const fetchSchedules = React.useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL('/api/push/schedules', window.location.origin);
      url.searchParams.set('subjectType', subjectType);
      url.searchParams.set('subjectId', subjectId);
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) {
        setSchedules([]);
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; schedules?: Schedule[] }
        | null;
      setSchedules(data?.schedules ?? []);
    } catch {
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [subjectType, subjectId]);

  const checkLocalSubscription = React.useCallback(async () => {
    setSupported(isPushSupported());
    try {
      const sub = await getCurrentSubscription();
      setLocalSubscribed(sub !== null);
    } catch {
      setLocalSubscribed(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchSchedules();
    void checkLocalSubscription();
  }, [fetchSchedules, checkLocalSubscription]);

  // Reset form defaults when caller changes them (e.g. cadence edit).
  React.useEffect(() => {
    setFormDays(defaultWeekdays);
  }, [defaultWeekdays]);

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  const onCreate = async () => {
    setBanner(null);
    // Client-side validation: weekdays must be non-empty.
    if (formDays.length === 0) {
      setBanner({
        variant: 'danger',
        message: 'Pick at least one weekday for the reminder.',
      });
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/push/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectType,
          subjectId,
          time: formTime,
          weekdays: formDays,
          enabled: true,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(data?.message ?? 'Could not save reminder.');
      }
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; schedule?: Schedule }
        | null;
      if (data?.schedule) {
        setSchedules((prev) => [...prev, data.schedule!]);
      } else {
        await fetchSchedules();
      }
      setFormOpen(false);
      setFormTime('09:00');
      setFormDays(defaultWeekdays);
      setBanner({ variant: 'success', message: 'Reminder added.' });
    } catch (e) {
      setBanner({
        variant: 'danger',
        message: e instanceof Error ? e.message : 'Could not save reminder.',
      });
    } finally {
      setPending(false);
    }
  };

  const onToggleEnabled = async (sched: Schedule) => {
    setBanner(null);
    const next = !sched.enabled;
    // Optimistic update.
    setSchedules((prev) =>
      prev.map((s) => (s.id === sched.id ? { ...s, enabled: next } : s)),
    );
    try {
      const res = await fetch(`/api/push/schedules/${sched.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        throw new Error('Could not update reminder.');
      }
    } catch (e) {
      // Revert.
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === sched.id ? { ...s, enabled: sched.enabled } : s,
        ),
      );
      setBanner({
        variant: 'danger',
        message: e instanceof Error ? e.message : 'Could not update reminder.',
      });
    }
  };

  const onDelete = async (sched: Schedule) => {
    setBanner(null);
    // Optimistic remove.
    const prev = schedules;
    setSchedules((s) => s.filter((x) => x.id !== sched.id));
    try {
      const res = await fetch(`/api/push/schedules/${sched.id}`, {
        method: 'DELETE',
      });
      // 204 is the success case.
      if (!res.ok && res.status !== 204) {
        throw new Error('Could not delete reminder.');
      }
    } catch (e) {
      // Revert.
      setSchedules(prev);
      setBanner({
        variant: 'danger',
        message: e instanceof Error ? e.message : 'Could not delete reminder.',
      });
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <section className={styles.section} aria-labelledby="schedules-h">
      <div className={styles.sectionHead}>
        <h2 id="schedules-h" className={styles.sectionTitle}>
          Notifications
        </h2>
      </div>

      {/* Nudge: only show when push is supported AND the user hasn't subscribed
          locally. We don't surface this for an unsupported browser — the
          nudge would imply "fix this here" which they can't. */}
      {supported && !localSubscribed && schedules.length > 0 ? (
        <div className={styles.nudge}>
          <Alert variant="info">
            Set times here. Enable notifications in your{' '}
            <a href="/account">account settings</a> to actually receive them.
          </Alert>
        </div>
      ) : null}

      {loading ? (
        <div className={styles.emptyMsg}>Loading reminders&hellip;</div>
      ) : schedules.length === 0 ? (
        <div className={styles.emptyMsg}>
          No reminders yet. Add one to be nudged at a time you pick.
        </div>
      ) : (
        <ul className={styles.list}>
          {schedules.map((s) => {
            const rowClass = [
              styles.row,
              !s.enabled && styles.rowDisabled,
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <li key={s.id} className={rowClass}>
                <div className={styles.rowTime} aria-label={`Reminder time ${s.time}`}>
                  {s.time}
                </div>
                <div className={styles.rowDays}>{formatWeekdays(s.weekdays)}</div>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={s.enabled}
                    aria-label={
                      s.enabled
                        ? 'Disable this reminder'
                        : 'Enable this reminder'
                    }
                    className={styles.switch}
                    onClick={() => void onToggleEnabled(s)}
                  />
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label="Delete this reminder"
                    onClick={() => void onDelete(s)}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!formOpen ? (
        <div className={styles.addBar}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setFormDays(defaultWeekdays);
              setFormTime('09:00');
              setBanner(null);
              setFormOpen(true);
            }}
          >
            Add notification
          </Button>
        </div>
      ) : (
        <div className={styles.form}>
          <div className={styles.formField}>
            <label htmlFor="schedule-time" className={styles.formLabel}>
              Time
            </label>
            <input
              id="schedule-time"
              type="time"
              className={styles.timeInput}
              value={formTime}
              onChange={(e) => setFormTime(e.target.value)}
              step={60}
              required
            />
          </div>
          <div className={styles.formField}>
            <span className={styles.formLabel}>Weekdays</span>
            <WeekdayChips
              selected={formDays}
              onChange={setFormDays}
              mode="multi"
              aria-label="Days this reminder should fire"
            />
            {weeklyCountHint ? (
              <div className={styles.formHint}>
                Weekly-count habits don&rsquo;t have set days &mdash; choose
                any you&rsquo;d like a reminder.
              </div>
            ) : null}
          </div>
          <div className={styles.formActions}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFormOpen(false);
                setBanner(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void onCreate()}
              loading={pending}
            >
              Save reminder
            </Button>
          </div>
        </div>
      )}

      {banner ? (
        <div className={styles.alertWrap}>
          <Alert variant={banner.variant} onDismiss={() => setBanner(null)}>
            {banner.message}
          </Alert>
        </div>
      ) : null}
    </section>
  );
}
