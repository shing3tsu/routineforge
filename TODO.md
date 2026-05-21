# RoutineForge — Active Sprint (MVP)

> **Status: MVP CODE-COMPLETE + TESTED + DEPLOY-READY.** Updated 2026-05-18 after ~35 subagent dispatches. **938 Vitest + 11 Playwright = 949 tests passing.** Build clean, bundles under target, lint zero, no dead code, no remaining TODOs in code.
>
> **Next step**: production deploy. See `docs/DEPLOY.md` for the full guide (Supabase + Vercel + env vars + cron + Lighthouse). Only user-blocked task is creating the Supabase project + setting Vercel env vars.
>
> Post-MVP shipped on top: full design redesign (4 palettes, OS-aware theme, watercolor wash, hand-drawn icons, Geist Sans+Mono, pillowy radii), celebration animations (routine done / habit pop / daily clear / hero morph / streak milestones at 7/30/100), Dialog primitive, offline-write queue with replay, signup + verify rate-limiting.
> See `.agent-logs/` for individual reports.
>
> **Done:**
> - Design system (tokens + 20 components specced + 10 mockups)
> - Backend auth foundation + project skeleton (Next.js 15 + Drizzle + Auth.js v5 + owner-token + CLI scaffold)
> - Frontend auth UI (signup/login/account/logout + theme plumbing + 5 primitive components)
> - Backend tests for auth (72 tests, 100% lines / 92.5% branches on auth code)
> - Frontend tests for auth components (92 tests across 7 files; account page deferred to E2E)
> - Backend routines: 3 tables, 11 endpoints, dual-auth wrapper, CLI extended
> - Frontend routines: 3 pages (`/routines`, `/routines/new`, `/routines/[id]`) + 4 new components (WeekdayChips, DayStepEditor, RoutineListItem, Alert)
> - Backend tests for routines: 318 tests, coverage gate passing (85% stmts / 86% lines)
>
> **In flight:**
> - Backend hotfix: 3 bugs surfaced by routines tests (smallint overflow is CRITICAL — breaks step mutations)
>
> **Pending (next):**
> - Frontend-test for routines components (WeekdayChips, DayStepEditor, RoutineListItem, Alert)
> - Today view integration (deferred from frontend routines dispatch; needs habits too — fold into Task 3)
> - Backend Task 3: Habits + streak math
> - Backend Task 4: Web Push
> - Frontend Task 5: PWA + offline shell
> - Design tweaks observed: SegmentedControl primitive needed for DayStepEditor mobile; Dialog primitive needed for delete confirms (currently using native `confirm()`)
>
> **Waiting on user (BLOCKER for E2E):**
> - Create Supabase project (DATABASE_URL)
> - Generate AUTH_SECRET (`openssl rand -base64 32`)
> - Generate OWNER_API_TOKEN (`openssl rand -hex 32`)
> - Set OWNER_EMAIL to the email you'll sign up with
> - Populate BOTH `/.env.local` (CLI) and `/apps/web/.env.local` (Next) — see `docs/ENV.md`
> - Optional now: Google OAuth credentials (can defer; credentials-only signup works)
>
> See `TaskList` for fine-grained per-dispatch tracking and dependencies.

## MVP gate — all five must pass quality gates in §6 of the brief

## MVP gate — all five must pass quality gates in §6 of the brief

### 1. Auth + signup + owner-token  [agents: backend → frontend → backend-test → frontend-test → real-user-tester]
- [x] Auth.js v5 wired with credentials + Google providers
- [x] Email/password signup with email verification stub (logged to console in dev; real provider behind env flag)
- [x] Session middleware on all non-public routes
- [x] `OWNER_API_TOKEN` middleware on `/api/owner/**` routes for the CLI
- [x] `scripts/manage.ts` skeleton with `auth ping` command verifying the token
- [x] UI: signup, login, logout, account page
- [x] Tests: unit (validators, owner-token guard), integration (signup→login round-trip), component tests for forms
- [ ] E2E (signup→verify→dashboard) — **blocked on user's Supabase setup**

### 2. Routines with per-weekday steps  [agents: design → backend → frontend → backend-test → frontend-test → design-tester → real-user-tester]
- [x] Schema: `routines`, `routine_day_steps` (per-weekday step list), `routine_step_completions` (per day, per user)
- [x] API: CRUD on routines, CRUD on per-day steps, POST/DELETE completion for a (routine, date, step), reorder
- [x] CLI: `routine create/list/update/delete/show`, `routine step add/remove/move/reorder`, `routine complete/uncomplete`
- [x] UI: routine list, routine detail with per-weekday step editor (`/routines`, `/routines/new`, `/routines/[id]`)
- [x] Empty/loading/error states for routines pages
- [x] Tests: unit (validation, position math, resolveUser), integration (CRUD, dual-auth, completions cascade)
- [ ] **In flight**: backend hotfix for 3 bugs (smallint overflow + `= ANY()` cast + description transform); 30 tests skipped until fixed
- [ ] Frontend-test for new routines components
- [ ] Today's view integration (deferred — combine with Habits dispatch)
- [ ] Design-tester visual conformance on routines screens
- [ ] E2E: create routine → set per-weekday steps → check off → reload (blocked on user's Supabase setup)

### 3. Habits with streaks  [agents: design → backend → frontend → backend-test → frontend-test → design-tester → real-user-tester]
- [ ] Schema: `habits` (cadence: daily / N-per-week / specific weekdays), `habit_completions`
- [ ] API: CRUD habits, POST/DELETE completion for a (habit, date)
- [ ] Server-side streak computation (current + longest + total)
- [ ] CLI: `habit create/list/update/delete`, `habit done`
- [ ] UI: habits list with streak badges, habit detail with calendar heatmap, today's view
- [ ] Tests: unit (streak math edge cases incl. DST), integration, component, E2E

### 4. Scheduled Web Push  [agents: backend → frontend → backend-test → real-user-tester]
- [ ] VAPID key generation and `.env.example` documentation
- [ ] Schema: `push_subscriptions`, `notification_schedules` (per routine and per habit)
- [ ] API: subscribe/unsubscribe endpoint, schedule CRUD
- [ ] Server-side dispatcher (cron-style: Vercel Cron or in-process scheduler in dev) firing at user-configured times
- [ ] Service worker handling push + click-through to the right screen
- [ ] UI: per-routine and per-habit notification time pickers, master toggle in account
- [ ] Tests: unit (dispatch eligibility), integration (subscribe), E2E (mock SW, verify subscription registered)

### 5. PWA install + offline shell  [agents: design → frontend → design-tester → real-user-tester]
- [ ] `manifest.webmanifest` with icons (light + dark + maskable), name, theme color from tokens
- [ ] Service worker caching app shell + last-known data for today's view
- [ ] Install prompt UX (deferred install banner; respects dismissal)
- [ ] Offline indicator + read-only mode for today's view when offline
- [ ] Lighthouse PWA ≥ 90 on home + today's view
- [ ] Tests: E2E install flow (Chromium), offline shell loads with network blocked

## Cross-cutting (assumed always)
- WCAG AA contrast on every screen, light + dark
- Keyboard-navigable everywhere
- All copy in plain English (no jargon, no placeholder text in production)

## Out of scope for MVP (parking lot — move to ROADMAP after sprint kickoff)
- Sharing routines with other users
- Importing from Apple Reminders / Google Tasks
- Apple Push (APNs via webkit-only PWA) edge cases beyond what Web Push covers
- Analytics dashboard / insights
