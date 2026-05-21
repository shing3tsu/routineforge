/**
 * LogPastDateDialog — backfill (or un-backfill) a habit completion for any
 * past date older than the 90-day heatmap window.
 *
 * Trigger: a small secondary "log a past date" button under the heatmap
 * on the habit detail page. Click opens this dialog.
 *
 * Body (inside the existing Dialog primitive `children` slot):
 *   - Native <input type="date"> bounded to `[habit creation date, today]`.
 *   - Helper text explaining the action.
 *   - A "remove the completion instead" checkbox. When checked, the dialog
 *     issues DELETE; otherwise POST. Mirrors the heatmap-cell toggle
 *     semantics so the user can correct an erroneous backfill without
 *     hunting through the calendar.
 *
 * On confirm:
 *   - Validates client-side: date is required + not in the future +
 *     >= minDate (habit creation).
 *   - POST or DELETE `/api/habits/:id/completions` with `{ date }`.
 *   - On success, closes the dialog and calls `onSuccess()` (parent calls
 *     `router.refresh()` to repaint the heatmap + streak numbers).
 *   - On error, keeps the dialog open + surfaces an inline Alert banner.
 *
 * The backend endpoint already accepts arbitrary past dates (verified by
 * reading `app/api/habits/[id]/completions/route.ts` — its only validation
 * is `localDateSchema`, which doesn't bound by recency). So there's no
 * server-side compatibility caveat to worry about here.
 */
'use client';

import * as React from 'react';
import { Alert } from '@/components/ui/Alert';
import { Dialog } from '@/components/ui/Dialog';

export type LogPastDateDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a successful POST or DELETE (parent triggers refresh). */
  onSuccess: () => void;
  habitId: string;
  /** Today's local date in habit tz — used as the max-selectable date. */
  todayLocal: string;
  /** Earliest selectable date — the habit's creation date in habit tz. */
  minDate: string;
};

export function LogPastDateDialog({
  open,
  onClose,
  onSuccess,
  habitId,
  todayLocal,
  minDate,
}: LogPastDateDialogProps) {
  const [date, setDate] = React.useState<string>('');
  const [remove, setRemove] = React.useState<boolean>(false);
  const [pending, setPending] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset internal state whenever the dialog reopens. Keeping the dialog
  // mounted across opens is fine, but we don't want the user's last picks
  // to leak into the next session.
  React.useEffect(() => {
    if (open) {
      setDate('');
      setRemove(false);
      setError(null);
      setPending(false);
    }
  }, [open]);

  const isFuture = date.length > 0 && date > todayLocal;
  const isBeforeMin = date.length > 0 && date < minDate;
  const hasDate = date.length > 0;

  // Client-side validation message. Server validation still applies on
  // submit but we surface clearer copy here than the server's terse zod
  // error would give.
  let validationError: string | null = null;
  if (!hasDate) {
    validationError = null; // no message until they try to submit
  } else if (isFuture) {
    validationError = "future dates aren't allowed.";
  } else if (isBeforeMin) {
    validationError = 'date is before the habit was created.';
  }

  const handleConfirm = async () => {
    if (!hasDate) {
      setError('pick a date first.');
      return;
    }
    if (isFuture) {
      setError("future dates aren't allowed.");
      return;
    }
    if (isBeforeMin) {
      setError('date is before the habit was created.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/habits/${habitId}/completions`, {
        method: remove ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      if (res.status === 204) {
        // DELETE — no body.
        onSuccess();
        onClose();
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(data?.message ?? 'could not save change.');
      }
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not save change.');
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (pending) return;
        onClose();
      }}
      title="log a past date"
      description={
        remove
          ? 'choose a date — the habit completion will be removed on that day.'
          : 'choose a date — the habit will be marked done on that day.'
      }
      primaryAction={{
        label: remove ? 'remove' : 'log it',
        onClick: handleConfirm,
        pending,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-3)',
        }}
      >
        {error ? (
          <Alert variant="danger" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <label
          htmlFor="log-past-date-input"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s-1)',
            fontSize: 'var(--fs-xs)',
            color: 'var(--c-text-muted)',
            letterSpacing: 'var(--tr-snug)',
          }}
        >
          <span>date</span>
          <input
            id="log-past-date-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={minDate}
            max={todayLocal}
            disabled={pending}
            required
            aria-invalid={
              validationError !== null && hasDate ? true : undefined
            }
            aria-describedby={
              validationError && hasDate
                ? 'log-past-date-validation'
                : undefined
            }
            style={{
              display: 'block',
              width: '100%',
              padding: 'var(--s-2) var(--s-3)',
              border: '1.5px solid var(--c-text-muted)',
              borderRadius: 'var(--r-md)',
              background: 'transparent',
              fontFamily: 'inherit',
              fontSize: 'var(--fs-base)',
              color: 'var(--c-text-primary)',
              outline: 'none',
            }}
          />
          {validationError && hasDate ? (
            <span
              id="log-past-date-validation"
              role="alert"
              style={{
                color: 'var(--c-danger)',
                fontSize: 'var(--fs-xs)',
              }}
            >
              {validationError}
            </span>
          ) : null}
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-2)',
            fontSize: 'var(--fs-sm)',
            color: 'var(--c-text-secondary)',
            cursor: pending ? 'default' : 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={remove}
            onChange={(e) => setRemove(e.target.checked)}
            disabled={pending}
            aria-label="remove the completion instead"
          />
          <span>remove the completion instead</span>
        </label>

      </div>
    </Dialog>
  );
}
