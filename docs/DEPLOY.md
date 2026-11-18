# Production deploy guide

Take the app from local pglite-dev to a real Vercel + Supabase deployment.

> **State before deploy:** local dev runs against pglite at `apps/web/.local-data/`. Production REQUIRES a real Postgres (`DATABASE_URL`) — the pglite fallback is gated on `NODE_ENV !== 'production'` and throws loudly in prod if `DATABASE_URL` is missing.

---

## 1. Pre-deploy checklist

You'll need accounts for:

- [ ] **GitHub** (or any git host) — to push the repo
- [ ] **Vercel** — hosting + serverless functions + Cron
- [ ] **Supabase** — managed Postgres (free tier is plenty for MVP)
- [ ] **Google Cloud Console** — *only if* you want Google sign-in (optional)
- [ ] An email address that will be your **owner email** (the CLI manages this account)

Tools needed locally:

- [ ] Node 22+ (per `.nvmrc`)
- [ ] `pnpm` 9+
- [ ] `git`
- [ ] OpenSSL or Node (for secret generation)
- [ ] Vercel CLI: `pnpm dlx vercel` (no install needed; works via dlx)

---

## 2. Create a Supabase project

1. Visit https://supabase.com and create a project.
2. Pick the **closest region** to your users — Postgres latency matters for serverless.
3. Set a strong DB password (Supabase generates one; save it).
4. After the project provisions, go to **Settings → Database → Connection String → URI (Pooler)**. Use the **transaction pooler** (port `6543`) connection — it's the right shape for Vercel's serverless functions. Copy the string. It looks like:
   ```
   postgresql://postgres.<project>:<password>@<host>:6543/postgres?sslmode=require
   ```
5. (Optional but recommended) Also copy the direct connection (port `5432`) for one-off migrations from your local machine — pooler doesn't support all migration ops.

**Apply migrations**:

```bash
# Set DATABASE_URL for the migrator (use the DIRECT 5432 URL, not the pooler)
export DATABASE_URL="postgresql://postgres.<project>:<password>@<host>:5432/postgres?sslmode=require"
pnpm --filter web db:migrate
```

This applies all migrations under `apps/web/db/migrations/` to the Supabase database. After it completes, you should see the tables in Supabase's **Table Editor** (users, accounts, sessions, verificationTokens, routines, routine_day_steps, routine_step_completions, habits, habit_completions, push_subscriptions, notification_schedules).

---

## 3. Generate production secrets

Generate fresh secrets — **do not reuse the local dev ones**.

```bash
# AUTH_SECRET — used by NextAuth to sign JWT session cookies
openssl rand -base64 32
# or, on Windows: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# OWNER_API_TOKEN — used by the CLI to authenticate as the owner
openssl rand -hex 32

# VAPID keys for Web Push
pnpm dlx web-push generate-vapid-keys
```

Save these somewhere safe (1Password, etc.) — you'll paste them into Vercel's env settings.

---

## 4. (Optional) Google OAuth

If you want the "Sign in with Google" button to work in production:

1. Go to https://console.cloud.google.com → create a project (or reuse one).
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application.**
3. **Authorized JavaScript origins**: `https://<your-vercel-domain>.vercel.app` (and any custom domain you'll add).
4. **Authorized redirect URIs**: `https://<your-vercel-domain>.vercel.app/api/auth/callback/google`.
5. Save the Client ID and Client Secret — these become `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in Vercel.

If you skip this, the Google button on signup/login will appear but click-through will fail at the OAuth provider end. You can leave the env vars unset and the button will still render; it just won't sign anyone in. Either remove the button or fill in the env later.

---

## 5. Push to GitHub

```bash
git init                            # if not already initialized
git add .
git commit -m "Initial commit"
# Create an empty repo on GitHub, then:
git remote add origin git@github.com:<you>/<repo>.git
git branch -M main
git push -u origin main
```

> **Note**: `.env.local` files are gitignored. Confirm by running `git status --ignored` — the `.env.local` and `apps/web/.env.local` files should appear under "Ignored files." If you see them as untracked, the `.gitignore` lost them and you'd be about to leak secrets — STOP and fix `.gitignore` first.

---

## 6. Set up Vercel

### Link the repo

```bash
pnpm dlx vercel
```

Follow the prompts. Important answers:
- **Set up and deploy?** Yes
- **Which scope?** Your personal account or team
- **Link to existing project?** No (first time)
- **Project name?** `routineforge` (or whatever)
- **Directory with code?** Hit Enter (uses repo root)
- **Override settings?** Yes — set Root Directory to `apps/web`:
  - **Build Command**: `cd ../.. && pnpm --filter web build`
  - **Output Directory**: `.next`
  - **Install Command**: `cd ../.. && pnpm install`
  - **Development Command**: `pnpm dev` (not used by Vercel)
- **Framework Preset**: Next.js

This creates `.vercel/` locally and uploads a first deploy. **It will fail** because env vars aren't set yet — that's expected.

### Set env vars

Either via Vercel Dashboard (Settings → Environment Variables) or CLI:

```bash
pnpm dlx vercel env add DATABASE_URL production
# paste the POOLER (port 6543) Supabase URL when prompted

pnpm dlx vercel env add AUTH_SECRET production
# paste your AUTH_SECRET

pnpm dlx vercel env add AUTH_URL production
# paste: https://<your-vercel-domain>.vercel.app

pnpm dlx vercel env add OWNER_API_TOKEN production
pnpm dlx vercel env add OWNER_EMAIL production
# OWNER_EMAIL is the email you'll sign up with — the CLI authenticates as this user

pnpm dlx vercel env add VAPID_PUBLIC_KEY production
pnpm dlx vercel env add VAPID_PRIVATE_KEY production
pnpm dlx vercel env add VAPID_SUBJECT production
# VAPID_SUBJECT format: "mailto:you@example.com"

pnpm dlx vercel env add NEXT_PUBLIC_PUSH_ENABLED production
# value: true

# Optional — only if you set up Google OAuth in step 4
pnpm dlx vercel env add AUTH_GOOGLE_ID production
pnpm dlx vercel env add AUTH_GOOGLE_SECRET production

# Cron auth — same value as OWNER_API_TOKEN
pnpm dlx vercel env add CRON_SECRET production
```

Then redeploy:

```bash
pnpm dlx vercel --prod
```

### Verify

After the deploy succeeds:

1. Visit your Vercel URL. The signed-out landing should render with the graphite palette (default).
2. Click "Sign up." Use your **`OWNER_EMAIL`**. Pick a strong password.
3. The verification link should arrive at your email **IF** you've configured Resend (§8). If you haven't yet, check the Vercel **Logs** (Functions → `/api/auth/signup`) for the `[signup] verification link for ...:` line and copy that URL into a browser tab to verify manually.
4. After verifying, log in. You should land on the today view.
5. From your local machine: `OWNER_API_TOKEN=<value> APP_BASE_URL=https://<your-domain> pnpm manage auth ping` → should return `{ ok: true, owner: <email>, ts: ... }`. This proves the CLI works against production.

---

## 7. Verify the push cron is firing

`apps/web/vercel.json` already declares the cron:

```json
{ "path": "/api/push/dispatch-tick", "schedule": "* * * * *" }
```

After the prod deploy:

1. Vercel Dashboard → your project → **Cron Jobs** tab. You should see the dispatch-tick job listed with "Active" status.
2. To smoke it: subscribe to push notifications via the account page (you'll need to grant browser permission). Add a notification schedule on a habit for 2 minutes from now. Wait. The cron should fire at the next minute boundary and deliver a notification.
3. If nothing arrives:
   - Check **Functions → /api/push/dispatch-tick** logs.
   - Check that `VAPID_*` env vars are populated (a misconfigured VAPID setup returns 503 from `/api/push/vapid-public-key`, blocking subscriptions).
   - Verify `CRON_SECRET` matches `OWNER_API_TOKEN` — the dispatch endpoint authenticates via Bearer token.

---

## 8. Email provider (Resend)

The signup flow sends a verification email via **Resend** (https://resend.com)
when `RESEND_API_KEY` is set. When unset, it falls back to logging the
verification URL to the server console (Vercel Functions logs). For real users
in production you MUST configure Resend — the console fallback is dev-only.

**One-time setup (≈ 5 min):**

1. **Create a Resend account** at https://resend.com — the free tier covers
   the first 3,000 emails/month, which is plenty for a personal app.
2. **Add a domain** in the Resend dashboard → **Domains → Add Domain**. Use a
   domain you own (e.g. `routineforge.app`). You'll need DNS access at your
   registrar.
3. **Verify DNS records** — Resend will display the records you need to add
   (typically MX / TXT / DKIM CNAMEs). Add them at your registrar and click
   **Verify**. Verification usually completes within a few minutes; can take
   up to a few hours depending on the registrar's TTL.
4. **Generate an API key** → Resend dashboard → **API Keys → Create API Key**.
   Sending-only scope is sufficient. Copy the key (you can't view it again).
5. **Set Vercel env vars:**
   ```bash
   pnpm dlx vercel env add RESEND_API_KEY production
   # paste the API key
   pnpm dlx vercel env add RESEND_FROM_EMAIL production
   # e.g. "noreply@routineforge.app" or "RoutineForge <noreply@routineforge.app>"
   # MUST match the verified domain — Resend rejects unverified senders.
   ```
6. **Redeploy:** `pnpm dlx vercel --prod`.
7. **Smoke test:** sign up with a real email address. The verification email
   should arrive within seconds. If not, check **Vercel Functions logs** for
   `[signup] verification email FAILED via resend` — the error message
   captures Resend's response (typically a sender-domain or API-key issue).

**Force-disable email send temporarily** (e.g. during an incident) without
unsetting `RESEND_API_KEY`: set `EMAIL_PROVIDER=console` in Vercel env. The
app will revert to console-logging the verification URL. Revert by unsetting
the var.

**Email send failures don't block signup** — the account is still created
and the user can request a fresh verification email later. The failure is
logged for ops visibility.

---

## 9. Custom domain (optional)

1. Vercel Dashboard → your project → **Settings → Domains → Add**.
2. Add the domain you own (e.g. `routineforge.app`).
3. Update DNS at your registrar to Vercel's nameservers OR a single CNAME per Vercel's instructions.
4. **Update `AUTH_URL`** env var to the custom domain. Redeploy. Otherwise NextAuth cookies will be set on the `.vercel.app` domain and you'll be silently logged out on the custom domain.
5. If you wired Google OAuth: add the custom domain to the OAuth client's Authorized origins + redirect URIs (Google Cloud Console → Credentials).

---

## 10. Lighthouse + post-deploy quality gate

Now that the app runs on Vercel with real Postgres, run Lighthouse for representative numbers:

```bash
# Local Chrome:
pnpm dlx lighthouse https://<your-domain>/ --view --preset desktop
pnpm dlx lighthouse https://<your-domain>/ --view --preset mobile

# Or use PageSpeed Insights: https://pagespeed.web.dev/?url=https://<your-domain>/
```

Expected scores (per the design + PWA work):
- **PWA**: ≥ 90 (manifest, SW, icons, offline, installable — all in place)
- **Performance**: ≥ 90 desktop, ≥ 75 mobile (Geist fonts + small bundles + server-rendered most things)
- **Accessibility**: ≥ 95 (WCAG AA in every palette, focus-visible everywhere)
- **Best Practices**: 100 (HTTPS, no console errors, modern APIs)
- **SEO**: ≥ 90 (signed-out landing is server-rendered with title + description)

If Performance Mobile is below 75, the usual culprit is the watercolor-wash gradients on the today view. Profile with the Lighthouse trace; consider serving a lighter wash variant under `prefers-reduced-data: reduce` (not implemented; flag for a future polish dispatch).

---

## 11. Switching back to pglite-dev locally

After deploying, you might want to keep developing locally without touching Supabase. The pglite fallback in `apps/web/db/index.ts` activates when `DATABASE_URL` is **unset** and `NODE_ENV !== 'production'`.

To run locally against pglite again:

```bash
# Remove DATABASE_URL from apps/web/.env.local (or comment it out)
pnpm --filter web dev
# → "[db] DATABASE_URL not set in dev — using pglite at apps/web/.local-data/"
```

To run locally against the **real Supabase** (useful for debugging production-state issues):

```bash
# Set DATABASE_URL in apps/web/.env.local to the Supabase URL
pnpm --filter web dev
# pglite branch is skipped automatically
```

---

## 12. Common gotchas

| Symptom | Cause / fix |
|---|---|
| Deploy succeeds but every page 500s | Most likely `DATABASE_URL` missing or wrong. Check Vercel **Function logs** for the actual error. The lazy pg.Pool in `db/index.ts` defers connection until first request, so build passes but runtime fails. |
| Push notifications never arrive | `VAPID_*` env vars not set, OR `CRON_SECRET` doesn't match `OWNER_API_TOKEN`. Verify both. |
| Signup says "Check your inbox" but no email | Either `RESEND_API_KEY`/`RESEND_FROM_EMAIL` are unset (verify URL is logged to Vercel Functions logs — see §8), `EMAIL_PROVIDER=console` is forcing the fallback, or Resend rejected the send. Check function logs for `[signup] verification email FAILED via resend`. |
| `/account` → palette click → palette doesn't change | `revalidatePath` not propagating. Hard refresh the browser; if persistent, check the Vercel deployment region — Vercel's edge caches may be serving stale layouts. |
| Custom domain → logged out immediately | `AUTH_URL` still points at `.vercel.app`. Update + redeploy. |
| iOS install prompt never appears | iOS Safari doesn't fire `beforeinstallprompt`. The `InstallPrompt` component detects iOS and shows the "Tap Share → Add to Home Screen" copy variant — that's the only path on iOS. |
| Lighthouse PWA score < 90 | Most often: SW didn't register (check `NEXT_PUBLIC_PUSH_ENABLED=true`), OR icons are missing — verify `/manifest.webmanifest` returns valid JSON with the icons array populated. |
| Vercel build fails on `pnpm install` | The Root Directory override in §6 is important. If `cd ../.. && ...` isn't in the install/build commands, Vercel runs them inside `apps/web` which doesn't have a workspace root. |
| `dispatch-tick` returns 401 from Vercel Cron | `CRON_SECRET` value doesn't match `OWNER_API_TOKEN`. Vercel Cron auto-injects an `Authorization: Bearer ${CRON_SECRET}` header. |

---

## 13. Rolling back

If a deploy goes badly:

```bash
pnpm dlx vercel rollback
```

This promotes the previous deploy back to production. DB migrations don't roll back automatically — if a deploy included a migration, you'll need to write a reverse migration manually. The schema is currently additive (every migration so far is `CREATE TABLE` or `ALTER COLUMN`), so this isn't an immediate concern.

---

## 14. Next steps after first deploy lands

These are the things explicitly deferred from MVP:

- **Email provider** (§8) — wire Resend so real users can verify their accounts. Console-only fallback works for solo dev but isn't usable beyond that.
- **Rate-limit storage** — current rate-limiter is in-process. Multi-instance Vercel deploys reset per-instance. For real traffic, swap to **Upstash Redis** (Vercel marketplace, 1-click). One file to change: `apps/web/lib/rate-limit.ts`.
- **Analytics** — Vercel Analytics is free; flip on in dashboard.
- **Error monitoring** — Sentry or similar.
- **Marketing site** — the current `/` for signed-out users is functional but minimal. Could expand into a real landing page if you're acquiring users beyond yourself.

### Backup + migrate local pglite → production Supabase

Two owner-token endpoints (`/api/owner/export` and `/api/owner/import`)
support dumping and loading the owner's data as versioned JSON. The CLI in
`scripts/manage.ts` wraps them. Sensitive fields (password hashes, OAuth
tokens, session tokens, verification tokens, push subscription keys) are
**never** serialised — see `docs/API.md` § Backup / migrate for the full
exclusion list.

Local backup (before risky changes — e.g. anything that touches `.local-data/`):

```bash
# Writes routineforge-export-YYYY-MM-DD.json in cwd by default.
pnpm manage export --out backup-$(date +%Y%m%d).json
```

Migrate local pglite data into production Supabase after the first deploy:

```bash
# 1. Deploy to production (steps §2 through §6 above).
# 2. Dump your local pglite data (default APP_BASE_URL = http://localhost:3000).
pnpm manage export --out local-data.json

# 3. Validate the import against production before touching it.
APP_BASE_URL=https://your-prod-url.com \
  pnpm manage import local-data.json --dry-run

# 4. Apply for real. --mode replace deletes any pre-existing owner data
#    on the destination first; the CLI prompts for confirmation unless --yes.
APP_BASE_URL=https://your-prod-url.com \
  pnpm manage import local-data.json --mode replace --yes
```

Notes:

- The `OWNER_API_TOKEN` used here must match the value set on the destination
  (Vercel env var in production). The CLI reads it from `.env.local` at the
  repo root; export `OWNER_API_TOKEN=...` inline if you want to use a
  different token without editing the file.
- OAuth links are NOT portable. After importing, sign in once on production
  with the same email and re-link Google (or any other OAuth provider) — the
  refresh / access tokens are deliberately not in the export.
- Push subscriptions are NOT portable either. Subscribe again from each
  destination device after the migration.

---

## Summary of env vars (cheat sheet)

| Var | Required | Where | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes (prod) | Vercel | Supabase pooler URL (port 6543) |
| `AUTH_SECRET` | yes | Vercel | `openssl rand -base64 32` |
| `AUTH_URL` | yes | Vercel | Full origin including `https://` |
| `AUTH_GOOGLE_ID` | optional | Vercel | Skip if no Google sign-in |
| `AUTH_GOOGLE_SECRET` | optional | Vercel | "" |
| `OWNER_API_TOKEN` | yes | Vercel + local `.env.local` | `openssl rand -hex 32`; CLI uses |
| `OWNER_EMAIL` | yes | Vercel | The email you sign up with |
| `VAPID_PUBLIC_KEY` | yes for push | Vercel | `pnpm dlx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | yes for push | Vercel | "" |
| `VAPID_SUBJECT` | yes for push | Vercel | `mailto:you@example.com` |
| `NEXT_PUBLIC_PUSH_ENABLED` | recommended | Vercel | `true` to register SW for push |
| `CRON_SECRET` | yes for cron | Vercel | Same value as `OWNER_API_TOKEN` |
| `RESEND_API_KEY` | yes for real email | Vercel | https://resend.com/api-keys. When unset, verify URLs go to console logs. |
| `RESEND_FROM_EMAIL` | required when `RESEND_API_KEY` is set | Vercel | Must be a Resend-verified sender (e.g. `noreply@your-domain`). |
| `EMAIL_PROVIDER` | optional | Vercel | Set to `console` to force-disable real email send. Defaults: auto-pick based on `RESEND_API_KEY`. |
| `APP_BASE_URL` | optional | local `.env.local` only | For CLI; defaults to localhost |
