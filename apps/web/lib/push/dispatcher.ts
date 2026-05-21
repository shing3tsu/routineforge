/**
 * Push dispatcher — finds schedules whose firing-time matches NOW in the
 * subject's local timezone, then sends a Web Push message to every
 * subscription owned by the schedule's user.
 *
 * Called every minute by:
 *   - Vercel Cron (prod) -> POST /api/push/dispatch-tick (owner-token auth)
 *   - The in-process dev scheduler (dev) -> direct function call from
 *     `apps/web/lib/push/dev-scheduler.ts`
 *
 * --------------------------------------------------------------------------
 * Algorithm: "find due triples, then send"
 * --------------------------------------------------------------------------
 *
 *   1. Load all schedules that are `enabled = true`, joined with their subject
 *      (routine OR habit) so we have the subject's timezone, name, and id.
 *
 *   2. For each schedule, compute "is this schedule due RIGHT NOW?" by:
 *        - Resolving the current `Date` to the SUBJECT'S local time.
 *        - Comparing `HH:MM` against `schedule.time` exactly.
 *        - Checking the local ISO weekday is in `schedule.weekdays`.
 *
 *   3. Group the due schedules by user, then fan out one push per
 *      (subscription, schedule).
 *
 *   4. On 410 Gone, delete the dead subscription. On other failures, log and
 *      continue — one broken subscription must not break the whole tick.
 *
 *   5. In-memory de-dup per tick: a single `Set` of `(subscriptionId, scheduleId)`
 *      keys ensures we never send the same notification twice within one tick.
 *      Cross-tick dedup is harder (see "Idempotency tradeoffs" below).
 *
 * --------------------------------------------------------------------------
 * Idempotency tradeoffs
 * --------------------------------------------------------------------------
 *
 * The dispatcher is invoked once per minute. If Vercel runs the cron twice
 * in the same minute (rare but possible) we'd double-send. Fixing this
 * cross-process would require a `notification_log` table with a
 * `(subscriptionId, scheduleId, minute)` unique key plus an INSERT-then-send
 * pattern. Flagged for a follow-up dispatch — for MVP, in-memory per-tick
 * de-dup is sufficient.
 *
 * The minute granularity is also the reason `time` is stored as plain "HH:MM":
 * any finer resolution would require a different matching algorithm.
 */

import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import webpush, { type WebPushError } from 'web-push';
import { db } from '@/db';
import {
  notificationSchedules,
  pushSubscriptions,
  routines,
  habits,
} from '@/db/schema';
import { isoWeekdayInTz, todayInTz } from '@/lib/habits/streaks';
import { applyVapid } from './vapid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DispatchResult = {
  /** Total schedules considered (after the enabled filter). */
  checked: number;
  /** Push messages successfully sent. */
  fired: number;
  /** Subscriptions deleted because the gateway returned 410 Gone. */
  deleted: number;
  /** Non-410 send errors (for observability). */
  errors: number;
};

type DueTriple = {
  scheduleId: string;
  userId: string;
  subjectType: 'routine' | 'habit';
  subjectId: string;
  subjectName: string;
  subjectTimezone: string;
};

// ---------------------------------------------------------------------------
// Payload shape sent to the service worker
// ---------------------------------------------------------------------------

export type PushPayload = {
  subjectType: 'routine' | 'habit';
  subjectId: string;
  title: string;
  body: string;
  url: string;
};

function buildPayload(triple: DueTriple): PushPayload {
  // Title is the subject name; body is a verb-led nudge. Keep both short so
  // mobile notification trays don't truncate the useful bit. URL deep-links
  // into the right detail screen.
  if (triple.subjectType === 'routine') {
    return {
      subjectType: 'routine',
      subjectId: triple.subjectId,
      title: triple.subjectName,
      body: 'Time for your routine.',
      url: `/routines/${triple.subjectId}`,
    };
  }
  return {
    subjectType: 'habit',
    subjectId: triple.subjectId,
    title: triple.subjectName,
    body: 'Time to check off this habit.',
    url: `/habits/${triple.subjectId}`,
  };
}

// ---------------------------------------------------------------------------
// Minute formatting in an IANA tz
// ---------------------------------------------------------------------------

/**
 * Format `now` as "HH:MM" 24h in the given IANA timezone. Uses
 * `Intl.DateTimeFormat`'s en-GB locale, which gives "HH:MM" with explicit
 * zero-padding (`hour12: false`). Matches the storage format exactly.
 */
function localHHMM(now: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  // en-GB returns "HH:MM" directly. Guard against locales / Node versions
  // that yield "24:MM" at midnight (some historical bugs); coerce to "00:MM".
  const out = fmt.format(now);
  return out.startsWith('24:') ? `00:${out.slice(3)}` : out;
}

// ---------------------------------------------------------------------------
// Core dispatch
// ---------------------------------------------------------------------------

/**
 * Run one dispatcher tick. Pure on its inputs (the `now` arg) — the route
 * handler / dev scheduler pass `new Date()` at the call site.
 *
 * Returns counts for observability. Does NOT throw on per-subscription
 * failures (per the dispatch contract).
 */
export async function dispatchTick(
  now: Date = new Date(),
): Promise<DispatchResult> {
  const result: DispatchResult = {
    checked: 0,
    fired: 0,
    deleted: 0,
    errors: 0,
  };

  // VAPID must be configured before we can sign push messages. When it's
  // absent, the dispatcher is a no-op (caller's 200 response includes counts
  // of zero, which is the right answer for "nothing to fire").
  if (!applyVapid()) {
    return result;
  }

  // --- 1. Load all enabled schedules + their subject metadata. ------------
  //
  // We do two left-joins because each schedule has either routineId OR
  // habitId (not both — the CHECK constraint guarantees it). The query
  // returns one row per schedule with the relevant subject column
  // populated. This is a single round-trip and lets the dispatcher iterate
  // without N+1 lookups.

  const rows = await db
    .select({
      scheduleId: notificationSchedules.id,
      userId: notificationSchedules.userId,
      routineId: notificationSchedules.routineId,
      habitId: notificationSchedules.habitId,
      time: notificationSchedules.time,
      weekdays: notificationSchedules.weekdays,
      routineName: routines.name,
      routineTz: routines.timezone,
      routineArchivedAt: routines.archivedAt,
      habitName: habits.name,
      habitTz: habits.timezone,
      habitArchivedAt: habits.archivedAt,
    })
    .from(notificationSchedules)
    .leftJoin(routines, eq(notificationSchedules.routineId, routines.id))
    .leftJoin(habits, eq(notificationSchedules.habitId, habits.id))
    .where(eq(notificationSchedules.enabled, true));

  result.checked = rows.length;

  // --- 2. Filter to "due NOW" --------------------------------------------

  const due: DueTriple[] = [];
  for (const row of rows) {
    const isRoutine = row.routineId !== null;
    const subjectName = isRoutine ? row.routineName : row.habitName;
    const subjectTz = isRoutine ? row.routineTz : row.habitTz;
    const archivedAt = isRoutine ? row.routineArchivedAt : row.habitArchivedAt;
    // Subject must exist and be active (not archived). If the subject was
    // soft-deleted we skip silently; the cascade on hard-delete would have
    // already removed the schedule.
    if (!subjectName || !subjectTz || archivedAt !== null) continue;

    const localToday = todayInTz(subjectTz, now);
    const localWd = isoWeekdayInTz(localToday, subjectTz);
    if (!row.weekdays.includes(localWd)) continue;

    const localTime = localHHMM(now, subjectTz);
    if (localTime !== row.time) continue;

    due.push({
      scheduleId: row.scheduleId,
      userId: row.userId,
      subjectType: isRoutine ? 'routine' : 'habit',
      subjectId: (isRoutine ? row.routineId : row.habitId) as string,
      subjectName,
      subjectTimezone: subjectTz,
    });
  }

  if (due.length === 0) return result;

  // --- 3. Look up subscriptions for the affected users -------------------

  const userIds = Array.from(new Set(due.map((t) => t.userId)));
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));

  const subsByUser = new Map<string, typeof subs>();
  for (const s of subs) {
    const list = subsByUser.get(s.userId) ?? [];
    list.push(s);
    subsByUser.set(s.userId, list);
  }

  // --- 4. Send + dedup ---------------------------------------------------
  //
  // In-memory de-dup key: `${subscriptionId}|${scheduleId}`. Cross-tick
  // dedup is intentionally NOT implemented here — see the module header for
  // tradeoff rationale.

  const sentKeys = new Set<string>();
  const deadEndpoints = new Set<string>();

  for (const triple of due) {
    const userSubs = subsByUser.get(triple.userId) ?? [];
    if (userSubs.length === 0) continue;

    const payload = buildPayload(triple);
    const json = JSON.stringify(payload);

    for (const sub of userSubs) {
      const dedupKey = `${sub.id}|${triple.scheduleId}`;
      if (sentKeys.has(dedupKey)) continue;
      sentKeys.add(dedupKey);

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          json,
        );
        result.fired += 1;
      } catch (e) {
        const err = e as WebPushError;
        if (typeof err.statusCode === 'number' && err.statusCode === 410) {
          // Endpoint is permanently gone. Mark for delete after the loop so we
          // can issue a single batched delete.
          deadEndpoints.add(sub.endpoint);
        } else {
          result.errors += 1;
          // Log and continue. Use console.warn so production logs surface this
          // without crashing the request.
          console.warn(
            `[push] send failed for sub ${sub.id} (sched ${triple.scheduleId}):`,
            err?.statusCode ?? 'unknown',
            err?.body ?? err?.message ?? String(e),
          );
        }
      }
    }
  }

  // --- 5. Garbage-collect dead subscriptions ------------------------------

  if (deadEndpoints.size > 0) {
    const endpoints = Array.from(deadEndpoints);
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.endpoint, endpoints));
    result.deleted = endpoints.length;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Auth helper for the dispatch route
// ---------------------------------------------------------------------------

/**
 * Verify the `Authorization: Bearer <OWNER_API_TOKEN>` header on a request.
 *
 * The dispatcher endpoint is NOT a normal user-facing route — it's the cron
 * entrypoint. We deliberately do NOT use the `withUser` wrapper here so a
 * regular session cookie can never trigger the cron logic.
 *
 * Why not reuse `authenticateOwner` from `lib/auth/owner.ts`: that helper
 * additionally resolves the OWNER_EMAIL user, which we don't need here — the
 * dispatcher is system-owned, not owner-owned. We just need to confirm the
 * cron call came from a trusted source.
 *
 * Returns true on a match, false on missing / wrong / misconfigured.
 */
export function isAuthorizedDispatch(req: Request): boolean {
  const expected = process.env.OWNER_API_TOKEN;
  if (!expected || expected.length < 16) return false;
  const header = req.headers.get('authorization');
  if (!header) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || !match[1]) return false;
  const presented = match[1].trim();
  // Constant-time compare to avoid leaking the token via timing. Manual
  // implementation (vs node:crypto.timingSafeEqual) to avoid pulling in
  // additional surface here; both inputs are short ASCII secrets.
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
