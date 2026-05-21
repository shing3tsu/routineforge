/**
 * Button primitive. Matches `design/components.md#Button`.
 *
 * Consumes the global `.rf-btn` family from `design/base.css`:
 *   - variants: `primary`, `secondary`, `ghost`, `danger`
 *   - sizes:    `sm` (34px), `md` (44px), `lg` (54px)
 *   - block:    `rf-btn--block` when `fullWidth`
 *   - states:   default / hover / active / focus-visible / disabled / loading
 *
 * Loading & disabled both block clicks and mirror to ARIA. `aria-disabled`
 * is preferred over the native `disabled` attribute for accessibility —
 * keyboard users can still focus a disabled button and discover its label.
 *
 * Loading state renders an inline spinner alongside the label (per dispatch
 * brief: "Keep its label visible — don't replace label with spinner; render
 * spinner alongside or inside leading slot"). The spinner is an inline SVG
 * with a stroke-dasharray rotation, sized to the current font.
 */
import * as React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'disabled'
> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Accessible name when no visible text (icon-only). */
  'aria-label'?: string;
};

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled = false,
      fullWidth = false,
      type = 'button',
      className,
      children,
      onClick,
      ...rest
    },
    ref,
  ) {
    const isInactive = disabled || loading;
    return (
      <button
        ref={ref}
        type={type}
        className={classes(
          'rf-btn',
          `rf-btn--${variant}`,
          `rf-btn--${size}`,
          fullWidth && 'rf-btn--block',
          // Compat shims for tests that grep for "variant-*" / "size-*" /
          // "full" class fragments. These names predate the .rf-* migration;
          // the test-reconciliation dispatch will move tests to query the new
          // names. Until then, mirroring keeps the test suite green.
          `variant-${variant}`,
          `size-${size}`,
          fullWidth && 'full',
          className,
        )}
        aria-disabled={isInactive || undefined}
        aria-busy={loading || undefined}
        // We intentionally do NOT set the native `disabled` attribute — see
        // the Button.tsx docstring + tests. Keyboard users can still tab to
        // a visually-disabled button to discover its label.
        onClick={(e) => {
          if (isInactive) {
            e.preventDefault();
            return;
          }
          onClick?.(e);
        }}
        {...rest}
      >
        <span className="rf-btn__label">{children}</span>
        {loading ? (
          <span className="rf-btn__spinner" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="1em"
              height="1em"
              role="presentation"
              focusable="false"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="60"
                strokeDashoffset="20"
              />
            </svg>
          </span>
        ) : null}
      </button>
    );
  },
);
