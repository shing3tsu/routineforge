/**
 * WeekdayChips — Mon–Sun selectable chip row.
 *
 * Consumes the global `.rf-chips` + `.rf-chip` from `design/base.css`:
 *   - `.rf-chips`            — flex container (`role="group"`)
 *   - `.rf-chip`             — individual chip (mono caps label, 44px tall)
 *   - `.rf-chip[aria-pressed="true"]`  — selected fill
 *   - `.rf-chip--rest`       — rest-day marker (line-through, transparent)
 *
 * Matches `design/components.md#WeekdayChips`. Weekday convention:
 * 0=Mon..6=Sun (matches the routines backend).
 *
 * Props:
 *   - selected:  the array of currently-selected weekdays (numbers 0..6).
 *   - onChange:  called with the new array when a chip is toggled. In single
 *                mode this is always a 0- or 1-length array. In multi mode the
 *                array is sorted ascending for stable diffs.
 *   - mode:      'multi' (default) or 'single'. Single chooses radiogroup
 *                ARIA semantics; multi uses aria-pressed buttons.
 *   - restDays:  optional array of weekdays to flag as rest (renders the
 *                `.rf-chip--rest` modifier without affecting selection).
 *   - disabled:  disables the whole group (all chips become non-interactive).
 *
 * The component is keyboard-operable: Tab into the group, Left/Right arrows
 * move focus between chips (roving tabindex), Space/Enter toggle.
 *
 * Visible label: single mono character (Mon→M, Sun→S — Tue and Thu both
 * map to T, Sat and Sun both map to S, matching the .rf-chip spec). The
 * full weekday name is in `aria-label` for screen readers.
 */
'use client';

import * as React from 'react';

type WeekdayMode = 'multi' | 'single';

export type WeekdayChipsProps = {
  selected: number[];
  onChange: (selected: number[]) => void;
  disabled?: boolean;
  mode?: WeekdayMode;
  /** Indices (0..6) to render with the `--rest` visual modifier. */
  restDays?: number[];
  /** Optional accessible label for the chip group. */
  'aria-label'?: string;
  /** Optional id of a labelling element. Takes precedence over aria-label. */
  'aria-labelledby'?: string;
};

const WEEKDAYS: ReadonlyArray<{
  value: number;
  short: string;
  full: string;
}> = [
  { value: 0, short: 'Mo', full: 'Monday' },
  { value: 1, short: 'Tu', full: 'Tuesday' },
  { value: 2, short: 'We', full: 'Wednesday' },
  { value: 3, short: 'Th', full: 'Thursday' },
  { value: 4, short: 'Fr', full: 'Friday' },
  { value: 5, short: 'Sa', full: 'Saturday' },
  { value: 6, short: 'Su', full: 'Sunday' },
];

function toggle(set: number[], value: number): number[] {
  const has = set.includes(value);
  const next = has ? set.filter((v) => v !== value) : [...set, value];
  next.sort((a, b) => a - b);
  return next;
}

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export function WeekdayChips({
  selected,
  onChange,
  disabled = false,
  mode = 'multi',
  restDays,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: WeekdayChipsProps) {
  const initialFocusIndex = React.useMemo(() => {
    if (selected.length === 0) return 0;
    const firstSel = WEEKDAYS.findIndex((w) => w.value === selected[0]);
    return firstSel === -1 ? 0 : firstSel;
  }, [selected]);
  const [focusIndex, setFocusIndex] = React.useState(initialFocusIndex);
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const focusChip = React.useCallback((idx: number) => {
    const safe = (idx + WEEKDAYS.length) % WEEKDAYS.length;
    setFocusIndex(safe);
    buttonRefs.current[safe]?.focus();
  }, []);

  const handleKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) => {
    if (disabled) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      focusChip(idx + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusChip(idx - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusChip(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusChip(WEEKDAYS.length - 1);
    }
  };

  const handleToggle = (value: number) => {
    if (disabled) return;
    if (mode === 'single') {
      onChange(selected.includes(value) ? [] : [value]);
    } else {
      onChange(toggle(selected, value));
    }
  };

  // Accessibility wiring: single mode uses radiogroup semantics; multi mode
  // uses an unlabelled group of toggle-buttons.
  const groupRole = mode === 'single' ? 'radiogroup' : 'group';

  return (
    <div
      role={groupRole}
      aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? 'Weekdays')}
      aria-labelledby={ariaLabelledBy}
      aria-disabled={disabled || undefined}
      className="rf-chips"
    >
      {WEEKDAYS.map((day, idx) => {
        const isSelected = selected.includes(day.value);
        const isRest = restDays?.includes(day.value) ?? false;
        const tabIndex = idx === focusIndex ? 0 : -1;
        // Test compatibility: keep the legacy "selected" + "disabled" class
        // fragments alongside the new aria-driven .rf-chip styling so the
        // existing test suite keeps passing.
        const className = classes(
          'rf-chip',
          isRest && 'rf-chip--rest',
          isSelected && 'selected',
          disabled && 'disabled',
        );
        const refCallback = (el: HTMLButtonElement | null) => {
          buttonRefs.current[idx] = el;
        };
        const handleClick = () => handleToggle(day.value);
        const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) =>
          handleKey(e, idx);
        const handleFocusEvt = () => setFocusIndex(idx);

        if (mode === 'single') {
          return (
            <button
              key={day.value}
              ref={refCallback}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={day.full}
              className={className}
              tabIndex={tabIndex}
              disabled={disabled}
              onClick={handleClick}
              onKeyDown={handleKeyDown}
              onFocus={handleFocusEvt}
            >
              <span aria-hidden="true">{day.short}</span>
            </button>
          );
        }
        return (
          <button
            key={day.value}
            ref={refCallback}
            type="button"
            aria-pressed={isSelected}
            aria-label={day.full}
            className={className}
            tabIndex={tabIndex}
            disabled={disabled}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onFocus={handleFocusEvt}
          >
            <span aria-hidden="true">{day.short}</span>
          </button>
        );
      })}
    </div>
  );
}
