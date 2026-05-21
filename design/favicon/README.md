# RoutineForge favicon

## Concept

**The kept promise** — a hand-drawn check inside a hand-drawn ring. The
favicon mark is the same glyph the in-app `BrandLockup`
(`apps/web/components/ui/BrandLockup.tsx`) uses, extracted, simplified,
and re-tuned for 16px legibility and rasterized PWA icons.

One ink color on one ground. No gradient, no glow, no glass. The
hand-drawn quality lives in the path geometry (asymmetric cubic-Bezier
arcs for the ring, lifted-pen endpoints for the check) — NOT in an SVG
`feTurbulence` displacement filter. Filters degrade to mud at favicon
sizes and bloat the binary; baking the imperfection into the geometry
keeps the mark crisp at 16px and consistent at 512px.

## Why this glyph (and not something else)

The in-app brand mark is a check-in-a-circle, rendered through the
`#rf-mark-rough` `feTurbulence` filter at runtime. The favicon family
must derive from that mark to read as the same identity across favicon,
install icon, splash, and apple-touch surfaces.

Tuning vs the in-app mark:

- **Ring**: cubic arcs with intentionally asymmetric control points so
  each quadrant has a different curvature. A pen-drawn ring is never a
  perfect circle. The path leaves a subtle hair-gap near the start of
  the stroke (no `Z` close) — the small tell of a lifted pen that says
  "human hand".
- **Check**: two segments only (descending stroke into the elbow, then
  rising stroke to the upper-right). Endpoints offset slightly from the
  geometric ideal so the corners read as drawn, not stamped. Elbow
  shifted slightly low-right of dead-center for visual weight — a
  centered check looks like a registration mark, an off-axis one looks
  like a tick.
- **Stroke 2.8** (vs the in-app's 2): heavier so the check survives
  rasterization at 16px. Below ~2.5 the elbow turns to noise after the
  rasterizer's anti-aliasing pass.

## Files

| File                    | Purpose                                       | Notes                                              |
| ----------------------- | --------------------------------------------- | -------------------------------------------------- |
| `favicon.svg`           | Source mark, single color                     | `viewBox="0 0 32 32"`, uses `currentColor`         |
| `favicon.ico`           | Multi-resolution favicon (16, 32, 48)         | PNG-embedded ICO, SOLID graphite ground            |
| `apple-touch-icon.png`  | 180x180 iOS home-screen icon                  | Solid graphite ground, ink `#EEEEF2`. Not pre-rounded — iOS rounds the corners. |
| `icon-192.png`          | PWA manifest icon (`maskable any`)            | Maskable-safe: mark sits within 80% safe-zone     |
| `icon-512.png`          | PWA manifest icon (`maskable any`)            | Maskable-safe: mark sits within 80% safe-zone     |
| `_build.mjs`            | One-shot Node script that builds the rasters  | Uses Playwright Chromium for rendering             |

## Color tokens

These are baked into the rasters; the SVG itself uses `currentColor` so
it can be tinted from CSS or `<meta name="theme-color">`.

| Role   | Hex       | Token reference                                       |
| ------ | --------- | ----------------------------------------------------- |
| ground | `#101012` | `--c-surface-base`  (graphite, dark)                  |
| ink    | `#EEEEF2` | `--c-text-primary`  (graphite, dark)                  |

### Why ink = `--c-text-primary`, not `--c-brand-primary`

Graphite-dark's brand-primary is `#A78BFA` (purple). At favicon size on
a near-black ground, purple reads as generic-SaaS / AI-template (which
the design brief explicitly rejects) and only holds ~7.3:1 contrast
(WCAG AA Large) — not enough headroom for the thin strokes the
hand-drawn aesthetic relies on.

The text-primary near-white `#EEEEF2` reads quieter, more mature, and
holds ~17.5:1 contrast (AAA easily) on `#101012` — critical because the
favicon mark's strokes are thin and need every drop of contrast they
can get at 16px. The check-in-a-ring is the shape that carries brand
recognition; the colour stays restrained so the mark reads as a stamp
rather than a logo.

The in-app `BrandLockup` continues to render in `--c-brand-primary`
(purple in graphite-dark) because at body-text scale the purple has
contrast headroom and the wordmark next to it carries the identity.
The favicon doesn't have that wordmark, so it leans harder on the
glyph itself.

### Why solid ground (not transparent)

Earlier iterations of this favicon used transparent PNGs inside the
ICO so the mark would composite onto the browser's tab background. At
16px the anti-aliased strokes collapsed to mid-grey on most chrome
colors and the mark vanished.

The fix: solid graphite ground for the ICO too. This makes the favicon
read as part of the same family as the apple-touch + maskable PWA
icons (all solid graphite). The dark "badge" approach is consistent
with Linear, Vercel, Things — restrained brands that own their ground
color instead of yielding it to the OS chrome.

The trade-off: dark-ground favicons on a light tab strip look like a
small dark badge. That's intentional. It's also why
`apps/web/app/layout.tsx`'s `themeColor` is `#101012` in dark and
`#F4F4F5` in light — the OS chrome and the favicon agree.

## Maskable safe-zone

The PWA spec defines an 80% inner safe-zone for `purpose: "maskable"`
icons so platforms (Android adaptive icons, iOS) can crop them to any
shape (circle, squircle, rounded square) without clipping the glyph.

For a 192px icon: the mark sits within a 153.6px centered region, with
~19.2px of solid surface color around every edge. For 512px: 409.6px
inner, ~51.2px outer ring. The build script enforces this by rendering
the SVG into a div sized at `0.8 x icon_size`, on a `0.2 x icon_size`
border of solid surface.

`favicon.ico` does NOT use a safe-zone (favicons are never masked into
circles). `apple-touch-icon.png` uses a slightly larger 0.86 inner
ratio than the favicon — iOS doesn't crop into a circle, just rounds
corners with a generous radius, so the mark can sit bigger.

## Rebuilding

```pwsh
node design/favicon/_build.mjs
```

Requirements: Node, plus Playwright with Chromium installed (already
in the workspace via `pnpm` and the `@playwright/test` toolchain). The
script resolves Playwright from its pnpm store path explicitly, so it
works without adding `playwright` to any `package.json`.

The script:

1. Reads `favicon.svg`.
2. Launches headless Chromium.
3. For each output size, renders an HTML page containing the SVG over
   the graphite-dark ground at the correct pixel size and scale, then
   takes a 1:1 screenshot.
4. For the ICO, builds a PNG-embedded ICO container by hand (a 6-byte
   `ICONDIR` + three 16-byte `ICONDIRENTRY` records + the three PNG
   payloads). Modern browsers all support PNG-in-ICO.

After rebuilding, copy the five outputs from `design/favicon/` into
`apps/web/public/` — that's the runtime location served by Next.

If Playwright is not available, the SVG is still the canonical source.
Manual fallback steps using ImageMagick:

```pwsh
# ICO (solid graphite ground; ImageMagick's rsvg backend renders SVG)
magick -background "#101012" -resize 16x16   design/favicon/favicon.svg ico-16.png
magick -background "#101012" -resize 32x32   design/favicon/favicon.svg ico-32.png
magick -background "#101012" -resize 48x48   design/favicon/favicon.svg ico-48.png
magick ico-16.png ico-32.png ico-48.png      design/favicon/favicon.ico

# Apple touch icon (solid ground, full mark)
magick -background "#101012" -resize 180x180 design/favicon/favicon.svg design/favicon/apple-touch-icon.png

# Maskable PWA icons (mark inset to 80% via -border)
magick -background "#101012" -resize 154x154 design/favicon/favicon.svg -bordercolor "#101012" -border 19 design/favicon/icon-192.png
magick -background "#101012" -resize 410x410 design/favicon/favicon.svg -bordercolor "#101012" -border 51 design/favicon/icon-512.png
```

## What ships where

The five assets live in two places:

- `design/favicon/` — design-side source of truth, rebuildable.
- `apps/web/public/` — runtime location served by Next at `/favicon.svg`,
  `/favicon.ico`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png`.

After every rebuild, copy all five assets into `apps/web/public/`.

The HTML wiring is already in `apps/web/app/layout.tsx`:

```ts
icons: {
  icon: [
    { url: '/favicon.svg', type: 'image/svg+xml' },
    { url: '/favicon.ico', sizes: 'any' },
  ],
  apple: '/apple-touch-icon.png',
  shortcut: '/favicon.ico',
}
```

And `apps/web/public/manifest.webmanifest` declares both PWA icons
with `purpose: "maskable any"`. No changes to either file were needed
for this refresh — the filenames are preserved.

## Squint test (acceptance)

Verified visually by extracting the three native PNGs embedded in the
ICO (16/32/48):

- **16px**: ring reads as a complete circular form; check reads as a
  single tick. Hand-drawn imperfection compresses out at this size —
  the mark reads as a clean tick-in-a-circle, which is the right
  fallback. The crucial thing is that both elements (ring + check)
  remain distinguishable — they don't collapse into a blob.
- **32px**: hand-drawn quality becomes visible (slight ring
  asymmetry, lifted check endpoints). Mark feels stamped by a person,
  not generated by an algorithm.
- **48px**: full hand-drawn character. The hair-gap at the top of the
  ring is visible as a subtle quirk — gives life to the mark without
  reading as broken.
- **180px / 192px / 512px**: full character, full breathing room,
  consistent with the in-app `BrandLockup`.

If the mark ever stops passing the squint test (a future refactor of
`favicon.svg`), the failure mode is usually one of:

- ring stroke too thin (<2.5 viewBox units),
- check stroke too thin (<2.5 viewBox units),
- check elbow too close to ring stroke (the two collapse into one
  blob at 16px).
