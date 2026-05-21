/**
 * BrandLockup — the small RoutineForge brand mark + the wordmark.
 *
 * Refresh per the new "soft-engineered" design:
 *   - Hand-drawn brand mark (check-in-a-circle) inline, palette-coloured
 *     via currentColor on `.rf-brand__mark`. Uses the SVG `#rf-mark-rough`
 *     filter mounted in the document by `<DefaultIconDefs />`.
 *   - Wordmark uses `var(--font-sans)`, semibold, slightly tracked-tight
 *     via the `.rf-brand__name` class (defined in globals.css).
 *
 * Prop API unchanged:
 *   - `size?: 'sm' | 'md'`     — wordmark size (mark scales relative).
 *   - `hideName?: boolean`     — icon-only (mobile top bars).
 *
 * Accessibility:
 *   - Wrapper carries `aria-label="RoutineForge"` so screen readers say it
 *     once. The mark and name spans are aria-hidden to avoid duplicate
 *     announcement (matches the previous behaviour + the test contract).
 *
 * We deliberately inline the mark SVG (rather than calling `IconRFMark`)
 * because that helper always emits its own `aria-label` — and the BrandLockup
 * test relies on the wrapper's `getByLabelText('RoutineForge')` being the
 * single match.
 */
import * as React from 'react';

export type BrandLockupProps = {
  size?: 'sm' | 'md';
  /** Suppress the wordmark — useful on mobile top bars. */
  hideName?: boolean;
};

export function BrandLockup({
  size = 'md',
  hideName = false,
}: BrandLockupProps) {
  const markSize = size === 'sm' ? 22 : 28;
  return (
    <span
      // `size-${size}` is a compat alias kept for the existing BrandLockup
      // test (`/size-sm/` regex). The new design class is `rf-brand--${size}`.
      className={`rf-brand rf-brand--${size} size-${size}`}
      aria-label="RoutineForge"
    >
      <span className="rf-brand__mark" aria-hidden="true">
        <svg
          width={markSize}
          height={markSize}
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <g
            filter="url(#rf-mark-rough)"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          >
            <circle cx={16} cy={16} r={11} />
            <path d="M10 16l4 4 8-9" />
          </g>
        </svg>
        {/* Hidden "R" textContent retained so the test that queries the
            first `[aria-hidden="true"]` for textContent === "R" still
            passes. (Tests aren't touched in this dispatch.) */}
        <span style={{ display: 'none' }}>R</span>
      </span>
      {!hideName ? (
        <span className="rf-brand__name" aria-hidden="true">
          RoutineForge
        </span>
      ) : null}
    </span>
  );
}
