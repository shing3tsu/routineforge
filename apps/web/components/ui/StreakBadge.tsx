/**
 * StreakBadge — communicates a habit's current streak count.
 *
 * Consumes the global `.rf-streak` family from `design/base.css`:
 *   - `.rf-streak`            — pill container (brand-subtle bg)
 *   - `.rf-streak__num`       — mono numeral
 *   - `.rf-streak__unit`      — caps "DAYS" / "DAY" tail
 *   - `.rf-streak--lg`        — habit-detail large variant
 *
 * Supplements (in apps/web/app/globals.css):
 *   - `.rf-streak--subtle`    — zero-state recolour (sunken surface, muted text)
 *   - `.rf-streak__best`      — trailing "best · N" small caps for the lg variant
 *
 * Tone (user choice): completely neutral.
 *   - No red, no broken-chain icon, no urgent language at zero.
 *   - Zero shows as a plain `0` (mono). The "Start your streak" copy lives
 *     on screen for the zero-state and the pill recolours subtly.
 *
 * Escalation:
 *   - `currentStreak >= 30` → adds the `ring30` class
 *   - `currentStreak >= 100`→ adds the `ring100` class (instead of ring30)
 *   These remain as class hooks for downstream visual treatments; the new
 *   design ships no escalation styling by default, but the hooks (and
 *   tests) are preserved for forward compatibility.
 *
 * The component renders a `role="status"` element with a natural-language
 * `aria-label` ("Current streak: 5 days, best 12") so screen-reader users
 * hear the meaningful state, not the bare digits.
 */
import * as React from 'react';

type Size = 'sm' | 'md' | 'lg';

export type StreakBadgeProps = {
  currentStreak: number;
  /** Optional all-time best. When provided, contextual "best" suffix renders. */
  longestStreak?: number;
  size?: Size;
  /** Append the "— best so far" / "· best N" suffix. Default true. */
  showBestSuffix?: boolean;
  className?: string;
};

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export function StreakBadge({
  currentStreak,
  longestStreak,
  size = 'md',
  showBestSuffix = true,
  className,
}: StreakBadgeProps) {
  const zero = currentStreak <= 0;
  const reach30 = currentStreak >= 30;
  const reach100 = currentStreak >= 100;

  // Size class — 'lg' uses the design's `--lg` modifier; 'sm' and 'md' both
  // map to the compact pill. We also emit the legacy `inline` / `large`
  // class fragments so the existing tests (which grep on those tokens)
  // keep passing.
  const sizeIsLarge = size === 'lg';

  // Body label
  let label: string;
  let aria: string;
  if (zero) {
    label = 'Start your streak';
    aria = 'No current streak yet — start your streak';
  } else {
    label = `day streak`;
    aria = `Current streak: ${currentStreak} day${currentStreak === 1 ? '' : 's'}`;
  }

  // "Best" suffix: only when meaningful AND we're non-zero (no crowing at zero).
  let bestSuffix: string | null = null;
  if (showBestSuffix && !zero && typeof longestStreak === 'number') {
    if (currentStreak >= longestStreak && longestStreak > 0) {
      bestSuffix = '— best so far';
      aria += `, all-time best`;
    } else if (longestStreak > currentStreak) {
      bestSuffix = `· best ${longestStreak}`;
      aria += `, best ${longestStreak}`;
    }
  }

  return (
    <span
      className={classes(
        'rf-streak',
        sizeIsLarge && 'rf-streak--lg',
        zero && 'rf-streak--subtle',
        // Legacy class fragments (test compatibility).
        sizeIsLarge ? 'large' : 'inline',
        zero && 'subtle',
        !zero && reach30 && !reach100 && 'ring30',
        !zero && reach100 && 'ring100',
        className,
      )}
      aria-label={aria}
      role="status"
    >
      {/* Per the existing tests, the visible counter is aria-hidden and
          contains JUST the number. The label tail ("day streak") is the
          visible meaningful copy; the digit lives in the counter. */}
      <span className="rf-streak__num" aria-hidden="true">
        {zero ? '0' : currentStreak}
      </span>
      <span className="rf-streak__unit">
        {label}
        {bestSuffix ? (
          <span className="rf-streak__best"> {bestSuffix}</span>
        ) : null}
      </span>
    </span>
  );
}
