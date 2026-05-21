/**
 * HabitDetailActions — non-destructive actions row for /habits/[id].
 *
 * Owns the "Duplicate" action: POST /api/habits/:id/duplicate, then route
 * to the new habit's detail page on success. Loading + error state are
 * local to this component (no parent threading required).
 *
 * Placement: rendered ABOVE the Danger zone Card in HabitDetailClient.
 * Duplicate is non-destructive, so the destructive Delete sits last per the
 * "destructive action sits last" rule from `design/components.md`.
 *
 * Variant: `secondary` — matches the Button family used elsewhere for the
 * positive-non-primary action.
 *
 * Auth: a 401 response means the session expired between page-load and click.
 * We route to `/login?from=/habits/{id}` so the user lands back here with
 * the original habit after re-authenticating.
 */
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export type HabitDetailActionsProps = {
  habitId: string;
  /** Used only for screen-reader announcement of the action target. */
  habitName: string;
};

export function HabitDetailActions({
  habitId,
  habitName,
}: HabitDetailActionsProps) {
  const router = useRouter();
  const [duplicating, setDuplicating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleDuplicate = async () => {
    if (duplicating) return;
    setError(null);
    setDuplicating(true);
    try {
      const res = await fetch(`/api/habits/${habitId}/duplicate`, {
        method: 'POST',
      });

      if (res.status === 401) {
        router.push(`/login?from=/habits/${habitId}`);
        return;
      }

      if (!res.ok) {
        throw new Error('duplicate_failed');
      }

      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; habit?: { id: string } }
        | null;

      const newId = data?.habit?.id;
      if (!data?.ok || !newId) {
        throw new Error('duplicate_failed');
      }

      router.push(`/habits/${newId}`);
    } catch {
      setError('Could not duplicate. Please try again.');
      setDuplicating(false);
    }
  };

  return (
    <section aria-labelledby="actions-h" style={{ marginTop: 'var(--s-5)' }}>
      <Card>
        <div className="rf-eyebrow" style={{ marginBottom: 'var(--s-3)' }}>
          <h2 id="actions-h" style={{ all: 'inherit', margin: 0 }}>
            Actions
          </h2>
        </div>

        {error ? (
          <div style={{ marginBottom: 'var(--s-3)' }}>
            <Alert variant="danger" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          </div>
        ) : null}

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
              Duplicate this habit
            </div>
            <div
              style={{
                fontSize: 'var(--fs-xs)',
                color: 'var(--c-text-muted)',
                marginTop: 2,
                lineHeight: 1.5,
              }}
            >
              Creates a copy with the same cadence. Completion history and
              streaks are not carried over.
            </div>
          </div>
          <div>
            <Button
              variant="secondary"
              onClick={handleDuplicate}
              loading={duplicating}
              aria-label={`Duplicate habit ${habitName}`}
            >
              Duplicate
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}
