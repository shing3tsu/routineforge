# RoutineForge — Component specs

Companion to `design/tokens.ts` and `design/tokens.css`. Each section documents one primitive: states, tokens, ARIA, keyboard, sizing.

All tokens are referenced by their semantic name (e.g. `color.brand.primary`). The CSS custom property mirror in `tokens.css` is given in parens.

---

## Conventions

- **Roles & names** follow the WAI-ARIA Authoring Practices.
- **Focus**: every interactive element gets a 2px outline in `color.focus.ring` (`--c-focus-ring`) offset by 2–3px, via `:focus-visible`. Pointer interactions don't show it.
- **Disabled**: `opacity: .45; pointer-events: none`; never visually swap the colour.
- **Min hit target**: 44×44pt on mobile. Every checkbox is at least 28px visually with a 56px-tall row.
- **Numerals**: any digit visible to the user — counts, streaks, times, dates — uses `font-family: var(--font-mono)` with `font-variant-numeric: tabular-nums`. Glyph-stable.

---

## Button

Variants: `primary` · `secondary` · `ghost` · `danger`
Sizes:    `sm` (34) · `md` (44) · `lg` (54)

### States — by variant

| state | primary | secondary | ghost | danger |
|---|---|---|---|---|
| default  | `brand.primary` bg, `text.on-brand` fg, `shadow.sm` | `surface.elevated` bg, `text.primary` fg, 1px `border.subtle` inset | transparent bg, `text.secondary` fg | `state.danger` bg, white fg |
| hover    | `brand.primaryHover` bg, `shadow.md` | inset 1px `border.strong`, `shadow.sm` | `surface.sunken` bg, `text.primary` fg | brightness .92 |
| active   | `transform: scale(.97)` | same | same | same |
| focus-visible | 2px `focus.ring` ring offset 3px | same | same | same |
| disabled | opacity .45, no pointer | same | same | same |
| loading  | inline spinner replaces leading slot; label stays; `aria-busy="true"` | same | same | same |

### Sizing rules

- Padding scales with size: `sm` 12px, `md` 16px, `lg` 24px (horizontal).
- Radius: always `radius.full`. Pillowy.
- Icons inline at 16/18/20px for sm/md/lg.
- `--block` modifier: `width: 100%`.

### ARIA / keyboard

- Native `<button>`. `aria-label` when icon-only. `Space`/`Enter` activate.

---

## TextField

Slots: label · hint · error · leading · trailing.

### Anatomy

```
[ leading ] [ input ] [ trailing ]
```

- Label is **outside** the field (small caps, secondary), not floating.
- Trailing slot is for actions (clear, reveal password, units).

### States

| state | shadow / outline |
|---|---|
| default | `shadow.xs` + inset 1px `border.subtle` |
| hover | inset 1px `border.strong` |
| focus-within | `shadow.sm` + inset 2px `border.focus` |
| error | inset 1.5px `state.danger`; hint text turns `state.danger` |
| disabled | opacity .55, `cursor: not-allowed` |
| read-only | `surface.sunken` bg, no inset, no focus ring |

### Sizing

- Wrap height ≥ 52px (touch). Input height 50.
- Radius `radius.lg`.

### ARIA / keyboard

- `<label for>` ties to `<input id>`. Hint and error link via `aria-describedby`. Error sets `aria-invalid="true"`.

---

## Card

Variants: default · `--hero` · `--sunken`

### Anatomy

- `default`: `surface.elevated` bg, `shadow.sm` + `shadow.inner`, `radius.xl` (22px), padding `spacing.5`.
- `--hero`: `radius.2xl` (28px), padding `spacing.6`, `shadow.lg`. Used for the active routine on Today and the streak block on Habit detail.
- `--sunken`: `surface.sunken` bg, no shadow, 1px `border.subtle`. For empty wells / disabled inputs.

### Notes

- Cards stack with `spacing.3` gap on mobile, `spacing.4`–`spacing.5` on desktop.
- No card has a coloured left border — that's a SaaS trope we explicitly rejected.
- Routines list cards have a watercolor blob in the top-right corner (radial gradient, blurred) for differentiation between routines. Sparing.

---

## Checkbox — the workhorse

Two surfaces:

1. **Bare** (`.rf-check`): the toggle alone, 28/32/36px. Use inside a tappable row or a button.
2. **Row** (`.rf-checkrow`): the entire row is the click target — checkbox + label + optional meta.

### Bare states

| state | look |
|---|---|
| default (unchecked) | `surface.elevated` bg, inset 2px `border.strong`, no glyph |
| hover               | inset 2px `text.secondary` |
| pressed             | `transform: scale(.92)` |
| checked             | `brand.primary` bg, inset 2px `brand.primary`, sketchy ✓ stroke draws in (spring easing 220ms, delay 60ms) |
| focus-visible       | 2px ring `focus.ring`, offset 2px |
| disabled            | opacity .45 |

### Row behavior

- Min height **56px** on mobile. Entire row tappable; check rotates 0px (no animation jiggle).
- When `data-done="true"`: label colour shifts to `text.muted`, line-through draws with `text-decoration-color` transitioning from transparent (220ms).
- **Mobile gestures**: row supports swipe-to-complete (left→right) and swipe-to-delete (right→left) — both reveal a 80-wide action well. Long-press opens a context menu (`reorder · edit · delete · skip today`).
- **Haptics**: implementer fires `navigator.vibrate(8)` on check. Designer-side, no visual cue.

### ARIA / keyboard

- `role="checkbox"`, `aria-checked`. Standalone or composite.
- Row uses `role="button"` + `aria-pressed`. The bare check inside has `aria-hidden="true"` to avoid double-announcement.
- Space toggles. Arrow up/down moves between rows in a list.

### Why this size

`28px` minimum check is the largest you can fit on a 390-wide row that still has room for label + meta. The 56px row guarantees the touch target even if the user lands on the label. Phones in cars / cold hands assumed.

---

## Alert

Variants: `success` · `info` · `warning` · `danger`.

- Radius `radius.lg`. Padding `spacing.4`.
- Background = the state's `.subtle` token; text = the state's base token. Both pass WCAG AA at 13–15px.
- Inline leading icon (18px, hand-drawn).
- Dismiss button (×) optional, sits in the trailing slot.
- `role="alert"` (assertive) for danger; `role="status"` (polite) for success/info.

---

## WeekdayChips

7 buttons, Mon–Sun (locale-aware, but the design uses Mon-first because the data model does too).

### States

| state | look |
|---|---|
| default     | `surface.elevated` bg, inset 1px `border.subtle`, `text.secondary` fg, mono caps label |
| pressed     | `brand.primary` bg, `text.on-brand` fg, inset 1px `brand.primary` |
| `--rest`    | transparent bg, `text.muted` fg, line-through |
| focus-visible | 2px ring |

- Height **44px**. Radius `radius.full`.
- Mono short-name (`mon`/`tue`/...). Caps + wider tracking distinguishes from sans body.

### ARIA / keyboard

- `role="group"`, group label = "weekdays".
- Each chip is a toggle button: `aria-pressed`. Tab/Shift-Tab moves between; Space toggles. Arrow keys NOT used — too easy to misfire.

---

## StreakBadge

Pill-shaped. `brand.primarySubtle` bg, `brand.primary` fg. Mono numeral + small caps unit.

### Sizes

- Default — sits inline next to a habit name. Padding `spacing.2 spacing.3`. Numeral `fs-lg`.
- `--lg` — for habit detail. Numeral `fs-4xl`, can carry a "best · N" affordance to the right (`text.muted`).

### Tone

User chose **completely neutral** streak UX. So:

- No red, no broken-chain icon, no urgent language at zero.
- Zero shows as a plain `0` (mono). The pill stays the same colour.
- Missed days don't trigger animation. We just don't increment the number.

---

## CalendarHeatmap

90-day grid, 13 cols × 7 rows (Mon-Sun rows, weeks as columns).

### Levels

- `level-0` (none): `surface.sunken`.
- `level-1`: 25% mix `brand.primary` → `surface.sunken`.
- `level-2`: 55% mix.
- `level-3`: 100% `brand.primary`.

### Layout

- Cell aspect 1:1, radius 4px, gap 4px.
- Legend below: "less ▢▢▢▢ more · last 90 days" in mono caps.

### ARIA / keyboard

- `role="img"` with `aria-label` summarising count + period.
- Hover/focus on a cell shows date + level in a tooltip (`role="tooltip"`).
- Roving tabindex if cells are individually focusable (optional — most users don't need it).

---

## DayStepEditor

The centerpiece of routine detail. Two parts.

### Weekday tab strip

- Pill-shaped segment control. 7 tabs (M T W T F S S), mono single-letter labels.
- Selected tab gets `surface.elevated` bg with `shadow.xs`.
- A tab can be marked **rest** (no steps scheduled): label gets line-through, opacity .6. Saturday is the canonical demo rest day.
- `role="tablist"`, each tab `role="tab"` with `aria-selected`. Arrow Left/Right rotate selection.

### Step list

- Drag handle on the left (sketchy six-dot, `text.muted`). Cursor `grab`.
- Mono two-digit index `01`, `02`, ... (caps the implicit ordering).
- Step text (`fs-base`).
- Trailing kebab (`⋯`) opens per-step menu (`rename · move up · move down · delete`).
- Rows divided by 1px `border.subtle`. No bg fill — quiet by default.
- Empty state inside a tab: dashed `border.strong`, "No steps for THU yet · + Add".

### Add step

- Trailing ghost button (`+ Add step`). When pressed, inserts an empty editable row at the bottom focused.

### Keyboard

- Tab between rows. `Space` to grab a row, arrows to reorder, `Space` to drop. Standard a11y drag-drop fallback.

---

## TopBar → BottomNav

We replaced the desktop-style TopBar with a **mobile-first bottom navigation** on phones. The desktop layout keeps a side rail (220px) on the left. Both use the same item set:

- `Today` (sun icon)
- `Routines` (list icon)
- `Habits` (flame icon)
- `Account` (user icon — labelled "You" on mobile to save horizontal space)

### Mobile (BottomNav)

- Fixed to viewport bottom; padding bottom = `max(spacing.3, env(safe-area-inset-bottom))`.
- Frosted bg: `surface.elevated` at 92% with `backdrop-filter: blur(20px)`.
- 4 items, even-distributed. Active item = `brand.primary`. Inactive = `text.muted`. Icon (22) + tiny mono caps label.
- 1px top `border.subtle`.

### Desktop (SideNav)

- 220px wide, transparent bg over the watercolor wash.
- Items get `surface.elevated` bg when active, with `shadow.xs`. Inactive items get hover `surface.sunken`.
- Avatar tile pinned at the bottom (name + email), separator above.

### Why bottom on mobile

Primary actions reachable in the thumb zone, per the brief constraint #5. The hand drops, the thumb sweeps a 250-pixel arc — Today, Routines, Habits, You all land in it.

---

## Motion

- All token names live under `motion.duration` and `motion.easing`.
- Default: `duration.quick` (160) on `easing.standard` for hovers, presses.
- Pillowy: `duration.glide` (220) on `easing.soft` for cards, drawers, the row swipe reveal.
- Springy: `duration.glide` on `easing.spring` for the checkbox check-in draw and pop.
- Page enter: `duration.ease` (280) on `easing.decel` — translateY(8) → 0 + opacity 0 → 1. Implementer adds `prefers-reduced-motion` guard (already in `base.css`).

---

## What we explicitly didn't ship

- No badges with notification dots — that's a productivity-as-anxiety crutch.
- No "celebrate" confetti, no streak red-flame icon. The brief said neutral.
- No floating tooltips on the today view. Touch-first UI; tooltips are desktop niceties.
- No left-border accent cards.
- No drop shadows over 56px-soft. Pillowy, never dramatic.
