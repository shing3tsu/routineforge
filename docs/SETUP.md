# Local setup

Step-by-step from a fresh clone to a running dev server. For the architectural overview see [docs/OVERVIEW.md](./OVERVIEW.md); for production deploy see [docs/DEPLOY.md](./DEPLOY.md).

---

## Prerequisites

- **Node.js 22+** — the workspace `engines.node` requires `>=22.0.0`. The project runs in degraded form on Node 20 (one timezone-edge test fails — see "Common gotchas" below), so 22 is what you want.
- **pnpm 9+** — `engines.pnpm` is `>=9.0.0`. Install via `npm i -g pnpm` or [corepack](https://nodejs.org/api/corepack.html).
- **git** — to clone the repo.
- **Optional:** OpenSSL (for secret generation). Windows PowerShell has a built-in fallback shown below.

---

## Step 1 — Clone and install

```bash
git clone <repo-url> routineforge
cd routineforge
pnpm install
```

`pnpm install` resolves the entire workspace (root + `apps/web/`) from `pnpm-lock.yaml`. No Postgres, Supabase, or other infra is needed yet — the app runs against a local pglite file by default in development.

---

## Step 2 — Create `apps/web/.env.local`

The web app reads its config from `apps/web/.env.local` (auto-loaded by `next dev` and Drizzle Kit). The canonical env-var matrix lives in [docs/ENV.md](./ENV.md); this section shows the **minimum set** needed to boot.

```env
# apps/web/.env.local

# Required: NextAuth JWT signing secret.
AUTH_SECRET=<generate — see below>

# Required: public origin of the app. Match the port you'll run dev on.
AUTH_URL=http://localhost:4000

# Owner CLI auth (also used by the route handlers' bearer-token fallback).
OWNER_API_TOKEN=<generate — see below>
OWNER_EMAIL=you@example.com

# DATABASE_URL intentionally omitted — the app uses pglite in dev when this is unset.
# See docs/ENV.md "Dev fallback: pglite" for details.
```

Generate the secrets:

```bash
# Linux / macOS / WSL / Git Bash:
openssl rand -base64 32     # AUTH_SECRET
openssl rand -hex 32        # OWNER_API_TOKEN
```

Windows PowerShell (no `openssl`):

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)    # AUTH_SECRET
[Convert]::ToHexString($bytes).ToLower()  # OWNER_API_TOKEN
```

You'll also want a matching `.env.local` at the repo root for the CLI:

```env
# /.env.local (repo root)
OWNER_API_TOKEN=<same value as in apps/web/.env.local>
APP_BASE_URL=http://localhost:4000
```

For the full list of optional vars (Google OAuth, Resend, VAPID, etc.) see [docs/ENV.md](./ENV.md).

---

## Step 3 — Generate VAPID keys (optional, only if you want push to work)

Web Push needs a VAPID keypair. The rest of the app works fine without it — push-subscribe endpoints return `503 push_not_configured` and the dev scheduler logs one warning at startup, then stays off.

```bash
pnpm dlx web-push generate-vapid-keys
```

Add the output to `apps/web/.env.local`:

```env
VAPID_PUBLIC_KEY=<publicKey from output>
VAPID_PRIVATE_KEY=<privateKey from output>
VAPID_SUBJECT=mailto:you@example.com
```

---

## Step 4 — (Optional) Supabase setup

For local development, you do not need Supabase — pglite covers everything except a few Postgres-specific features (`drizzle-kit studio` against a file, extensions beyond `pgcrypto`). Skip this step unless you specifically want to develop against real Postgres.

If you do want to point local dev at Supabase, set `DATABASE_URL` (and ideally `DIRECT_URL`) in `apps/web/.env.local`:

```env
DATABASE_URL=postgresql://postgres.<project>:<password>@<pooler-host>:6543/postgres?sslmode=require
DIRECT_URL=postgresql://postgres.<project>:<password>@<pooler-host>:5432/postgres?sslmode=require
```

**Gotcha — IPv6:** Supabase's literal `db.<project-ref>.supabase.co` host is IPv6-only by default. Most home networks (and many corporate ones) are IPv4-only, where that hostname resolves to nothing (`getaddrinfo ENOTFOUND`). For `DIRECT_URL`, prefer the **session-mode pooler** host (`aws-0-<region>.pooler.supabase.com:5432`) — it's IPv4-friendly and supports the DDL operations Drizzle Kit needs. The transaction-mode pooler on port 6543 is the right shape for the app's runtime `DATABASE_URL` but rejects session-scoped DDL, which is why a separate `DIRECT_URL` exists. See [docs/ENV.md "Migrations on Supabase"](./ENV.md#migrations-on-supabase-direct_url-vs-database_url) for the full discussion.

Production deploy is covered separately in [docs/DEPLOY.md](./DEPLOY.md).

---

## Step 5 — Apply database migrations

If you set `DATABASE_URL` (Step 4), run:

```bash
pnpm --filter web db:migrate
```

If you are using the pglite fallback (no `DATABASE_URL`), **skip this step**. The migration runner applies the same SQL files (`apps/web/db/migrations/`) automatically on first DB use.

Other Drizzle commands available from the web filter:

```bash
pnpm --filter web db:generate   # generate a new migration after schema changes
pnpm --filter web db:push       # push schema directly (use sparingly; prefer migrate)
pnpm --filter web db:studio     # open Drizzle Studio (requires real Postgres)
```

---

## Step 6 — Start the dev server

```bash
pnpm --filter web dev -- --port 4000
```

Or equivalently, from inside `apps/web/`: `pnpm dev -- --port 4000`.

**Why port 4000?** The default Next.js port is 3000, but on the maintainer's Windows machine ports 2984-3083 (including 3000 and 3001) are reserved by Hyper-V / WSL. 4000 is the project's reserved dev port. If you're on a different machine, any free port works — just keep `AUTH_URL` in `apps/web/.env.local` in sync with whatever port you pick.

Once it boots you should see:

```
[db] DATABASE_URL not set in dev — using pglite at apps/web/.local-data/
- Local:        http://localhost:4000
```

Open `http://localhost:4000` in a browser.

---

## Step 7 — Sign up and verify

1. Click **Sign up** and create an account with the email you set as `OWNER_EMAIL` in Step 2.
2. The signup flow issues a verification email. **In dev with no `RESEND_API_KEY`, no real email is sent** — the verification URL is logged to the dev-server console in this exact format:

   ```
   [signup] verification link for you@example.com: http://localhost:4000/api/auth/verify?token=...&email=...
   ```

3. Copy that URL into a new tab. You'll be redirected to `/login?verified=1`.
4. Log in. You should land on the today view.
5. From a separate terminal, smoke-test the owner CLI:

   ```bash
   pnpm manage auth ping
   # → { ok: true, owner: 'you@example.com', ts: '2026-...' }
   ```

If the ping returns `400 no_owner_user`, your `OWNER_EMAIL` doesn't match a user row yet — sign up with that exact email first.

---

## Step 8 — Run tests

Vitest (unit + integration, runs against pglite — no extra setup):

```bash
pnpm --filter web test            # one-shot run
pnpm --filter web test:watch      # watch mode
pnpm --filter web test:coverage   # with coverage report
```

Typecheck and lint:

```bash
pnpm --filter web typecheck
pnpm --filter web lint
```

---

## Step 9 — Run E2E tests (optional)

Playwright drives a real browser against a fresh dev server. The Playwright config lives at the repo root (`playwright.config.ts`) and starts its own web server, so make sure your dev server on port 4000 is **stopped** before running E2E.

First-time setup (downloads browser binaries):

```bash
pnpm exec playwright install
```

Run the suite:

```bash
pnpm exec playwright test           # headless
pnpm exec playwright test --ui      # interactive runner
```

---

## (Optional) Seed demo data

To populate the local pglite DB with two routines, four habits, and some completion history:

```bash
node scripts/seed-demo.mjs
```

The owner email written by the seeder is `sinaghaffari1@outlook.com` and the initial password is `RoutineForge!2026`. Edit the script if you want a different demo account. Change the password from `/account` after first sign-in.

---

## Common gotchas

- **pglite WASM aborts after long uptime.** The dev-fallback DB is a WASM build that occasionally aborts after the dev server has been running for many hours or after a crash. The symptom is every API call 500-ing with a Postgres-y error. Fix: stop the dev server, delete `apps/web/.local-data/`, restart, and sign up again. The folder is gitignored — it's pure local cache. If you care about the data, back it up first with `pnpm manage export --out backup.json`.
- **Node 20 fails one timezone test.** The `Etc/GMT+14` edge-case test in the habit streak suite depends on a tz table that's complete in Node 22 but partial in Node 20. Upgrade to Node 22+ and it clears. The rest of the suite passes on Node 20.
- **Port 4000 is the project convention.** Hyper-V on the maintainer's Windows box reserves ports 2984-3083 (including 3000/3001). If you're on macOS or Linux, any free port is fine — just keep `AUTH_URL` in `apps/web/.env.local` aligned with whatever port you choose, or NextAuth callbacks will redirect to the wrong host and silently log you out.
- **Supabase `db.<ref>.supabase.co` is IPv6-only.** See Step 4 above. Use the session-mode pooler host for `DIRECT_URL` on IPv4-only networks.
- **Verification email never arrives in dev.** Expected — without `RESEND_API_KEY` the URL is printed to the dev-server console (see Step 7). If you want real email in dev, set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` in `apps/web/.env.local` (the from address must match a Resend-verified domain).
- **Push doesn't fire in dev.** Either VAPID env vars are missing (Step 3) or you haven't subscribed yet from a browser that supports the Notifications API. Check the dev-server console — `lib/push/dispatcher.ts` and the `apps/web/instrumentation.ts` scheduler both log clearly when they no-op for config reasons.

---

## See also

- [README.md](../README.md) — front door.
- [docs/OVERVIEW.md](./OVERVIEW.md) — architectural overview.
- [docs/ENV.md](./ENV.md) — every env var.
- [docs/API.md](./API.md) — REST API reference.
- [docs/DEPLOY.md](./DEPLOY.md) — production deploy.
