# RoutineForge

RoutineForge is a Progressive Web App for tracking **routines** (per-weekday step lists) and **habits** (cadence + streaks). It runs offline, installs to the home screen, and delivers scheduled reminders via Web Push.

## What it does

- **Routines** — per-weekday checklists with reorderable steps, per-routine timezone, soft-archive, and duplicate.
- **Habits** — three cadences (`daily`, `weekly_count`, `specific_weekdays`), server-computed current / longest streaks, idempotent completions.
- **Today view** — single page that aggregates everything due today across routines and habits.
- **Calendar heatmap** — 90-day grid per habit with **editable past completions** (tap a past cell to toggle).
- **PWA** — installable on iOS, Android, and desktop; offline shell with a write-replay queue.
- **Web Push** — self-hosted with VAPID keys; per-minute Vercel Cron dispatcher.
- **JSON export / import** — full per-owner data dump for backup or pglite-to-Supabase migration.
- **4 palettes x OS-aware light/dark** — Graphite (default), Bone, Fog, Sage. Hand-drawn icon look via SVG turbulence filter.
- **Owner CLI** — `pnpm manage` drives the same endpoints as the UI via owner-token auth.

## Quick start

```bash
git clone <repo-url> routineforge
cd routineforge
pnpm install
# See docs/SETUP.md for the full env walkthrough.
pnpm --filter web dev -- --port 4000
```

The app boots without a real database — it uses [pglite](https://pglite.dev) under `apps/web/.local-data/` whenever `DATABASE_URL` is unset in development. Sign up at `http://localhost:4000/signup`; when no email provider is configured the verification URL is printed to the dev-server console.

Full setup: [docs/SETUP.md](./docs/SETUP.md).

## Stack at a glance

- **Next.js 15** App Router on **Vercel**, TypeScript strict.
- **Drizzle ORM** + **Postgres** (Supabase in prod, **pglite** dev fallback).
- **Auth.js / NextAuth v5** — email + password (bcrypt) + optional Google OAuth.
- **CSS tokens** design system (no Tailwind, no CSS-in-JS); 4 palettes x light/dark.
- **PWA** — `manifest.webmanifest`, service worker, offline shell.
- **Web Push** with **VAPID**; dispatcher fired every minute by Vercel Cron.
- **Resend** for transactional email (verification); console fallback in dev.
- **pnpm** workspaces; **Node 22+** required.

See [docs/STACK.md](./docs/STACK.md) for the locked decisions.

## Project layout

```
apps/web/            Next.js app (App Router, the entire product lives here)
design/              CSS tokens, base styles, animations, icon system, mockups
docs/                STACK, ENV, API, DEPLOY, SETUP, OVERVIEW
scripts/             manage.ts (owner-token CLI) + seed-demo.mjs
tests/e2e/           Playwright end-to-end specs
```

- `apps/web/app/` — App-Router pages and `app/api/**` route handlers.
- `apps/web/db/` — Drizzle schema + migrations + driver bootstrap (pg or pglite).
- `apps/web/lib/` — domain logic (routines, habits, push, export, auth helpers, theme).
- `apps/web/components/` — React UI primitives + feature components.
- `apps/web/public/` — service worker, web manifest, icons.

## Where to read next

- [docs/SETUP.md](./docs/SETUP.md) — fresh clone to running locally.
- [docs/OVERVIEW.md](./docs/OVERVIEW.md) — what the app is and how the code is organised (for contributors).
- [docs/STACK.md](./docs/STACK.md) — locked tech-stack decisions.
- [docs/ENV.md](./docs/ENV.md) — canonical environment-variable matrix.
- [docs/API.md](./docs/API.md) — REST API reference for every route under `/api/**`.
- [docs/DEPLOY.md](./docs/DEPLOY.md) — production deploy on Vercel + Supabase.

## Status

- 938 Vitest unit / integration + 11 Playwright E2E specs passing.
- `pnpm --filter web typecheck` and `pnpm --filter web lint` clean.
- MVP feature-complete; production deploy gated only on Vercel + Supabase env config.

No CI badges are shipped yet — run the test commands locally (see [docs/SETUP.md](./docs/SETUP.md#step-8-run-tests)) for the source of truth.

## License

Released under the MIT License — see [LICENSE](./LICENSE).

Author: Sina Ghaffari (`sinaghaffari1@outlook.com`).
