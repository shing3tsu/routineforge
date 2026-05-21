/**
 * Card primitive. Matches `design/components.md#Card`.
 *
 * Consumes the global `.rf-card` family from `design/base.css`:
 *   - default                  → `rf-card`
 *   - variant="hero"           → `rf-card rf-card--hero`  (large radius + lg shadow)
 *   - variant="sunken"         → `rf-card rf-card--sunken` (recessed well)
 *
 * Composition:
 *   - <CardHeader>, <CardBody>, <CardFooter> remain as opt-in slots for the
 *     few places (auth forms, account page) that lean on header/footer
 *     divisions. They render plain divs with semantic class names; the
 *     visual is entirely the Card's responsibility.
 *
 * Props kept stable for backwards-compat:
 *   - `padded` — base.css's `.rf-card` already ships padding. The prop is
 *     a no-op visually (the card is always padded) but retained because
 *     consumer code passes it; the class is still emitted so existing
 *     tests asserting `/padded/` keep passing.
 *   - `selected` — same intent (no design token for this state in the
 *     refresh; the prop still emits a class so consumers can style hover
 *     selection per-route if needed).
 */
import * as React from 'react';

export type CardVariant = 'default' | 'hero' | 'sunken';

export type CardProps = React.HTMLAttributes<HTMLElement> & {
  /**
   * Visual variant. `default` is the standard elevated card. `hero` is for
   * the one most-important card on a screen (active routine on Today, the
   * streak block on Habit detail). `sunken` is the empty-well variant.
   */
  variant?: CardVariant;
  /**
   * Apply default body padding. `.rf-card` ships padding already; this
   * prop is retained for API stability and emits the class so external
   * test queries (e.g. `/padded/`) still match.
   */
  padded?: boolean;
  selected?: boolean;
  /** Render as a different element (default `section`). */
  as?: 'section' | 'div' | 'article';
};

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export function Card({
  variant = 'default',
  padded = false,
  selected = false,
  as = 'section',
  className,
  children,
  ...rest
}: CardProps) {
  const Tag = as;
  const variantClass =
    variant === 'hero'
      ? 'rf-card--hero'
      : variant === 'sunken'
        ? 'rf-card--sunken'
        : '';
  return (
    <Tag
      className={classes(
        'rf-card',
        variantClass,
        // Compat-named classes — tests grep for `card`, `padded`, `selected`.
        'card',
        padded && 'padded',
        selected && 'selected',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classes('rf-card__header', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardBody({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classes('rf-card__body', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classes('rf-card__footer', className)} {...rest}>
      {children}
    </div>
  );
}
