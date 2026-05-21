/**
 * Routine detail — client island.
 *
 * Owns:
 *   - Optimistic local state for steps (so the DayStepEditor doesn't have to
 *     wait for a full server refresh on every keystroke).
 *   - Inline-editable name & description (commits on blur via PATCH).
 *   - Delete confirmation routed through the Dialog primitive.
 *
 * Visual target: `design/screens/routines.jsx → RoutineDetailMobile /
 * RoutineDetailDesktop`. Surface composition via `.rf-card`, `.rf-eyebrow`,
 * `.rf-btn`, `.rf-chips`. Cards have generous interior padding (pillowy).
 *
 * The WeekdayChips above the editor is READ-ONLY: it visualizes which
 * weekdays currently have steps, derived from the local state. Toggling
 * a chip is a no-op (with a hint that scheduling happens via adding/
 * removing steps in the editor below).
 */
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DayStepEditor, type DayStep } from '@/components/ui/DayStepEditor';
import { Dialog } from '@/components/ui/Dialog';
import { InlineEditField } from '@/components/ui/InlineEditField';
import { RoutineDetailActions } from '@/components/ui/RoutineDetailActions';
import { WeekdayChips } from '@/components/ui/WeekdayChips';
import { SubjectSchedules } from '@/components/push/SubjectSchedules';

type StepsByWeekday = Record<number, DayStep[]>;

type Routine = {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  category: string | null;
  location: string | null;
  scheduleWeekdays: number[];
  stepsByWeekday: StepsByWeekday;
};

export type RoutineDetailClientProps = {
  routine: Routine;
};

function emptyByWeekday(): StepsByWeekday {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

function deriveSchedule(steps: StepsByWeekday): number[] {
  return Object.entries(steps)
    .filter(([, v]) => v.length > 0)
    .map(([k]) => Number(k))
    .sort((a, b) => a - b);
}

// --- shared inline styles for the inline-editable header inputs.
// These intentionally don't use a module.css file — the new design wants
// transparent inputs that ONLY show a subtle underline on focus, matching
// the `.rf-field` minimalism.
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

export function RoutineDetailClient({ routine }: RoutineDetailClientProps) {
  const router = useRouter();

  // Local state mirrors the routine for optimistic UI.
  const [name, setName] = React.useState(routine.name);
  const [description, setDescription] = React.useState(routine.description ?? '');
  const [steps, setSteps] = React.useState<StepsByWeekday>(() => {
    const seed = emptyByWeekday();
    for (let i = 0; i < 7; i++) {
      seed[i] = routine.stepsByWeekday[i] ?? [];
    }
    return seed;
  });

  const scheduleWeekdays = React.useMemo(() => deriveSchedule(steps), [steps]);

  const [banner, setBanner] = React.useState<{
    variant: 'success' | 'danger';
    message: string;
  } | null>(null);

  const [deleting, setDeleting] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  // -------------------------------------------------------------------------
  // Routine field updates (inline edit)
  // -------------------------------------------------------------------------
  const patchRoutine = React.useCallback(
    async (
      patch: Partial<{
        name: string;
        description: string | null;
        category: string | null;
        location: string | null;
      }>,
    ) => {
      const res = await fetch(`/api/routines/${routine.id}`, {
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
    [routine.id],
  );

  // category / location use the InlineEditField primitive. On success we
  // refresh server-side so the SSR-rendered display picks up the change.
  // On failure we re-throw so InlineEditField reverts its local draft and
  // we surface the message via the shared banner state.
  const onCategorySave = React.useCallback(
    async (next: string | null) => {
      try {
        await patchRoutine({ category: next });
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
    [patchRoutine, router],
  );

  const onLocationSave = React.useCallback(
    async (next: string | null) => {
      try {
        await patchRoutine({ location: next });
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
    [patchRoutine, router],
  );

  const onNameBlur = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setName(routine.name);
      setBanner({ variant: 'danger', message: 'Name cannot be empty.' });
      return;
    }
    if (trimmed === routine.name) return;
    try {
      await patchRoutine({ name: trimmed });
      setName(trimmed);
      router.refresh();
    } catch (e) {
      setName(routine.name);
      setBanner({
        variant: 'danger',
        message: e instanceof Error ? e.message : 'Could not update name.',
      });
    }
  };

  const onDescriptionBlur = async () => {
    const trimmed = description.trim();
    const existing = routine.description ?? '';
    if (trimmed === existing.trim()) return;
    try {
      await patchRoutine({
        description: trimmed.length === 0 ? null : trimmed,
      });
      router.refresh();
    } catch (e) {
      setDescription(existing);
      setBanner({
        variant: 'danger',
        message: e instanceof Error ? e.message : 'Could not update description.',
      });
    }
  };

  // -------------------------------------------------------------------------
  // Step mutations
  // -------------------------------------------------------------------------
  const reloadStepsForWeekday = React.useCallback(
    async (weekday: number) => {
      const res = await fetch(
        `/api/routines/${routine.id}/steps?weekday=${weekday}`,
        { method: 'GET' },
      );
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; steps?: DayStep[] }
        | null;
      if (!data?.ok || !data.steps) return;
      setSteps((prev) => ({ ...prev, [weekday]: data.steps! }));
    },
    [routine.id],
  );

  const handleStepAdd = React.useCallback(
    async (weekday: number, title: string) => {
      try {
        const res = await fetch(`/api/routines/${routine.id}/steps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weekday, title }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(data?.message ?? 'Could not add step.');
        }
        const data = (await res.json().catch(() => null)) as
          | { ok: boolean; step?: DayStep }
          | null;
        if (data?.ok && data.step) {
          setSteps((prev) => ({
            ...prev,
            [weekday]: [...(prev[weekday] ?? []), data.step!],
          }));
        } else {
          await reloadStepsForWeekday(weekday);
        }
      } catch (e) {
        setBanner({
          variant: 'danger',
          message: e instanceof Error ? e.message : 'Could not add step.',
        });
        throw e;
      }
    },
    [routine.id, reloadStepsForWeekday],
  );

  const handleStepUpdate = React.useCallback(
    async (stepId: string, patch: { title?: string }) => {
      const prevSteps = steps;
      let weekdayOfStep = -1;
      for (let w = 0; w < 7; w++) {
        if ((prevSteps[w] ?? []).some((s) => s.id === stepId)) {
          weekdayOfStep = w;
          break;
        }
      }
      if (weekdayOfStep === -1) return;
      setSteps((prev) => ({
        ...prev,
        [weekdayOfStep]: (prev[weekdayOfStep] ?? []).map((s) =>
          s.id === stepId ? { ...s, title: patch.title ?? s.title } : s,
        ),
      }));
      try {
        const res = await fetch(
          `/api/routines/${routine.id}/steps/${stepId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(data?.message ?? 'Could not update step.');
        }
      } catch (e) {
        setSteps(prevSteps);
        setBanner({
          variant: 'danger',
          message: e instanceof Error ? e.message : 'Could not update step.',
        });
        throw e;
      }
    },
    [routine.id, steps],
  );

  const handleStepDelete = React.useCallback(
    async (stepId: string) => {
      const prevSteps = steps;
      let weekdayOfStep = -1;
      for (let w = 0; w < 7; w++) {
        if ((prevSteps[w] ?? []).some((s) => s.id === stepId)) {
          weekdayOfStep = w;
          break;
        }
      }
      if (weekdayOfStep === -1) return;
      setSteps((prev) => ({
        ...prev,
        [weekdayOfStep]: (prev[weekdayOfStep] ?? []).filter(
          (s) => s.id !== stepId,
        ),
      }));
      try {
        const res = await fetch(
          `/api/routines/${routine.id}/steps/${stepId}`,
          { method: 'DELETE' },
        );
        if (!res.ok) {
          throw new Error('Could not delete step.');
        }
        await reloadStepsForWeekday(weekdayOfStep);
      } catch (e) {
        setSteps(prevSteps);
        setBanner({
          variant: 'danger',
          message: e instanceof Error ? e.message : 'Could not delete step.',
        });
        throw e;
      }
    },
    [routine.id, steps, reloadStepsForWeekday],
  );

  const handleStepsReorder = React.useCallback(
    async (weekday: number, stepIds: string[]) => {
      const prevSteps = steps;
      const byId = new Map(
        (prevSteps[weekday] ?? []).map((s) => [s.id, s] as const),
      );
      const reordered: DayStep[] = [];
      for (let i = 0; i < stepIds.length; i++) {
        const s = byId.get(stepIds[i]!);
        if (s) reordered.push({ ...s, position: i });
      }
      setSteps((prev) => ({ ...prev, [weekday]: reordered }));
      try {
        const res = await fetch(
          `/api/routines/${routine.id}/steps/reorder`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weekday, stepIds }),
          },
        );
        if (!res.ok) {
          throw new Error('Could not reorder steps.');
        }
      } catch (e) {
        setSteps(prevSteps);
        setBanner({
          variant: 'danger',
          message: e instanceof Error ? e.message : 'Could not reorder steps.',
        });
        throw e;
      }
    },
    [routine.id, steps],
  );

  // -------------------------------------------------------------------------
  // Delete routine
  // -------------------------------------------------------------------------
  // Confirmation now flows through the Dialog primitive — the trigger
  // opens the dialog, the dialog's primary action calls the network. The
  // dialog stays open while pending and only closes on caller request.
  const handleDeleteRoutine = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/routines/${routine.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Could not delete routine.');
      }
      // Close the dialog before navigating so the body-scroll-lock
      // cleanup runs before the page unmounts.
      setDeleteDialogOpen(false);
      router.push('/routines');
    } catch (e) {
      setBanner({
        variant: 'danger',
        message: e instanceof Error ? e.message : 'Could not delete routine.',
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
          routine
        </div>
        <input
          style={titleInputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={onNameBlur}
          aria-label="Routine name"
          maxLength={100}
        />
        <textarea
          style={descInputStyle}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={onDescriptionBlur}
          aria-label="Routine description"
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
            value={routine.category}
            onSave={onCategorySave}
            label="Category"
            emptyPlaceholder="+ add category"
            data-testid="routine-category-field"
          />
          <InlineEditField
            value={routine.location}
            onSave={onLocationSave}
            label="Location"
            emptyPlaceholder="+ add location"
            data-testid="routine-location-field"
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

      <section
        aria-labelledby="schedule-h"
        style={{ marginTop: 'var(--s-5)' }}
      >
        <Card>
          <div className="rf-eyebrow" style={{ marginBottom: 'var(--s-3)' }}>
            <h2 id="schedule-h" style={{ all: 'inherit', margin: 0 }}>
              Schedule
            </h2>
          </div>
          <WeekdayChips
            selected={scheduleWeekdays}
            onChange={() => {
              /* read-only — see RoutineDetail comment */
            }}
            aria-label="Days this routine runs (derived from steps)"
          />
          <p
            style={{
              fontSize: 'var(--fs-xs)',
              color: 'var(--c-text-muted)',
              marginTop: 'var(--s-3)',
              letterSpacing: 'var(--tr-snug)',
            }}
          >
            {scheduleWeekdays.length === 0
              ? 'Add a step below to schedule a day.'
              : `Runs on ${scheduleWeekdays.length} day${scheduleWeekdays.length === 1 ? '' : 's'} a week. Add or remove steps below to change which days.`}
          </p>
        </Card>
      </section>

      <section
        aria-labelledby="steps-h"
        style={{ marginTop: 'var(--s-5)' }}
      >
        <div className="rf-eyebrow" style={{ marginBottom: 'var(--s-3)' }}>
          <h2 id="steps-h" style={{ all: 'inherit', margin: 0 }}>
            Steps by weekday
          </h2>
        </div>
        <DayStepEditor
          routineId={routine.id}
          daySteps={steps}
          onStepAdd={handleStepAdd}
          onStepUpdate={handleStepUpdate}
          onStepDelete={handleStepDelete}
          onStepsReorder={handleStepsReorder}
        />
      </section>

      {/* Per-routine reminders. Default weekdays for the add-form mirror the
          days this routine actually runs on. */}
      <div style={{ marginTop: 'var(--s-5)' }}>
        <SubjectSchedules
          subjectType="routine"
          subjectId={routine.id}
          defaultWeekdays={scheduleWeekdays}
        />
      </div>

      {/* Non-destructive actions (Duplicate) sit ABOVE the danger zone so
          destructive Delete is visually last. */}
      <RoutineDetailActions routineId={routine.id} routineName={name} />

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
                Delete this routine
              </div>
              <div
                style={{
                  fontSize: 'var(--fs-xs)',
                  color: 'var(--c-text-muted)',
                  marginTop: 2,
                  lineHeight: 1.5,
                }}
              >
                Archives the routine. Its history is preserved but it won&apos;t
                appear in your routines list anymore.
              </div>
            </div>
            <div>
              <Button
                variant="danger"
                onClick={() => setDeleteDialogOpen(true)}
                loading={deleting}
              >
                Delete routine
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
        title="Delete routine?"
        description="This will remove the routine and all of its steps. Past completions stay in your history."
        destructive
        primaryAction={{
          label: 'Delete routine',
          onClick: handleDeleteRoutine,
          pending: deleting,
        }}
      />
    </>
  );
}
