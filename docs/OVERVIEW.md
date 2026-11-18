# Codebase overview

Audience: a developer about to work on RoutineForge. This file is the map — it tells you what the app is, how the code is organised, where the load-bearing decisions live, and where to start digging for the most common tasks. It does NOT repeat the API, env, or deploy docs — those are linked inline.

For the user-facing pitch, see the root [README.md](../README.md).

---

## Purpose

RoutineForge is a single-tenant-per-account PWA for tracking two kinds of repeating commitments: **routines** (a per-weekday checklist of named steps) and **habits** (a recurring thing with a cadence rule and a streak count). Everything is owned by one user; there is no team or sharing model. The app is meant to feel mature and calm — long-lived, not gamified — and to work the same way on phone, tablet, and desktop, online or offline.

---

## Architecture

### High-level shape

A single Next.js 15 App Router application under `apps/web/`. There is no separate backend service — the same Next.js process serves the UI, the REST API under `/api/**`, the service worker, and the cron-triggered push dispatcher.

Data lives in Postgres via Drizzle ORM. In development, when `DATABASE_URL` is unset, the app transparently swaps in a [pglite](https://pglite.dev)-backed Drizzle client that persists to `apps/web/.local-data/`. The same Drizzle API is used either way, so route handlers and library code do not branch on driver. In production (`NODE_ENV === 'production'`), `DATABASE_URL` is required; the first query throws loudly without it. The driver-bootstrap logic lives in `apps/web/db/index.ts`.

### Server side

- **Route handlers**: `apps/web/app/api/**/route.ts`. Every endpoint is documented in [docs/API.md](./API.md). Validation is done with `zod` schemas in `apps/web/lib/validation/`. Errors have a stable shape (`{ ok: false, error, message? }` or zod's flattened-issues form for 400s).
- **Auth resolution**: `apps/web/lib/auth/resolveUser.ts` exports `withUser(handler)`, used by every authenticated route. It first attempts a NextAuth session, then falls back to `Authorization: Bearer <OWNER_API_TOKEN>` so the owner CLI can call the same endpoints. Owner-only endpoints (`/api/owner/**`, `/api/push/dispatch-tick`) use `withOwnerAuth` / a bespoke check instead.
- **NextAuth v5 (Auth.js)**: configured in `apps/web/auth.ts` + `auth.config.ts`. JWT session strategy. Credentials (email + bcrypt password) plus optional Google OAuth (only enabled when `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are set).
- **Middleware**: `apps/web/middleware.ts` enforces session-gated paths and a public allowlist.
- **Domain logic** (pure functions, unit-tested):
  - Routines step-position helpers: `apps/web/lib/routines/steps.ts`.
  - Habit streak math (tz-aware, no external date lib): `apps/web/lib/habits/streaks.ts`.
  - Push dispatcher: `apps/web/lib/push/dispatcher.ts` + `apps/web/lib/push/vapid.ts`.
  - Export / import: `apps/web/lib/export/index.ts`.
- **Email**: `apps/web/lib/email/index.ts` resolves a provider — Resend when `RESEND_API_KEY` is set (and `EMAIL_PROVIDER !== 'console'`); otherwise logs the verification URL to the server console. Email-send failures never block signup.
- **Push dispatcher**: in dev, `apps/web/instrumentation.ts` registers a 60-second `setInterval` that calls the dispatcher in-process. In prod, `apps/web/vercel.json` registers a `* * * * *` Vercel Cron job against `/api/push/dispatch-tick`. Same handler, same code path.

### Client side

- **App Router pages**: server components by default; interactive parts are explicitly marked `'use client'`. The page-to-file mapping is in the "Surface area map" below.
- **No CSS framework**: the design system is a CSS-tokens approach in `apps/web/app/globals.css` (re-exporting `design/tokens.css` + `design/base.css` + `design/animations.css`). Components own a sibling `*.module.css` file when they need styles beyond the token utilities.
- **Theme**: `apps/web/lib/theme/theme.ts` + `apps/web/lib/theme/actions.ts`. Palette is stored on the user (server) and mirrored to a cookie + `<html data-palette>` attribute so first paint is correct. Light/dark mode follows the OS by default, with an explicit override.
- **PWA**: `apps/web/public/sw.js` (service worker), `apps/web/public/manifest.webmanifest`, and the install prompt logic under `apps/web/components/pwa/`. Offline completion toggles are queued in `localStorage` and replayed on reconnect — see `apps/web/lib/pwa/offlineQueue.ts`.
- **Web Push subscription** UX is wired through `apps/web/components/push/` and the account "Devices" list. The subscription endpoint + keys never leave the server after the initial `POST /api/push/subscriptions`.

### Data flow at a glance

1. The browser issues an authenticated `fetch` to an `/api/**` route (NextAuth cookie set on the same origin).
2. The route handler validates the body with a `zod` schema from `apps/web/lib/validation/`.
3. `withUser` resolves the caller; the handler reads or writes through Drizzle (`apps/web/db/index.ts`).
4. The response shape is the one documented in [docs/API.md](./API.md).
5. The client either revalidates the affected route (server actions + `revalidatePath`) or optimistically updates and replays through the offline queue if the network failed.

Push notifications flow separately: Vercel Cron (or the dev `setInterval`) hits `/api/push/dispatch-tick` once a minute, which queries enabled `notification_schedules`, resolves the current minute in each subject's timezone, and fans out `webpush.sendNotification` calls per matching subscription.

---

## Key design decisions

- **Four palettes, OS-aware dark/light.** Graphite is the default. Palette + mode are persisted per user and applied via `data-palette` / `data-theme` attributes on `<html>` so the very first paint is correct. The whole design system is documented in `design/components.md` with source tokens in `design/tokens.css`.
- **Hand-drawn icon filter.** Icons use SVG `<feTurbulence>` + `<feDisplacementMap>` to give vector strokes a subtle hand-drawn wobble without rasterising. Implementation: `design/icons.jsx`.
- **Owner-token CLI for power-user ops.** A long random token (`OWNER_API_TOKEN`) authenticates `scripts/manage.ts` against the same `/api/**` endpoints the UI uses. The CLI never goes through NextAuth — it's a parallel auth lane intended for scripting and recovery (e.g. backup / restore, bulk schedule edits). The token is also the `CRON_SECRET` value Vercel uses to authenticate the push dispatch cron.
- **pglite as the dev fallback.** New contributors can run the app with zero infra — `pnpm install` and `pnpm --filter web dev`. The same migrations run against pglite as against real Postgres. Production behaviour is unaffected: `DATABASE_URL` is mandatory whenever `NODE_ENV === 'production'`.
- **Mature, calm UI tone.** No badges, confetti, or streak-shaming. Celebration animations exist (routine completion, habit pop, streak milestones) but are subtle. Copy avoids superlatives.
- **No raw SQL in route handlers.** Every read/write goes through Drizzle. The schema in `apps/web/db/schema.ts` is the source of truth for column shapes; route handlers import inferred types.
- **Soft delete via `archivedAt`.** Routines and habits are never hard-deleted by the API. Lists filter on `archivedAt IS NULL`.
- **All date arithmetic is tz-aware calendar-day math.** `Intl.DateTimeFormat` is used instead of 86400-second offsets so DST flips never produce off-by-ones.

---

## Surface area map

URL paths and the files they render from. Server components unless marked.

| URL                          | File                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `/` (signed-in: today view)  | `apps/web/app/page.tsx` + `apps/web/components/today/TodayView.tsx`                   |
| `/` (signed-out: landing)    | `apps/web/app/page.tsx` (renders a marketing-lite landing for unauthenticated users)  |
| `/signup`                    | `apps/web/app/(auth)/signup/page.tsx`                                                 |
| `/login`                     | `apps/web/app/(auth)/login/page.tsx`                                                  |
| `/account`                   | `apps/web/app/account/page.tsx`                                                       |
| `/routines`                  | `apps/web/app/routines/page.tsx`                                                      |
| `/routines/new`              | `apps/web/app/routines/new/page.tsx`                                                  |
| `/routines/[id]`             | `apps/web/app/routines/[id]/page.tsx` + `RoutineDetailClient.tsx`                     |
| `/habits/new`                | `apps/web/app/habits/new/page.tsx`                                                    |
| `/habits/[id]`               | `apps/web/app/habits/[id]/page.tsx` + `HabitDetailClient.tsx`                         |
| `/habits` (list)             | `apps/web/app/habits/HabitsListClient.tsx` (mounted from `/account` or `/`)           |
| `/offline`                   | `apps/web/app/offline/page.tsx` (PWA offline fallback)                                |
| `/api/auth/[...nextauth]`    | `apps/web/auth.ts`                                                                    |
| `/api/auth/signup` + `verify`| `apps/web/app/api/auth/`                                                              |
| `/api/routines/**`           | `apps/web/app/api/routines/`                                                          |
| `/api/habits/**`             | `apps/web/app/api/habits/`                                                            |
| `/api/push/**`               | `apps/web/app/api/push/`                                                              |
| `/api/owner/**`              | `apps/web/app/api/owner/` (`ping`, `export`, `import`)                                |

For the full set of endpoints (request shapes, response shapes, error codes, rate limits), see [docs/API.md](./API.md).

---

## Data model summary

Defined in `apps/web/db/schema.ts`. One sentence each.

- **`users`** — one row per account; email is unique; `passwordHash` is null for OAuth-only users.
- **`accounts`** — NextAuth's OAuth-account table (provider + providerAccountId compound PK).
- **`sessions`** — NextAuth session rows (unused in practice; we run JWT strategy, kept for forward-compat).
- **`verificationTokens`** — single-use email verification tokens, 24h TTL.
- **`routines`** — per-user named routine with IANA `timezone`, optional `category` / `location`, soft-deleted via `archivedAt`.
- **`routine_day_steps`** — ordered steps keyed by `(routineId, weekday, position)`; weekday is ISO 0=Mon..6=Sun; positions compact on delete.
- **`routine_step_completions`** — row exists iff a step is done; unique on `(stepId, userId, date)` with `date` as the local calendar date in the routine's tz.
- **`habits`** — per-user habit with IANA `timezone` and a JSONB `cadence` discriminated union (`daily` / `weekly_count` / `specific_weekdays`).
- **`habit_completions`** — row exists iff a habit was done that local day; unique on `(habitId, userId, date)`.
- **`push_subscriptions`** — one row per (user, browser-endpoint); `endpoint` + `p256dh` + `auth` are secrets and never returned from `GET` endpoints.
- **`notification_schedules`** — polymorphic via a CHECK constraint that exactly one of (`routineId`, `habitId`) is non-null; stores `time` as `"HH:MM"` and `weekdays` as a JSONB int array.

---

## Where to look first for common tasks

- **Add a new field to habits** (e.g. `colorHex`):
  1. `apps/web/db/schema.ts` — add the column on `habits`.
  2. `apps/web/db/migrations/` — generate a migration with `pnpm --filter web db:generate`.
  3. `apps/web/lib/validation/habits.ts` — extend `createHabitSchema` / `updateHabitSchema`.
  4. Route handlers under `apps/web/app/api/habits/` — pass the field through to inserts / updates.
  5. UI: `apps/web/app/habits/new/page.tsx`, `apps/web/app/habits/[id]/HabitDetailClient.tsx`.
- **Add a new API route**:
  1. Create `apps/web/app/api/<area>/<route>/route.ts`.
  2. Wrap the handler with `withUser` (`apps/web/lib/auth/resolveUser.ts`) or `withOwnerAuth` (`apps/web/lib/auth/owner.ts`).
  3. Add the zod schema under `apps/web/lib/validation/`.
  4. Document it in [docs/API.md](./API.md) — same section style as the existing entries.
- **Add a new page**:
  1. Drop the file under `apps/web/app/<route>/page.tsx`.
  2. If the path should be public, add it to the allowlist in `apps/web/middleware.ts`.
  3. Use server components by default; mark interactive subtrees with `'use client'`.
- **Change a palette / token**:
  1. `design/tokens.css` — palette CSS custom properties.
  2. `design/base.css` — base element styles.
  3. `design/components.md` — keep the docs in sync; this file is the source of truth for component-level decisions.
- **Add an owner CLI command**:
  1. Extend `scripts/manage.ts` with a new `citty` subcommand.
  2. Make it call the matching `/api/**` endpoint with the `OWNER_API_TOKEN` bearer header.
  3. Document the command in the relevant [docs/API.md](./API.md) section's "CLI" block.
- **Adjust the push dispatcher**:
  - Logic: `apps/web/lib/push/dispatcher.ts`.
  - VAPID setup: `apps/web/lib/push/vapid.ts`.
  - HTTP entry: `apps/web/app/api/push/dispatch-tick/route.ts`.
  - Dev scheduling: `apps/web/instrumentation.ts`.
  - Prod scheduling: `apps/web/vercel.json`.
- **Touch streak math**:
  - Pure function: `apps/web/lib/habits/streaks.ts`.
  - Tz-aware day arithmetic helpers: same file (no external date library).
  - Tests: `apps/web/lib/habits/__tests__/streaks.test.ts` (and adjacent files).
- **Investigate offline / PWA behaviour**:
  - Service worker: `apps/web/public/sw.js`.
  - Manifest: `apps/web/public/manifest.webmanifest`.
  - Offline write queue + replay: `apps/web/lib/pwa/`.
  - Install prompt UI: `apps/web/components/pwa/`.

---

## See also

- [README.md](../README.md) — the front door.
- [docs/SETUP.md](./SETUP.md) — fresh-clone to running locally.
- [docs/STACK.md](./STACK.md) — locked tech-stack decisions.
- [docs/ENV.md](./ENV.md) — canonical env-var matrix.
- [docs/API.md](./API.md) — REST reference for `/api/**`.
- [docs/DEPLOY.md](./DEPLOY.md) — production deploy guide.
