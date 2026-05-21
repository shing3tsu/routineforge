// @vitest-environment jsdom
/**
 * DayStepEditor tests.
 *
 * Surface area (per DayStepEditor.tsx):
 *   - Tab strip: 7 tabs (Mon..Sun) inside role="tablist"; active reflects to
 *     aria-selected=true. Switching shows that weekday's panel.
 *   - Add step: typing + submit calls onStepAdd(weekday, title). Error path:
 *     onStepAdd rejects, the parent is responsible for keeping the input state
 *     intact for retry — we assert the title is preserved.
 *   - Edit title: blur or Enter commits via onStepUpdate(stepId, { title }).
 *     Esc cancels without calling onStepUpdate.
 *   - Delete: clicking the per-row delete opens a <Dialog> primitive; only
 *     calls onStepDelete when the user confirms via the dialog's primary
 *     "Delete step" button. Cancel closes the dialog without delete.
 *   - Reorder: Move-up / Move-down buttons call onStepsReorder(weekday, ids)
 *     with the swapped permutation. (We avoid HTML5 DnD simulation in jsdom
 *     because dataTransfer.setData behavior is unreliable — the keyboard path
 *     covers the contract.)
 *
 * The parent owns the canonical state; tests pass `daySteps` and re-render
 * with updated props when verifying the cycle.
 */

import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  screen,
  cleanup,
  within,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayStepEditor, type DayStep } from '@/components/ui/DayStepEditor';

afterEach(() => {
  cleanup();
});

function makeStep(overrides: Partial<DayStep> = {}): DayStep {
  return {
    id: 's1',
    routineId: 'r1',
    weekday: 0,
    position: 1,
    title: 'Stretch',
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...overrides,
  };
}

function emptyDaySteps(): { [weekday: number]: DayStep[] } {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

function noopHandlers() {
  return {
    onStepAdd: vi.fn(async () => {}),
    onStepUpdate: vi.fn(async () => {}),
    onStepDelete: vi.fn(async () => {}),
    onStepsReorder: vi.fn(async () => {}),
  };
}

// ---------------------------------------------------------------------------
describe('DayStepEditor — tab strip', () => {
  it('renders a tablist labelled "Weekdays" with 7 tabs (Mon..Sun)', () => {
    const handlers = noopHandlers();
    render(
      <DayStepEditor
        routineId="r1"
        daySteps={emptyDaySteps()}
        {...handlers}
      />,
    );
    const tablist = screen.getByRole('tablist', { name: 'Weekdays' });
    expect(tablist).toBeInTheDocument();
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(7);
    // Visible labels are short forms.
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((label) => {
      expect(within(tablist).getByText(label)).toBeInTheDocument();
    });
  });

  it('defaults the active tab to the first weekday with steps', () => {
    const handlers = noopHandlers();
    const daySteps = emptyDaySteps();
    daySteps[2] = [makeStep({ id: 's-wed', weekday: 2, title: 'Wed step' })];
    render(
      <DayStepEditor
        routineId="r1"
        daySteps={daySteps}
        {...handlers}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    // Wednesday (idx 2) should be aria-selected=true; the rest false.
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[6]).toHaveAttribute('aria-selected', 'false');
  });

  it('defaults the active tab to Monday when no weekday has steps', () => {
    const handlers = noopHandlers();
    render(
      <DayStepEditor
        routineId="r1"
        daySteps={emptyDaySteps()}
        {...handlers}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking a tab switches the active panel to that weekday', async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    const daySteps = emptyDaySteps();
    daySteps[1] = [makeStep({ id: 's-tue', weekday: 1, title: 'Tuesday step' })];
    render(
      <DayStepEditor
        routineId="r1"
        daySteps={daySteps}
        {...handlers}
      />,
    );

    // Start: active is Tuesday (first with steps). The step title renders
    // inside a controlled <input value=...> so we query by display value.
    expect(screen.getByDisplayValue('Tuesday step')).toBeInTheDocument();

    // Switch to Monday.
    await user.click(screen.getAllByRole('tab')[0]!);
    // Monday is empty -> "Rest day" empty state shown.
    expect(screen.getByText('Rest day')).toBeInTheDocument();
    // The Tuesday step no longer renders.
    expect(screen.queryByDisplayValue('Tuesday step')).not.toBeInTheDocument();
  });

  it('Arrow keys move focus between tabs (manual activation per WAI-ARIA APG)', async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    render(
      <DayStepEditor
        routineId="r1"
        daySteps={emptyDaySteps()}
        {...handlers}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    tabs[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(tabs[1]).toHaveFocus();
    // Focusing moves the rover, but doesn't activate the panel (manual).
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('Enter on a focused tab activates that weekday (manual activation)', async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    const daySteps = emptyDaySteps();
    daySteps[3] = [makeStep({ id: 's-thu', weekday: 3, title: 'Thu step' })];
    render(
      <DayStepEditor
        routineId="r1"
        daySteps={daySteps}
        {...handlers}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    tabs[3]!.focus();
    // Move focus to Monday and press Enter to activate it.
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    await user.keyboard('{Enter}');
    // Monday is empty -> "Rest day".
    expect(screen.getByText('Rest day')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
describe('DayStepEditor — empty (rest day) state', () => {
  it('shows the "Rest day" empty state for a weekday with no steps', () => {
    const handlers = noopHandlers();
    render(
      <DayStepEditor
        routineId="r1"
        daySteps={emptyDaySteps()}
        {...handlers}
      />,
    );
    expect(screen.getByText('Rest day')).toBeInTheDocument();
    // The empty state mentions the active weekday's full name.
    expect(
      screen.getByText(/No steps for Monday\. Add one below/i),
    ).toBeInTheDocument();
  });

  it('renders the inline "Add" CTA in the empty state', () => {
    const handlers = noopHandlers();
    render(
      <DayStepEditor
        routineId="r1"
        daySteps={emptyDaySteps()}
        {...handlers}
      />,
    );
    expect(screen.getByLabelText('New step title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
describe('DayStepEditor — add step', () => {
  it('typing a title and submitting calls onStepAdd(activeWeekday, trimmedTitle)', async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    render(
      <DayStepEditor
        routineId="r1"
        daySteps={emptyDaySteps()}
        {...handlers}
      />,
    );
    const input = screen.getByLabelText('New step title');
    await user.type(input, '  Hydrate  ');
    await user.click(screen.getByRole('button', { name: /Add/ }));
    expect(handlers.onStepAdd).toHaveBeenCalledTimes(1);
    expect(handlers.onStepAdd).toHaveBeenCalledWith(0, 'Hydrate');
  });

  it('Add button is disabled when the input is empty / whitespace-only', () => {
    const handlers = noopHandlers();
    render(
      <DayStepEditor
        routineId="r1"
        daySteps={emptyDaySteps()}
        {...handlers}
      />,
    );
    // aria-disabled is set on the underlying Button when disabled prop is truthy.
    const addBtn = screen.getByRole('button', { name: /Add/ });
    expect(addBtn).toHaveAttribute('aria-disabled', 'true');
  });

  it('clears the input on successful add and re-focuses it for fast next-step entry', async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    const { rerender } = render(
      <DayStepEditor
        routineId="r1"
        daySteps={emptyDaySteps()}
        {...handlers}
      />,
    );
    const input = screen.getByLabelText('New step title') as HTMLInputElement;
    // Type + submit via Enter so the input retains focus across the submission
    // (clicking the submit button moves focus to the button first). This
    // exercises the same submitAdd path; the focus contract is what we care
    // about — after onStepAdd resolves, addInputRef.current?.focus() runs.
    await user.type(input, 'New step{Enter}');
    await waitFor(() => expect(input.value).toBe(''));
    await waitFor(() => expect(input).toHaveFocus());
    // Sanity: parent can now pass updated daySteps reflecting the new step.
    const next = emptyDaySteps();
    next[0] = [makeStep({ id: 'new-id', title: 'New step' })];
    rerender(
      <DayStepEditor
        routineId="r1"
        daySteps={next}
        {...handlers}
      />,
    );
    expect(screen.getByDisplayValue('New step')).toBeInTheDocument();
  });

  it('preserves the input value when onStepAdd rejects (revert-on-error)', async () => {
    // The source uses `void submitAdd()` in the form onSubmit — when
    // onStepAdd rejects, the rejection escapes as an unhandled-promise-
    // rejection. Install listeners on BOTH `window` and `process` so vitest's
    // own unhandled-rejection guard doesn't fail the test. This is a known
    // side-effect of the fire-and-forget submit pattern in the source.
    const onUnhandledWin = (e: PromiseRejectionEvent) => {
      if (e?.reason instanceof Error && /boom/.test(e.reason.message)) {
        e.preventDefault();
      }
    };
    const onUnhandledProc = (reason: unknown) => {
      if (reason instanceof Error && /boom/.test(reason.message)) {
        // Swallow expected rejection.
      } else {
        throw reason;
      }
    };
    window.addEventListener('unhandledrejection', onUnhandledWin);
    process.on('unhandledRejection', onUnhandledProc);
    try {
      const user = userEvent.setup();
      const handlers = noopHandlers();
      handlers.onStepAdd.mockRejectedValueOnce(new Error('boom'));
      render(
        <DayStepEditor
          routineId="r1"
          daySteps={emptyDaySteps()}
          {...handlers}
        />,
      );
      const input = screen.getByLabelText(
        'New step title',
      ) as HTMLInputElement;
      await user.type(input, 'Retry me{Enter}');
      // Wait for the finally block (setAdding(false)) to flip the input
      // back to interactive — proof the rejected promise settled.
      await waitFor(() => expect(input).not.toBeDisabled());
      // The input value is preserved for retry (the source only clears on the
      // resolve path).
      expect(input.value).toBe('Retry me');
      // Verify the parent's handler was indeed invoked once.
      expect(handlers.onStepAdd).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandledWin);
      process.off('unhandledRejection', onUnhandledProc);
    }
  });

  it('submitting via Enter inside the form triggers the add', async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    render(
      <DayStepEditor
        routineId="r1"
        daySteps={emptyDaySteps()}
        {...handlers}
      />,
    );
    const input = screen.getByLabelText('New step title');
    await user.type(input, 'Brush teeth{Enter}');
    expect(handlers.onStepAdd).toHaveBeenCalledTimes(1);
    expect(handlers.onStepAdd).toHaveBeenCalledWith(0, 'Brush teeth');
  });
});

// ---------------------------------------------------------------------------
describe('DayStepEditor — edit step title', () => {
  function renderWithOneStep() {
    const handlers = noopHandlers();
    const daySteps = emptyDaySteps();
    daySteps[0] = [makeStep({ id: 's1', title: 'Old title' })];
    const utils = render(
      <DayStepEditor
        routineId="r1"
        daySteps={daySteps}
        {...handlers}
      />,
    );
    return { ...utils, handlers };
  }

  it('renders the step title inside an input labelled "Step N title"', () => {
    renderWithOneStep();
    const input = screen.getByLabelText('Step 1 title') as HTMLInputElement;
    expect(input.value).toBe('Old title');
  });

  it('committing an edited title via blur calls onStepUpdate(stepId, { title })', async () => {
    const user = userEvent.setup();
    const { handlers } = renderWithOneStep();
    const input = screen.getByLabelText('Step 1 title') as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, 'New title');
    // Blur to commit.
    input.blur();
    // Microtask flush.
    await Promise.resolve();
    expect(handlers.onStepUpdate).toHaveBeenCalledTimes(1);
    expect(handlers.onStepUpdate).toHaveBeenCalledWith('s1', {
      title: 'New title',
    });
  });

  it('Enter commits the edit (and blurs the input)', async () => {
    const user = userEvent.setup();
    const { handlers } = renderWithOneStep();
    const input = screen.getByLabelText('Step 1 title') as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, 'Via Enter{Enter}');
    await Promise.resolve();
    expect(handlers.onStepUpdate).toHaveBeenCalledTimes(1);
    expect(handlers.onStepUpdate).toHaveBeenCalledWith('s1', {
      title: 'Via Enter',
    });
  });

  // Fixed by frontend dispatch (2026-05-17): a `justCancelledRef` set inside
  // `cancelEdit` is read-and-cleared by `commitEdit`, so the Esc-then-blur
  // race no longer reaches `onStepUpdate`. The `.fails` modifier was removed
  // because the test now passes (the bug is fixed).
  it('Escape cancels the edit (no onStepUpdate call) and restores the original', async () => {
    const user = userEvent.setup();
    const { handlers } = renderWithOneStep();
    const input = screen.getByLabelText('Step 1 title') as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, 'discard');
    await user.keyboard('{Escape}');
    expect(handlers.onStepUpdate).not.toHaveBeenCalled();
    // After Esc + blur, the input rerenders with the original step title.
    expect(input.value).toBe('Old title');
  });

  it('does not call onStepUpdate when the title is unchanged on blur', async () => {
    const user = userEvent.setup();
    const { handlers } = renderWithOneStep();
    const input = screen.getByLabelText('Step 1 title') as HTMLInputElement;
    await user.click(input);
    // No edits — just blur.
    input.blur();
    await Promise.resolve();
    expect(handlers.onStepUpdate).not.toHaveBeenCalled();
  });

  it('does not call onStepUpdate when the title is empty/whitespace on blur', async () => {
    const user = userEvent.setup();
    const { handlers } = renderWithOneStep();
    const input = screen.getByLabelText('Step 1 title') as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '   ');
    input.blur();
    await Promise.resolve();
    expect(handlers.onStepUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('DayStepEditor — delete step (via Dialog primitive)', () => {
  // The delete flow used to call window.confirm(). It was replaced by the
  // <Dialog> primitive (apps/web/components/ui/Dialog.tsx), which portals to
  // document.body — so we use top-level `screen` queries (which search the
  // whole document) rather than scoping within the editor's container.
  function renderWithOneStep() {
    const handlers = noopHandlers();
    const daySteps = emptyDaySteps();
    daySteps[0] = [makeStep({ id: 's1', title: 'Cleanser' })];
    const utils = render(
      <DayStepEditor
        routineId="r1"
        daySteps={daySteps}
        {...handlers}
      />,
    );
    return { ...utils, handlers };
  }

  it('opens a confirmation dialog naming the step when the per-row delete is clicked', async () => {
    const user = userEvent.setup();
    renderWithOneStep();
    await user.click(screen.getByRole('button', { name: 'Delete step 1' }));
    // Dialog portals to document.body; `findByRole` waits for the mount
    // effect to flip from null → portalled content.
    const dialog = await screen.findByRole('dialog', { name: /Delete step\??/i });
    expect(dialog).toBeInTheDocument();
    // The description names the step. Quotes in the source are curly (“ ”),
    // so we just look for the step title substring.
    expect(within(dialog).getByText(/Cleanser/)).toBeInTheDocument();
  });

  it('clicking the dialog primary action calls onStepDelete(stepId) and closes the dialog', async () => {
    const user = userEvent.setup();
    const { handlers } = renderWithOneStep();
    await user.click(screen.getByRole('button', { name: 'Delete step 1' }));
    const dialog = await screen.findByRole('dialog', { name: /Delete step\??/i });
    // The primary button label is "Delete step" (no trailing number) — match
    // the exact accessible name to avoid the per-row "Delete step N" button.
    await user.click(within(dialog).getByRole('button', { name: 'Delete step' }));
    expect(handlers.onStepDelete).toHaveBeenCalledTimes(1);
    expect(handlers.onStepDelete).toHaveBeenCalledWith('s1');
    // confirmDelete clears deleteTarget on success, which unmounts the Dialog.
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('clicking Cancel closes the dialog without calling onStepDelete', async () => {
    const user = userEvent.setup();
    const { handlers } = renderWithOneStep();
    await user.click(screen.getByRole('button', { name: 'Delete step 1' }));
    const dialog = await screen.findByRole('dialog', { name: /Delete step\??/i });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(handlers.onStepDelete).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
});

// ---------------------------------------------------------------------------
describe('DayStepEditor — reorder via Move up / Move down', () => {
  function renderWithThreeSteps() {
    const handlers = noopHandlers();
    const daySteps = emptyDaySteps();
    daySteps[0] = [
      makeStep({ id: 'a', title: 'A', position: 1 }),
      makeStep({ id: 'b', title: 'B', position: 2 }),
      makeStep({ id: 'c', title: 'C', position: 3 }),
    ];
    const utils = render(
      <DayStepEditor
        routineId="r1"
        daySteps={daySteps}
        {...handlers}
      />,
    );
    return { ...utils, handlers };
  }

  it('Move up on step 2 swaps it with step 1 -> reorder is [b, a, c]', async () => {
    const user = userEvent.setup();
    const { handlers } = renderWithThreeSteps();
    await user.click(screen.getByRole('button', { name: 'Move step 2 up' }));
    expect(handlers.onStepsReorder).toHaveBeenCalledTimes(1);
    expect(handlers.onStepsReorder).toHaveBeenCalledWith(0, ['b', 'a', 'c']);
  });

  it('Move down on step 1 swaps it with step 2 -> reorder is [b, a, c]', async () => {
    const user = userEvent.setup();
    const { handlers } = renderWithThreeSteps();
    await user.click(screen.getByRole('button', { name: 'Move step 1 down' }));
    expect(handlers.onStepsReorder).toHaveBeenCalledTimes(1);
    expect(handlers.onStepsReorder).toHaveBeenCalledWith(0, ['b', 'a', 'c']);
  });

  it('Move up on the first step is disabled', () => {
    renderWithThreeSteps();
    const upBtn = screen.getByRole('button', { name: 'Move step 1 up' });
    expect(upBtn).toBeDisabled();
  });

  it('Move down on the last step is disabled', () => {
    renderWithThreeSteps();
    const downBtn = screen.getByRole('button', { name: 'Move step 3 down' });
    expect(downBtn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
describe('DayStepEditor — drag-and-drop reorder (light contract)', () => {
  // jsdom does not implement full HTML5 DnD; setData / getData on dataTransfer
  // may behave unexpectedly. We simulate by firing the React synthetic events
  // directly. We assert the SAME callback contract as the keyboard path so the
  // path used by the actual UI is covered.
  it('drop fires onStepsReorder with the source moved into the target position', async () => {
    const handlers = noopHandlers();
    const daySteps = emptyDaySteps();
    daySteps[0] = [
      makeStep({ id: 'a', title: 'A' }),
      makeStep({ id: 'b', title: 'B' }),
      makeStep({ id: 'c', title: 'C' }),
    ];
    render(
      <DayStepEditor
        routineId="r1"
        daySteps={daySteps}
        {...handlers}
      />,
    );
    // Each <li> is identified by its aria-labelled input ("Step N title");
    // we navigate to the parent <li>.
    const stepInputs = screen
      .getAllByLabelText(/Step \d+ title/)
      .map((i) => i.closest('li'));
    const sourceLi = stepInputs[0]!;
    const targetLi = stepInputs[2]!;
    expect(sourceLi).not.toBeNull();
    expect(targetLi).not.toBeNull();

    // Build a minimal dataTransfer object jsdom is happy with.
    const data = new Map<string, string>();
    const dt = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: (type: string, value: string) => {
        data.set(type, value);
      },
      getData: (type: string) => data.get(type) ?? '',
      types: [],
    } as unknown as DataTransfer;

    fireEvent.dragStart(sourceLi, { dataTransfer: dt });
    fireEvent.dragOver(targetLi, { dataTransfer: dt });
    fireEvent.drop(targetLi, { dataTransfer: dt });

    expect(handlers.onStepsReorder).toHaveBeenCalledTimes(1);
    // The component splices the source OUT (idx 0) and INSERTS it AT the
    // target's index in the post-removal array. After removing 'a' from
    // [a,b,c] we get [b,c]; inserting 'a' at idx 2 yields [b,c,a].
    expect(handlers.onStepsReorder).toHaveBeenCalledWith(0, ['b', 'c', 'a']);
  });
});

// ---------------------------------------------------------------------------
describe('DayStepEditor — step list a11y', () => {
  it('renders the steps inside a <ul role="list">', () => {
    const handlers = noopHandlers();
    const daySteps = emptyDaySteps();
    daySteps[0] = [makeStep({ id: 'a', title: 'A' })];
    render(
      <DayStepEditor
        routineId="r1"
        daySteps={daySteps}
        {...handlers}
      />,
    );
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('UL');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });

  it('each step row is draggable when not in a transient state', () => {
    const handlers = noopHandlers();
    const daySteps = emptyDaySteps();
    daySteps[0] = [makeStep({ id: 'a', title: 'A' })];
    render(
      <DayStepEditor
        routineId="r1"
        daySteps={daySteps}
        {...handlers}
      />,
    );
    const li = screen.getByRole('listitem');
    expect(li).toHaveAttribute('draggable', 'true');
  });
});
