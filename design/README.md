# RoutineForge — Design rationale

> "One quiet list. Every day, on time."

This pass replaces the previous "competent but generic" design with something that has a point of view: **soft-engineered**. Arc's pillow × Reflect's restraint × Stoic's atmospheric wash — sand-cast through Linear's monospace numerals.

## What's in here

| File | What it is |
|---|---|
| `tokens.ts` | Typed token export. Four palettes × light/dark × full semantic layer + spacing/type/motion/radius/shadow/z. |
| `tokens.css` | Same tokens as CSS custom properties, scoped by `[data-palette]` + `[data-theme]` on `<html>`. |
| `base.css` | Element resets + watercolor wash + every primitive (button, field, check, chip, badge, heatmap, nav, tabs, alert). All using token variables. |
| `icons.jsx` | Hand-drawn icon set. Clean SVG paths run through an SVG `feTurbulence` + `feDisplacementMap` filter for organic distortion. |
| `primitives.jsx` | React building blocks shared across screens. |
| `screens/*.jsx` | Per-screen React. Each exports a `Mobile` and `Desktop` variant. |
| `mockups/*.html` | One self-contained HTML file per screen. Mobile + desktop, light/dark/both toggle, palette toggle. |
| `components.md` | Per-component spec sheet — states, tokens, ARIA, keyboard, sizing. |

`../RoutineForge.html` (project root) is a pan/zoom design canvas that shows all 10 screens at once, with the same palette + theme tweaks.

## Aesthetic position

### What we drew from

- **Arc** — pillowy radii (16–28px), watercolor washes as ambient backdrops, generous whitespace, brand permitted to bleed across surfaces. Permission to be soft.
- **Reflect** — chrome-less. No top bars on the today view. The page IS the content. Words and numbers do the work.
- **Stoic** — the radial watercolor wash on every signed-in surface. Contemplative, dawn-coloured, never decorative-for-decoration's-sake.
- **Linear, sparingly** — monospace numerals for any digit a user reads. Streaks, counts, times, dates, percentages. It's the engineered backbone under the soft skin.

### What we rejected

- **The previous pass: too generic / too corporate / felt like a SaaS template.** Specifically: shrunk-desktop on mobile, arbitrary blue accent, flat hierarchy, no character.
- **Coloured left-border cards.** The single most overused pattern in dashboards.
- **Stock Inter.** User said "Inter-replacements, not Inter" — we use Geist Sans + Geist Mono. Same neutral utility, no Inter fatigue.
- **Streak punishment.** User chose neutral-streak UX, so: no red flame at zero, no broken-chain icon, no "you lost it" copy. The number changes; the pill doesn't.
- **Bottom sheets that look like fingernails.** Pillowy radius (22+), generous padding.
- **AI tropes:** no gradient buttons, no emoji garnishes, no glassmorphism for its own sake, no SVG illustrations of cartoon people. Where we needed warmth, we used watercolor wash.

## Palette rationale — why four

We ship four palettes because the user said "make different palettes." Each has a fully-tuned light + dark mode with semantic-token parity. The active palette flips via `[data-palette]` on `<html>`.

### Bone (default)

Warm cream + dusty terracotta (`#C9543A`). The friendliest palette, hardest to make look like a SaaS. Reads as paper-pulp on the light side, ember and ink on the dark. Personality: morning, kitchen, a slightly worn notebook.

### Fog

Cool slate + indigo (`#4F46E5`). The "looks like a real app" option for users who reach for blue. We pulled the indigo away from generic-Inter-blue toward something cooler, more deliberate.

### Sage

Off-white with a green hint (`#4A7C3A`). Calmest, most "wellness" leaning without being on-the-nose. The neutrals carry a faint chlorophyll cast.

### Graphite

True neutral (warm-free greys) + plum (`#7C3AED`). For users who hate warmth in their tools. Clean engineering vibe; the plum accent prevents it from feeling clinical.

Every palette × every theme combination is verified AA (body text ≥ 4.5:1, large text ≥ 3:1). Body text against page background hits AAA in every variant — that was the brief's bar.

## Type

- **Geist Sans** — display, body, all UI labels. 12 sizes (xs … 7xl), three weights (400/500/600).
- **Geist Mono** — every numeral, every eyebrow caption, every time/date. `tabular-nums` always. Tight letter-spacing on big numerals (`-0.04em`) so they look like display type, not data.

The mono *is* the brand voice. It's how the design feels engineered without looking technical: a date glyph or streak number is always quietly, recognisably monospaced.

## Motion

User chose **balanced**. The token system splits motion into five durations and five easings so we don't have to pick one:

- `snap` (120ms) on `standard` — tap acknowledgements
- `quick` (160ms) on `standard` — hovers, color/bg fades
- `glide` (220ms) on `soft` (custom pillowy cubic-bezier) — cards, drawers, swipe reveal
- `glide` (220ms) on `spring` — the checkbox tick draw + scale pop
- `ease` (280ms) on `decel` — page-enter (translateY 8 → 0 + fade)

All transitions degrade to 1ms under `prefers-reduced-motion: reduce` (in `base.css`).

## Iconography

Hand-drawn. The implementation is a wide SVG `feTurbulence`/`feDisplacementMap` filter applied to clean stroke paths — 1.6 unit displacement, baseFrequency 0.04. Soft icons (sun, flame, leaf) use a gentler filter; sharp icons (chevron, check, plus) use the standard one.

Why a filter and not actual hand-drawn assets:

1. It scales to any size without going pixelly.
2. It recolors via `currentColor` so palette swaps Just Work.
3. The "wobble" is deterministic per icon (`seed` controls it).
4. One filter, ~30 icons. No asset pipeline.

The brand mark gets its own filter (less wobble) so the logotype reads consistent.

## Mobile-first decisions

- **Bottom nav, not top.** Today / Routines / Habits / You. Thumb-zone.
- **Hero numeral on Today.** "4" sits at 72px in the upper left — the eye lands on it before anything else. Below: "things left for today" in 17/20px sans, then a 7-dot progress run.
- **Hero card on Today.** The first unfinished routine renders fully expanded with 32px checkboxes. Tapping any row checks it without a navigation step. Subsequent routines render compact (2 steps + "more").
- **FAB on list screens.** Compose-style pill (`+ New routine` / `+ New habit`) anchored 88px above the bottom nav.
- **Auth on mobile**: brand lockup top, headline + form vertically centred, action button full-width 54px. One-thumb sign-in.

## Desktop scales up, doesn't replace

- 220px side rail with the lockup + nav + signed-in avatar.
- Today is **two columns** (1.4fr routines · 1fr habits) inside an 880px content max-width.
- Routines/Habits list → 2-column grid at >900px.
- Detail pages → primary surface on the left (Heatmap / DayStepEditor), three small cards stacked on the right.

We never grow components past their useful size. A check is 32px on mobile and 32px on desktop — your finger and your mouse are roughly the same precision tool at this scale.

## Do's and don'ts

### Do

- Reach for `surface.elevated` cards on top of the wash backdrop. The contrast is the design.
- Use `mono` numerals everywhere you show a digit. Even one number in a sentence: `<span className="mono">3</span> of 7`.
- Keep eyebrow captions short (≤ 3 words), mono, all-caps, `widest` tracking.
- Use the `--hero` card modifier for the one thing on a screen that matters most. One per screen.

### Don't

- Mix mono digits with sans digits in the same string. Pick the whole sentence.
- Add an icon to every label. We use icons sparingly — section eyebrows have no icon, routine cards do (because routines are visually distinct entities), buttons sometimes do, navigation always does.
- Re-introduce coloured left-border alerts/cards. Use the `.subtle` background variants instead.
- Show progress as a percentage. Always show fractions (`3 of 7`) or counts (`12 day streak`).

## Implementation notes for engineering

- `tokens.ts` is the source of truth. `tokens.css` is generated to mirror it 1:1 (in this design pass it's hand-written; in production, generate it).
- Component prop shapes match what was in the existing primitives — Button (variant/size), TextField (label/hint/error/leading/trailing), Checkbox, WeekdayChips, StreakBadge, CalendarHeatmap, DayStepEditor, Alert. The visual is new; the shape is not.
- The watercolor wash is two CSS gradients + an SVG noise overlay. Inexpensive. Avoid putting it inside scrollable lists; put it on the page background.
- The hand-drawn icon filter is GPU-cheap on every browser shipped since 2017. We tested at 60fps with 24 icons on screen.
- Streak math (current / longest / total) is server-computed. The design just renders the numbers — no client-side calculation, no race conditions on midnight.

## What's intentionally not in this pass

- **Pricing / billing screens.** Not in the brief.
- **Onboarding flow.** Empty state covers first-run but a multi-screen tour is its own design pass — flag it for the next one.
- **Insights / analytics view.** Habit detail has the 90-day heatmap; a weekly recap or yearly review isn't designed.
- **Sharing / collaboration.** Brief says multi-user, but only in the auth sense — not collaborative routines.

These are open questions, not omissions. Worth a follow-up conversation before designing them.
