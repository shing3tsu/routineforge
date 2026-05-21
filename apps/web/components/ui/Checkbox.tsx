/**
 * Checkbox — the workhorse "tick" primitive (matches `design/components.md#Checkbox`).
 *
 * Renders a `<button role="checkbox">` styled by the global `.rf-check`
 * classes in `design/base.css`. The check glyph is a single SVG path with a
 * stroke-dasharray animation that draws in on toggle (handled entirely by
 * `.rf-check__svg` + `.rf-check[aria-checked="true"] .rf-check__svg`).
 *
 * Sizes:
 *   - `sm` (default) → 28px (`.rf-check`)
 *   - `lg`           → 32px (`.rf-check rf-check--lg`)
 *   - `xl`           → 36px (`.rf-check rf-check--xl`)
 *
 * ARIA:
 *   - `role="checkbox"` + `aria-checked` for assistive tech.
 *   - Native `<button>` keyboard contract (Space / Enter toggle).
 *   - Caller supplies `aria-label` (the bare check has no visible text).
 *
 * Consumers like `CheckRow` may wrap this in a larger tappable surface and
 * pass `aria-hidden` to avoid double-announcement — that's expected; the
 * inner button still needs to be a real button for pointer events.
 */
'use client';

import * as React from 'react';

type CheckSize = 'sm' | 'lg' | 'xl';

export type CheckboxProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  size?: CheckSize;
  disabled?: boolean;
  /** Surface a pending async toggle to assistive tech via `aria-busy`. */
  pending?: boolean;
  /** Accessible name. Required when the check is standalone (no visible label). */
  'aria-label'?: string;
  /** When wrapped by a CheckRow, the inner check is decorative — pass `true`. */
  'aria-hidden'?: boolean;
  className?: string;
  /** Forwarded to the underlying button — useful for stable test selectors. */
  'data-testid'?: string;
};

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  function Checkbox(
    {
      checked,
      onChange,
      size = 'sm',
      disabled = false,
      pending = false,
      'aria-label': ariaLabel,
      'aria-hidden': ariaHidden,
      className,
      'data-testid': dataTestId,
    },
    ref,
  ) {
    const sizeClass =
      size === 'lg' ? 'rf-check--lg' : size === 'xl' ? 'rf-check--xl' : '';
    const isInactive = disabled || pending;
    if (ariaHidden) {
      return (
        <span
          ref={ref as React.Ref<HTMLSpanElement>}
          aria-checked={checked}
          aria-hidden
          data-checked={checked || undefined}
          data-disabled={isInactive || undefined}
          data-pending={pending || undefined}
          className={classes('rf-check', sizeClass, className)}
          data-testid={dataTestId}
        >
          <svg
            className="rf-check__svg"
            viewBox="0 0 28 28"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M7 14.5 l4 4 l10 -10" />
          </svg>
        </span>
      );
    }
    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-disabled={isInactive || undefined}
        aria-busy={pending || undefined}
        aria-label={ariaLabel}
        disabled={isInactive}
        className={classes('rf-check', sizeClass, className)}
        data-testid={dataTestId}
        onClick={(e) => {
          if (isInactive) return;
          // Prevent the click from bubbling into a parent CheckRow handler
          // (which already toggles via its own click). Caller can still call
          // event.stopPropagation in a custom handler if they need to.
          e.stopPropagation();
          onChange(!checked);
        }}
      >
        <svg
          className="rf-check__svg"
          viewBox="0 0 28 28"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M7 14.5 l4 4 l10 -10" />
        </svg>
      </button>
    );
  },
);
