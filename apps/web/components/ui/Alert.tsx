/**
 * Alert — banner for success / error / warning / info messages.
 *
 * Consumes the global `.rf-alert` family from `design/base.css`:
 *   - `.rf-alert`                    — flex layout, subtle background
 *   - `.rf-alert--{variant}`         — colour mapping for the four states
 *
 * Use for non-modal, in-page feedback (e.g. "Routine created", network
 * error). For transient notifications use a Toast (TBD). For per-field
 * validation, use TextField's `error` slot.
 *
 * ARIA: `danger` uses `role="alert"` so it's announced immediately. The
 * other variants use `role="status"` (polite) — failing loudly is reserved
 * for actual failures.
 */
import * as React from 'react';

type Variant = 'success' | 'danger' | 'warning' | 'info';

export type AlertProps = React.HTMLAttributes<HTMLDivElement> & {
  variant: Variant;
  title?: string;
  /** Render an "x" close button — invokes `onDismiss` when clicked. */
  onDismiss?: () => void;
  children?: React.ReactNode;
};

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export function Alert({
  variant,
  title,
  onDismiss,
  className,
  children,
  ...rest
}: AlertProps) {
  const role = variant === 'danger' ? 'alert' : 'status';
  return (
    <div
      role={role}
      className={classes(
        'rf-alert',
        `rf-alert--${variant}`,
        // Compat class for tests that grep `/variant-${variant}/`.
        `variant-${variant}`,
        className,
      )}
      {...rest}
    >
      <div className="rf-alert__body">
        {title ? <div className="rf-alert__title">{title}</div> : null}
        {children ? <div className="rf-alert__message">{children}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="rf-alert__close"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
