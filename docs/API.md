# API Reference

All endpoints land under `apps/web/app/api/**`. Update this file whenever an
endpoint is added, removed, or changes shape.

**Auth modes:**

- **public** — no auth required.
- **session** — requires a valid NextAuth session cookie. Enforced via
  `middleware.ts` for any path not in the public allowlist.
- **owner-token** — requires `Authorization: Bearer <OWNER_API_TOKEN>`. Used by
  the CLI in `scripts/manage.ts`. Enforced per-route via the
  `withOwnerAuth(handler)` wrapper in `apps/web/lib/auth/owner.ts` (not via
  `middleware.ts`, so it stays unit-testable).

**Errors:** validation failures return HTTP 400 with shape
`{ ok: false, error: 'validation_error', issues: { fieldErrors, formErrors } }`
(the standard `zod` flattened-error shape). Other errors return
`{ ok: false, error: '<kind>', message: '<human readable>' }`.

---

## Auth

### `POST /api/auth/signup` — public

Create a new user with email + password. Issues a single-use email verification
token. The verification URL is dispatched via the email provider resolver
(`apps/web/lib/email/index.ts`):

- **Resend** (when `RESEND_API_KEY` + `RESEND_FROM_EMAIL` are set and
  `EMAIL_PROVIDER !== 'console'`) — sends a real email.
- **Console** (default in dev; when no `RESEND_API_KEY`, or when
  `EMAIL_PROVIDER=console`) — logs the URL to the server console:

  ```
  [signup] verification link for alice@example.com: http://localhost:3000/api/auth/verify?token=...&email=alice%40example.com
  ```

Email send failures do NOT block signup — the user row + token are still
persisted and the response is still `{ ok: true }`. Failures are logged as
`[signup] verification email FAILED via <provider> for <email>: <reason>`.

**Request body** (`application/json`):

```ts
{
  email: string;        // valid email, lowercased server-side
  password: string;     // min length 8
  name?: string;        // 1-120 chars, optional
}
```

zod schema: `z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(1).max(120).optional() })`.

**Success** (`200`):

```json
{ "ok": true }
```

The response is intentionally vague: it returns `{ ok: true }` even if the
email already exists, to avoid email enumeration. If the existing user is
unverified, a fresh verification token is issued.

**Errors:**

- `400 invalid_json` — body was not parseable JSON.
- `400 validation_error` — zod validation failed.
- `429 rate_limited` — see "Rate limiting" below.

**Rate limiting:** Per-client-IP token bucket with **capacity 5** and **refill
3 tokens/minute** (i.e. up to 5 burst requests, then ~one new attempt every
20s once drained). The client IP is taken from the first hop of
`X-Forwarded-For` (Vercel/proxy-friendly), falling back to `X-Real-IP`, then
the literal `'unknown'`. On limit the endpoint returns:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: <seconds>
Content-Type: application/json

{ "ok": false, "error": "rate_limited" }
```

The limiter is in-memory and **single-process** — sufficient for the current
single-server dev/prod deployment, but should be replaced with a Redis-backed
limiter (e.g. `@upstash/ratelimit`) if/when the app goes multi-instance.
Implementation: `apps/web/lib/rate-limit.ts`.

**Example:**

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"correcthorsebattery","name":"Alice"}'
```

### `GET /api/auth/verify` — public

Validate a verification token, mark the user's `emailVerified`, delete the
token, and redirect to the login screen.

**Query string:**

```ts
{
  token: string;   // 32-128 char hex (currently 64 from randomBytes(32))
  email: string;   // valid email
}
```

zod schema: `z.object({ token: z.string().min(32).max(128), email: z.string().email() })`.

**Responses:** HTTP `302` redirect to one of:

- `/login?verified=1` — success.
- `/login?verified=0&reason=bad_request` — query string failed validation.
- `/login?verified=0&reason=invalid_token` — token not found for that email.
- `/login?verified=0&reason=expired` — token is past its 24h TTL (also deleted).
- `/login?verified=0&reason=rate_limited` — too many attempts (see below).

**Rate limiting:** Per-client-IP token bucket with **capacity 10** and
**refill 5 tokens/minute** (slightly more generous than signup since
legitimate users may re-load the verification page). Same IP-extraction rules
as signup. Since this is a browser GET flow, on limit we redirect with
`reason=rate_limited` rather than returning JSON, matching the existing
error-redirect pattern. Implementation: `apps/web/lib/rate-limit.ts`.

**Example:**

```bash
curl -i 'http://localhost:3000/api/auth/verify?token=<token>&email=alice%40example.com'
```

### `/api/auth/[...nextauth]` — public

Standard NextAuth v5 catch-all. Handles `signIn`, `signOut`, `session`,
`callback/<provider>`, etc. Configured in `apps/web/auth.ts`.

Providers enabled:

- `credentials` — email + bcrypt-hashed password. Rejects unverified users with
  redirect to `/login?error=unverified`.
- `google` — only enabled when both `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`
  are set. Google-verified emails bypass the verification gate.

Session strategy: JWT.

---

## Owner

### `GET /api/owner/ping` — owner-token

Smoke-test that the owner token + `OWNER_EMAIL` setup is working.

**Headers:**

```
Authorization: Bearer <OWNER_API_TOKEN>
```

**Success** (`200`):

```json
{ "ok": true, "owner": "owner@example.com", "ts": "2026-05-17T12:34:56.789Z" }
```

**Errors:**

- `401 missing_token` — no `Authorization: Bearer ...` header.
- `401 invalid_token` — token did not match `OWNER_API_TOKEN`.
- `500 misconfigured` — `OWNER_API_TOKEN` or `OWNER_EMAIL` env var is unset on
  the server.
- `400 no_owner_user` — `OWNER_EMAIL` is set but no user exists with that
  email. Sign up via `/signup` first.

**Example:**

```bash
curl -H "Authorization: Bearer $OWNER_API_TOKEN" \
  http://localhost:3000/api/owner/ping
```

Or via the CLI (recommended):

```bash
pnpm manage auth ping
```

---

## Routines

All routine endpoints accept **either** a NextAuth session cookie **or** an
`Authorization: Bearer <OWNER_API_TOKEN>` header — implemented via the
`withUser` wrapper in `apps/web/lib/auth/resolveUser.ts`. Session is attempted
first; the owner token is the fallback (used by the CLI in `scripts/manage.ts`).

Auth-resolution failure responses:

- `401 unauthenticated` — neither a session nor a Bearer token was present.
- `401 invalid_token` — Bearer token was present but did not match `OWNER_API_TOKEN`.
- `400 no_owner_user` — Bearer token matched but `OWNER_EMAIL` user does not exist.
- `500 misconfigured` — `OWNER_API_TOKEN` or `OWNER_EMAIL` env vars unset.

Per-resource `404 not_found` is returned when a routine / step exists but is
not owned by the resolved user, OR does not exist at all. We deliberately do
not distinguish these to avoid leaking the existence of other users' ids.

**Weekday encoding:** `0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun` (ISO).

**Position model:** Steps are zero-based positions within a `(routine, weekday)`
bucket. On delete or weekday-move-out we **compact** subsequent positions to
keep numbering contiguous (no gaps). To reorder, use the bulk reorder endpoint.

**Completions:** A row in `routine_step_completions` for
`(stepId, userId, date)` IS the completion. Absence = not completed. `date`
is the LOCAL `YYYY-MM-DD` date in the routine's `timezone`. Computing
"today" is the caller's responsibility (the CLI does this server-side by
fetching the routine first).

### `GET /api/routines` — session OR owner-token

List the current user's non-archived routines, ordered by name.

**Success** (`200`):

```ts
{
  ok: true,
  routines: Array<{
    id: string;                  // uuid
    name: string;
    description: string | null;
    timezone: string;            // IANA, e.g. 'America/Los_Angeles'
    category: string | null;
    location: string | null;
    scheduleWeekdays: number[];  // derived: weekdays with >= 1 step
    updatedAt: string;           // ISO timestamp
    // --- today + last-7-days stats (additive) -----------------------------
    stepCountToday: number;          // steps scheduled for today (in routine tz)
    stepsCompletedToday: number;     // of those, how many the user completed today
    isScheduledToday: boolean;       // stepCountToday > 0
    lastSevenDays: Array<{
      date: string;                  // 'YYYY-MM-DD' in routine tz
      scheduled: number;             // step count for that weekday
      total: number;                 // alias of `scheduled` (same value)
      completed: number;             // distinct completed step ids on that date
    }>;                              // length 7, oldest first; today is last
  }>;
}
```

The 7-day stats are computed per routine in the routine's own IANA timezone
(so a user with routines in mixed tzs gets the right local dates per row).
Empty list: `{ ok: true, routines: [] }`.

**Example:**

```bash
curl -H "Authorization: Bearer $OWNER_API_TOKEN" \
  http://localhost:3000/api/routines
```

### `POST /api/routines` — session OR owner-token

Create a routine.

**Request body:**

```ts
{
  name: string;                       // trim, 1..100
  description?: string;               // trim, <=500 (empty string is normalised to omitted -> stored as NULL)
  timezone: string;                   // valid IANA
  category?: string | null;           // free-text, trim, <=50; '' is normalised to null
  location?: string | null;           // free-text, trim, <=50; '' is normalised to null
}
```

zod: `createRoutineSchema` in `lib/validation/routines.ts`.

**Success** (`201`):

```ts
{ ok: true, routine: { id, ownerUserId, name, description, timezone, category, location, createdAt, updatedAt, archivedAt: null, scheduleWeekdays: [] } }
```

**Errors:**

- `400 invalid_json`
- `400 validation_error`

**Example:**

```bash
curl -X POST -H "Authorization: Bearer $OWNER_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Morning ritual","timezone":"America/Los_Angeles"}' \
  http://localhost:3000/api/routines
```

### `GET /api/routines/:id` — session OR owner-token

Fetch one routine plus all its steps grouped by weekday.

**Success** (`200`):

```ts
{
  ok: true,
  routine: {
    id, ownerUserId, name, description, timezone, category, location, createdAt, updatedAt, archivedAt,
    scheduleWeekdays: number[],
    stepsByWeekday: Record<'0'|'1'|'2'|'3'|'4'|'5'|'6', Array<{
      id, routineId, weekday, position, title, createdAt, updatedAt
    }>>;
  };
}
```

**Errors:** `404 not_found` if the routine doesn't exist or isn't owned.

### `PATCH /api/routines/:id` — session OR owner-token

Partial update of `name` / `description` / `timezone` / `category` / `location`.
At least one field required.

**Request body:**

```ts
{
  name?: string;
  description?: string | null;
  timezone?: string;
  category?: string | null;    // '' normalised to null (clears the column)
  location?: string | null;    // '' normalised to null (clears the column)
}
```

zod: `updateRoutineSchema`. `description: null` / `category: null` / `location: null` clear the field.

**Success** (`200`): `{ ok: true, routine: <full row> }`.

**Errors:** `400 invalid_json`, `400 validation_error`, `404 not_found`.

### `DELETE /api/routines/:id` — session OR owner-token

Soft delete (sets `archived_at`). Routine disappears from list/get afterward.

**Success** (`200`): `{ ok: true }`.

**Errors:** `404 not_found`.

### `POST /api/routines/:id/duplicate` — session OR owner-token

Clone an owned routine, including all of its `routine_day_steps` (per-weekday
gating preserved). Completions are NOT cloned — the new routine starts at zero
progress.

No request body — the URL param is the source.

The new routine's `name` is `"{original} (copy)"`, truncated so the total length
stays within the 100-char cap (chars are shaved off the *original* portion so
the `(copy)` suffix is always visible).

Runs inside a Drizzle transaction: if the steps insert fails, the routine row
is rolled back so a partially-cloned routine never leaks into the user's list.

**Success** (`201`):

```ts
{
  ok: true,
  routine: {
    id, ownerUserId, name, description, timezone, category, location,
    createdAt, updatedAt, archivedAt,
    scheduleWeekdays: number[],   // weekdays cloned from the source
  };
}
```

**Errors:** `404 not_found` (missing / not owned / archived).

```bash
curl -X POST -H "Authorization: Bearer $OWNER_API_TOKEN" \
  http://localhost:3000/api/routines/<id>/duplicate
```

### `GET /api/routines/:id/steps?weekday=N` — session OR owner-token

List steps for a single weekday, ordered by `position`.

**Query:** `weekday: 0..6` (coerced from string).

**Success** (`200`):

```ts
{ ok: true, steps: Array<{ id, routineId, weekday, position, title, createdAt, updatedAt }> }
```

**Errors:** `400 validation_error`, `404 not_found`.

### `POST /api/routines/:id/steps` — session OR owner-token

Create a step in a (routine, weekday) bucket.

**Request body:**

```ts
{
  weekday: 0..6;
  title: string;        // trim, 1..200
  position?: number;    // zero-based; omit = append. >= count clamps to append.
}
```

zod: `createStepSchema`. If `position` is supplied and < current count, later
steps shift up to make room.

**Success** (`201`): `{ ok: true, step: { id, routineId, weekday, position, title, createdAt, updatedAt } }`.

**Errors:** `400 invalid_json`, `400 validation_error`, `404 not_found`.

### `PATCH /api/routines/:id/steps/:stepId` — session OR owner-token

Update title and/or move (weekday and/or position).

**Request body:** `{ title?: string; weekday?: 0..6; position?: number; }`. At least one field required.

zod: `updateStepSchema`.

Move semantics: if `weekday` changes, the source bucket is compacted and the
target bucket is shifted to make room at the new `position` (or append if
omitted). Title-only updates do not touch positions.

**Success** (`200`): `{ ok: true, step: <full row> }`.

**Errors:** `400 invalid_json`, `400 validation_error`, `404 not_found`.

### `DELETE /api/routines/:id/steps/:stepId` — session OR owner-token

Delete a step and compact the bucket (later positions shift down by 1).

**Success** (`200`): `{ ok: true }`.

**Errors:** `404 not_found`.

### `POST /api/routines/:id/steps/reorder` — session OR owner-token

Bulk reorder all steps within a (routine, weekday). Pass the **full** ordered
list of step ids for that weekday — partial reorders are rejected.

**Request body:**

```ts
{ weekday: 0..6; stepIds: string[] /* uuid, 1..1000 */; }
```

zod: `reorderStepsSchema`.

**Success** (`200`): `{ ok: true }`.

**Errors:**

- `400 invalid_json` / `400 validation_error`
- `400 duplicate_step_ids` — `stepIds` has duplicates.
- `400 mismatched_step_ids` — supplied id set doesn't equal the existing set
  for `(routine, weekday)`.
- `404 not_found`.

### `GET /api/routines/:id/completions?date=YYYY-MM-DD` — session OR owner-token

Completions for the resolved user on a given local date in the routine's tz.

**Query:** `date` (zod: `localDateSchema`, real-calendar-date check).

**Success** (`200`):

```ts
{ ok: true, completions: Array<{ stepId: string; completedAt: string /* ISO */ }> }
```

**Errors:** `400 validation_error`, `404 not_found`.

### `POST /api/routines/:id/completions` — session OR owner-token

Mark a step done for the resolved user + date. **Idempotent** on
`(stepId, userId, date)`.

**Request body:** `{ stepId: string /* uuid */; date: 'YYYY-MM-DD'; }`.

zod: `completionMutationSchema`.

**Success** (`201`):

```ts
{ ok: true, completion: { id, routineId, stepId, userId, date, completedAt } }
```

**Errors:** `400 invalid_json`, `400 validation_error`, `400 step_not_in_routine`, `404 not_found`.

### `DELETE /api/routines/:id/completions` — session OR owner-token

Remove a completion if it exists. **Always 204** (idempotent).

**Request body:** `{ stepId: string; date: 'YYYY-MM-DD'; }`.

**Success:** `204 No Content`.

**Errors:** `400 invalid_json`, `400 validation_error`, `404 not_found`.

### CLI

The owner CLI exposes the entire routine namespace under `pnpm manage routine`:

```bash
pnpm manage routine list
pnpm manage routine create --name "Morning ritual" --timezone America/Los_Angeles
pnpm manage routine show <id>
pnpm manage routine update <id> --description "Updated"
pnpm manage routine delete <id> --yes

pnpm manage routine step add <id> --weekday mon --title "Make coffee"
pnpm manage routine step add <id> --weekday 2 --title "Stretch" --position 0
pnpm manage routine step move <id> <stepId> --weekday tue --position 1
pnpm manage routine step remove <id> <stepId>
pnpm manage routine step reorder <id> --weekday mon <stepId1> <stepId2> <stepId3>

pnpm manage routine complete <id> --step <stepId>
pnpm manage routine complete <id> --step <stepId> --date 2026-05-17
pnpm manage routine uncomplete <id> --step <stepId>
```

Weekday accepts `mon|tue|wed|thu|fri|sat|sun` (case-insensitive) or `0..6`
(0=Mon). `complete` / `uncomplete` default `--date` to today in the routine's
timezone (fetched server-side).

---

## Habits

All habit endpoints accept **either** a NextAuth session cookie **or** an
`Authorization: Bearer <OWNER_API_TOKEN>` header — same dual-auth wrapper as
routines (`withUser` in `apps/web/lib/auth/resolveUser.ts`). Auth-failure
responses are identical to the routines section above.

Per-resource `404 not_found` is returned when a habit exists but is not owned
by the resolved user, OR does not exist at all (existence not distinguished).

**Weekday encoding:** `0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun` (ISO).
Same as routines.

### Cadence — discriminated union (JSONB)

Habits store a `cadence` JSONB column. Three kinds, validated server-side
with a zod discriminated union:

```ts
type Cadence =
  | { kind: 'daily' }
  | { kind: 'weekly_count'; perWeek: 1..7; weekStart: 0..6 } // weekStart default 0 (Mon)
  | { kind: 'specific_weekdays'; weekdays: number[] };       // subset of 0..6, non-empty
```

- **daily** — due every day.
- **weekly_count** — due N times per week; user picks which days as they go.
  `weekStart` defines the week boundary (default 0 = Monday).
- **specific_weekdays** — due on these weekdays only (e.g. Mon/Wed/Fri).
  Weekdays are de-duped + sorted server-side.

### Streak semantics (server-side; client never sends streak counts)

For each habit, we compute three numbers as of the reference date (default:
today in the habit's `timezone`):

- **currentStreak** — consecutive due-and-completed dates ending at the
  reference date. For `daily` / `specific_weekdays`, non-due days don't break
  the streak (they're skipped). For `weekly_count`, the streak counts
  consecutive *weeks* (per `weekStart`) where completions ≥ `perWeek`. The
  in-progress week counts only if it has already hit `perWeek`; otherwise the
  streak is measured ending at the most recently *completed* qualifying week.
- **longestStreak** — max consecutive due-and-completed dates (or weeks) ever
  seen for this habit/user.
- **totalCompletions** — count of distinct completion rows.

Edge cases:

- **Habit created mid-streak**: streak counting stops at `createdAt` (in the
  habit's tz). Pre-creation due dates are NOT counted as misses.
- **Timezone + DST**: all date arithmetic is calendar-day, in the habit's
  IANA timezone. We never use 86400 seconds as a "day" — DST flips would
  introduce off-by-one errors.
- **Cadence changes**: streaks are RECOMPUTED on next read against the new
  cadence. No migration of historical completions is performed.

Implementation: pure function in `apps/web/lib/habits/streaks.ts`
(`computeStreaks(inputs) -> StreakResult`). DB queries live in
`apps/web/lib/habits/queries.ts`. No external date library — uses Node's
`Intl.DateTimeFormat` for tz-aware day arithmetic.

### `GET /api/habits` — session OR owner-token

List the current user's non-archived habits with computed streak fields,
ordered by name.

**Success** (`200`):

```ts
{
  ok: true,
  habits: Array<{
    id: string;          // uuid
    ownerUserId: string;
    name: string;
    description: string | null;
    timezone: string;    // IANA
    cadence: Cadence;    // see above
    createdAt: string;   // ISO timestamp
    updatedAt: string;
    archivedAt: string | null;
    currentStreak: number;
    longestStreak: number;
    totalCompletions: number;
    lastCompletedDate: string | null; // 'YYYY-MM-DD' in habit tz
  }>;
}
```

Empty list: `{ ok: true, habits: [] }`.

### `POST /api/habits` — session OR owner-token

Create a habit. Streaks for a brand-new habit are always 0 (no completions yet).

**Request body:**

```ts
{
  name: string;                       // trim, 1..100
  description?: string;               // trim, <=500 (empty string -> NULL)
  timezone: string;                   // valid IANA
  cadence: Cadence;                   // discriminated union
  category?: string | null;           // free-text, trim, <=50; '' is normalised to null
  location?: string | null;           // free-text, trim, <=50; '' is normalised to null
}
```

zod: `createHabitSchema` in `lib/validation/habits.ts`.

**Success** (`201`):

```ts
{ ok: true, habit: { ...habit, currentStreak: 0, longestStreak: 0, totalCompletions: 0, lastCompletedDate: null } }
```

**Errors:** `400 invalid_json`, `400 validation_error`.

**Examples (cadence shapes):**

```bash
# Daily.
curl -X POST -H "Authorization: Bearer $OWNER_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Meditate","timezone":"America/Los_Angeles","cadence":{"kind":"daily"}}' \
  http://localhost:3000/api/habits

# 3 times per week, week starts Monday.
curl ... -d '{"name":"Run","timezone":"America/Los_Angeles","cadence":{"kind":"weekly_count","perWeek":3,"weekStart":0}}' ...

# Specific weekdays (Mon, Wed, Fri).
curl ... -d '{"name":"Gym","timezone":"America/Los_Angeles","cadence":{"kind":"specific_weekdays","weekdays":[0,2,4]}}' ...
```

### `GET /api/habits/:id` — session OR owner-token

Fetch one habit with streaks + the last 90 days of completion dates (for the
`CalendarHeatmap`).

**Success** (`200`):

```ts
{
  ok: true,
  habit: {
    ...habitFields,
    currentStreak, longestStreak, totalCompletions, lastCompletedDate,
    completionsLast90Days: Array<string>; // 'YYYY-MM-DD' in habit tz, ascending
  };
}
```

**Errors:** `404 not_found`.

### `PATCH /api/habits/:id` — session OR owner-token

Partial update. Body may include any of `name`, `description`, `timezone`,
`cadence`, `category`, `location`. At least one field required. If `cadence`
changes, streaks are recomputed on the next read (no migration of completion rows).

**Request body:**

```ts
{
  name?: string;
  description?: string | null;
  timezone?: string;
  cadence?: Cadence;
  category?: string | null;   // '' normalised to null (clears the column)
  location?: string | null;   // '' normalised to null (clears the column)
}
```

zod: `updateHabitSchema`. `description: null` / `category: null` / `location: null` clear the field.

**Success** (`200`): `{ ok: true, habit: <full row + streaks + completionsLast90Days> }`.

**Errors:** `400 invalid_json`, `400 validation_error`, `404 not_found`.

### `DELETE /api/habits/:id` — session OR owner-token

Soft delete (sets `archived_at`). Habit disappears from list / get afterward.

**Success** (`200`): `{ ok: true }`.

**Errors:** `404 not_found`.

### `POST /api/habits/:id/duplicate` — session OR owner-token

Clone an owned habit. `cadence` is copied verbatim (the full discriminated
union, including `weekStart` and `weekdays`). Habit completions are NOT
cloned — the new habit starts at zero streaks.

No request body — the URL param is the source.

The new habit's `name` is `"{original} (copy)"`, truncated so the total length
stays within the 100-char cap (chars are shaved off the *original* portion so
the `(copy)` suffix is always visible).

**Success** (`201`):

```ts
{
  ok: true,
  habit: {
    ...habitFields,
    currentStreak: 0,
    longestStreak: 0,
    totalCompletions: 0,
    lastCompletedDate: null,
  };
}
```

(Same shape as `POST /api/habits` — a fresh habit with zero progress.)

**Errors:** `404 not_found` (missing / not owned / archived).

```bash
curl -X POST -H "Authorization: Bearer $OWNER_API_TOKEN" \
  http://localhost:3000/api/habits/<id>/duplicate
```

### `POST /api/habits/:id/completions` — session OR owner-token

Mark a habit done for the resolved user + date. **Idempotent** on
`(habit_id, user_id, date)`. Returns the canonical row + updated streak numbers.

**Request body:** `{ date: 'YYYY-MM-DD' }`.

zod: `habitCompletionMutationSchema`.

**Success** (`201`):

```ts
{
  ok: true,
  completion: { id, habitId, userId, date, completedAt };
  streaks: { currentStreak, longestStreak, totalCompletions, lastCompletedDate };
}
```

**Errors:** `400 invalid_json`, `400 validation_error`, `404 not_found`.

### `DELETE /api/habits/:id/completions` — session OR owner-token

Remove a completion if it exists. **Always 204** (idempotent).

**Request body:** `{ date: 'YYYY-MM-DD' }`.

**Success:** `204 No Content`.

**Errors:** `400 invalid_json`, `400 validation_error`, `404 not_found`.

### CLI

The owner CLI exposes the habits namespace under `pnpm manage habit`:

```bash
pnpm manage habit list
pnpm manage habit create --name "Meditate" --timezone America/Los_Angeles --cadence daily
pnpm manage habit create --name "Run" --cadence weekly:3
pnpm manage habit create --name "Run" --cadence weekly:3:sun           # weekStart = Sunday
pnpm manage habit create --name "Gym" --cadence days:mon,wed,fri
pnpm manage habit show <id>
pnpm manage habit update <id> --cadence weekly:4
pnpm manage habit update <id> --description "New goal"
pnpm manage habit delete <id> --yes

pnpm manage habit done <id>                       # today in habit tz
pnpm manage habit done <id> --date 2026-05-17
pnpm manage habit undone <id>
```

The `--cadence` spec parser accepts:

- `daily` — daily.
- `weekly:N` — N times per week, week starts Monday.
- `weekly:N:DAY` — N times per week, week boundary on DAY (mon..sun or 0..6).
- `days:mon,wed,fri` — specific weekdays (comma-separated, case-insensitive).

`done` / `undone` default `--date` to today in the habit's timezone (fetched
server-side via a quick `GET /api/habits/:id`).

---

## Search

### `GET /api/search?q=<query>` — session OR owner-token

Unified free-text search over the current user's non-archived routines AND
habits. The frontend renders mixed results from a single response.

**Query params:**

- `q` (optional) — the free-text query.
  - **Missing** or **empty** → 200 with empty results.
  - **`q.length < 2`** → 200 with empty results (don't 4xx — the UI fires on
    each keystroke and a short-query 400 would feel hostile).
  - **`q.length > 100`** → silently truncated to 100 chars (don't reject).
  - Leading / trailing whitespace is trimmed.
  - LIKE wildcards (`%`, `_`) in user input are escaped so they match
    themselves literally; they do not behave as patterns.

zod: `searchQuerySchema` in `lib/validation/search.ts`. The normaliser
(`normaliseSearchQuery`) applies the lenient rules above; the schema itself
just bounds `q` to a sane hard ceiling (10 000 chars) to keep abuse out.

**Search fields:**

- Routines: `name`, `description`, `category`, `location`.
- Habits: `name`, `category`, `location`. (Habits' `description` column is
  intentionally NOT searched — keep the per-kind shape minimal.)

Match is case-insensitive (Postgres `ILIKE`).

**`matchedField` — bucket priority:** the first field (in the priority order
below) whose value contains the query is what `matchedField` reports. The
frontend uses it to highlight which field hit.

- Routines: `name` → `description` → `category` → `location`.
- Habits:  `name` → `category` → `location`.

**Ordering:** within each kind, results are sorted by `matchedField` bucket
(name matches surface first), then by `name ASC` (case-insensitive) within
each bucket.

**Cap:** at most 20 routines + 20 habits in the response. There is no
pagination — the cap is a UX guard, not a perf guard.

**Success** (`200`):

```ts
{
  ok: true,
  query: string,  // the effective (trimmed + truncated) query, or '' when short-circuited
  results: {
    routines: Array<{
      id: string;                  // uuid
      name: string;
      description: string | null;
      scheduleWeekdays: number[];  // 0=Mon..6=Sun; derived from routine_day_steps
      category: string | null;
      location: string | null;
      matchedField: 'name' | 'description' | 'category' | 'location';
    }>;
    habits: Array<{
      id: string;                  // uuid
      name: string;
      cadence: HabitCadence;       // same shape as GET /api/habits
      currentStreak: number;
      longestStreak: number;
      category: string | null;
      location: string | null;
      matchedField: 'name' | 'category' | 'location';
    }>;
  }
}
```

Empty / short-query response:

```json
{ "ok": true, "query": "", "results": { "routines": [], "habits": [] } }
```

**Errors:**

- `400 validation_error` — `q` exceeded the 10 000-char hard ceiling, or an
  unknown query param was supplied (`strict()` schema).
- `401 unauthenticated` — no session and no owner-token bearer.

**Examples:**

```bash
# Two matches: routine "Morning yoga" (matchedField=name) and habit "Yoga"
# (matchedField=name).
curl -H "Authorization: Bearer $OWNER_API_TOKEN" \
  'http://localhost:3000/api/search?q=yoga'

# Short query — empty results.
curl -H "Authorization: Bearer $OWNER_API_TOKEN" \
  'http://localhost:3000/api/search?q=y'
```

---

## Push notifications

All endpoints under `/api/push/**` except the public VAPID-key fetch require
auth. User-facing endpoints accept **either** a NextAuth session cookie **or**
an `Authorization: Bearer <OWNER_API_TOKEN>` header via the same `withUser`
wrapper as routines and habits. The dispatcher endpoint is owner-token-only —
session auth must NEVER be allowed to trigger pushes (see the
`/api/push/dispatch-tick` section below).

### Data model

- **`push_subscriptions`** — one row per (user, browser endpoint URL). The
  endpoint is the natural primary key (browser-guaranteed unique). Columns:
  `id`, `userId`, `endpoint` (unique), `p256dh`, `auth`, `userAgent`,
  `createdAt`, `lastSeenAt`. Endpoint + keys are SECRETS — never exposed via
  the list endpoint.
- **`notification_schedules`** — one shape, polymorphic via a CHECK constraint
  that exactly one of (`routineId`, `habitId`) is non-null. Columns: `id`,
  `userId`, `routineId?`, `habitId?`, `time` ("HH:MM" 24h), `weekdays`
  (JSONB int[], subset of 0..6 ISO), `enabled`, `createdAt`, `updatedAt`.
  When `enabled = false` the schedule is paused but kept.

### Time + weekday semantics

- `time` is stored verbatim as 24-hour `HH:MM`. The dispatcher converts the
  current `Date` into the SUBJECT'S IANA timezone (routine.timezone /
  habit.timezone) and exact-string compares against `time`. Minute-granularity
  matching means the dispatcher must run every minute.
- `weekdays` uses the same ISO encoding as the rest of the codebase: 0=Mon,
  6=Sun. Arrays are deduped + sorted server-side.

### VAPID configuration

- Generate the keypair: `pnpm dlx web-push generate-vapid-keys`.
- Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (a
  `mailto:` or `https:` URL identifying the app owner per RFC 8292).
- The dispatcher calls `webpush.setVapidDetails(...)` once per process via
  the `applyVapid()` helper in `apps/web/lib/push/vapid.ts`.
- When VAPID is NOT configured, all push functionality degrades gracefully:
  - `GET /api/push/vapid-public-key` → 503 `push_not_configured`.
  - `POST /api/push/subscriptions` → 503 `push_not_configured`.
  - `POST /api/push/dispatch-tick` → 200 with `{ fired: 0, ... }` (no-op).
  - The dev scheduler logs a one-line warning and does not start.

### `GET /api/push/vapid-public-key` — public

Returns the configured VAPID public key for browser subscription.

**Success** (`200`):

```json
{ "ok": true, "key": "BNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
```

Response headers include
`Cache-Control: public, max-age=3600, s-maxage=3600, immutable`.

**Errors:** `503 push_not_configured` when env vars are absent.

### `GET /api/push/subscriptions` — session OR owner-token

List the current user's push subscriptions (for the account "Devices" UI).
Never returns the endpoint URL or the push keys — those are secrets that
should not leave the server beyond the original `POST`.

**Success** (`200`):

```ts
{
  ok: true,
  subscriptions: Array<{
    id: string;
    userAgent: string | null;
    createdAt: string; // ISO
    lastSeenAt: string;
  }>;
}
```

### `POST /api/push/subscriptions` — session OR owner-token

Upsert by `endpoint`. Re-binds the row to the current user on conflict
(handles account-switching on the same device).

**Request body:**

```ts
{
  endpoint: string;       // https URL, <=2048 chars
  keys: {
    p256dh: string;       // base64url, <=512 chars
    auth: string;         // base64url, <=512 chars
  };
  userAgent?: string;     // <=512 chars
}
```

zod: `subscribePushSchema` in `lib/validation/push.ts`.

**Success** (`201`):

```ts
{
  ok: true,
  subscription: { id, userAgent, createdAt, lastSeenAt };
}
```

(Endpoint + keys are NOT echoed back — they are secrets the client already has.)

**Errors:** `400 invalid_json`, `400 validation_error`, `503 push_not_configured`.

### `DELETE /api/push/subscriptions` — session OR owner-token

Remove by endpoint. Always 204.

**Request body:** `{ endpoint: string }`.

zod: `unsubscribePushSchema`.

**Success:** `204 No Content`.

**Errors:** `400 invalid_json`, `400 validation_error`.

### `DELETE /api/push/subscriptions/:id` — session OR owner-token

Remove a subscription by its DB id (the id surfaced by
`GET /api/push/subscriptions`). Companion to the endpoint-based DELETE above:
the browser uses the endpoint variant to unsubscribe its OWN device (it has
the endpoint URL but not the DB id), while the account "Devices" UI uses this
id variant to drop other devices whose endpoints it never sees. Owner-scoped:
the WHERE clause requires both `id` and `userId` to match, so attempting to
delete another user's subscription is a silent no-op. Always 204 (idempotent —
does not distinguish "not yours" from "doesn't exist" to avoid id leakage,
matching the schedules convention).

**Success:** `204 No Content`.

**Example:**

```bash
curl -X DELETE -H "Authorization: Bearer $OWNER_API_TOKEN" \
  http://localhost:3000/api/push/subscriptions/00000000-0000-0000-0000-000000000000
```

### `GET /api/push/schedules?subjectType=routine|habit&subjectId=<id>` — session OR owner-token

List schedules. Both query params are optional — when both are omitted,
returns ALL schedules for the user. When provided, both are required and the
endpoint validates the subject is owned by the user (404 if not).

**Success** (`200`):

```ts
{
  ok: true,
  schedules: Array<{
    id: string;
    routineId: string | null;
    habitId: string | null;
    time: string;       // "HH:MM"
    weekdays: number[]; // ISO 0..6
    enabled: boolean;
    createdAt: string;  // ISO
    updatedAt: string;
  }>;
}
```

**Errors:** `400 validation_error`, `404 not_found`.

### `POST /api/push/schedules` — session OR owner-token

Create one schedule. The subject must be owned by the caller (else 404).

**Request body:**

```ts
{
  subjectType: 'routine' | 'habit';
  subjectId: string;     // uuid
  time: string;          // "HH:MM" 24h
  weekdays: number[];    // 1..7 unique entries in 0..6 (ISO); dedupe + sort happen server-side
  enabled?: boolean;     // defaults to true
}
```

zod: `createScheduleSchema`.

**Success** (`201`):

```ts
{ ok: true, schedule: { /* as listed above */ } }
```

**Errors:** `400 invalid_json`, `400 validation_error`, `404 not_found`.

### `PATCH /api/push/schedules/:id` — session OR owner-token

Partial update. Body may include any of `time`, `weekdays`, `enabled`. At
least one required.

**Request body:** `{ time?: string; weekdays?: number[]; enabled?: boolean }`.

zod: `updateScheduleSchema`.

**Success** (`200`): `{ ok: true, schedule: <full row> }`.

**Errors:** `400 invalid_json`, `400 validation_error`, `404 not_found`.

### `DELETE /api/push/schedules/:id` — session OR owner-token

Remove a schedule. Always 204 (idempotent — does not distinguish "not yours"
from "doesn't exist" to avoid id leakage, matching the routines/habits
convention).

**Success:** `204 No Content`.

### `POST /api/push/dispatch-tick` — owner-token ONLY

The cron entrypoint. Runs one dispatcher tick:

1. Loads every `enabled=true` schedule joined to its subject (routine or habit).
2. For each, computes the subject's local time + weekday and keeps only
   schedules where `time == HH:MM (now in subject tz)` AND `weekday ∈ schedule.weekdays`.
3. Looks up subscriptions for the affected users.
4. Fans out one `webpush.sendNotification` per (subscription, schedule) with
   a JSON payload `{ subjectType, subjectId, title, body, url }`.
5. On 410 Gone, deletes the dead subscription. On other failures, logs +
   continues — one broken subscription must not break the tick.
6. Dedupes per tick via an in-memory `(subscriptionId, scheduleId)` set.

**Auth:** Owner-token only (`Authorization: Bearer <OWNER_API_TOKEN>`) — a
session cookie must NEVER trigger this endpoint. Implementation in
`apps/web/lib/push/dispatcher.ts` (`isAuthorizedDispatch`) is bespoke for
this reason (does NOT use the `withUser` / `withOwnerAuth` wrappers).

**Success** (`200`):

```ts
{
  ok: true,
  checked: number;  // total enabled schedules considered
  fired: number;    // pushes successfully sent
  deleted: number;  // subscriptions deleted because of 410 Gone
  errors: number;   // non-410 send failures (logged)
}
```

**Errors:**

- `401 unauthorized` — missing or invalid bearer token.

### Idempotency tradeoffs

The dispatcher runs once per minute. If Vercel runs it twice in the same
minute (rare), schedules whose `time` equals that minute could double-send.
The in-tick dedup set prevents the same (subscription, schedule) being sent
twice within a single dispatcher invocation — but NOT across invocations.

Cross-tick dedup would require a `notification_log` table with a
`(subscriptionId, scheduleId, minute)` unique key plus INSERT-then-send.
**Deferred** for a follow-up dispatch — for MVP, in-memory per-tick dedup is
sufficient.

### Dev vs prod scheduling

- **Dev**: `apps/web/instrumentation.ts` calls `startDevScheduler()` which
  runs a `setInterval(dispatchTick, 60_000)`. Gated on
  `NODE_ENV !== 'production'`. No setup needed beyond having VAPID env vars
  set.
- **Prod**: `apps/web/vercel.json` registers
  `{ path: "/api/push/dispatch-tick", schedule: "* * * * *" }`. Vercel
  attaches an `Authorization: Bearer <CRON_SECRET>` header automatically —
  set `CRON_SECRET = OWNER_API_TOKEN` in the Vercel project (or use a
  separate value and adjust the env in `lib/push/dispatcher.ts#isAuthorizedDispatch`).

### CLI

```bash
pnpm manage push subscriptions list

pnpm manage push schedules list                       # all
pnpm manage push schedules list --routine <id>        # filtered
pnpm manage push schedules list --habit <id>

pnpm manage push schedules add --routine <id> --time 07:30 --weekdays mon,wed,fri
pnpm manage push schedules add --habit <id> --time 21:00 --weekdays 0,1,2,3,4,5,6 --disabled

pnpm manage push schedules update <id> --time 08:00
pnpm manage push schedules update <id> --weekdays mon,tue --enabled
pnpm manage push schedules delete <id> --yes

pnpm manage push dispatch-tick                        # manually fire the dispatcher
```

The `--weekdays` parser accepts the same forms as the rest of the CLI
(`mon|tue|...|sun` or `0..6`, comma-separated). Times are validated against
`/^([01]\d|2[0-3]):([0-5]\d)$/`.

---

## Backup / migrate

Two owner-token-only endpoints for dumping the owner's full data set as
versioned JSON and loading it back. Used to:

1. **Back up** local pglite-dev data (insurance against WASM corruption).
2. **Migrate** from local pglite-dev to a real Supabase deployment.

Library helpers `exportOwnerData` and `importOwnerData` live in
`apps/web/lib/export/index.ts` and are reusable from in-process callers; the
HTTP wrappers below add auth + JSON parsing only.

**Security exclusions** (enforced at the library layer — never on the wire):

- `users.passwordHash` — never selected.
- `accounts.refresh_token` / `access_token` / `id_token` / `session_state` / `expires_at` / `token_type` / `scope` — never selected.
- `sessions.*` — always returned as `[]`.
- `verificationTokens.*` — always returned as `[]`.
- `pushSubscriptions.*` — always returned as `[]` (per-device keys are not portable).

A leaked export file is therefore useless for impersonation. Reimporting an
OAuth account row writes only `provider` + `providerAccountId` — the user
must re-link the provider on the destination to get a working OAuth flow.

### `POST /api/owner/export` — owner-token ONLY

Dump the owner's data set.

**Auth:** owner-token only. Sessions cannot trigger this endpoint — a stolen
session cookie should NOT be able to exfiltrate the complete data dump.

**Request body** (all optional):

```ts
{
  scope?: 'mine' | 'all';   // default 'mine'
}
```

`scope: 'all'` is reserved for future multi-user support; the current MVP
returns `400 export_failed` for it.

**Success** (`200`): the full export payload as JSON.

```jsonc
{
  "version": 1,
  "exportedAt": "2026-05-19T12:34:56.789Z",
  "scope": "mine",
  "users": [
    {
      "id": "...",
      "email": "owner@example.com",
      "name": null,
      "image": null,
      "emailVerified": "2026-05-19T...",
      "createdAt": "2026-05-19T...",
      "updatedAt": "2026-05-19T..."
      // NOTE: passwordHash deliberately absent.
    }
  ],
  "accounts": [
    {
      "userId": "...",
      "type": "oauth",
      "provider": "google",
      "providerAccountId": "..."
      // NOTE: refresh_token/access_token/etc deliberately absent.
    }
  ],
  "verificationTokens": [],
  "sessions": [],
  "routines": [...],
  "routineDaySteps": [...],
  "routineStepCompletions": [...],
  "habits": [...],
  "habitCompletions": [...],
  "pushSubscriptions": [],
  "notificationSchedules": [...]
}
```

**Errors:**

- `400 invalid_json` — body is not valid JSON.
- `400 validation_error` — body fails the optional `{ scope }` schema.
- `400 export_failed` — `scope: 'all'` not supported yet.
- `401 missing_token` / `401 invalid_token` — owner-token auth failed.

**Example:**

```bash
curl -X POST http://localhost:3000/api/owner/export \
  -H "Authorization: Bearer $OWNER_API_TOKEN" \
  > backup-$(date +%Y%m%d).json
```

### `POST /api/owner/import` — owner-token ONLY

Load a previously-exported payload, rebinding all rows to the authenticated
owner's user-id.

**Auth:** owner-token only — same rationale as export. Importing can wipe
the entire data set in `replace` mode; never allow a session cookie to do
this.

**Body**: the full export payload (same shape as the export response) PLUS
optional control fields:

```ts
{
  ...exportPayload,            // version, users, routines, habits, etc.
  mode?: 'replace' | 'merge';  // default 'replace'
  dryRun?: boolean;            // default false
}
```

`mode` and `dryRun` may also be passed as query parameters
(`?mode=merge&dryRun=1`) — query takes precedence over body.

**Modes:**

- `'replace'` (default): delete the owner's existing rows for the affected
  tables, then insert the payload. The `users` row and OAuth `accounts` are
  **not** deleted (deleting the user mid-request would yank the
  authenticated session); accounts are merged via `ON CONFLICT DO NOTHING`.
- `'merge'`: insert rows; skip any whose primary key already exists. Safer
  for partial restores.

**Dry-run** (`dryRun: true`): validate the payload, report counts, but do
not write. The DB is untouched. Safe to call against production.

**Atomicity:** the entire import runs inside `db.transaction(...)`. Any
failure rolls back. Partial writes are impossible.

**Owner rebinding:** every `userId` / `ownerUserId` in the payload is
rewritten to the authenticated owner's id. The payload MUST contain exactly
one user row; any reference to a different user-id within the payload is a
**hand-crafted impersonation attempt** and is rejected with `owner_mismatch`.

**Success** (`200`):

```ts
{
  ok: true,
  mode: 'replace' | 'merge',
  dryRun: boolean,
  counts: {
    routines: number,
    routineDaySteps: number,
    routineStepCompletions: number,
    habits: number,
    habitCompletions: number,
    notificationSchedules: number
  }
}
```

**Errors:**

- `400 invalid_json` — body is not valid JSON.
- `400 version_mismatch` — `payload.version !== 1`.
- `400 validation_error` — zod schema check failed (issues attached).
- `400 owner_mismatch` — payload references a user other than the single
  user in `payload.users` (or the user list is empty / has multiple rows).
- `401 missing_token` / `401 invalid_token` — owner-token auth failed.
- `500 import_failed` — transaction threw at the DB layer (rolled back).

**Examples:**

```bash
# Dry-run (no writes; reports counts):
curl -X POST http://localhost:3000/api/owner/import \
  -H "Authorization: Bearer $OWNER_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @backup.json \
  --data-urlencode 'dryRun=true'

# Real replace import (DELETES owner's existing data first, then inserts):
curl -X POST 'http://localhost:3000/api/owner/import?mode=replace' \
  -H "Authorization: Bearer $OWNER_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @backup.json
```

### CLI

```bash
# Local backup (writes routineforge-export-YYYY-MM-DD.json in cwd by default).
pnpm manage export

# Custom output path.
pnpm manage export --out backup.json

# Pipe to stdout (e.g. for shell scripting / streaming).
pnpm manage export --stdout > backup.json

# Validate a backup without writing.
pnpm manage import backup.json --dry-run

# Restore a backup. WITHOUT --yes, prompts for confirmation since replace
# deletes the owner's existing data.
pnpm manage import backup.json --mode replace
pnpm manage import backup.json --mode replace --yes

# Merge mode: insert new rows, keep existing ones on id conflict.
pnpm manage import backup.json --mode merge --yes
```
