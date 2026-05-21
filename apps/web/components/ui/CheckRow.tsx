/**
 * CheckRow — a tappable row composed of a Checkbox + label.
 *
 * Uses the global `.rf-checkrow` + `.rf-checkrow__label` styles from
 * `design/base.css`. The whole row is the click target; the inner Checkbox
 * is `aria-hidden` so screen readers only announce the row once.
 *
 * The outer surface is a `<button role="button" aria-pressed>` so toggling
 * is fully keyboard-operable (Space / Enter) AND screen readers correctly
 * announce the new state.
 *
 * Sizes mirror the underlying Checkbox: `lg` (32px check), `xl` (36px check).
 * The default is `lg` per the spec — CheckRow is meant for the today / step
 * list contexts, which is always 32+px.
 */
'use client';

import * as React from 'react';
import { Checkbox } from './Checkbox';

type RowSize = 'lg' | 'xl';

export type CheckRowProps = {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  size?: RowSize;
  disabled?: boolean;
  /** Optional trailing meta rendered after the label (e.g. mono streak count). */
  meta?: React.ReactNode;
  className?: string;
  /** Override the accessible name (defaults to the label). */
  'aria-label'?: string;
};

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export const CheckRow = React.forwardRef<HTMLButtonElement, CheckRowProps>(
  function CheckRow(
    {
      label,
      checked,
      onChange,
      size = 'lg',
      disabled = false,
      meta,
      className,
      'aria-label': ariaLabel,
    },
    ref,
  ) {
    const handleToggle = () => {
      if (disabled) return;
      onChange(!checked);
    };
    return (
      <button
        ref={ref}
        type="button"
        role="button"
        aria-pressed={checked}
        aria-label={ariaLabel ?? label}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        data-done={checked || undefined}
        className={classes('rf-checkrow', className)}
        onClick={handleToggle}
      >
        <Checkbox
          checked={checked}
          onChange={(next) => {
            if (disabled) return;
            onChange(next);
          }}
          size={size}
          disabled={disabled}
          aria-hidden
        />
        <span className="rf-checkrow__label">{label}</span>
        {meta != null ? <span className="rf-checkrow__meta">{meta}</span> : null}
      </button>
    );
  },
);
