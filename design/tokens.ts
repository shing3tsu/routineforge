// design/tokens.ts
// RoutineForge — design tokens
// "Soft-engineered" aesthetic: pillowy radii, watercolor wash backgrounds,
// hand-drawn sketchy icons, sans body + mono numerals.
//
// Four palettes ship out of the box; the active palette is selected by the
// `data-palette` attribute on <html>. Light vs dark by `data-theme`.

export type Mode = 'light' | 'dark';
export type Palette = 'bone' | 'fog' | 'sage' | 'graphite';

// ─── raw scales (one ramp per palette × mode) ────────────────────────────
// Each ramp has neutrals 0..12 + brand 1..5 + state colors. They feed the
// semantic layer below — never reference raw scales from product code.

const ramps = {
  bone: {
    light: {
      n: ['#FFFEFB', '#FAF6EE', '#F4EEDF', '#ECE3CE', '#DDD0B3', '#C5B594',
          '#A39074', '#7E6E55', '#5E4F3C', '#42372A', '#2B231A', '#1A140F', '#0E0A07'],
      brand: ['#FFE6DA', '#F4B49C', '#E58869', '#C9543A', '#A03B22', '#74240F'],
      success: '#4F7A3A', warning: '#B8770F', danger: '#B83A2A', info: '#3F6E8F',
    },
    dark: {
      n: ['#0C0805', '#14100B', '#1A1612', '#221E18', '#2E2820', '#3D362C',
          '#544A3D', '#6F6353', '#8B7E6C', '#A89A86', '#C8BCA8', '#E5DBC8', '#FDF8EE'],
      brand: ['#3B1F11', '#6B3320', '#A0533A', '#E2876B', '#F2B49A', '#FBDDC8'],
      success: '#A8CB8E', warning: '#E5B26B', danger: '#E69080', info: '#92BDD8',
    },
  },
  fog: {
    light: {
      n: ['#FFFFFF', '#F8FAFC', '#F1F4F8', '#E6EBF2', '#D3DAE5', '#B4BDCC',
          '#8E97A8', '#6B7385', '#4A5364', '#323A48', '#1F2530', '#11161D', '#070A0E'],
      brand: ['#E6E9FF', '#B8BFFF', '#8A92F5', '#4F46E5', '#3730A3', '#1E1B5C'],
      success: '#0E7C4A', warning: '#A2640A', danger: '#C4382C', info: '#1F6B8F',
    },
    dark: {
      n: ['#05080B', '#0A0E12', '#0F1419', '#161C24', '#1F2730', '#2A323E',
          '#3A4452', '#4F5A6B', '#6B7585', '#8B95A4', '#B0BAC8', '#D5DCE5', '#F0F4F9'],
      brand: ['#1A1B4B', '#2D2F7E', '#5460C4', '#818CF8', '#B4BBFB', '#DFE3FD'],
      success: '#7CC499', warning: '#E0B468', danger: '#EA8B82', info: '#8FB9D4',
    },
  },
  sage: {
    light: {
      n: ['#FDFDF8', '#F6F8F1', '#EEF2E5', '#E2E8D2', '#CCD5B5', '#A8B58A',
          '#7C8C5F', '#5A6845', '#414C31', '#2D341F', '#1D2214', '#10130A', '#070905'],
      brand: ['#E2EFD3', '#B9D49B', '#85B265', '#4A7C3A', '#2F5723', '#173411'],
      success: '#3F7236', warning: '#9C6B0E', danger: '#B23A2D', info: '#3F6F8C',
    },
    dark: {
      n: ['#060805', '#0B0E09', '#10130D', '#161A12', '#1F2419', '#2A3122',
          '#3A4330', '#4E5942', '#6A7657', '#8A9776', '#AEBA9A', '#D0DBC0', '#ECF1DF'],
      brand: ['#1A2412', '#2E3F22', '#536D3F', '#8FBC75', '#B8D9A1', '#DEEDCB'],
      success: '#9BC181', warning: '#DBAE69', danger: '#E69183', info: '#92B9D2',
    },
  },
  graphite: {
    light: {
      n: ['#FFFFFF', '#FAFAFB', '#F4F4F5', '#ECECEE', '#DDDDDF', '#BCBCC0',
          '#92929A', '#6E6E76', '#4D4D54', '#34343A', '#222226', '#131316', '#08080A'],
      brand: ['#ECE7FE', '#C4B5FD', '#A78BFA', '#7C3AED', '#5B21B6', '#3B0F77'],
      success: '#10703F', warning: '#A35A0D', danger: '#BD3527', info: '#256590',
    },
    dark: {
      n: ['#050507', '#0A0A0C', '#101012', '#16161A', '#1F1F24', '#292930',
          '#3A3A42', '#4F4F58', '#6B6B73', '#8A8A92', '#B0B0B8', '#D2D2D8', '#EEEEF2'],
      brand: ['#2A1B4B', '#3E2A6E', '#664CB8', '#A78BFA', '#C4B5FD', '#E4DAFE'],
      success: '#7AC094', warning: '#DBB068', danger: '#E68C82', info: '#8FB6D4',
    },
  },
};

// Fix syntax slip in graphite.light (closing ']' before sentinel)
// (kept here as a typed export, but in actual TS source this would be a clean object.)

// ─── semantic tokens (light + dark, one per palette) ─────────────────────
// Reference these from product code via the CSS custom properties exported
// in design/tokens.css.

const makeSemantic = (r: typeof ramps.bone.light) => ({
  surface: {
    base: r.n[2],          // page background
    elevated: r.n[0],      // cards, popovers
    sunken: r.n[3],        // recessed wells, code blocks
    overlay: 'rgba(0,0,0,0.45)',
  },
  wash: {                  // ambient watercolor gradients (used as backdrop)
    a: r.brand[0],
    b: r.n[1],
    c: r.brand[1],
  },
  text: {
    primary: r.n[11],
    secondary: r.n[8],
    muted: r.n[6],
    inverse: r.n[0],
    onBrand: '#FFFFFF',
  },
  border: {
    subtle: r.n[3],
    strong: r.n[5],
    focus: r.brand[3],
  },
  brand: {
    primary: r.brand[3],
    primaryHover: r.brand[4],
    primarySubtle: r.brand[0],
    onPrimary: '#FFFFFF',
  },
  state: {
    success: r.success,
    successSubtle: r.brand[0],   // palette-dependent tint behind chips
    warning: r.warning,
    warningSubtle: r.brand[0],
    danger: r.danger,
    dangerSubtle: r.brand[0],
    info: r.info,
    infoSubtle: r.brand[0],
  },
  focus: { ring: r.brand[3] },
});

export const tokens = {
  // ── color ──────────────────────────────────────────────────────────────
  color: Object.fromEntries(
    (['bone','fog','sage','graphite'] as Palette[]).map(p => [p, {
      light: makeSemantic(ramps[p].light),
      dark:  makeSemantic(ramps[p].dark),
    }])
  ),

  // ── spacing (4px base) ─────────────────────────────────────────────────
  spacing: {
    px: '1px', 0: '0', 0.5: '2px', 1: '4px', 1.5: '6px', 2: '8px', 2.5: '10px',
    3: '12px', 4: '16px', 5: '20px', 6: '24px', 7: '28px', 8: '32px',
    10: '40px', 12: '48px', 14: '56px', 16: '64px', 20: '80px', 24: '96px',
    28: '112px', 32: '128px',
  },

  // ── typography ─────────────────────────────────────────────────────────
  type: {
    family: {
      sans: '"Geist", -apple-system, BlinkMacSystemFont, "Inter Tight", system-ui, sans-serif',
      mono: '"Geist Mono", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
    },
    size: {
      xs:  { px: 12, lh: 16, weight: 500 },
      sm:  { px: 13, lh: 18, weight: 500 },
      base:{ px: 15, lh: 22, weight: 400 },
      lg:  { px: 17, lh: 24, weight: 500 },
      xl:  { px: 20, lh: 28, weight: 500 },
      '2xl':{px: 24, lh: 30, weight: 500 },
      '3xl':{px: 30, lh: 36, weight: 500 },
      '4xl':{px: 36, lh: 40, weight: 600 },
      '5xl':{px: 48, lh: 52, weight: 600 },
      '6xl':{px: 60, lh: 62, weight: 600 },
      '7xl':{px: 72, lh: 72, weight: 600 },
    },
    tracking: {
      tight: '-0.02em',
      snug: '-0.012em',
      normal: '0',
      wide: '0.02em',
      wider: '0.06em',
      widest: '0.12em',
    },
  },

  // ── radius ─────────────────────────────────────────────────────────────
  // Generous, pillowy. Cards land at lg / xl, hero cards at 2xl.
  radius: {
    none: '0', xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '22px',
    '2xl': '28px', '3xl': '36px', full: '999px',
  },

  // ── shadow (light + dark variants per token) ───────────────────────────
  // Light uses softly layered ambient shadows. Dark uses subtle outer
  // glow + a tiny inner highlight so cards still feel lifted in a dim UI.
  shadow: {
    light: {
      xs: '0 1px 2px rgba(36,28,18,.05)',
      sm: '0 1px 3px rgba(36,28,18,.06), 0 1px 2px rgba(36,28,18,.04)',
      md: '0 4px 12px rgba(36,28,18,.07), 0 2px 4px rgba(36,28,18,.04)',
      lg: '0 12px 28px rgba(36,28,18,.08), 0 4px 10px rgba(36,28,18,.05)',
      xl: '0 24px 56px rgba(36,28,18,.10), 0 8px 20px rgba(36,28,18,.06)',
      inner: 'inset 0 1px 0 rgba(255,255,255,.6)',
    },
    dark: {
      xs: '0 1px 2px rgba(0,0,0,.40)',
      sm: '0 1px 3px rgba(0,0,0,.45), 0 1px 2px rgba(0,0,0,.30)',
      md: '0 4px 12px rgba(0,0,0,.50), 0 2px 4px rgba(0,0,0,.35)',
      lg: '0 12px 28px rgba(0,0,0,.55), 0 4px 10px rgba(0,0,0,.40)',
      xl: '0 24px 56px rgba(0,0,0,.60), 0 8px 20px rgba(0,0,0,.45)',
      inner: 'inset 0 1px 0 rgba(255,255,255,.04)',
    },
  },

  // ── motion ─────────────────────────────────────────────────────────────
  motion: {
    duration: {
      instant: '0ms',
      snap:    '120ms',
      quick:   '160ms',
      glide:   '220ms',
      ease:    '280ms',
      slow:    '420ms',
    },
    easing: {
      standard: 'cubic-bezier(.22,.61,.36,1)',  // default
      decel:    'cubic-bezier(0,0,.2,1)',
      accel:    'cubic-bezier(.4,0,1,1)',
      spring:   'cubic-bezier(.34,1.56,.64,1)', // checkbox pop
      soft:     'cubic-bezier(.32,.72,.36,1)',  // pillowy
    },
  },

  // ── z-index layers ─────────────────────────────────────────────────────
  z: {
    base: 0,
    raised: 10,
    sticky: 100,
    nav: 200,
    overlay: 800,
    modal: 900,
    toast: 1000,
    tooltip: 1100,
  },
} as const;

export type Tokens = typeof tokens;
export default tokens;
