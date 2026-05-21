/**
 * DayStepEditor — centerpiece of the routine detail page.
 *
 * Anatomy per `design/components.md#DayStepEditor`:
 *   - Weekday tab strip across the top (7 tabs Mon..Sun). Consumes the
 *     global `.rf-tabs` + `.rf-tab` classes from `design/base.css`. A tab
 *     marked rest (no steps) gets the `data-rest="true"` attribute, which
 *     base.css renders with line-through + muted colour.
 *   - Step list under the active tab. Each step uses a `CheckRow`-style row
 *     to render the drag handle + position number + inline-editable title
 *     + action icons.
 *   - Bottom: an inline "+ Add step" input.
 *   - Empty weekday: rest-day empty state with a "+ Add step" CTA.
 *
 * Layout chrome that base.css doesn't ship (the surrounding container, the
 * add-step form, the drag-handle styling) lives in the small accompanying
 * `DayStepEditor.module.css`.
 *
 * State model:
 *   - The parent passes in `daySteps` as the canonical state. The component
 *     keeps a local mirror so we can do optimistic UI on the title edits
 *     without round-tripping through the server.
 *
 * Drag-and-drop and keyboard reorder behaviour is preserved verbatim from
 * the previous implementation (the `justCancelledRef` Escape-cancel fix
 * stays). The dispatch's brief explicitly calls this out.
 */
'use client';

import * as React from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import styles from './DayStepEditor.module.css';

export type DayStep = {
  id: string;
  routineId: string;
  weekday: number;
  position: number;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type DayStepEditorProps = {
  routineId: string;
  daySteps: { [weekday: number]: DayStep[] };
  onStepAdd: (weekday: number, title: string) => Promise<void>;
  onStepUpdate: (stepId: string, patch: { title?: string }) => Promise<void>;
  onStepDelete: (stepId: string) => Promise<void>;
  onStepsReorder: (weekday: number, stepIds: string[]) => Promise<void>;
};

const WEEKDAYS_SHORT: ReadonlyArray<string> = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
];
const WEEKDAYS_FULL: ReadonlyArray<string> = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export function DayStepEditor({
  daySteps,
  onStepAdd,
  onStepUpdate,
  onStepDelete,
  onStepsReorder,
}: DayStepEditorProps) {
  const initialActive = React.useMemo<number>(() => {
    for (let i = 0; i < 7; i++) {
      if ((daySteps[i] ?? []).length > 0) return i;
    }
    return 0;
  }, [daySteps]);
  const [active, setActive] = React.useState<number>(initialActive);

  const activeSteps = React.useMemo(
    () => daySteps[active] ?? [],
    [daySteps, active],
  );

  // Tab keyboard nav (manual activation per spec) -----------------------------
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [focusedTab, setFocusedTab] = React.useState<number>(initialActive);
  const focusTab = React.useCallback((idx: number) => {
    const safe = (idx + 7) % 7;
    setFocusedTab(safe);
    tabRefs.current[safe]?.focus();
  }, []);

  const handleTabKey = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusTab(idx + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusTab(idx - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusTab(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusTab(6);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setActive(idx);
    }
  };

  // Add step -----------------------------------------------------------------
  const [newTitle, setNewTitle] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const addInputRef = React.useRef<HTMLInputElement | null>(null);

  const submitAdd = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      await onStepAdd(active, trimmed);
      setNewTitle('');
      addInputRef.current?.focus();
    } finally {
      setAdding(false);
    }
  };

  // Edit step title (inline). See justCancelledRef note in the previous file. -
  const [pendingTitles, setPendingTitles] = React.useState<
    Record<string, string>
  >({});
  const [savingStepId, setSavingStepId] = React.useState<string | null>(null);
  const justCancelledRef = React.useRef<Set<string>>(new Set());

  const startEdit = (step: DayStep) => {
    setPendingTitles((prev) => ({ ...prev, [step.id]: step.title }));
  };
  const handleTitleChange = (stepId: string, value: string) => {
    setPendingTitles((prev) => ({ ...prev, [stepId]: value }));
  };
  const commitEdit = async (step: DayStep) => {
    if (justCancelledRef.current.has(step.id)) {
      justCancelledRef.current.delete(step.id);
      return;
    }
    const next = pendingTitles[step.id];
    if (next === undefined) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === step.title) {
      setPendingTitles((prev) => {
        const copy = { ...prev };
        delete copy[step.id];
        return copy;
      });
      return;
    }
    setSavingStepId(step.id);
    try {
      await onStepUpdate(step.id, { title: trimmed });
    } finally {
      setSavingStepId(null);
      setPendingTitles((prev) => {
        const copy = { ...prev };
        delete copy[step.id];
        return copy;
      });
    }
  };
  const cancelEdit = (stepId: string) => {
    justCancelledRef.current.add(stepId);
    setPendingTitles((prev) => {
      const copy = { ...prev };
      delete copy[stepId];
      return copy;
    });
  };

  // Delete step (via Dialog primitive) --------------------------------------
  // We keep the target step in local state so the Dialog can name it in
  // the description, and so we know which step to delete when the user
  // confirms. Closing the dialog clears the target.
  const [deletingStepId, setDeletingStepId] = React.useState<string | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = React.useState<DayStep | null>(null);
  const handleDelete = (step: DayStep) => {
    setDeleteTarget(step);
  };
  const confirmDelete = async () => {
    const step = deleteTarget;
    if (!step) return;
    setDeletingStepId(step.id);
    try {
      await onStepDelete(step.id);
      setDeleteTarget(null);
    } catch {
      // The parent's handler surfaces its own error banner; we just close
      // the dialog so the user can retry.
      setDeleteTarget(null);
    } finally {
      setDeletingStepId(null);
    }
  };

  // Drag-and-drop (within a single weekday) ---------------------------------
  const [dragSourceId, setDragSourceId] = React.useState<string | null>(null);
  const [dragOverId, setDragOverId] = React.useState<string | null>(null);
  const [reordering, setReordering] = React.useState(false);

  const handleDragStart = (
    e: React.DragEvent<HTMLLIElement>,
    stepId: string,
  ) => {
    setDragSourceId(stepId);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', stepId);
    } catch {
      // intentionally ignore
    }
  };
  const handleDragOver = (
    e: React.DragEvent<HTMLLIElement>,
    stepId: string,
  ) => {
    if (!dragSourceId || dragSourceId === stepId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(stepId);
  };
  const handleDragLeave = (stepId: string) => {
    setDragOverId((prev) => (prev === stepId ? null : prev));
  };
  const handleDragEnd = () => {
    setDragSourceId(null);
    setDragOverId(null);
  };
  const handleDrop = async (
    e: React.DragEvent<HTMLLIElement>,
    targetStepId: string,
  ) => {
    e.preventDefault();
    const sourceId = dragSourceId;
    setDragSourceId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetStepId) return;

    const ids = activeSteps.map((s) => s.id);
    const fromIdx = ids.indexOf(sourceId);
    const toIdx = ids.indexOf(targetStepId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...ids];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, sourceId);

    setReordering(true);
    try {
      await onStepsReorder(active, reordered);
    } finally {
      setReordering(false);
    }
  };

  // Keyboard reorder (Move up / Move down) ----------------------------------
  const moveStep = async (stepId: string, direction: 'up' | 'down') => {
    const ids = activeSteps.map((s) => s.id);
    const idx = ids.indexOf(stepId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ids.length) return;
    const reordered = [...ids];
    [reordered[idx], reordered[swapIdx]] = [
      reordered[swapIdx]!,
      reordered[idx]!,
    ];
    setReordering(true);
    try {
      await onStepsReorder(active, reordered);
    } finally {
      setReordering(false);
    }
  };

  // Render ------------------------------------------------------------------

  const deletePending = deletingStepId === deleteTarget?.id;
  return (
    <>
    <div className={styles.root}>
      {/* Tab strip — uses the global `.rf-tabs` / `.rf-tab` styling. */}
      <div role="tablist" aria-label="Weekdays" className="rf-tabs">
        {WEEKDAYS_SHORT.map((short, idx) => {
          const count = (daySteps[idx] ?? []).length;
          const isActive = active === idx;
          const isRest = count === 0;
          return (
            <button
              key={idx}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              type="button"
              role="tab"
              id={`day-tab-${idx}`}
              aria-controls={`day-panel-${idx}`}
              aria-selected={isActive}
              data-rest={isRest ? 'true' : undefined}
              tabIndex={idx === focusedTab ? 0 : -1}
              className="rf-tab"
              onClick={() => {
                setActive(idx);
                setFocusedTab(idx);
              }}
              onFocus={() => setFocusedTab(idx)}
              onKeyDown={(e) => handleTabKey(e, idx)}
            >
              {short}
            </button>
          );
        })}
      </div>

      {/* Active day panel */}
      <div
        role="tabpanel"
        id={`day-panel-${active}`}
        aria-labelledby={`day-tab-${active}`}
        className={styles.panel}
      >
        {activeSteps.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>Rest day</div>
            <div className={styles.emptyDesc}>
              No steps for {WEEKDAYS_FULL[active]}. Add one below if you change
              your mind.
            </div>
          </div>
        ) : (
          <ul
            className={styles.list}
            role="list"
            aria-busy={reordering || undefined}
          >
            {activeSteps.map((step, idx) => {
              const pendingTitle = pendingTitles[step.id];
              const isEditing = pendingTitle !== undefined;
              const titleValue = isEditing ? pendingTitle : step.title;
              const isSaving = savingStepId === step.id;
              const isDeleting = deletingStepId === step.id;
              const isDragSource = dragSourceId === step.id;
              const isDragOver = dragOverId === step.id;
              return (
                <li
                  key={step.id}
                  draggable={!isEditing && !isSaving && !isDeleting}
                  onDragStart={(e) => handleDragStart(e, step.id)}
                  onDragOver={(e) => handleDragOver(e, step.id)}
                  onDragLeave={() => handleDragLeave(step.id)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, step.id)}
                  className={classes(
                    styles.row,
                    isDragSource && styles.rowDragging,
                    isDragOver && styles.rowDropTarget,
                  )}
                >
                  <span
                    className={styles.handle}
                    aria-hidden="true"
                    title="Drag to reorder"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      focusable="false"
                    >
                      <line x1="3" y1="5" x2="11" y2="5" />
                      <line x1="3" y1="9" x2="11" y2="9" />
                    </svg>
                  </span>
                  <span className={classes(styles.num, 'mono')} aria-hidden="true">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <input
                    className={styles.input}
                    value={titleValue}
                    aria-label={`Step ${idx + 1} title`}
                    disabled={isSaving || isDeleting}
                    onFocus={() => startEdit(step)}
                    onChange={(e) =>
                      handleTitleChange(step.id, e.target.value)
                    }
                    onBlur={() => commitEdit(step)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.currentTarget.blur();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelEdit(step.id);
                        e.currentTarget.blur();
                      }
                    }}
                  />
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => moveStep(step.id, 'up')}
                      disabled={idx === 0 || reordering}
                      aria-label={`Move step ${idx + 1} up`}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="m6 15 6-6 6 6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => moveStep(step.id, 'down')}
                      disabled={idx === activeSteps.length - 1 || reordering}
                      aria-label={`Move step ${idx + 1} down`}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtnDanger}
                      onClick={() => handleDelete(step)}
                      disabled={isDeleting}
                      aria-label={`Delete step ${idx + 1}`}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      </svg>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Add step (inline) */}
        <form
          className={styles.addRow}
          onSubmit={(e) => {
            e.preventDefault();
            void submitAdd();
          }}
        >
          <span className={styles.addIcon} aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              focusable="false"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <input
            ref={addInputRef}
            className={styles.addInput}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={`Add a step for ${WEEKDAYS_FULL[active]}`}
            aria-label="New step title"
            maxLength={200}
            disabled={adding}
          />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            loading={adding}
            disabled={!newTitle.trim()}
          >
            Add
          </Button>
        </form>
      </div>
    </div>

    <Dialog
      open={deleteTarget !== null}
      onClose={() => {
        if (deletePending) return;
        setDeleteTarget(null);
      }}
      title="Delete step?"
      description={
        deleteTarget
          ? `“${deleteTarget.title}” will be removed from this weekday.`
          : undefined
      }
      destructive
      primaryAction={{
        label: 'Delete step',
        onClick: confirmDelete,
        pending: deletePending,
      }}
    />
    </>
  );
}
