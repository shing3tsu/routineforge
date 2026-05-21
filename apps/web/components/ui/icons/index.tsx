/**
 * Hand-drawn icon set.
 *
 * Port of `design/icons.jsx`. Each icon is a clean SVG stroke path passed
 * through an SVG `feTurbulence` + `feDisplacementMap` filter for organic
 * "wobble". Two filters ship:
 *
 *   - `#rf-rough`       — standard wobble (sharp icons: chevron, check, plus)
 *   - `#rf-rough-soft`  — gentler wobble (organic icons: sun, flame, leaf)
 *
 * The brand mark uses its own less-wobbly filter (`#rf-mark-rough`) so the
 * logotype reads consistent.
 *
 * Usage rules:
 *   1. Mount `<DefaultIconDefs />` exactly once near the document root
 *      (`apps/web/app/layout.tsx`). The filter `<defs>` need to be in the
 *      DOM for every icon's `filter="url(#rf-rough)"` reference to resolve.
 *   2. Icons recolour via `currentColor` — place an icon inside any element
 *      with a colour and it follows.
 *   3. Use the `size` prop for both width AND height (icons are square).
 *      Defaults to `22` which matches the design source.
 *   4. Decorative icons should set `aria-hidden`; meaningful icons take an
 *      `aria-label`.
 *
 * Performance: the SVG filter renders on GPU. Design tested 24 icons on
 * screen at 60fps on browsers shipped since 2017.
 */
import type { SVGProps } from 'react';

// Match design/icons.jsx exactly so the visual rendering ports cleanly.
const ROUGH_STROKE = 1.75;

/**
 * The two filter `<defs>` blocks for the wobble effect. Renders an invisible
 * `<svg>` carrying the filter definitions; must be mounted exactly once in
 * the document for the `filter="url(#rf-rough[-soft])"` references on every
 * icon to resolve.
 */
export function DefaultIconDefs(): React.ReactElement {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id="rf-rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.04"
            numOctaves={2}
            seed={3}
            result="turb"
          />
          <feDisplacementMap in="SourceGraphic" in2="turb" scale={1.6} />
        </filter>
        <filter
          id="rf-rough-soft"
          x="-5%"
          y="-5%"
          width="110%"
          height="110%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.025"
            numOctaves={2}
            seed={7}
            result="t2"
          />
          <feDisplacementMap in="SourceGraphic" in2="t2" scale={0.9} />
        </filter>
        <filter
          id="rf-mark-rough"
          x="-5%"
          y="-5%"
          width="110%"
          height="110%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05"
            numOctaves={2}
            seed={9}
          />
          <feDisplacementMap in="SourceGraphic" scale={1.2} />
        </filter>
      </defs>
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Generic icon shell. Internal — not exported. All Ico* icons compose it.
// ────────────────────────────────────────────────────────────────────────

export interface IconProps {
  /** Pixel size for both width & height. Defaults to 22 (design baseline). */
  size?: number;
  /** Extra class applied to the wrapping span (for layout tweaks). */
  className?: string;
  /**
   * Accessible label. When provided the icon is exposed to assistive tech as
   * `role="img"` with the label. Omit for decorative icons; they fall back
   * to `aria-hidden`.
   */
  'aria-label'?: string;
  /** Extra inline styles forwarded to the wrapping span. */
  style?: React.CSSProperties;
}

interface IcoProps extends IconProps {
  soft?: boolean;
  children: React.ReactNode;
}

function Ico({
  size = 22,
  soft = false,
  className,
  style,
  children,
  ...rest
}: IcoProps): React.ReactElement {
  const label = rest['aria-label'];
  const a11y = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true, focusable: false } as const);
  return (
    <span
      className={['rf-icon', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size, ...style }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={ROUGH_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={soft ? 'url(#rf-rough-soft)' : 'url(#rf-rough)'}
        {...a11y}
      >
        {children}
      </svg>
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Icons — paths copied verbatim from design/icons.jsx so the rendered
// glyphs match the design source exactly.
// ────────────────────────────────────────────────────────────────────────

export const IconSun = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <circle cx={12} cy={12} r={4} />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4" />
  </Ico>
);

export const IconMoon = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </Ico>
);

export const IconHome = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <path d="M3.5 11.5L12 4l8.5 7.5" />
    <path d="M5.5 10.5V20h4v-5h5v5h4v-9.5" />
  </Ico>
);

export const IconCheck = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <path d="M5 12.5l4.5 4.5L19.5 7" />
  </Ico>
);

export const IconX = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Ico>
);

export const IconPlus = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <path d="M12 5v14M5 12h14" />
  </Ico>
);

export const IconMore = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <circle cx={6} cy={12} r={0.6} />
    <circle cx={12} cy={12} r={0.6} />
    <circle cx={18} cy={12} r={0.6} />
  </Ico>
);

export const IconFlame = (p: IconProps): React.ReactElement => (
  <Ico {...p} soft>
    <path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7 0 1-1 2-2 2 0-2-1-5-4-7 0 4-5 6-5 12 0 4 3 7 7 7z" />
    <path d="M12 22c2 0 3.5-1.5 3.5-3.5 0-1.5-1-2.5-1.5-3.5-.5 1-1.5 1.5-2 1.5-.5-1 0-2.5-1-3.5-1 2-2.5 3.5-2.5 5.5 0 2 1.5 3.5 3.5 3.5z" />
  </Ico>
);

export const IconLeaf = (p: IconProps): React.ReactElement => (
  <Ico {...p} soft>
    <path d="M20 4c0 9-7 16-16 16 0-9 7-16 16-16z" />
    <path d="M4 20c5-5 10-7 13-7" />
  </Ico>
);

export const IconDroplet = (p: IconProps): React.ReactElement => (
  <Ico {...p} soft>
    <path d="M12 3c-3 5-6 8-6 12a6 6 0 0 0 12 0c0-4-3-7-6-12z" />
  </Ico>
);

export const IconBook = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <path d="M4 5c2-1 5-1 8 0v15c-3-1-6-1-8 0V5z" />
    <path d="M12 5c3-1 6-1 8 0v15c-2-1-5-1-8 0" />
    <path d="M12 5v15" />
  </Ico>
);

export const IconDumbbell = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <rect x={2} y={9} width={3} height={6} rx={1} />
    <rect x={19} y={9} width={3} height={6} rx={1} />
    <rect x={5} y={10} width={2} height={4} rx={1} />
    <rect x={17} y={10} width={2} height={4} rx={1} />
    <path d="M7 12h10" />
  </Ico>
);

export const IconSparkle = (p: IconProps): React.ReactElement => (
  <Ico {...p} soft>
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
    <path d="M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />
  </Ico>
);

/**
 * IconAuto — circle split half empty / half filled, the industry-standard
 * "auto / system theme" glyph (left half is the light/outline side; the
 * right half is filled with `currentColor` for the dark side). Uses the
 * soft wobble filter so the hand-drawn aesthetic matches the rest of the
 * set. The half-fill is rendered as a closed semicircle path, sharing the
 * same stroke as the outer circle so the two read as one mark.
 */
export const IconAuto = (p: IconProps): React.ReactElement => (
  <Ico {...p} soft>
    <circle cx={12} cy={12} r={8} />
    <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
  </Ico>
);

export const IconBell = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <path d="M6 10c0-3 3-6 6-6s6 3 6 6c0 4 1 6 2 7H4c1-1 2-3 2-7z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </Ico>
);

export const IconUser = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <circle cx={12} cy={8} r={3.5} />
    <path d="M5 20c1-3 4-5 7-5s6 2 7 5" />
  </Ico>
);

export const IconList = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <circle cx={4.5} cy={6} r={0.6} />
    <circle cx={4.5} cy={12} r={0.6} />
    <circle cx={4.5} cy={18} r={0.6} />
  </Ico>
);

export const IconCalendar = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <rect x={3.5} y={5} width={17} height={15} rx={2} />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Ico>
);

export const IconChevronRight = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <path d="M9 6l6 6-6 6" />
  </Ico>
);

export const IconChevronLeft = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Ico>
);

export const IconChevronDown = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <path d="M6 9l6 6 6-6" />
  </Ico>
);

export const IconSearch = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <circle cx={11} cy={11} r={6} />
    <path d="M16 16l5 5" />
  </Ico>
);

export const IconSettings = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <circle cx={12} cy={12} r={3} />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2" />
  </Ico>
);

export const IconDrag = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <circle cx={9} cy={6} r={0.7} />
    <circle cx={15} cy={6} r={0.7} />
    <circle cx={9} cy={12} r={0.7} />
    <circle cx={15} cy={12} r={0.7} />
    <circle cx={9} cy={18} r={0.7} />
    <circle cx={15} cy={18} r={0.7} />
  </Ico>
);

export const IconOffline = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <path d="M3 8a13 13 0 0 1 18 0M6 12a8 8 0 0 1 12 0M9 16a4 4 0 0 1 6 0" />
    <path d="M4 4l16 16" />
  </Ico>
);

export const IconTrash = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Ico>
);

export const IconEye = (p: IconProps): React.ReactElement => (
  <Ico {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx={12} cy={12} r={3} />
  </Ico>
);

// ────────────────────────────────────────────────────────────────────────
// Brand assets. Multi-color (Google) and brand-mark (RFMark) icons skip the
// rough filter pattern — Google needs its literal brand colors, and the
// brand mark gets its own less-wobbly filter.
// ────────────────────────────────────────────────────────────────────────

export interface FlatIconProps {
  size?: number;
  className?: string;
  'aria-label'?: string;
}

/**
 * Google G mark — preserves Google's brand colors per their brand guidelines.
 * Not run through the rough filter (must look like Google's mark).
 */
export function IconGoogle({
  size = 22,
  className,
  ...rest
}: FlatIconProps): React.ReactElement {
  const label = rest['aria-label'];
  return (
    <span
      className={['rf-icon', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        {...(label
          ? { role: 'img', 'aria-label': label }
          : { 'aria-hidden': true, focusable: false })}
      >
        <path
          d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4c-.2 1.3-.9 2.4-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.5z"
          fill="#4285F4"
        />
        <path
          d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.6C4.7 19.8 8.1 22 12 22z"
          fill="#34A853"
        />
        <path
          d="M6.4 13.9C6.2 13.3 6.1 12.7 6.1 12s.1-1.3.3-1.9V7.5H3a10 10 0 0 0 0 9l3.4-2.6z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.8c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17 2.9 14.7 2 12 2 8.1 2 4.7 4.2 3 7.5l3.4 2.6C7.2 7.6 9.4 5.8 12 5.8z"
          fill="#EA4335"
        />
      </svg>
    </span>
  );
}

/**
 * RoutineForge brand mark — a check-in-a-circle. Uses its own less-wobbly
 * filter (`#rf-mark-rough`) so the logotype reads consistent across pages.
 */
export function IconRFMark({
  size = 32,
  className,
  ...rest
}: FlatIconProps): React.ReactElement {
  const label = rest['aria-label'] ?? 'RoutineForge';
  return (
    <span
      className={['rf-icon', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        fill="none"
        role="img"
        aria-label={label}
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
    </span>
  );
}

// Convenience re-export of the underlying SVG attribute type for downstream
// consumers that want to spread extras through a wrapper.
export type { SVGProps };
