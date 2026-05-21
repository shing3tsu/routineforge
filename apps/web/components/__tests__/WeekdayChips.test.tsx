// @vitest-environment jsdom
/**
 * WeekdayChips tests.
 *
 * Per WeekdayChips.tsx:
 *   - 7 buttons (Mon..Sun); full name via aria-label, two-letter visible label.
 *   - multi mode: `<button aria-pressed>` inside `role="group"`.
 *   - single mode: `<button role="radio" aria-checked>` inside `role="radiogroup"`.
 *   - Roving tabindex: one focusable chip at a time (initially the first
 *     selected, or chip 0).
 *   - Keyboard: Arrow keys move focus; Space/Enter activate (via native button
 *     semantics — onClick fires on those keys for real <button> elements).
 *   - disabled: sets native `disabled` on every chip + aria-disabled on group;
 *     handlers no-op.
 */

import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeekdayChips } from '@/components/ui/WeekdayChips';

afterEach(() => {
  cleanup();
});

describe('WeekdayChips — rendering & accessibility wiring', () => {
  it('renders 7 buttons with full weekday names as accessible labels (multi mode)', () => {
    render(<WeekdayChips selected={[]} onChange={() => {}} />);
    const group = screen.getByRole('group');
    expect(group).toBeInTheDocument();
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(7);
    expect(within(group).getByRole('button', { name: 'Monday' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Tuesday' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Wednesday' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Thursday' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Friday' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Saturday' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Sunday' })).toBeInTheDocument();
  });

  it('uses role="radiogroup" in single mode with role="radio" children', () => {
    render(<WeekdayChips selected={[]} onChange={() => {}} mode="single" />);
    const group = screen.getByRole('radiogroup');
    expect(group).toBeInTheDocument();
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(7);
  });

  it('uses "Weekdays" as the default group aria-label', () => {
    render(<WeekdayChips selected={[]} onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Weekdays' })).toBeInTheDocument();
  });

  it('honors a custom aria-label on the group', () => {
    render(
      <WeekdayChips
        selected={[]}
        onChange={() => {}}
        aria-label="Schedule"
      />,
    );
    expect(screen.getByRole('group', { name: 'Schedule' })).toBeInTheDocument();
  });

  it('honors aria-labelledby (takes precedence over aria-label)', () => {
    render(
      <>
        <span id="ext-label">External</span>
        <WeekdayChips
          selected={[]}
          onChange={() => {}}
          aria-labelledby="ext-label"
          aria-label="ignored"
        />
      </>,
    );
    const group = screen.getByRole('group');
    expect(group).toHaveAttribute('aria-labelledby', 'ext-label');
    expect(group).not.toHaveAttribute('aria-label');
  });
});

describe('WeekdayChips — selection state', () => {
  it('multi: `selected={[0, 2]}` sets aria-pressed=true on Mon + Wed only', () => {
    render(<WeekdayChips selected={[0, 2]} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Wednesday' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Tuesday' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('single: `selected={[3]}` sets aria-checked=true on Thursday only', () => {
    render(
      <WeekdayChips selected={[3]} onChange={() => {}} mode="single" />,
    );
    expect(screen.getByRole('radio', { name: 'Thursday' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Monday' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('applies the selected class to selected chips', () => {
    render(<WeekdayChips selected={[1]} onChange={() => {}} />);
    const tuesday = screen.getByRole('button', { name: 'Tuesday' });
    expect(tuesday.className).toMatch(/selected/);
    const monday = screen.getByRole('button', { name: 'Monday' });
    expect(monday.className).not.toMatch(/selected/);
  });
});

describe('WeekdayChips — multi mode click behavior', () => {
  it('clicking an unselected chip ADDS it (sorted)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayChips selected={[2]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Monday' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([0, 2]);
  });

  it('clicking a selected chip REMOVES it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayChips selected={[0, 2, 4]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Wednesday' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([0, 4]);
  });

  it('sorts the resulting array ascending for stable diffs', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayChips selected={[6, 0]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Wednesday' }));
    expect(onChange).toHaveBeenCalledWith([0, 2, 6]);
  });
});

describe('WeekdayChips — single mode click behavior', () => {
  it('clicking an unselected chip REPLACES the array (single mode)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WeekdayChips selected={[2]} onChange={onChange} mode="single" />,
    );
    await user.click(screen.getByRole('radio', { name: 'Friday' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([4]);
  });

  it('clicking the already-selected chip CLEARS it (empty array)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WeekdayChips selected={[2]} onChange={onChange} mode="single" />,
    );
    await user.click(screen.getByRole('radio', { name: 'Wednesday' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe('WeekdayChips — keyboard activation', () => {
  it('Enter activates a focused chip (native button semantics)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayChips selected={[]} onChange={onChange} />);
    const monday = screen.getByRole('button', { name: 'Monday' });
    monday.focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([0]);
  });

  it('Space activates a focused chip', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayChips selected={[]} onChange={onChange} />);
    const monday = screen.getByRole('button', { name: 'Monday' });
    monday.focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([0]);
  });

  it('ArrowRight on a focused chip moves focus to the next chip (roving tabindex)', async () => {
    const user = userEvent.setup();
    render(<WeekdayChips selected={[]} onChange={() => {}} />);
    const monday = screen.getByRole('button', { name: 'Monday' });
    monday.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Tuesday' })).toHaveFocus();
  });

  it('ArrowLeft on the first chip wraps to the last chip', async () => {
    const user = userEvent.setup();
    render(<WeekdayChips selected={[]} onChange={() => {}} />);
    const monday = screen.getByRole('button', { name: 'Monday' });
    monday.focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveFocus();
  });

  it('Home jumps focus to Monday; End to Sunday', async () => {
    const user = userEvent.setup();
    render(<WeekdayChips selected={[]} onChange={() => {}} />);
    const thursday = screen.getByRole('button', { name: 'Thursday' });
    thursday.focus();
    await user.keyboard('{End}');
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveFocus();
  });
});

describe('WeekdayChips — roving tabindex', () => {
  it('only the initial focus chip is tab-focusable (tabIndex=0); rest are -1', () => {
    render(<WeekdayChips selected={[2]} onChange={() => {}} />);
    // First selected = Wednesday (idx 2) is the initial focus target.
    expect(screen.getByRole('button', { name: 'Wednesday' })).toHaveAttribute(
      'tabindex',
      '0',
    );
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('with nothing selected the first chip (Monday) is tabbable', () => {
    render(<WeekdayChips selected={[]} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });
});

describe('WeekdayChips — disabled state', () => {
  it('sets aria-disabled="true" on the group when disabled', () => {
    render(<WeekdayChips selected={[]} onChange={() => {}} disabled />);
    expect(screen.getByRole('group')).toHaveAttribute('aria-disabled', 'true');
  });

  it('sets the native disabled attribute on every chip', () => {
    render(<WeekdayChips selected={[]} onChange={() => {}} disabled />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((b) => expect(b).toBeDisabled());
  });

  it('applies the disabled class to chips when disabled', () => {
    render(<WeekdayChips selected={[]} onChange={() => {}} disabled />);
    const monday = screen.getByRole('button', { name: 'Monday' });
    expect(monday.className).toMatch(/disabled/);
  });

  it('does NOT call onChange when a disabled chip is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayChips selected={[]} onChange={onChange} disabled />);
    await user.click(screen.getByRole('button', { name: 'Monday' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
