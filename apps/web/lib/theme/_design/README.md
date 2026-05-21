# `_design/` — local mirror of `design/tokens.css` + `design/base.css`

**Status:** mirror. The files here are byte-identical copies of the canonical
design files at `<repo-root>/design/tokens.css` and `<repo-root>/design/base.css`.

## Why this directory exists

Next.js 15's css-loader pipeline does not resolve `@import` URLs that escape
the package root with `../../../` paths. We tried this first:

```css
/* apps/web/app/globals.css */
@import '../../../design/tokens.css';
@import '../../../design/base.css';
```

The build fails with a confusing `postcss` "Unclosed string" error on the
next CSS rule that follows the `@import`s — webpack's css-loader silently
declines to resolve the path outside the package and subsequent parsing
desyncs.

Mirroring the design CSS into the package fixes it cleanly. We've kept the
mirror under `lib/theme/_design/` so it sits next to `_bridge.css` and
`theme.ts` — the entire "how does theming work" surface in one folder.

## Sync rules

The mirror is **manually kept in sync with the canonical files** in
`design/`. Until a build-step ships:

1. Whenever `design/tokens.css` or `design/base.css` changes, copy the
   updated file into `apps/web/lib/theme/_design/` verbatim.
   ```sh
   cp design/tokens.css       apps/web/lib/theme/_design/tokens.css
   cp design/base.css         apps/web/lib/theme/_design/base.css
   ```
2. Do **not** hand-edit these copies. If you need a token change, make it
   in `design/tokens.css` (or via the design agent) and re-copy.
3. CI/git status should make drift visible; treat any local diff in
   `_design/*` versus `design/*` as a sync bug.

## Future work

A build step (next.config.ts plugin, or a `scripts/sync-design.ts`) could
symlink or codegen these. Out of scope for the dispatch that introduced this
mirror — flagged for a future iteration when the design tokens stabilise.
