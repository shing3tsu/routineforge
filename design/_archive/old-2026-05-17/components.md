# RoutineForge — Component Specs

This document is the contract between `design` and `frontend`. Every component
below enumerates every applicable state. Token references are semantic only
(`color.surface.elevated`, never `raw.neutral[100]`). When `frontend`
implements these, the API surface should match the *behavior* described — not
necessarily the prop names verbatim — but every listed state must be reachable.

A few conventions:

- **Focus** means `:focus-visible` unless otherwise noted. Mouse-click focus
  must not show a ring; keyboard focus must. We never use `:focus` raw.
- The focus ring is a `2px` solid `color.focus.ring` with `2px` offset using
  `outline` (NOT `box-shadow`, so it composes with elevation shadows). On dark
  backgrounds the offset uses `color.focus.ringContrast` if a halo is needed.
- Minimum interactive target is `40px` square (`spacing[10]`). On dense
  desktop lists we allow `32px` with the surrounding row clickable.
- Transitions use `motion.duration.fast` (`100ms`) for hovers,
  `motion.duration.normal` (`200ms`) for state changes that move geometry.
- All icons are line-style, 1.5px stroke, 20px box (16px in dense contexts).
  No emoji as icons. Anywhere we'd reach for a fire / flame for streaks, we
  use the `StreakBadge` component instead.

---

## Button

A solid, semantic action trigger. Use `IconButton` when the action is purely
icon-led (toolbar, close, kebab).

### Variants

| variant     | use                                                 |
|-------------|-----------------------------------------------------|
| `primary`   | The single most important action on a view.         |
| `secondary` | Other affirmative actions; outlined.                |
| `ghost`     | Tertiary actions; no fill, no border at rest.       |
| `danger`    | Destructive actions (delete routine, sign out is *secondary* not danger). |

### Sizes

| size | height | px-padding-x | font-size | icon |
|------|--------|--------------|-----------|------|
| `sm` | 32px   | `spacing[3]` | `sm`      | 16px |
| `md` | 40px   | `spacing[4]` | `base`    | 20px |
| `lg` | 48px   | `spacing[5]` | `lg`      | 20px |

All sizes use `radius.md`, font-weight `medium`. Internal icon-to-label gap is
`spacing[2]`.

### States

#### `primary`

- **default** — bg `color.brand.primary`, text `color.brand.onPrimary`,
  no border. Shadow `shadow.1` light / `shadow.1` dark (very subtle).
- **hover** — bg `color.brand.primaryHover`. Cursor `pointer`. Transition
  `background-color` `fast` `easeInOut`.
- **active** (pressed) — bg `color.brand.primaryHover`, translate-y `1px`,
  shadow `shadow.0`. Snaps back on release.
- **focus-visible** — outline `2px solid color.focus.ring` with `2px` offset.
- **disabled** — bg `color.surface.sunken`, text `color.text.muted`, no
  shadow, cursor `not-allowed`. `aria-disabled="true"`. NOT just lowered
  opacity — that always looks broken on dark mode.
- **loading** — replace label with `Spinner` (size matches font size). Button
  retains its width (measured at render). `aria-busy="true"`,
  `aria-disabled="true"`. Pointer events disabled but visually identical to
  default fill.
- **empty / error** — not applicable (button has no inherent empty state;
  callers handle error toasts).

#### `secondary`

- **default** — bg `color.surface.elevated`, text `color.text.primary`, border
  `1px solid color.border.strong`.
- **hover** — bg `color.surface.sunken`, border `color.border.strong`.
- **active** — bg `color.surface.sunken`, translate-y `1px`.
- **focus-visible** — outline as primary.
- **disabled** — bg `color.surface.elevated`, text `color.text.muted`, border
  `color.border.subtle`, cursor `not-allowed`.
- **loading** — as primary.

#### `ghost`

- **default** — transparent bg, text `color.text.primary`, no border.
- **hover** — bg `color.surface.sunken`.
- **active** — bg `color.surface.sunken`, translate-y `1px`.
- **focus-visible** — outline as primary, with `2px` offset so the ring is
  visible against the transparent default.
- **disabled** — text `color.text.muted`.

#### `danger`

- Same shape as `primary` but using `color.state.danger` / `color.text.onAccent`.
- Hover lowers L* by ~6% (use a slightly darker derivative; in tokens this is
  achieved by referencing `raw.red[600]` from a derived semantic — for MVP,
  components may darken via `filter: brightness(0.94)` on hover only).
- Focus ring uses `color.state.danger` instead of `color.focus.ring` so the
  semantic stays consistent.

### ARIA

- Implicit `role="button"` from `<button>`. Always use `<button>`, never a div.
- `aria-label` required if there is no visible text (icon-only variants —
  consider `IconButton` instead).
- `aria-busy="true"` while loading; `aria-disabled` mirrors `disabled` when
  the prop is set programmatically.
- `type="button"` by default; `type="submit"` only inside forms when intended.

### Keyboard

- `Enter` / `Space` activate. Native `<button>` semantics.
- `Tab` to focus. Buttons in a row should be reachable in document order.

---

## IconButton

Square button hosting a single icon. Used for kebab menus, close buttons on
dialogs, tab bar items, toolbar actions.

### Sizes

| size | square | icon |
|------|--------|------|
| `sm` | 32px   | 16px |
| `md` | 40px   | 20px |
| `lg` | 48px   | 24px |

`radius.md` for square; `radius.full` for the "round" variant (used for the
floating action button on `today.html` mobile).

### States

Same state set as Button.ghost (default ghost-style is the most common). When
used as a "primary FAB" (today's floating quick-add on mobile), it uses
Button.primary tokens.

### ARIA

- `aria-label` is REQUIRED. The build should fail typecheck without it.
- If the icon's meaning is decorative (paired with a visible label nearby),
  use Button with `aria-labelledby` instead.

---

## TextField

Single-line text input with label, optional hint, optional error message,
optional leading and trailing icons.

### Anatomy

```
[ Label ] (optional eyebrow on top)
[ icon | input ........................ | icon ]
[ Hint or Error message ]
```

### Sizing

| size | height | font-size | padding-x |
|------|--------|-----------|-----------|
| `md` | 40px   | `base`    | `spacing[3]` |
| `lg` | 48px   | `md`      | `spacing[4]` |

Label uses `sm`, `medium` weight, `color.text.secondary`, `spacing[1]` margin
below. Hint uses `xs`, `regular`, `color.text.muted`. Error uses `xs`,
`medium`, `color.state.danger`.

### States

- **default** — bg `color.surface.elevated`, border `1px solid color.border.subtle`,
  text `color.text.primary`, placeholder `color.text.muted`, radius `radius.md`.
- **hover** (not focused) — border `color.border.strong`.
- **focus-visible** — border `color.border.focus`, outline `2px solid color.focus.ring`
  at `1px` offset. Background unchanged.
- **filled** (has value, not focused) — same as default; weighting via value
  contrast is sufficient.
- **disabled** — bg `color.surface.sunken`, text `color.text.muted`, border
  `color.border.subtle`, cursor `not-allowed`. `aria-disabled="true"`.
- **read-only** — bg `color.surface.sunken`, text `color.text.primary`,
  border `color.border.subtle`. Cursor `text`. NOT disabled — focus and copy
  still work.
- **loading** — trailing icon swapped for a `Spinner`. The rest of the field
  remains interactive (a value still keys); the spinner indicates an
  async validation. `aria-busy="true"`.
- **error** — border `color.state.danger`, error message visible below in
  `color.state.danger`. Focus ring shifts to `color.state.danger`.
  `aria-invalid="true"`, `aria-describedby` linking to the error node id.
- **empty** — not applicable (the empty-with-placeholder is the default).

### ARIA

- `<label for>` linked to the input id; or `aria-labelledby` if visually unusual.
- `aria-describedby` pointing to hint and/or error id (space-separated).
- Required fields use `aria-required="true"`; the visual indicator is the
  word "required" in `xs` `color.text.muted` after the label, NOT a bare `*`.

### Keyboard

- All native input keys.
- `Enter` in a single-field form submits; in multi-field forms it advances
  to the next focusable field unless explicitly designated as submit.

---

## Checkbox

The workhorse. Every routine step on the today view is a Checkbox. Every
habit completion is a Checkbox. Must read instantly, must feel tactile.

### Anatomy

A `20px` square (`radius.sm`) with an `18px` label gap.

```
[ ☐ ]  Label text
```

For routine steps in dense lists, label may span multiple lines; checkbox
aligns to the first line baseline + 2px (visually-centered cap-height).

### States

- **unchecked, default** — bg `color.surface.elevated`, border `1.5px solid
  color.border.strong`. Label `color.text.primary`.
- **unchecked, hover** — bg `color.surface.sunken`, border `color.brand.primary`.
  Cursor `pointer`. Transition `border-color`, `background-color` `fast`.
- **unchecked, active** (mouse-down or finger-down) — bg `color.brand.primarySubtle`,
  border `color.brand.primary`. Scale `0.95` for `instant` then back.
- **unchecked, focus-visible** — outline `2px solid color.focus.ring` at `2px`
  offset.
- **checked, default** — bg `color.brand.primary`, border `color.brand.primary`.
  Checkmark drawn as inline SVG, stroke `color.brand.onPrimary`, 2px width,
  draw-on transition over `normal` `easeOutQuart` (clip-path or stroke-dasharray;
  caller-decided). Label text gets `color.text.secondary` and a `1px` strike
  through `color.text.muted` (transition opacity `normal`).
- **checked, hover** — bg `color.brand.primaryHover`.
- **checked, active** — same as checked-hover with a `0.95` scale flash.
- **checked, focus-visible** — outline as unchecked-focus.
- **indeterminate** — bg `color.brand.primary`, border same. SVG is a `2px`
  horizontal bar centered (not a check). Used for "parent" rows in a routine
  card when 1–3 of N steps are done.
- **disabled, unchecked** — bg `color.surface.sunken`, border
  `color.border.subtle`. Label `color.text.muted`.
- **disabled, checked** — bg `color.surface.sunken`, border
  `color.border.subtle`, checkmark `color.text.muted`. Label as
  disabled-unchecked.
- **error** — border `color.state.danger`, label unchanged. Used when a
  checkbox is part of a required group with nothing selected.
- **loading** — replace checkmark/box with a 16px `Spinner` centered. Used
  when checking/unchecking triggers an async write. `aria-busy="true"`.
- **empty** — not applicable.

### ARIA

- Use a `<input type="checkbox">` or a `<button role="checkbox" aria-checked>`
  for fully custom rendering. Either way, the toggle is keyboard-actionable.
- `aria-checked="mixed"` for indeterminate.
- Group of related checkboxes wraps in `<fieldset><legend>` or
  `role="group"` with `aria-labelledby`.

### Keyboard

- `Space` toggles. `Enter` does NOT toggle a checkbox (matches platform).
- `Tab` moves focus.

---

## Toggle / Switch

For binary preferences (notification master toggle, dark-mode toggle).
DO NOT use for actions or for things that submit on change without confirmation.

### Anatomy

A pill `radius.full`, width 36px, height 20px, knob diameter 16px with 2px
padding.

### States

- **off, default** — track bg `color.surface.sunken`, knob `color.surface.elevated`,
  knob shadow `shadow.1`. Border on track `1px solid color.border.subtle`.
- **off, hover** — track bg `color.border.subtle`.
- **off, focus-visible** — outline `2px solid color.focus.ring`, `2px` offset.
- **on, default** — track bg `color.brand.primary`, knob `color.brand.onPrimary`,
  no track border. Knob translates +16px over `fast` `easeInOut`.
- **on, hover** — track bg `color.brand.primaryHover`.
- **on, focus-visible** — outline `2px solid color.focus.ring`.
- **disabled** — track bg `color.surface.sunken`, knob `color.surface.elevated`
  at reduced contrast (border `color.border.subtle`), cursor `not-allowed`.
- **loading** — knob becomes a small `Spinner` centered; track stays in its
  pre-toggle state; `aria-busy="true"`.

### ARIA

- `role="switch"` with `aria-checked` (true|false). Provide an accessible name
  via `aria-label` or visible label that's `aria-labelledby`'d.

### Keyboard

- `Space` toggles. `Enter` toggles when a labelled-button (we permit Enter for
  switches because they're often within forms).

---

## Select / Combobox

Used for the cadence picker on habits ("daily / N per week / specific
weekdays"), and the notification time picker fallback. Type-ahead optional.

### Anatomy

A button styled identically to `TextField` default, with a trailing chevron-
down icon. Activating opens a popover with a list of options.

### States (button)

- Mirrors `TextField` for default/hover/focus/disabled/error.
- **open** — border `color.border.focus`, outline `2px solid color.focus.ring`
  at `1px` offset, chevron rotated 180deg.

### States (popover)

- bg `color.surface.elevated`, shadow `shadow.3`, border `1px solid color.border.subtle`,
  radius `radius.lg`, padding `spacing[1]`.
- Option default — text `color.text.primary`, padding `spacing[2] spacing[3]`,
  radius `radius.sm`.
- Option hover / keyboard-active — bg `color.surface.sunken`.
- Option selected — bg `color.brand.primarySubtle`, text `color.brand.primary`,
  trailing checkmark icon.
- Option disabled — text `color.text.muted`, cursor `not-allowed`.
- **empty** — when no options match the type-ahead, show a single non-interactive
  row with `color.text.muted` reading "No matches." (or context-specific copy).
- **loading** — show three skeleton rows for async results. `aria-busy="true"`.
- **error** — if the option list fails to load, show a single row with
  `color.state.danger` text and a "Retry" Button.ghost.

### ARIA

- Combobox pattern (`role="combobox"`, `aria-expanded`, `aria-controls`,
  `aria-activedescendant`). Listbox uses `role="listbox"`; options
  `role="option"` with `aria-selected`.

### Keyboard

- `ArrowDown` opens and moves to next option. `ArrowUp` moves up.
- `Home` / `End` jump to first / last. Type-ahead jumps to matching option.
- `Enter` selects and closes. `Escape` closes without selecting.

---

## Card

A grouped surface. Has optional `header` (title + actions), `body`,
`footer` slots.

### Defaults

- bg `color.surface.elevated`, border `1px solid color.border.subtle`,
  radius `radius.lg`, shadow `shadow.0` at rest. Light mode card on
  `color.surface.base` reads through the subtle border + zero shadow — calmer
  than ambient drop shadows on a list of cards.
- Padding: `spacing[5]` desktop, `spacing[4]` mobile.
- Header divider (when both header and body present): `1px solid color.border.subtle`
  with `spacing[4]` padding below before body.
- Footer mirrors header divider rules above.

### States

- **default** — as above.
- **interactive (hover)** — if the entire card is clickable, hover bg
  `color.surface.sunken`. Add `cursor: pointer`.
- **interactive (focus-visible)** — outline `2px solid color.focus.ring` at
  `2px` offset, no inner border change.
- **selected** (e.g. selected routine in a list) — border `color.brand.primary`,
  bg unchanged.
- **disabled (interactive)** — text and content opacity unchanged but
  cursor `not-allowed`; do not change border. Add aria-disabled.
- **loading** — body replaced with `Skeleton` blocks; header preserved.
- **error** — body replaced with an inline error block: `color.state.dangerSubtle`
  bg, `color.state.dangerBorder` border, `color.text.primary` headline +
  `color.text.secondary` body + retry button.
- **empty** — body uses the `EmptyState` component (see below).

### ARIA

- Static cards are presentational. Interactive cards use `<button>` or
  `<a>` as the outer element if entirely clickable, or use a heading inside
  with a properly-scoped link/button (preferred for accessibility — clickable
  cards-as-buttons are not great for screen readers).

---

## Badge

Small inline tag. Used for: routine completion ("3/5"), cadence label
("Daily"), status pills.

### Variants

| variant   | bg                              | text                  | border                          |
|-----------|---------------------------------|-----------------------|---------------------------------|
| `neutral` | `color.surface.sunken`          | `color.text.secondary`| `color.border.subtle`            |
| `success` | `color.state.successSubtle`    | `color.state.success` | `color.state.successBorder`     |
| `warning` | `color.state.warningSubtle`    | `color.state.warning` | `color.state.warningBorder`     |
| `danger`  | `color.state.dangerSubtle`     | `color.state.danger`  | `color.state.dangerBorder`      |
| `info`    | `color.state.infoSubtle`       | `color.state.info`    | `color.state.infoBorder`        |
| `brand`   | `color.brand.primarySubtle`    | `color.brand.primary` | (none)                           |

### Sizing

| size | height | px-padding-x | font-size | dot |
|------|--------|--------------|-----------|-----|
| `sm` | 18px   | `spacing[2]` | `xs`      | 6px |
| `md` | 22px   | `spacing[2]` | `xs`      | 8px |

Always `radius.full`. Font weight `medium`. Optional leading dot (6px or 8px
circle in same color as text) or leading 12px icon.

### States

- Badges are presentational and have only a default state. If a badge is
  removable (e.g. selected weekday chip), see `WeekdayChips`.

### ARIA

- Static decoration: no role. If the badge represents the *meaning* of
  surrounding content, mark surrounding context with proper labels — the badge
  itself shouldn't carry semantics screen readers must read.

---

## Tabs and SegmentedControl

`Tabs` for navigating between primary views inside a screen (e.g. weekday
tabs on routine detail). `SegmentedControl` is the visual style for
sub-filters (e.g. "All / Active / Archived" on routines list).

### Tabs (underline style)

#### Anatomy

A horizontal row of tab triggers, each with a label and optional badge,
underline indicator below the active tab. Bottom border line `1px solid
color.border.subtle` spans full width.

#### States

- **default** — text `color.text.secondary`, no underline, padding `spacing[2]
  spacing[3]`.
- **hover** — text `color.text.primary`.
- **focus-visible** — outline `2px solid color.focus.ring` at `2px` offset.
- **active** (selected) — text `color.text.primary`, weight `medium`,
  underline `2px solid color.brand.primary`. Underline animates left/right on
  selection over `normal` `easeOutQuart`.
- **disabled** — text `color.text.muted`, cursor `not-allowed`.

#### ARIA

- `role="tablist"` parent, `role="tab"` triggers, `role="tabpanel"` for
  content. `aria-selected` on the active tab. `aria-controls` linking trigger
  to panel id, `aria-labelledby` on the panel pointing back.

#### Keyboard

- `Left/Right Arrow` move focus between tabs. `Home`/`End` jump.
- Activation can be automatic (focus = selected) or manual (`Enter`/`Space`
  to select). For weekday tabs we use manual activation — tabbing through
  weekdays while editing should not commit a weekday selection.

### SegmentedControl

#### Anatomy

A rounded pill container holding 2–4 options, each option is a sibling button
with no border. A floating "pill" moves to indicate the selected option.

#### States

- **container** — bg `color.surface.sunken`, radius `radius.full`, padding
  `spacing[1]`.
- **option default** — text `color.text.secondary`, padding `spacing[2]
  spacing[3]`, radius `radius.full`.
- **option hover** — text `color.text.primary`.
- **option selected** — bg `color.surface.elevated`, text `color.text.primary`,
  shadow `shadow.1`. Animates over `fast` `easeInOut`.
- **option focus-visible** — outline `2px solid color.focus.ring`.
- **option disabled** — text `color.text.muted`.

#### ARIA

- Use `role="radiogroup"` with `role="radio"` options. `aria-checked` on the
  selected option. Keyboard: arrow keys move and select.

---

## List + ListItem (interactive)

The routines list and habits list use this. Dense rows with leading meta,
primary label, optional secondary text, trailing meta and overflow action.

### Anatomy

```
[ ☐ | 📄  Push day                      | 4 / 6   ⋯ ]
            Mon · Wed · Fri              4 day streak
```

(Icons in the diagram are placeholders — replace with line icons.)

### Sizing

- Row min-height `64px` desktop, `72px` mobile (per [touch target spec][hig]).
- Padding-x `spacing[4]`.
- Border between rows: `1px solid color.border.subtle`; first and last rows
  may omit it if the parent surface already provides one.

### States

- **default** — bg `color.surface.elevated`, text `color.text.primary`.
- **hover** — bg `color.surface.sunken`. Cursor `pointer`.
- **focus-visible** — outline `2px solid color.focus.ring` at `-2px` offset
  (inset, so the ring doesn't push neighbors).
- **active** — bg `color.surface.sunken`, content translate-x `1px`.
- **selected** — bg `color.brand.primarySubtle`, left `3px` accent bar in
  `color.brand.primary` (radius 0).
- **disabled** — text `color.text.muted`, cursor `not-allowed`.
- **loading** — row content swapped for `Skeleton` shapes matching layout.
- **empty (the list, not a row)** — see `EmptyState`.

### ARIA

- `<ul role="list">` parent (explicit role guards against CSS list-style
  resets). Items `<li>` with the clickable region as `<a>` or `<button>`.

### Keyboard

- `Up/Down Arrow` move focus within the list when the list is the focused
  composite. `Enter` activates. Provide a focus trap only when inside a Dialog.

---

## Dialog / Modal

Center sheet on desktop, full-height bottom sheet on mobile.

### Anatomy

```
[overlay: color.surface.overlay]
  [panel:
    header  : title + close IconButton
    body    : content
    footer  : primary + secondary actions, right-aligned
  ]
```

### Sizing

- Desktop panel: max-width `480px` (small), `640px` (medium), `840px`
  (large); centered vertically; max-height `min(640px, 90vh)`.
- Mobile: full-width, anchored to bottom, slides up over `normal` `easeOutQuart`.
- Padding `spacing[6]` desktop, `spacing[5]` mobile.
- Radius `radius.xl` desktop, `radius.xl` only on top corners for mobile sheet.

### States

- **opening** — overlay fades from 0 to full opacity over `fast`; panel slides
  in.
- **open, default** — bg `color.surface.elevated`, shadow `shadow.4`.
- **focus inside** — focus trapped within panel. First focus = first
  focusable element (NOT the close button — typically the primary input or
  the primary action depending on intent).
- **closing** — reverse of opening using `easeInQuart`.
- **destructive variant** — primary action is `Button.danger`. Title may be
  prefixed with a 20px `color.state.danger` warning icon.
- **loading** — body shows skeleton; actions disabled.
- **error** — body shows inline error block; primary action becomes "Retry".
- **empty** — not applicable.

### ARIA

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` (title id),
  `aria-describedby` (body id when copy needs to be announced).
- Focus trap. Body scroll locked.
- `Esc` closes (unless destructive-with-loss; then confirm-before-close).

---

## Toast

Transient notification, top-right desktop, bottom mobile.

### Anatomy

```
[icon] [body: title + optional description] [close]
```

### Variants

`success`, `warning`, `danger`, `info`, `neutral` — mapping to `color.state.*`.

### States

- **default (visible)** — bg `color.surface.elevated`, border `1px solid
  color.state.{variant}Border`, left `3px` accent bar `color.state.{variant}`,
  shadow `shadow.3`, radius `radius.lg`, padding `spacing[4]`.
- **entering** — slide in from edge over `normal` `easeOutQuart`.
- **leaving** — slide + fade over `fast` `easeInQuart`.
- **hover** — pauses auto-dismiss timer; subtle bg `color.surface.sunken`.
- **focus-visible** — outline `2px solid color.focus.ring`.
- **with action** — secondary "Undo"-style Button.ghost on right of body.

### ARIA

- `role="status"` for non-critical (auto-dismiss). `role="alert"` for danger.
- Region wrapper `aria-live="polite"` / `"assertive"`.
- Close button: `aria-label="Dismiss notification"`.

---

## EmptyState

Used inside cards and as full-page states. NOT generic SaaS hero copy — we
write specific empty states per surface ("No routines yet — let's set one up.").

### Anatomy

```
[ 48px line icon — outlined, low-contrast ]
[ Headline                                 ]
[ One-line description                      ]
[ Primary CTA ]   [ Optional secondary link ]
```

### Tokens

- Icon: stroke `color.text.muted`, 48px.
- Headline: type `xl`, weight `semibold`, color `color.text.primary`.
- Description: type `base`, color `color.text.secondary`, max-width `48ch`.
- Spacing: 24px between icon and headline, 8px between headline and
  description, 24px before CTA.
- Container padding: `spacing[12]` desktop, `spacing[8]` mobile.

### States

- **default** — as above.
- **loading** — replaced by `Skeleton` shapes (the consumer decides whether
  to show empty vs. skeleton).
- All other states (hover/focus etc.) don't apply at the component level —
  the CTA inside has them.

### ARIA

- Headline is a heading at the appropriate level for the surrounding section
  (`<h2>` on a tab panel, `<h1>` only when the empty state is the entire
  page's main content).

---

## Spinner

Indeterminate progress indicator.

### Sizing

12px, 16px, 20px, 24px, 32px. Stroke width 2px (1.5px at 12px).

### Style

A circular arc rotating, 270deg arc, stroke `currentColor` so it inherits
context (a spinner inside a primary button uses `color.brand.onPrimary`).

### States

- **spinning** — rotating at `1.2s` linear infinite.
- **paused** — JS-only state for testing; not a user-visible variant.

### ARIA

- Standalone spinner: `role="status"`, with a visually-hidden label
  ("Loading"). When inside a Button with `aria-busy`, the button itself
  carries the semantics and the spinner is decorative (`aria-hidden`).

---

## Skeleton

Inert shape placeholder for loading lists, cards, headlines.

### Style

bg `color.surface.sunken`. Animated subtle horizontal shimmer using a linear-
gradient overlay translating x at `slower` linear infinite (or reduced-motion-
friendly: a slow fade in/out of opacity 0.6–1.0). Respect `prefers-reduced-
motion: reduce`.

### Variants

| variant     | shape                                                     |
|-------------|-----------------------------------------------------------|
| `text`      | radius `radius.sm`, height matches the target type size.  |
| `circle`    | `radius.full`, equal width/height.                        |
| `rect`      | radius `radius.md`, arbitrary dimensions.                 |
| `card`      | radius `radius.lg`, sized to match a Card.                |

### States

- Only renders when loading. No other states.

### ARIA

- `aria-hidden="true"`. The surrounding container should carry
  `aria-busy="true"` and provide a fallback label for screen readers.

---

## Avatar

Profile / user indicator. Used in the TopBar and account screen.

### Sizing

| size | square |
|------|--------|
| `sm` | 24px   |
| `md` | 32px   |
| `lg` | 40px   |
| `xl` | 64px   |

Always `radius.full`.

### Content priority

1. Image (provided URL).
2. Initials (first letter of name, uppercase, font-weight `semibold`).
3. Fallback line icon (silhouette).

### States

- **default** — bg derived from initials hash (use the **neutral** palette
  step 200/300 in light, 700/800 in dark — NOT random color hashes; those
  give a circus-poster effect).
- **hover (interactive)** — used when avatar is a menu trigger: shows a
  `1px` ring `color.border.subtle` and a `color.brand.primary` 1px outer ring
  on hover; `color.focus.ring` outline on focus-visible.
- **loading (image not yet loaded)** — `Skeleton` circle.
- **error (image failed)** — fall back to initials.
- **disabled** — `0.5` opacity, cursor `not-allowed`.

### ARIA

- Decorative when paired with name nearby: `aria-hidden="true"`.
- Interactive menu trigger: `aria-label="Account menu"` (or similar).

---

## TopBar

### Mobile (≤ 720px)

- Height 56px. Sticky top. `position: sticky`, z `z.sticky`.
- bg `color.surface.elevated`, bottom-border `1px solid color.border.subtle`.
- Layout: left optional back IconButton (`sm`), centered title (truncate),
  right trailing IconButton(s).
- Title type `lg`, weight `semibold`.
- Status bar offset: include safe-area-inset-top.

### Desktop (> 720px)

- Height 64px. Sticky top.
- Layout: left logo + product name, center primary nav (Tabs), right
  account avatar menu.
- Logo + product name use type `lg`, weight `semibold`.
- Nav uses `Tabs` underline style.

### States

- **default** — as above.
- **scrolled** — add a shadow `shadow.1` and `1px` solid `color.border.subtle`
  bottom border (replacing the static border for subtler visual stacking).
- **offline** — replace the bottom border with `1px solid color.state.warning`;
  show an inline `Badge.warning` ("Offline") in the right slot.

### ARIA

- `<header role="banner">` for the global TopBar.
- Nav inside uses `<nav aria-label="Primary">`.

---

## BottomTabBar

Mobile primary nav. NOT shown on desktop.

### Anatomy

A row of 4 tabs (Today / Routines / Habits / Account), each with an icon
(24px) above a 12px label.

### Sizing

- Height 64px + safe-area-inset-bottom. Sticky bottom, z `z.sticky`.
- bg `color.surface.elevated`, top-border `1px solid color.border.subtle`.

### States

- **default** — icon stroke `color.text.muted`, label `color.text.muted`.
- **active** (current route) — icon fill `color.brand.primary`, stroke
  `color.brand.primary` for icons that have outline-only style; label
  `color.brand.primary`, weight `medium`.
- **hover (rare on mobile but used on tablet pointer)** — icon stroke
  `color.text.primary`.
- **focus-visible** — outline `2px solid color.focus.ring` at `-2px` offset.
- **disabled** — not applicable (tabs are always reachable).

### ARIA

- `<nav aria-label="Primary">` with `<a aria-current="page">` on the active
  tab. Each tab carries its own accessible name.

---

## StreakBadge

Custom. Communicates current streak count. **No flame emoji. No fire icon.**

### Anatomy

A pill containing a 12px circle counter on the left filled with
`color.streak.fill` and the streak number in white inside it, followed by a
short label.

```
[(•)4 day streak]
```

When streak ≥ 30, an outline ring appears around the counter circle
(`color.streak.text`, 1.5px). When streak ≥ 100, a second ring outside the
first (same color, 1.5px, 2px offset). This is the *only* visual flourish.

### Variants

| variant   | use                                                                |
|-----------|--------------------------------------------------------------------|
| `inline`  | In the today view, beside a habit name.                            |
| `large`   | On the habit detail header.                                        |
| `subtle`  | When streak is 0 — uses muted tokens.                              |

### Sizing

| size    | height | counter | font  |
|---------|--------|---------|-------|
| `inline`| 22px   | 12px    | `xs`  |
| `large` | 36px   | 22px    | `lg`  |

`radius.full`. Padding-x `spacing[2]` inline, `spacing[3]` large.

### Tokens

- Pill bg `color.streak.subtle`, border `1px solid color.streak.border`,
  text `color.streak.text`.
- Counter circle bg `color.streak.fill`, text `color.brand.onPrimary` (white
  in both modes — the amber fill stays warm enough that white reads cleanly).
- Subtle variant: pill bg `color.surface.sunken`, text `color.text.muted`,
  counter `color.border.strong`. Used when streak is 0; reads "Start a streak".

### States

- **default** — as above.
- **hover (when StreakBadge is itself a link/button to habit detail)** — pill
  bg shifts to `color.streak.subtle` with +4% opacity.
- **focus-visible** — outline `2px solid color.focus.ring`.
- **animating in** — when a habit is just completed and streak increments,
  badge does a brief scale 1 → 1.06 → 1 over `slow` `easeOutQuart` and the
  counter number flips with a vertical slide (respect `prefers-reduced-motion`).
- **disabled** — opacity 0.6 — used when the streak data is stale offline.

### ARIA

- Provides an accessible name: "4 day streak". The visible label text already
  communicates this; the counter circle is `aria-hidden`.

---

## CalendarHeatmap

90-day grid on habit detail. GitHub-style but mature.

### Anatomy

A 13-week (90 days padded back to most recent Sunday) grid laid out as
columns (weeks) of 7 rows (days). Each cell is a `12px` square with `3px`
gap between cells. Cell radius `radius.sm`. Month labels float above the
grid at the start of each new month.

### Color stops

Use `color.heatmap.0` … `color.heatmap.4`. Today is outlined with a `1.5px`
border in `color.heatmap.today`, not filled differently.

Stop mapping (where N = times completed in that day; for daily habits N is
always 0 or 1, so stops use `0` and `4`; for N-per-week habits the weekly
total determines the stop intensity of each contributing day):

| value           | stop |
|-----------------|------|
| 0               | `0`  |
| 1               | `2`  |
| 2 (overachiever)| `3`  |
| 3+              | `4`  |

(`1` is reserved for "scheduled but not yet completed" on future days within
the visible window, which we render at low-contrast even though the grid is
historical — we include up to today and shade future days as `0`.)

### States

- **default** — as above.
- **hover on a cell** — show a small tooltip ("Mon, May 5 — completed") with
  the date and result. Cell border becomes `1.5px solid color.text.primary`.
- **focus-visible on a cell** — cell outline `2px solid color.focus.ring` at
  `2px` offset.
- **loading** — render the grid using `color.surface.sunken` for all cells
  with the same shimmer used by `Skeleton`.
- **empty** (no completions, fresh habit) — render the grid in `color.heatmap.0`;
  show an `EmptyState`-style overlay caption beneath: "No completions yet —
  this calendar starts filling once you mark this habit done."
- **error** — render skeleton + an inline error block below ("Couldn't load
  history. Retry").

### ARIA

- Grid uses `role="grid"` with `role="row"` for each week and `role="gridcell"`
  for cells. Each cell has `aria-label` describing its date and value.
- Provide a textual summary above the grid: "47 completions in the last 90
  days — 12 day current streak — best week: 6 days." That summary is the
  *primary* accessible source; the grid is supplemental.

### Keyboard

- Arrow keys move between cells. `Home` / `End` move to start/end of week.
- `PageUp`/`PageDown` move to same weekday in previous/next week. `Enter` /
  `Space` toggles completion (only for the current day; past days are
  read-only — older completion edits go through a dialog).

---

## WeekdayChips

Selectable Mon–Sun chip row. Used to pick which weekdays a routine runs and
which weekdays a habit applies to.

### Anatomy

7 chip buttons in a row. Mobile: scrolls horizontally if needed (rare). Each
chip shows the weekday's two-letter code (`Mo Tu We Th Fr Sa Su`); full name
in `aria-label`.

### Sizing

- Chip height 36px, min-width 36px, padding-x `spacing[3]` if label is wider
  (international locales).
- Inter-chip gap `spacing[2]`. Radius `radius.full`.

### States

- **default (unselected)** — bg `color.surface.elevated`, text
  `color.text.secondary`, border `1px solid color.border.strong`.
- **hover** — bg `color.surface.sunken`.
- **selected** — bg `color.brand.primary`, text `color.brand.onPrimary`,
  border `color.brand.primary`.
- **selected hover** — bg `color.brand.primaryHover`.
- **focus-visible** — outline `2px solid color.focus.ring` at `2px` offset.
- **disabled** — bg `color.surface.sunken`, text `color.text.muted`, border
  `color.border.subtle`, cursor `not-allowed`.
- **error** (e.g. user tried to save with zero days selected) — group-level:
  helper text appears below in `color.state.danger` reading "Pick at least
  one day."; chips themselves stay default.

### ARIA

- `role="group"` with `aria-label="Weekdays"`. Chips are `role="button"`
  with `aria-pressed="true|false"` for the toggle state.

### Keyboard

- `Tab` enters the group, `Left/Right Arrow` move within. `Space` / `Enter`
  toggle.

---

## DayStepEditor

Centerpiece of the routine detail view. Tab strip across weekdays;
selecting a weekday reveals its step list. Steps are reorderable.

### Anatomy

```
[ Mon | Tue | Wed | Thu | Fri | Sat | Sun ]   <- weekday tab strip
[                                          ]
[ 1.  ☰  [ Step name ____________________ ]  ⋯  ]
[ 2.  ☰  [ Step name ____________________ ]  ⋯  ]
[ +  Add step                                  ]
```

The weekday tab strip uses `Tabs` (underline style) on desktop and
`SegmentedControl` style on mobile (tighter for thumb reach). Tab labels are
the two-letter weekday code. The active tab's underline color is
`color.brand.primary`; tabs with no steps yet show a subtle dot indicator in
`color.text.muted` below the label, the active+empty tab shows a `+` mini-
icon instead.

### Step row anatomy

- Drag handle (left) — 16px line icon, `color.text.muted`.
- Step number — `xs` `color.text.muted`, fixed `24px` width.
- Inline TextField (no border at rest; on focus it becomes a TextField with
  border).
- Trailing IconButton menu (kebab) — duplicate, delete, move to top/bottom.

Row height min 40px, padding-y `spacing[2]`.

### States

#### Whole component

- **default (with steps)** — as above.
- **default (empty weekday — e.g. Sat is a rest day)** — show an
  `EmptyState`-lite: `color.text.muted` icon (a sleeping moon outline), short
  copy "Rest day — no steps." A small "Add a step" ghost button below to
  override.
- **loading** — three skeleton step rows.
- **error** — `EmptyState`-error variant with retry.

#### Step row

- **default** — bg `color.surface.elevated`, text `color.text.primary`.
- **hover** — drag handle becomes `color.text.secondary`; row bg unchanged
  (we don't want the whole list lighting up on mouse-move). Inline text input
  shows a 1px solid `color.border.subtle` bottom border.
- **inline-field focus** — TextField becomes the full focused TextField state
  with border `color.border.focus` and outline ring.
- **dragging** — bg `color.surface.elevated`, shadow `shadow.3`, transform
  `scale(1.01)`. The original position shows a `color.surface.sunken`
  placeholder of the same height.
- **drop target** — a `2px` `color.brand.primary` line at the insertion point.
- **disabled** (when whole routine is archived) — text `color.text.muted`,
  drag handle hidden, kebab disabled.

### ARIA

- Tab strip — Tabs ARIA pattern, manual activation.
- Step list — `<ul role="list">`; rows are `<li>`. Drag handle is a
  `<button>` with `aria-label="Reorder step"`. Keyboard reorder: focus
  the handle, `Space` to "grab", `Up/Down Arrow` to move, `Space` to drop.
- Inline TextField — labelled by an `aria-label="Step name"` (the position
  number is supplementary, not the label).

### Keyboard

- `Tab` between weekday tabs and into the step list.
- Within a step row, `Tab` moves: handle → text → kebab.
- `Enter` on text submits the edit and creates a new empty step below; `Esc`
  cancels current edit and restores prior value.
- Reordering via keyboard as described above.

[hig]: https://developer.apple.com/design/human-interface-guidelines/inputs/pointing-devices
