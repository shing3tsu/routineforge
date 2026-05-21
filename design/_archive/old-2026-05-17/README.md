# RoutineForge Design System

This directory is the source of truth for everything visual: tokens,
component specs, and high-fidelity static mockups. `frontend` and
`frontend-test` consume this — no app code should re-define what's
expressed here.

## Files

- `tokens.ts` — typed design tokens. Light + dark color tables, spacing,
  type ramp, radii, layered shadows, motion durations + easings, z-index
  layers. Components consume **semantic** tokens only (`color.surface.elevated`),
  never raw scale entries.
- `components.md` — per-component spec, every state (`default`, `hover`,
  `active`, `focus-visible`, `disabled`, `loading`, `empty`, `error`),
  ARIA expectations, keyboard behavior, sizing.
- `mockups/*.html` — standalone HTML files, one per screen, both light and
  dark in side-by-side viewports at mobile (390 × 844) and desktop (1440)
  widths. Inline CSS uses literal token values from `tokens.ts`. Inline SVG
  for icons. No external assets, no JS.

Open any mockup directly via `file://` in a browser. Nothing fetched, nothing
to install.

## Aesthetic position

Calm. Minimal. Mature. **Typography does the heavy lifting; color and
spacing reinforce.** A product about routine and habit should not feel
exciting — it should feel composed.

References we sit alongside:

- **Linear** — the bar for app-shell composure, dark mode that's its own
  thing, opinionated keyboard-first interactions.
- **Things 3** — the bar for a single-product, single-task list reading
  cleanly with zero visual noise.
- **Stripe Dashboard** — the bar for restraint in data-density screens;
  a deeply functional UI that never reaches for decoration.
- **Notion** — for editor mechanics in the `DayStepEditor` and other
  inline-edit moments.

References we are **explicitly not**:

- Generic SaaS landing-page look — no full-bleed gradient backdrops, no
  hero "AI for X" gradient blurs, no 3D illustration garbage.
- The "AI-template" trap — no purple-to-pink brand gradients, no glossy
  hero panels, no spotlight-on-card lighting effects, no glass-morphism.
- `rounded-2xl` on everything — radius is restrained, defaulting to `md`
  (6px) for controls. `xl`/`2xl` is reserved for sheets and major surfaces.
- Emoji-as-icon — never. Including for streaks; the `StreakBadge`
  component is the only thing that conveys streaks. No flames.

## Palette rationale

Brand-level colors (≤ 5): brand, neutrals, success (green), warning/streak
(amber), danger (red), info (deeper blue). Neutrals carry 90% of the work.

- **Brand (deep teal-blue, light `#1F5A99` / dark `#6FA8DC`).** Considered.
  Reads serious without going corporate-navy. Saturation is intentionally
  modest — at high saturation a UI brand color competes with content; at
  low saturation it disappears. This sits in the middle.
- **Neutral ramp** runs from warm paper (`#FCFCFB`) in light to a warm-tinged
  near-black (`#0E1013`) in dark. Pure cool grays look clinical and the
  pure black trap on dark mode (#000) flattens elevation; we use `#0E1013`
  base with `#1E2125` for elevated surfaces. Dark mode is **designed**, not
  inverted.
- **Success green (`#377C33` / `#6DB46A`)** is a muted forest tone, not
  the default `#22C55E` "go green". It reads success without screaming.
- **Streak amber (`#C2872A` / `#D4A24A`)** is a real amber. Warm without
  being orange. Used exclusively in the StreakBadge and the
  "in-progress" badge — those two use cases share intent (a thing being
  built up).
- **Danger brick (`#A0342B` / `#D9716A`)** is a brick red, not a hot
  tomato. Destructive without being aggressive.
- **Info (`#266183` / `#7DB2CE`)** lives slightly deeper than the brand so
  the two can co-occur (a brand button next to an info Toast) without
  reading as the same hue.

All semantic background-on-text pairs are tested for WCAG contrast:
- Body text (`text.primary` on `surface.base`) hits AAA in both modes
  (17.4 : 1 light, 15.3 : 1 dark).
- Secondary text hits AAA.
- Muted text (`text.muted`) hits AA — restricted to non-body uses (meta,
  hints, eyebrows).

## Spacing & rhythm

A 4px base scale. Most padding lives between `spacing[3]` and
`spacing[6]`. Section gaps land on `spacing[6]`–`spacing[8]`. Cards on
mobile use `spacing[4]` padding; desktop `spacing[5]`. We do not use a
5px or 7px value — the scale is the scale.

Typography ramp follows ~1.2 between adjacent UI sizes, stretching to
~1.3 at display sizes. Letter-spacing tightens at larger sizes; line
height loosens at body sizes. This is the calm rhythm: small variations
near the body, sharper hierarchy at headlines.

## Motion

Three easings:
- `easeOutQuart` — appearances and expansions decelerate into rest.
- `easeInOut` — symmetric movement between two on-screen states.
- `easeInQuart` — exits accelerate away.

Durations live in the 50–500ms band. Anything over 300ms is reserved for
deliberate, layered transitions (sheet entries, completion celebrations).
We honor `prefers-reduced-motion: reduce` everywhere — animations become
opacity fades or are skipped.

## Dos and Don'ts

### Do

- Lean on neutrals. Color appears when meaning needs to travel.
- Use `Card` (border, no shadow) over `Card` (shadow, no border) when
  multiple cards stack — shadowed-card-lists give a busy, layered look.
- Write specific empty-state copy per surface: *"No routines yet — let's
  set one up"* not *"No items found"*.
- Use line icons at 1.5px stroke. Filled icons for active nav states only.
- Reach for `motion.duration.fast` for hover state changes;
  `motion.duration.normal` for geometry-changing transitions.
- Use the dark-mode shadow recipe (lower-alpha dark drop + 1px hairline
  border) rather than punching shadow opacity up.
- Always provide a focus ring on interactive elements (`:focus-visible`),
  using `outline` not `box-shadow`, so it composes with elevation.

### Don't

- Don't use opacity-only hovers — `opacity: 0.8` reads as a render bug
  in dark mode. Hover changes use color tokens.
- Don't use emoji as icons. Especially flames for streaks. Use
  `StreakBadge`.
- Don't introduce a new color outside the semantic palette to "make
  something pop". If something is competing for attention, fix the
  hierarchy first.
- Don't use `rounded-2xl` on buttons or list rows. Default is `radius.md`
  (6px). `xl` for cards, `2xl` for sheets only.
- Don't reach for gradients except as `surface.sunken → surface.elevated`
  vertical fade on auth marketing-side panels (and even that is
  optional).
- Don't put more than one primary action on a screen. Secondary or ghost
  for everything else.
- Don't use raw color values in components — only semantic tokens
  (`color.surface.elevated`). If a semantic token is missing, add it; do
  not bypass.
- Don't disable a button by lowering opacity. Use the `disabled` token
  pair (`surface.sunken` bg + `text.muted` text) so the state is legible
  on both modes.

## Implementation notes for `frontend`

- Tokens are exported as a frozen-in-shape `const` (TypeScript `as const`)
  so editor autocomplete is exhaustive. Resolve theme via a single
  `useTokens(mode)` (or equivalent server-derivable helper) returning
  the active mode's semantic table.
- The mockups inline the literal CSS values. When implementing, do **not**
  re-inline — generate from the tokens (CSS custom properties is the
  cleanest path: emit `:root` + `[data-theme="dark"]` once and reference
  via `var(--surface-base)`).
- Every component spec calls out the focus-visible ring explicitly. If a
  component has no visible focus state in implementation, that's a
  blocker.
- Where ARIA is described (`role="grid"`, `aria-pressed`, etc.), it's
  the minimum bar, not the ceiling. Use semantic HTML elements first;
  reach for ARIA only when no native element fits.

## Mockup inventory

| File                         | Light + Dark | Mobile + Desktop | Notes |
|------------------------------|--------------|------------------|-------|
| `signup.html`                | yes          | yes              | Marketing panel on desktop.            |
| `login.html`                 | yes          | yes              | Dark mobile shows inline error state.  |
| `today.html`                 | yes          | yes              | Mixed completion (done / in-prog / 0). |
| `routines-list.html`         | yes          | yes              | Selected row on desktop.               |
| `routine-detail.html`        | yes          | yes              | Dark mobile = Saturday rest-day empty. |
| `habits-list.html`           | yes          | yes              | Mini 7-day heatmap on desktop rows.    |
| `habit-detail.html`          | yes          | yes              | Full 90-day heatmap + stats + streak.  |
| `account.html`               | yes          | yes              | Per-routine + per-habit reminder rows. |
| `empty-state-today.html`     | yes          | yes              | First-run + starter templates.         |
| `offline.html`               | yes          | yes              | Warning topbar border + banner.        |

## What this set does not yet include

Reported here for `next-agent` triage; out of this dispatch's scope:

- Routine create dialog (vs. detail page) — the inline detail editor
  covers most flows but a true creation modal would be cleaner.
- Habit create dialog with cadence picker.
- Toast and Spinner live demos (specced, not mocked).
- Push permission prompt UX (specced once we know what the browser
  prompt looks like alongside ours).
- Install-prompt banner (specced as a `Card` variant; deserves its own
  mockup once the PWA agent confirms behavior).
- Loading and error states for `today.html` (specced via Skeleton and
  Card.error; not yet mocked).
