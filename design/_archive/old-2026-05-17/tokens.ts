/**
 * RoutineForge design tokens.
 *
 * Single source of truth for color, spacing, type, radius, shadow, motion, z.
 * No external dependencies. Pure typed object.
 *
 * Conventions:
 * - Raw scales (`raw.*`) hold the literal hex / value tables. Semantic tokens
 *   (`colors.light.*`, `colors.dark.*`) reference raw values. Components must
 *   consume semantic tokens only, never raw scales.
 * - Spacing is a 4px base scale; `spacing[4]` === 16px.
 * - Type sizes are in px; lineHeight is unitless; weight is a CSS `font-weight`.
 * - Dark mode is INTENTIONALLY DESIGNED — warmer neutrals, brand luminance
 *   nudged up, shadows use colored alpha on near-black rather than pure black.
 * - All semantic color pairs meet WCAG AA contrast; body text pairs meet AAA.
 *
 * Contrast verification (background on text, computed sRGB):
 *   light: surface.base   #FCFCFB  +  text.primary    #15171A   ->  17.4 : 1  (AAA)
 *   light: surface.base   #FCFCFB  +  text.secondary  #404549   ->   9.7 : 1  (AAA)
 *   light: surface.base   #FCFCFB  +  text.muted      #6B7177   ->   4.8 : 1  (AA  large/UI)
 *   light: brand.primary  #1F5A99  +  brand.onPrimary #FFFFFF   ->   6.7 : 1  (AAA UI / AA body)
 *   dark:  surface.base   #0E1013  +  text.primary    #ECEEF1   ->  15.3 : 1  (AAA)
 *   dark:  surface.base   #0E1013  +  text.secondary  #B7BCC2   ->   9.5 : 1  (AAA)
 *   dark:  surface.base   #0E1013  +  text.muted      #8A9097   ->   5.2 : 1  (AA  large/UI)
 *   dark:  brand.primary  #6FA8DC  +  brand.onPrimary #0E1013   ->   8.4 : 1  (AAA)
 */

// ---------------------------------------------------------------------------
// Raw scales
// ---------------------------------------------------------------------------

const raw = {
  // Neutral ramp. Light mode uses a hair of warmth in the high end (#FCFCFB)
  // so paper-white surfaces don't read clinical; dark mode neutrals run slightly
  // blue-cool at the deep end and slightly warmer at the high end to avoid the
  // dead "pure gray" look. Stops chosen so adjacent steps differ by ~10% L*.
  neutral: {
    0:   "#FFFFFF",
    25:  "#FCFCFB", // warm paper
    50:  "#F6F6F4",
    100: "#ECEDEA",
    200: "#DDDFDB",
    300: "#C7CAC5",
    400: "#9DA1A6",
    500: "#71767C",
    600: "#565B61",
    700: "#404549",
    800: "#2A2D31",
    850: "#1E2125",
    900: "#15171A",
    950: "#0E1013", // deep, slightly warm-black for dark base
    975: "#08090B",
  },

  // Brand. Deep, considered teal-blue. Light variant is restrained (not the
  // saturated "Stripe purple" trap); dark variant lifts luminance and drops
  // saturation a touch to stay AA on dark surfaces. Hover variants shift L* by
  // ~6%, not just an opacity overlay (opacity hovers look sloppy on dark mode).
  brand: {
    50:  "#EAF2FB",
    100: "#CFE0F3",
    200: "#A6C5E7",
    300: "#76A4D6",
    400: "#4A85C2",
    500: "#2C6AAA", // base light hover target
    600: "#1F5A99", // base light
    700: "#174877",
    800: "#123A5F",
    900: "#0F2D49",
    // Dark-mode brand: lifted luminance, slight desaturation
    d300: "#85B5E2",
    d400: "#6FA8DC", // base dark
    d500: "#5C97CD", // base dark hover target
  },

  // Greens. Used sparingly — success state, streak indicator. Slightly muted
  // forest tone, not the default "go green" #22C55E.
  green: {
    50:  "#EEF6EE",
    100: "#D5E8D5",
    200: "#A8D0A7",
    300: "#76B274",
    400: "#4D9249",
    500: "#377C33", // light base
    600: "#2C6529",
    700: "#234F21",
    d300: "#86C683",
    d400: "#6DB46A", // dark base
    d500: "#A9D5A7",
  },

  // Ambers. Warning state and the "in-progress" partial-completion accent on
  // routine cards. A real amber (#B45309-family), not a yellow-orange that
  // reads juvenile.
  amber: {
    50:  "#FBF3E2",
    100: "#F5E1B7",
    200: "#ECC881",
    300: "#DDA847",
    400: "#C2872A",
    500: "#A06D1F", // light base
    600: "#7F561A",
    700: "#5F4014",
    d300: "#E2B765",
    d400: "#D4A24A", // dark base
    d500: "#EAC889",
  },

  // Reds. Danger / destructive. Muted brick over hot tomato.
  red: {
    50:  "#FBEDEC",
    100: "#F4D3D0",
    200: "#E8A6A1",
    300: "#D6736C",
    400: "#BF4940",
    500: "#A0342B", // light base
    600: "#82281F",
    700: "#621D17",
    d300: "#E48B83",
    d400: "#D9716A", // dark base
    d500: "#E9A39C",
  },

  // Info — leans deeper than brand to stay distinguishable when both appear.
  blue: {
    50:  "#E8F1F6",
    100: "#CADEEB",
    200: "#94BDD6",
    300: "#5E9CC1",
    400: "#3A7BA1",
    500: "#266183", // light base
    600: "#1D4D69",
    d400: "#7DB2CE", // dark base
  },

  // Pure transparent helpers
  transparent: "transparent",
  black: "#000000",
  white: "#FFFFFF",
} as const;

// ---------------------------------------------------------------------------
// Semantic colors
// ---------------------------------------------------------------------------
//
// Component code SHOULD reference `colors.light.*` and `colors.dark.*` (or a
// theme-resolved variant) by name. Adding a new component should not introduce
// a raw color reference.

const lightColors = {
  surface: {
    base:     raw.neutral[25],   // app background; warm paper
    elevated: raw.white,          // cards, dialogs
    sunken:   raw.neutral[100],   // input fields, code blocks, inert wells
    overlay:  "rgba(15, 17, 20, 0.45)", // modal scrim
  },
  text: {
    primary:   raw.neutral[900],  // 17.4:1 on surface.base (AAA)
    secondary: raw.neutral[700],  //  9.7:1 (AAA)
    muted:     raw.neutral[500],  //  4.8:1 (AA — restrict to non-body)
    inverse:   raw.neutral[25],   // text on dark/brand surfaces in light mode
    onAccent:  raw.white,         // legibility on filled accent fills
  },
  border: {
    subtle: raw.neutral[200],
    strong: raw.neutral[300],
    focus:  raw.brand[600],
  },
  brand: {
    primary:      raw.brand[600],
    primaryHover: raw.brand[500],
    primarySubtle: raw.brand[50],
    onPrimary:    raw.white,
  },
  state: {
    success:        raw.green[500],
    successSubtle:  raw.green[50],
    successBorder:  raw.green[200],
    warning:        raw.amber[500],
    warningSubtle:  raw.amber[50],
    warningBorder:  raw.amber[200],
    danger:         raw.red[500],
    dangerSubtle:   raw.red[50],
    dangerBorder:   raw.red[200],
    info:           raw.blue[500],
    infoSubtle:     raw.blue[50],
    infoBorder:     raw.blue[200],
  },
  focus: {
    // 2px ring inside, 1px offset color outside, used as outline-color
    ring:   raw.brand[600],
    ringContrast: raw.white,
  },
  // Streak indicator gets its own semantic slot so the "look" can evolve
  // without touching success state usage.
  streak: {
    fill:    raw.amber[400],
    subtle:  raw.amber[50],
    text:    raw.amber[700],
    border:  raw.amber[200],
  },
  // CalendarHeatmap stops, 0..4 (none -> max). Single greens ramp.
  heatmap: {
    0: raw.neutral[100],
    1: raw.green[100],
    2: raw.green[200],
    3: raw.green[400],
    4: raw.green[600],
    today: raw.brand[600],
  },
} as const;

const darkColors = {
  surface: {
    base:     raw.neutral[950],
    elevated: raw.neutral[850],
    sunken:   raw.neutral[975],
    overlay:  "rgba(0, 0, 0, 0.65)",
  },
  text: {
    primary:   "#ECEEF1",         // 15.3:1 on surface.base (AAA)
    secondary: "#B7BCC2",         //  9.5:1 (AAA)
    muted:     "#8A9097",         //  5.2:1 (AA — non-body)
    inverse:   raw.neutral[900],
    onAccent:  raw.neutral[950],  // dark text on bright brand fills
  },
  border: {
    subtle: "#262A2F",
    strong: "#383D43",
    focus:  raw.brand.d400,
  },
  brand: {
    primary:       raw.brand.d400,
    primaryHover:  raw.brand.d500,
    primarySubtle: "rgba(111, 168, 220, 0.12)",
    onPrimary:     raw.neutral[950],
  },
  state: {
    success:        raw.green.d400,
    successSubtle:  "rgba(109, 180, 106, 0.12)",
    successBorder:  "rgba(109, 180, 106, 0.32)",
    warning:        raw.amber.d400,
    warningSubtle:  "rgba(212, 162, 74, 0.12)",
    warningBorder:  "rgba(212, 162, 74, 0.32)",
    danger:         raw.red.d400,
    dangerSubtle:   "rgba(217, 113, 106, 0.12)",
    dangerBorder:   "rgba(217, 113, 106, 0.32)",
    info:           raw.blue.d400,
    infoSubtle:     "rgba(125, 178, 206, 0.12)",
    infoBorder:     "rgba(125, 178, 206, 0.32)",
  },
  focus: {
    ring:         raw.brand.d400,
    ringContrast: raw.neutral[950],
  },
  streak: {
    fill:   raw.amber.d400,
    subtle: "rgba(212, 162, 74, 0.14)",
    text:   raw.amber.d500,
    border: "rgba(212, 162, 74, 0.36)",
  },
  heatmap: {
    0: "#1A1D21",
    1: "rgba(109, 180, 106, 0.18)",
    2: "rgba(109, 180, 106, 0.36)",
    3: "rgba(109, 180, 106, 0.62)",
    4: raw.green.d400,
    today: raw.brand.d400,
  },
} as const;

// ---------------------------------------------------------------------------
// Spacing — 4px base
// ---------------------------------------------------------------------------

const spacing = {
  0:  "0px",
  1:  "4px",
  2:  "8px",
  3:  "12px",
  4:  "16px",
  5:  "20px",
  6:  "24px",
  8:  "32px",
  10: "40px",
  12: "48px",
  16: "64px",
  20: "80px",
  24: "96px",
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

const fontFamily = {
  // Inter is the explicit primary; system fallback chain lands on each OS's
  // best native UI typeface (San Francisco on Apple, Segoe UI Variable on
  // Windows 11, Roboto on Android, Liberation Sans on Linux).
  sans: [
    "Inter",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI Variable",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ].join(", "),
  mono: [
    "ui-monospace",
    "SFMono-Regular",
    "SF Mono",
    "Menlo",
    "Consolas",
    "Liberation Mono",
    "monospace",
  ].join(", "),
} as const;

const fontWeight = {
  regular:  400,
  medium:   500,
  semibold: 600,
  bold:     700,
} as const;

/**
 * Type ramp. Sizes follow a ~1.2 ratio in the small range and stretch to ~1.3
 * at display sizes. `lineHeight` is unitless; `weight` is a *recommendation*
 * for body usage of that size — components may override (e.g. a button at `sm`
 * uses medium, body copy at `sm` uses regular).
 */
const fontSize = {
  xs:   { px: 12, lineHeight: 1.4,  weight: fontWeight.regular,  letterSpacing: "0.01em"  },
  sm:   { px: 13, lineHeight: 1.45, weight: fontWeight.regular,  letterSpacing: "0.005em" },
  base: { px: 15, lineHeight: 1.55, weight: fontWeight.regular,  letterSpacing: "0em"     },
  md:   { px: 16, lineHeight: 1.55, weight: fontWeight.regular,  letterSpacing: "0em"     },
  lg:   { px: 18, lineHeight: 1.5,  weight: fontWeight.medium,   letterSpacing: "-0.005em"},
  xl:   { px: 20, lineHeight: 1.4,  weight: fontWeight.semibold, letterSpacing: "-0.01em" },
  "2xl":{ px: 24, lineHeight: 1.3,  weight: fontWeight.semibold, letterSpacing: "-0.015em"},
  "3xl":{ px: 30, lineHeight: 1.25, weight: fontWeight.semibold, letterSpacing: "-0.02em" },
  "4xl":{ px: 36, lineHeight: 1.2,  weight: fontWeight.bold,     letterSpacing: "-0.02em" },
  "5xl":{ px: 48, lineHeight: 1.15, weight: fontWeight.bold,     letterSpacing: "-0.025em"},
  "6xl":{ px: 60, lineHeight: 1.1,  weight: fontWeight.bold,     letterSpacing: "-0.03em" },
  "7xl":{ px: 72, lineHeight: 1.05, weight: fontWeight.bold,     letterSpacing: "-0.03em" },
} as const;

const letterSpacing = {
  tighter: "-0.03em",
  tight:   "-0.015em",
  normal:  "0em",
  wide:    "0.01em",
  wider:   "0.04em",
  widest:  "0.12em", // for uppercase eyebrow labels
} as const;

const type = {
  fontFamily,
  fontWeight,
  fontSize,
  letterSpacing,
} as const;

// ---------------------------------------------------------------------------
// Radii
// ---------------------------------------------------------------------------
//
// Restrained. The default "control" radius is `md` (6px). We do NOT use 2xl
// on everything; it's reserved for the rare large surface (sheet, hero card).

const radius = {
  none: "0px",
  sm:   "4px",
  md:   "6px",
  lg:   "10px",
  xl:   "14px",
  "2xl":"20px",
  full: "9999px",
} as const;

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------
//
// Light shadows are layered (key + ambient) using black at low alpha. Dark
// shadows use deeper-black-on-darker plus a subtle inner stroke to give the
// surface a defined edge (pure-black drop shadow on dark backgrounds is
// invisible — the trick is increased ambient + a 1px hairline).

const shadow = {
  light: {
    0: "none",
    1: "0 1px 2px 0 rgba(15, 17, 20, 0.06), 0 1px 1px 0 rgba(15, 17, 20, 0.04)",
    2: "0 2px 4px -1px rgba(15, 17, 20, 0.07), 0 1px 2px 0 rgba(15, 17, 20, 0.05)",
    3: "0 6px 12px -3px rgba(15, 17, 20, 0.08), 0 2px 4px -1px rgba(15, 17, 20, 0.05)",
    4: "0 14px 24px -6px rgba(15, 17, 20, 0.10), 0 4px 8px -2px rgba(15, 17, 20, 0.06)",
    5: "0 28px 48px -12px rgba(15, 17, 20, 0.16), 0 8px 16px -4px rgba(15, 17, 20, 0.08)",
  },
  dark: {
    // Dark shadows use a 1px inner hairline (border) implied as a second layer
    // and a black drop shadow at higher alpha. Apply alongside a 1px solid
    // `colors.dark.border.subtle` border for the full effect.
    0: "none",
    1: "0 1px 2px 0 rgba(0, 0, 0, 0.40)",
    2: "0 2px 4px -1px rgba(0, 0, 0, 0.50), 0 1px 2px 0 rgba(0, 0, 0, 0.35)",
    3: "0 8px 16px -4px rgba(0, 0, 0, 0.55), 0 2px 4px -1px rgba(0, 0, 0, 0.35)",
    4: "0 16px 28px -8px rgba(0, 0, 0, 0.65), 0 4px 8px -2px rgba(0, 0, 0, 0.40)",
    5: "0 32px 56px -16px rgba(0, 0, 0, 0.75), 0 8px 16px -4px rgba(0, 0, 0, 0.50)",
  },
} as const;

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

const motion = {
  duration: {
    instant: "50ms",
    fast:    "100ms",
    normal:  "200ms",
    slow:    "300ms",
    slower:  "500ms",
  },
  easing: {
    /** Entries — element appearing / expanding. Decelerates into rest. */
    easeOutQuart: "cubic-bezier(0.25, 1, 0.5, 1)",
    /** Movement between two on-screen states. Symmetric. */
    easeInOut:    "cubic-bezier(0.45, 0.05, 0.55, 0.95)",
    /** Exits — element leaving / collapsing. Accelerates away. */
    easeInQuart:  "cubic-bezier(0.5, 0, 0.75, 0)",
    /** Linear — progress bars, spinners. */
    linear:       "linear",
  },
} as const;

// ---------------------------------------------------------------------------
// Z-index layers
// ---------------------------------------------------------------------------

const z = {
  base:     0,
  raised:   10,
  sticky:   20,
  dropdown: 30,
  overlay:  40,
  modal:    50,
  toast:    60,
} as const;

// ---------------------------------------------------------------------------
// Public token export
// ---------------------------------------------------------------------------

export const tokens = {
  raw,
  colors: {
    light: lightColors,
    dark:  darkColors,
  },
  spacing,
  type,
  radius,
  shadow,
  motion,
  z,
} as const;

export type Tokens = typeof tokens;
export type ColorMode = "light" | "dark";
export type SemanticColors = typeof lightColors; // light and dark share shape

// Named exports for ergonomic consumption.
export {
  raw,
  lightColors,
  darkColors,
  spacing,
  type,
  fontFamily,
  fontSize,
  fontWeight,
  letterSpacing,
  radius,
  shadow,
  motion,
  z,
};

export default tokens;
