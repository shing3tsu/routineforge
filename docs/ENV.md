# Environment Variables

Canonical list of every env var used by RoutineForge. Update this file whenever
a variable is added, removed, or renamed.

There are two `.env` files:

- **`/.env.local`** (repo root) — used by the owner CLI in `scripts/manage.ts`.
- **`/apps/web/.env.local`** — used by Next.js. Auto-loaded by `next dev` /
  `next build`. Drizzle Kit also reads this via `dotenv` in `drizzle.config.ts`.

Some variables are needed in both files (notably `OWNER_API_TOKEN`). For local
development the simplest setup is to keep them in sync; in CI / Vercel they are
configured per-environment.

Never commit real secrets. `.env.example` files are templates only.

---

## Web app (`apps/web/.env.local`)

| Variable             | Required          | Dev default                                                      | Where to obtain                                                                                |
| -------------------- | ----------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | yes (prod); optional (dev) | _unset — see "Dev fallback: pglite" below_              | Supabase project -> Settings -> Database -> Connection string (pooled `6543` for serverless).  |
| `DIRECT_URL`         | optional          | _unset_                                                          | Supabase Settings -> Database -> Direct connection (port `5432`). Used by `drizzle-kit` for migrations only (DDL can't run over the PgBouncer transaction-mode pooler). Falls back to `DATABASE_URL` if unset. See "Migrations on Supabase" below. |
| `AUTH_SECRET`        | yes               | generate                                                         | `openssl rand -hex 32`. Used by NextAuth to sign JWTs.                                         |
| `AUTH_URL`           | yes               | `http://localhost:3000`                                          | Public origin of the app. Set to Vercel preview / prod URLs in those environments.             |
| `AUTH_GOOGLE_ID`     | optional (dev), yes (prod) | _empty_                                                  | https://console.cloud.google.com/apis/credentials                                              |
| `AUTH_GOOGLE_SECRET` | optional (dev), yes (prod) | _empty_                                                  | Same Google Cloud Console screen.                                                              |
| `OWNER_API_TOKEN`    | yes               | generate                                                         | `openssl rand -hex 32`. Long random secret for the owner CLI.                                  |
| `OWNER_EMAIL`        | yes               | `owner@example.com`                                              | The email of the user the owner CLI authenticates as. Must already exist as a signed-up user.  |
| `EMAIL_PROVIDER`     | optional          | _empty_ (auto-resolves: console when `RESEND_API_KEY` unset, resend otherwise) | Set to `'console'` to force the dev fallback even when `RESEND_API_KEY` is set.                |
| `RESEND_API_KEY`     | optional (dev), yes (prod, to email users) | _empty_                                  | https://resend.com/api-keys. When set, verification emails are sent via Resend.                |
| `RESEND_FROM_EMAIL`  | required when `RESEND_API_KEY` is set | `noreply@routineforge.app`                   | Must match a domain you've verified in Resend. Format: `noreply@yours.com` or `Name <noreply@yours.com>`. |
| `VAPID_PUBLIC_KEY`   | yes (push, prod); optional (dev) | _empty_                                           | `pnpm dlx web-push generate-vapid-keys` (output: `{ publicKey, privateKey }`).                 |
| `VAPID_PRIVATE_KEY`  | yes (push, prod); optional (dev) | _empty_                                           | Same command as above. Keep secret — never expose to the browser.                              |
| `VAPID_SUBJECT`      | yes (push, prod); optional (dev) | `mailto:owner@example.com`                        | Any `mailto:` or `https:` URL identifying the app owner per RFC 8292.                          |

### Dev fallback: pglite (no `DATABASE_URL` required)

For first-time setup and quick local work, `DATABASE_URL` can be left unset
in dev. When the app boots in dev (`NODE_ENV !== 'production'`) without it,
`apps/web/db/index.ts` transparently swaps in a [pglite][pglite]-backed
Drizzle client and persists data to `apps/web/.local-data/` (gitignored).
Migrations under `apps/web/db/migrations/` are applied automatically on
first boot. The app exposes the same Drizzle API regardless of driver, so
route handlers, `auth.ts`, and `lib/**` don't change.

- **What works:** every API route, signup/login, routines, habits,
  completions, push subscriptions storage. The dispatcher's `web-push`
  sending still needs `VAPID_*` env vars.
- **What doesn't:** anything that demands real Postgres semantics beyond
  what pglite provides (extensions outside `pgcrypto`, `pg_dump`-style
  tooling, `drizzle-kit studio` against the file). For those, set a real
  `DATABASE_URL`.
- **Production behavior is unchanged:** in production (`NODE_ENV === 'production'`),
  `DATABASE_URL` is required. The first DB query throws loudly if it's missing.
- **Switching to real Postgres:** set `DATABASE_URL` in
  `apps/web/.env.local` and restart `pnpm dev`. The pglite folder is left in
  place — delete `apps/web/.local-data/` if you want to reclaim the disk.

[pglite]: https://pglite.dev

### Migrations on Supabase (`DIRECT_URL` vs `DATABASE_URL`)

The app **runtime** uses `DATABASE_URL` — typically the pooled connection on
port `6543` (PgBouncer in transaction mode). That mode is great for serverless
but rejects session-scoped DDL, so `drizzle-kit migrate` would fail against it.

`drizzle.config.ts` therefore reads `DIRECT_URL` first, falling back to
`DATABASE_URL` if `DIRECT_URL` is unset. Two valid choices for `DIRECT_URL`:

1. **Direct connection** (`db.<project-ref>.supabase.co:5432`) — what Supabase's
   dashboard suggests. **Caveat:** as of 2024, new Supabase projects expose this
   host over IPv6 only. From an IPv4-only network it resolves to nothing
   (`getaddrinfo ENOTFOUND`). Either enable Supabase's "IPv4 add-on" or use
   option 2.
2. **Session-mode pooler** (`aws-0-<region>.pooler.supabase.com:5432`, same
   user `postgres.<project-ref>` as the transaction pooler) — IPv4-friendly and
   supports DDL. This is the recommended `DIRECT_URL` for dev machines without
   IPv6.

Either way, set both vars in `apps/web/.env.local` and run
`pnpm --filter web db:migrate`. The script reads `apps/web/.env.local`
explicitly (it's not auto-loaded by `drizzle-kit`).

### Google OAuth redirect URI

When creating the Google OAuth client, set the authorized redirect URI to:

```
${AUTH_URL}/api/auth/callback/google
```

For local dev: `http://localhost:3000/api/auth/callback/google`.

### Note on `OWNER_EMAIL`

The owner-token guard does **not** auto-create the owner user. After setting
`OWNER_EMAIL`, sign up through the normal `/signup` flow (or `POST
/api/auth/signup`) with that email before calling owner endpoints.

### Note on email (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`)

The signup flow emits a verification URL for the user. Provider resolution:

- **`EMAIL_PROVIDER='console'`** → force the console fallback even if Resend
  is configured. Useful in staging / when you need to silence outbound mail.
- **`RESEND_API_KEY` set + `EMAIL_PROVIDER` unset (or anything other than
  `'console'`)** → send real email via Resend.
- **Neither set** → log the URL to the server console in the format
  `[signup] verification link for <email>: <url>`. This is the default for
  local dev and what the Playwright `verification.ts` fixture parses.

`RESEND_FROM_EMAIL` MUST match a domain you've added + verified in your
Resend dashboard (Resend rejects sends from arbitrary domains). The default
in `.env.example` is `noreply@routineforge.app` — change it to whatever
domain you own.

Email send failures are logged as `[signup] verification email FAILED via
resend for <email>: <reason>` but never propagate — signup still returns
`{ ok: true }` so a Resend outage doesn't break account creation.

### Note on `VAPID_*` (Web Push)

These keys are read by both the in-process dev scheduler and the
`/api/push/dispatch-tick` cron endpoint (`apps/web/lib/push/vapid.ts`).

- **Required in production** for push to work. Without them:
  - `GET /api/push/vapid-public-key` returns `503 push_not_configured`.
  - `POST /api/push/subscriptions` returns `503 push_not_configured`.
  - `POST /api/push/dispatch-tick` succeeds with `{ checked: N, fired: 0 }`
    (the dispatcher silently no-ops).
  - The dev scheduler logs one warning at startup and stays off.
- **Optional in dev** — the rest of the app works without them; subscribe
  attempts surface the 503 above so the frontend can disable the "Enable
  push" UI cleanly.
- **Generate with:** `pnpm dlx web-push generate-vapid-keys`. Output:

  ```json
  { "publicKey": "BNxxx…", "privateKey": "vxxx…" }
  ```

  Paste `publicKey` into `VAPID_PUBLIC_KEY` and `privateKey` into
  `VAPID_PRIVATE_KEY`. Set `VAPID_SUBJECT=mailto:<owner-email>` or
  an `https:` URL identifying the app owner (RFC 8292).
- **Production scheduling:** `apps/web/vercel.json` registers a Vercel Cron
  that hits `/api/push/dispatch-tick` every minute. Vercel attaches
  `Authorization: Bearer <CRON_SECRET>` automatically — set
  `CRON_SECRET = OWNER_API_TOKEN` in the Vercel project so the dispatcher's
  token check passes.
- **Dev scheduling:** `apps/web/instrumentation.ts` registers a 60s
  `setInterval` that calls the dispatcher in-process. Gated on
  `NODE_ENV !== 'production'`. No manual setup required beyond having
  VAPID env vars set.

---

## Owner CLI (`/.env.local` at repo root)

| Variable          | Required | Dev default               | Notes                                                                              |
| ----------------- | -------- | ------------------------- | ---------------------------------------------------------------------------------- |
| `OWNER_API_TOKEN` | yes      | _must match the web app_  | Sent as `Authorization: Bearer <token>` to `/api/owner/**`.                        |
| `APP_BASE_URL`    | no       | `http://localhost:3000`   | Base URL the CLI hits. Override to talk to a deployed preview / prod environment.  |

---

## Generation snippets

```bash
# AUTH_SECRET, OWNER_API_TOKEN (Linux / macOS / WSL)
openssl rand -hex 32

# VAPID keypair (prints { publicKey, privateKey })
pnpm dlx web-push generate-vapid-keys
```

Windows PowerShell equivalent (no `openssl`):

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToHexString($bytes).ToLower()
```
