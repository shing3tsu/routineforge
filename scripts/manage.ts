#!/usr/bin/env -S tsx
/**
 * RoutineForge owner CLI.
 *
 * Reads OWNER_API_TOKEN and APP_BASE_URL from .env.local at the repo root and
 * shells out to API endpoints with the token in the `Authorization: Bearer ...`
 * header.
 *
 * Subcommands:
 *   auth ping                                       -> GET  /api/owner/ping
 *   routine list                                    -> GET  /api/routines
 *   routine create --name [--description] [--timezone] [--category] [--location]
 *                                                   -> POST /api/routines
 *   routine show <id>                               -> GET  /api/routines/:id
 *   routine update <id> [--name --description --timezone --category --location]
 *                                                   -> PATCH /api/routines/:id
 *   routine delete <id> [--yes]                     -> DELETE /api/routines/:id
 *   routine step add <routineId> --weekday --title [--position]
 *                                                   -> POST /api/routines/:id/steps
 *   routine step remove <routineId> <stepId>        -> DELETE /api/routines/:id/steps/:stepId
 *   routine step move <routineId> <stepId> --weekday [--position]
 *                                                   -> PATCH  /api/routines/:id/steps/:stepId
 *   routine step reorder <routineId> --weekday <id1> <id2> ...
 *                                                   -> POST /api/routines/:id/steps/reorder
 *   routine complete <routineId> --step [--date]    -> POST /api/routines/:id/completions
 *   routine uncomplete <routineId> --step [--date]  -> DELETE /api/routines/:id/completions
 *
 *   habit list                                      -> GET  /api/habits
 *   habit create --name [--description] [--timezone] [--category] [--location] --cadence <spec>
 *                                                   -> POST /api/habits
 *   habit show <id>                                 -> GET  /api/habits/:id
 *   habit update <id> [--name --description --timezone --cadence --category --location ...]
 *                                                   -> PATCH /api/habits/:id
 *   habit delete <id> [--yes]                       -> DELETE /api/habits/:id
 *   habit done <id> [--date]                        -> POST  /api/habits/:id/completions
 *   habit undone <id> [--date]                      -> DELETE /api/habits/:id/completions
 *
 *   push subscriptions list                         -> GET  /api/push/subscriptions
 *   push schedules list [--routine <id> | --habit <id>]
 *                                                   -> GET  /api/push/schedules
 *   push schedules add (--routine <id> | --habit <id>) --time HH:MM --weekdays mon,wed,fri [--disabled]
 *                                                   -> POST /api/push/schedules
 *   push schedules update <id> [--time --weekdays --enabled/--disabled]
 *                                                   -> PATCH /api/push/schedules/:id
 *   push schedules delete <id> [--yes]              -> DELETE /api/push/schedules/:id
 *   push dispatch-tick                              -> POST  /api/push/dispatch-tick
 *
 *   export [--out <path>] [--scope mine|all]        -> POST  /api/owner/export
 *   import <path> [--mode replace|merge] [--dry-run] [--yes]
 *                                                   -> POST  /api/owner/import
 *
 * Cadence spec (passed to `--cadence`):
 *   daily                  → { kind: 'daily' }
 *   weekly:N               → { kind: 'weekly_count', perWeek: N, weekStart: 0 (Mon) }
 *   weekly:N:DAY           → weekly_count with weekStart = DAY (mon..sun)
 *   days:mon,wed,fri       → { kind: 'specific_weekdays', weekdays: [...] }
 */

import { defineCommand, runMain } from 'citty';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

// Load .env.local from the repo root (one level up from scripts/).
const repoRoot = resolve(import.meta.dirname ?? __dirname, '..');
const envPath = resolve(repoRoot, '.env.local');
if (existsSync(envPath)) {
  loadEnv({ path: envPath });
}

interface Env {
  token: string;
  baseUrl: string;
}

function requireEnv(): Env {
  const token = process.env.OWNER_API_TOKEN;
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';

  if (!token) {
    process.stderr.write(
      'manage: OWNER_API_TOKEN is not set. Copy .env.example to .env.local and fill it in.\n',
    );
    process.exit(1);
  }
  return { token, baseUrl };
}

async function callApi(
  env: Env,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const url = `${env.baseUrl.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }
  return { status: res.status, json };
}

async function callApiOrExit(
  env: Env,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  try {
    return await callApi(env, method, path, body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`manage: request failed: ${msg}\n`);
    process.exit(1);
  }
}

function printJson(j: unknown): void {
  process.stdout.write(`${JSON.stringify(j, null, 2)}\n`);
}

function exitWithStatus(res: { status: number; json: unknown }, okStatuses: number[] = [200, 201, 204]): never {
  if (okStatuses.includes(res.status)) {
    process.exit(0);
  } else {
    process.stderr.write(`manage: server returned HTTP ${res.status}\n`);
    process.exit(1);
  }
}

// --- weekday parsing --------------------------------------------------------

const WEEKDAY_NAMES: Record<string, number> = {
  mon: 0, monday: 0,
  tue: 1, tues: 1, tuesday: 1,
  wed: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3,
  fri: 4, friday: 4,
  sat: 5, saturday: 5,
  sun: 6, sunday: 6,
};

/**
 * Parse `mon|tue|...|sun` (case-insensitive) OR `0..6` (0=Monday).
 * Throws a clear error on anything else.
 */
function parseWeekday(raw: string | number | undefined): number {
  if (raw === undefined || raw === '') {
    throw new Error('--weekday is required (mon|tue|wed|thu|fri|sat|sun or 0..6).');
  }
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw < 0 || raw > 6) {
      throw new Error(`--weekday must be 0..6 (got ${raw}).`);
    }
    return raw;
  }
  const lower = String(raw).trim().toLowerCase();
  if (/^[0-6]$/.test(lower)) return Number(lower);
  const mapped = WEEKDAY_NAMES[lower];
  if (mapped === undefined) {
    throw new Error(
      `--weekday must be mon|tue|wed|thu|fri|sat|sun or 0..6 (got "${raw}").`,
    );
  }
  return mapped;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// --- shared helpers ---------------------------------------------------------

function defaultTimezone(): string {
  return process.env.TZ ?? 'UTC';
}

async function confirmPrompt(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(`${question} (y/N) `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

/** Compute today's local YYYY-MM-DD in a given IANA timezone. */
function todayInTimezone(timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA happens to format as YYYY-MM-DD already.
  return fmt.format(new Date());
}

// --- auth ping --------------------------------------------------------------

const authPing = defineCommand({
  meta: { name: 'ping', description: 'Verify the owner token by calling GET /api/owner/ping.' },
  async run() {
    const env = requireEnv();
    const res = await callApiOrExit(env, 'GET', '/api/owner/ping');
    printJson(res.json);
    exitWithStatus(res);
  },
});

const authGroup = defineCommand({
  meta: { name: 'auth', description: 'Auth-related commands.' },
  subCommands: { ping: authPing },
});

// --- routine list -----------------------------------------------------------

const routineList = defineCommand({
  meta: { name: 'list', description: 'List your non-archived routines.' },
  async run() {
    const env = requireEnv();
    const res = await callApiOrExit(env, 'GET', '/api/routines');
    if (res.status >= 400) {
      printJson(res.json);
      exitWithStatus(res);
    }
    const payload = res.json as { routines?: Array<{ id: string; name: string; description: string | null; timezone: string; scheduleWeekdays: number[] }> };
    const list = payload.routines ?? [];
    if (list.length === 0) {
      process.stdout.write('(no routines)\n');
      process.exit(0);
    }
    for (const r of list) {
      const days = r.scheduleWeekdays.map((w) => WEEKDAY_LABELS[w]).join(' ');
      const desc = r.description ? ` — ${r.description}` : '';
      process.stdout.write(`${r.id}  ${r.name}${desc}  [${r.timezone}]  ${days || '(no scheduled days)'}\n`);
    }
    process.exit(0);
  },
});

// --- routine create ---------------------------------------------------------

const routineCreate = defineCommand({
  meta: { name: 'create', description: 'Create a routine.' },
  args: {
    name: { type: 'string', required: true, description: 'Routine name (1..100).' },
    description: { type: 'string', required: false, description: 'Optional description (<=500).' },
    timezone: { type: 'string', required: false, description: 'IANA timezone (default: $TZ or UTC).' },
    category: { type: 'string', required: false, description: 'Optional free-text grouping label (<=50).' },
    location: { type: 'string', required: false, description: 'Optional free-text location label (<=50).' },
  },
  async run({ args }) {
    const env = requireEnv();
    const body: Record<string, unknown> = {
      name: args.name,
      description: args.description,
      timezone: args.timezone ?? defaultTimezone(),
    };
    // Only forward category/location when the user passed them. Empty strings
    // are forwarded as-is — the server-side validator converts '' to null.
    if (args.category !== undefined) body.category = args.category;
    if (args.location !== undefined) body.location = args.location;
    const res = await callApiOrExit(env, 'POST', '/api/routines', body);
    printJson(res.json);
    exitWithStatus(res);
  },
});

// --- routine show -----------------------------------------------------------

const routineShow = defineCommand({
  meta: { name: 'show', description: 'Show a routine and its per-weekday steps.' },
  args: {
    id: { type: 'positional', required: true, description: 'Routine id (uuid).' },
  },
  async run({ args }) {
    const env = requireEnv();
    const res = await callApiOrExit(env, 'GET', `/api/routines/${encodeURIComponent(args.id)}`);
    if (res.status >= 400) {
      printJson(res.json);
      exitWithStatus(res);
    }
    const payload = res.json as {
      routine?: {
        id: string;
        name: string;
        description: string | null;
        timezone: string;
        category: string | null;
        location: string | null;
        stepsByWeekday: Record<string, Array<{ id: string; position: number; title: string }>>;
      };
    };
    const r = payload.routine;
    if (!r) {
      printJson(res.json);
      process.exit(1);
    }
    process.stdout.write(`${r.name}  [${r.timezone}]\n`);
    if (r.description) process.stdout.write(`${r.description}\n`);
    process.stdout.write(`id: ${r.id}\n`);
    if (r.category) process.stdout.write(`category: ${r.category}\n`);
    if (r.location) process.stdout.write(`location: ${r.location}\n`);
    process.stdout.write('\n');
    for (let w = 0; w <= 6; w++) {
      const steps = r.stepsByWeekday[String(w)] ?? [];
      if (steps.length === 0) continue;
      process.stdout.write(`${WEEKDAY_LABELS[w]}\n`);
      for (const s of steps) {
        process.stdout.write(`  ${s.position + 1}. ${s.title}  (${s.id})\n`);
      }
    }
    process.exit(0);
  },
});

// --- routine update ---------------------------------------------------------

const routineUpdate = defineCommand({
  meta: {
    name: 'update',
    description:
      'Update a routine (any of name/description/timezone/category/location). Pass --category="" or --location="" to clear.',
  },
  args: {
    id: { type: 'positional', required: true, description: 'Routine id (uuid).' },
    name: { type: 'string', required: false },
    description: { type: 'string', required: false },
    timezone: { type: 'string', required: false },
    category: {
      type: 'string',
      required: false,
      description: 'Free-text category label (<=50). Pass "" to clear.',
    },
    location: {
      type: 'string',
      required: false,
      description: 'Free-text location label (<=50). Pass "" to clear.',
    },
  },
  async run({ args }) {
    const env = requireEnv();
    const body: Record<string, unknown> = {};
    if (args.name !== undefined) body.name = args.name;
    if (args.description !== undefined) body.description = args.description;
    if (args.timezone !== undefined) body.timezone = args.timezone;
    // Empty-string forwards as '' so the server-side validator normalises it
    // to `null` (clears the column). Forwarding `undefined` is omitted from
    // the body and leaves the field untouched.
    if (args.category !== undefined) body.category = args.category;
    if (args.location !== undefined) body.location = args.location;
    if (Object.keys(body).length === 0) {
      process.stderr.write(
        'manage: pass at least one of --name / --description / --timezone / --category / --location.\n',
      );
      process.exit(1);
    }
    const res = await callApiOrExit(env, 'PATCH', `/api/routines/${encodeURIComponent(args.id)}`, body);
    printJson(res.json);
    exitWithStatus(res);
  },
});

// --- routine delete ---------------------------------------------------------

const routineDelete = defineCommand({
  meta: { name: 'delete', description: 'Soft-delete (archive) a routine.' },
  args: {
    id: { type: 'positional', required: true, description: 'Routine id (uuid).' },
    yes: { type: 'boolean', required: false, description: 'Skip the confirm prompt.' },
  },
  async run({ args }) {
    const env = requireEnv();
    if (!args.yes) {
      const ok = await confirmPrompt(`Archive routine ${args.id}?`);
      if (!ok) {
        process.stderr.write('manage: cancelled.\n');
        process.exit(1);
      }
    }
    const res = await callApiOrExit(env, 'DELETE', `/api/routines/${encodeURIComponent(args.id)}`);
    printJson(res.json);
    exitWithStatus(res);
  },
});

// --- routine step add -------------------------------------------------------

const routineStepAdd = defineCommand({
  meta: { name: 'add', description: 'Add a step to a routine weekday.' },
  args: {
    routineId: { type: 'positional', required: true, description: 'Routine id.' },
    weekday: { type: 'string', required: true, description: 'mon|tue|...|sun or 0..6.' },
    title: { type: 'string', required: true, description: 'Step title (1..200).' },
    position: { type: 'string', required: false, description: 'Zero-based position. Omit to append.' },
  },
  async run({ args }) {
    const env = requireEnv();
    let weekday: number;
    try {
      weekday = parseWeekday(args.weekday);
    } catch (e) {
      process.stderr.write(`manage: ${(e as Error).message}\n`);
      process.exit(1);
    }
    const body: Record<string, unknown> = { weekday, title: args.title };
    if (args.position !== undefined) {
      const pos = Number(args.position);
      if (!Number.isInteger(pos) || pos < 0) {
        process.stderr.write(`manage: --position must be a non-negative integer (got "${args.position}").\n`);
        process.exit(1);
      }
      body.position = pos;
    }
    const res = await callApiOrExit(env, 'POST', `/api/routines/${encodeURIComponent(args.routineId)}/steps`, body);
    printJson(res.json);
    exitWithStatus(res);
  },
});

// --- routine step remove ----------------------------------------------------

const routineStepRemove = defineCommand({
  meta: { name: 'remove', description: 'Remove a step.' },
  args: {
    routineId: { type: 'positional', required: true },
    stepId: { type: 'positional', required: true },
  },
  async run({ args }) {
    const env = requireEnv();
    const res = await callApiOrExit(
      env,
      'DELETE',
      `/api/routines/${encodeURIComponent(args.routineId)}/steps/${encodeURIComponent(args.stepId)}`,
    );
    printJson(res.json);
    exitWithStatus(res);
  },
});

// --- routine step move ------------------------------------------------------

const routineStepMove = defineCommand({
  meta: { name: 'move', description: 'Move a step to a different weekday and/or position.' },
  args: {
    routineId: { type: 'positional', required: true },
    stepId: { type: 'positional', required: true },
    weekday: { type: 'string', required: true, description: 'Target weekday.' },
    position: { type: 'string', required: false, description: 'Target position (omit to append).' },
  },
  async run({ args }) {
    const env = requireEnv();
    let weekday: number;
    try {
      weekday = parseWeekday(args.weekday);
    } catch (e) {
      process.stderr.write(`manage: ${(e as Error).message}\n`);
      process.exit(1);
    }
    const body: Record<string, unknown> = { weekday };
    if (args.position !== undefined) {
      const pos = Number(args.position);
      if (!Number.isInteger(pos) || pos < 0) {
        process.stderr.write(`manage: --position must be a non-negative integer (got "${args.position}").\n`);
        process.exit(1);
      }
      body.position = pos;
    }
    const res = await callApiOrExit(
      env,
      'PATCH',
      `/api/routines/${encodeURIComponent(args.routineId)}/steps/${encodeURIComponent(args.stepId)}`,
      body,
    );
    printJson(res.json);
    exitWithStatus(res);
  },
});

// --- routine step reorder ---------------------------------------------------

const routineStepReorder = defineCommand({
  meta: { name: 'reorder', description: 'Bulk reorder steps in a weekday by full ordered id list.' },
  args: {
    routineId: { type: 'positional', required: true },
    weekday: { type: 'string', required: true, description: 'Weekday to reorder.' },
    stepIds: { type: 'positional', required: false, description: 'Step ids in desired order (space-separated).' },
  },
  async run(ctx) {
    const env = requireEnv();
    let weekday: number;
    try {
      weekday = parseWeekday(ctx.args.weekday);
    } catch (e) {
      process.stderr.write(`manage: ${(e as Error).message}\n`);
      process.exit(1);
    }
    // citty collects extra positional args under `_` after the named positionals.
    const restArgs = ((ctx.args as { _?: string[] })._ ?? []).slice(2); // drop routineId, weekday
    const stepIds: string[] = [];
    if (typeof ctx.args.stepIds === 'string' && ctx.args.stepIds.length > 0) {
      stepIds.push(ctx.args.stepIds);
    }
    for (const s of restArgs) if (typeof s === 'string' && s.length > 0) stepIds.push(s);
    if (stepIds.length === 0) {
      process.stderr.write('manage: pass the full ordered list of step ids as positional args.\n');
      process.exit(1);
    }
    const body = { weekday, stepIds };
    const res = await callApiOrExit(
      env,
      'POST',
      `/api/routines/${encodeURIComponent(ctx.args.routineId)}/steps/reorder`,
      body,
    );
    printJson(res.json);
    exitWithStatus(res);
  },
});

const routineStepGroup = defineCommand({
  meta: { name: 'step', description: 'Per-weekday step commands.' },
  subCommands: {
    add: routineStepAdd,
    remove: routineStepRemove,
    move: routineStepMove,
    reorder: routineStepReorder,
  },
});

// --- routine complete / uncomplete -----------------------------------------

async function defaultDateForRoutine(env: Env, routineId: string): Promise<string> {
  // Fetch the routine to learn its timezone, then compute today's local date.
  const res = await callApi(env, 'GET', `/api/routines/${encodeURIComponent(routineId)}`);
  if (res.status >= 400) {
    // Fall back to UTC today.
    return todayInTimezone('UTC');
  }
  const tz = (res.json as { routine?: { timezone?: string } }).routine?.timezone ?? 'UTC';
  return todayInTimezone(tz);
}

const routineComplete = defineCommand({
  meta: { name: 'complete', description: 'Mark a step done for a date (default: today in the routine timezone).' },
  args: {
    routineId: { type: 'positional', required: true },
    step: { type: 'string', required: true, description: 'Step id (uuid).' },
    date: { type: 'string', required: false, description: 'YYYY-MM-DD.' },
  },
  async run({ args }) {
    const env = requireEnv();
    const date = args.date ?? (await defaultDateForRoutine(env, args.routineId));
    const body = { stepId: args.step, date };
    const res = await callApiOrExit(
      env,
      'POST',
      `/api/routines/${encodeURIComponent(args.routineId)}/completions`,
      body,
    );
    printJson(res.json);
    exitWithStatus(res);
  },
});

const routineUncomplete = defineCommand({
  meta: { name: 'uncomplete', description: 'Unmark a step for a date (always succeeds).' },
  args: {
    routineId: { type: 'positional', required: true },
    step: { type: 'string', required: true },
    date: { type: 'string', required: false },
  },
  async run({ args }) {
    const env = requireEnv();
    const date = args.date ?? (await defaultDateForRoutine(env, args.routineId));
    const body = { stepId: args.step, date };
    const res = await callApiOrExit(
      env,
      'DELETE',
      `/api/routines/${encodeURIComponent(args.routineId)}/completions`,
      body,
    );
    if (res.status === 204) {
      process.stdout.write('{"ok":true}\n');
      process.exit(0);
    }
    printJson(res.json);
    exitWithStatus(res);
  },
});

// --- routine root -----------------------------------------------------------

const routineGroup = defineCommand({
  meta: { name: 'routine', description: 'Routines CRUD + step + completion commands.' },
  subCommands: {
    list: routineList,
    create: routineCreate,
    show: routineShow,
    update: routineUpdate,
    delete: routineDelete,
    step: routineStepGroup,
    complete: routineComplete,
    uncomplete: routineUncomplete,
  },
});

// --- habit cadence spec parser ----------------------------------------------

type ParsedCadence =
  | { kind: 'daily' }
  | { kind: 'weekly_count'; perWeek: number; weekStart: number }
  | { kind: 'specific_weekdays'; weekdays: number[] };

/**
 * Parse a `--cadence` CLI spec into the canonical shape the API expects.
 *
 * Grammar:
 *   daily                  -> { kind: 'daily' }
 *   weekly:N               -> { kind: 'weekly_count', perWeek: N, weekStart: 0 }
 *   weekly:N:DAY           -> weekStart from DAY (mon..sun or 0..6)
 *   days:mon,wed,fri       -> { kind: 'specific_weekdays', weekdays: [...] }
 *
 * Throws on malformed input with a clear, actionable error message.
 */
function parseCadenceSpec(raw: string): ParsedCadence {
  const trimmed = raw.trim();
  if (trimmed === 'daily') return { kind: 'daily' };

  if (trimmed.startsWith('weekly:')) {
    const parts = trimmed.slice('weekly:'.length).split(':');
    const nRaw = parts[0];
    if (!nRaw) throw new Error('--cadence weekly:N — N is required (1..7).');
    const n = Number(nRaw);
    if (!Number.isInteger(n) || n < 1 || n > 7) {
      throw new Error(`--cadence weekly:N — N must be 1..7 (got "${nRaw}").`);
    }
    let weekStart = 0;
    if (parts.length > 1) {
      const dayRaw = parts[1];
      if (!dayRaw) throw new Error('--cadence weekly:N:DAY — DAY is required.');
      try {
        weekStart = parseWeekday(dayRaw);
      } catch (e) {
        throw new Error(`--cadence weekly:N:DAY — ${(e as Error).message}`);
      }
    }
    return { kind: 'weekly_count', perWeek: n, weekStart };
  }

  if (trimmed.startsWith('days:')) {
    const rest = trimmed.slice('days:'.length);
    if (rest.length === 0) {
      throw new Error('--cadence days:LIST — LIST is required (e.g. mon,wed,fri).');
    }
    const tokens = rest.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    if (tokens.length === 0) {
      throw new Error('--cadence days:LIST — at least one day is required.');
    }
    const weekdays: number[] = [];
    for (const tok of tokens) {
      try {
        weekdays.push(parseWeekday(tok));
      } catch (e) {
        throw new Error(`--cadence days:LIST — ${(e as Error).message}`);
      }
    }
    // De-dup + sort.
    const set = new Set(weekdays);
    return { kind: 'specific_weekdays', weekdays: [...set].sort((a, b) => a - b) };
  }

  throw new Error(
    `--cadence: unrecognized spec "${raw}". Use "daily", "weekly:N[:DAY]", or "days:mon,wed,fri".`,
  );
}

/** Human-readable cadence summary for tables / show commands. */
function cadenceSummary(c: ParsedCadence | undefined | null): string {
  if (!c) return '(unknown)';
  if (c.kind === 'daily') return 'daily';
  if (c.kind === 'weekly_count') {
    const wsLabel = WEEKDAY_LABELS[c.weekStart] ?? '?';
    return `${c.perWeek}/week (week starts ${wsLabel})`;
  }
  return c.weekdays.map((w) => WEEKDAY_LABELS[w]).join(' ');
}

// --- habit list -------------------------------------------------------------

interface HabitListItem {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  cadence: ParsedCadence;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
}

const habitList = defineCommand({
  meta: { name: 'list', description: 'List your non-archived habits with streaks.' },
  async run() {
    const env = requireEnv();
    const res = await callApiOrExit(env, 'GET', '/api/habits');
    if (res.status >= 400) {
      printJson(res.json);
      exitWithStatus(res);
    }
    const payload = res.json as { habits?: HabitListItem[] };
    const list = payload.habits ?? [];
    if (list.length === 0) {
      process.stdout.write('(no habits)\n');
      process.exit(0);
    }
    for (const h of list) {
      const desc = h.description ? ` — ${h.description}` : '';
      const cadStr = cadenceSummary(h.cadence);
      process.stdout.write(
        `${h.id}  ${h.name}${desc}  [${cadStr}]  cur=${h.currentStreak}  longest=${h.longestStreak}  total=${h.totalCompletions}\n`,
      );
    }
    process.exit(0);
  },
});

// --- habit create -----------------------------------------------------------

const habitCreate = defineCommand({
  meta: { name: 'create', description: 'Create a habit.' },
  args: {
    name: { type: 'string', required: true, description: 'Habit name (1..100).' },
    description: { type: 'string', required: false, description: 'Optional (<=500).' },
    timezone: { type: 'string', required: false, description: 'IANA timezone (default: $TZ or UTC).' },
    cadence: {
      type: 'string',
      required: true,
      description: 'daily | weekly:N[:DAY] | days:mon,wed,fri',
    },
    category: { type: 'string', required: false, description: 'Optional free-text grouping label (<=50).' },
    location: { type: 'string', required: false, description: 'Optional free-text location label (<=50).' },
  },
  async run({ args }) {
    const env = requireEnv();
    let cadence: ParsedCadence;
    try {
      cadence = parseCadenceSpec(args.cadence);
    } catch (e) {
      process.stderr.write(`manage: ${(e as Error).message}\n`);
      process.exit(1);
    }
    const body: Record<string, unknown> = {
      name: args.name,
      description: args.description,
      timezone: args.timezone ?? defaultTimezone(),
      cadence,
    };
    if (args.category !== undefined) body.category = args.category;
    if (args.location !== undefined) body.location = args.location;
    const res = await callApiOrExit(env, 'POST', '/api/habits', body);
    printJson(res.json);
    exitWithStatus(res);
  },
});

// --- habit show -------------------------------------------------------------

const habitShow = defineCommand({
  meta: { name: 'show', description: 'Show a habit with streaks + 30-day recent completions.' },
  args: {
    id: { type: 'positional', required: true, description: 'Habit id (uuid).' },
  },
  async run({ args }) {
    const env = requireEnv();
    const res = await callApiOrExit(env, 'GET', `/api/habits/${encodeURIComponent(args.id)}`);
    if (res.status >= 400) {
      printJson(res.json);
      exitWithStatus(res);
    }
    const payload = res.json as {
      habit?: {
        id: string;
        name: string;
        description: string | null;
        timezone: string;
        category: string | null;
        location: string | null;
        cadence: ParsedCadence;
        currentStreak: number;
        longestStreak: number;
        totalCompletions: number;
        lastCompletedDate: string | null;
        completionsLast90Days: string[];
      };
    };
    const h = payload.habit;
    if (!h) {
      printJson(res.json);
      process.exit(1);
    }
    process.stdout.write(`${h.name}  [${h.timezone}]\n`);
    if (h.description) process.stdout.write(`${h.description}\n`);
    process.stdout.write(`id: ${h.id}\n`);
    process.stdout.write(`cadence: ${cadenceSummary(h.cadence)}\n`);
    if (h.category) process.stdout.write(`category: ${h.category}\n`);
    if (h.location) process.stdout.write(`location: ${h.location}\n`);
    process.stdout.write(
      `streaks: current=${h.currentStreak}  longest=${h.longestStreak}  total=${h.totalCompletions}\n`,
    );
    if (h.lastCompletedDate) {
      process.stdout.write(`last completed: ${h.lastCompletedDate}\n`);
    }
    // Recent 30-day list (subset of completionsLast90Days within the 30d window).
    const today = todayInTimezone(h.timezone);
    const cutoff = (() => {
      const [yStr, mStr, dStr] = today.split('-') as [string, string, string];
      const dt = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, Number(dStr), 12));
      dt.setUTCDate(dt.getUTCDate() - 29);
      const y2 = dt.getUTCFullYear();
      const m2 = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d2 = String(dt.getUTCDate()).padStart(2, '0');
      return `${y2}-${m2}-${d2}`;
    })();
    const recent = (h.completionsLast90Days ?? []).filter((d) => d >= cutoff);
    process.stdout.write(`\nLast 30 days (${recent.length} completions):\n`);
    if (recent.length === 0) {
      process.stdout.write('  (none)\n');
    } else {
      for (const d of recent) process.stdout.write(`  ${d}\n`);
    }
    process.exit(0);
  },
});

// --- habit update -----------------------------------------------------------

const habitUpdate = defineCommand({
  meta: {
    name: 'update',
    description:
      'Update a habit (any of name/description/timezone/cadence/category/location). Pass --category="" or --location="" to clear.',
  },
  args: {
    id: { type: 'positional', required: true, description: 'Habit id (uuid).' },
    name: { type: 'string', required: false },
    description: { type: 'string', required: false },
    timezone: { type: 'string', required: false },
    cadence: { type: 'string', required: false, description: 'See `habit create` for spec.' },
    category: {
      type: 'string',
      required: false,
      description: 'Free-text category label (<=50). Pass "" to clear.',
    },
    location: {
      type: 'string',
      required: false,
      description: 'Free-text location label (<=50). Pass "" to clear.',
    },
  },
  async run({ args }) {
    const env = requireEnv();
    const body: Record<string, unknown> = {};
    if (args.name !== undefined) body.name = args.name;
    if (args.description !== undefined) body.description = args.description;
    if (args.timezone !== undefined) body.timezone = args.timezone;
    if (args.cadence !== undefined) {
      try {
        body.cadence = parseCadenceSpec(args.cadence);
      } catch (e) {
        process.stderr.write(`manage: ${(e as Error).message}\n`);
        process.exit(1);
      }
    }
    if (args.category !== undefined) body.category = args.category;
    if (args.location !== undefined) body.location = args.location;
    if (Object.keys(body).length === 0) {
      process.stderr.write(
        'manage: pass at least one of --name / --description / --timezone / --cadence / --category / --location.\n',
      );
      process.exit(1);
    }
    const res = await callApiOrExit(env, 'PATCH', `/api/habits/${encodeURIComponent(args.id)}`, body);
    printJson(res.json);
    exitWithStatus(res);
  },
});

// --- habit delete -----------------------------------------------------------

const habitDelete = defineCommand({
  meta: { name: 'delete', description: 'Soft-delete (archive) a habit.' },
  args: {
    id: { type: 'positional', required: true, description: 'Habit id (uuid).' },
    yes: { type: 'boolean', required: false, description: 'Skip the confirm prompt.' },
  },
  async run({ args }) {
    const env = requireEnv();
    if (!args.yes) {
      const ok = await confirmPrompt(`Archive habit ${args.id}?`);
      if (!ok) {
        process.stderr.write('manage: cancelled.\n');
        process.exit(1);
      }
    }
    const res = await callApiOrExit(env, 'DELETE', `/api/habits/${encodeURIComponent(args.id)}`);
    printJson(res.json);
    exitWithStatus(res);
  },
});

// --- habit done / undone ----------------------------------------------------

/** Default --date to today in the habit's timezone (fetched server-side). */
async function defaultDateForHabit(env: Env, habitId: string): Promise<string> {
  const res = await callApi(env, 'GET', `/api/habits/${encodeURIComponent(habitId)}`);
  if (res.status >= 400) {
    return todayInTimezone('UTC');
  }
  const tz = (res.json as { habit?: { timezone?: string } }).habit?.timezone ?? 'UTC';
  return todayInTimezone(tz);
}

const habitDone = defineCommand({
  meta: { name: 'done', description: 'Mark a habit done for a date (default: today in habit tz).' },
  args: {
    id: { type: 'positional', required: true },
    date: { type: 'string', required: false, description: 'YYYY-MM-DD.' },
  },
  async run({ args }) {
    const env = requireEnv();
    const date = args.date ?? (await defaultDateForHabit(env, args.id));
    const res = await callApiOrExit(
      env,
      'POST',
      `/api/habits/${encodeURIComponent(args.id)}/completions`,
      { date },
    );
    printJson(res.json);
    exitWithStatus(res);
  },
});

const habitUndone = defineCommand({
  meta: { name: 'undone', description: 'Unmark a habit for a date (always succeeds).' },
  args: {
    id: { type: 'positional', required: true },
    date: { type: 'string', required: false },
  },
  async run({ args }) {
    const env = requireEnv();
    const date = args.date ?? (await defaultDateForHabit(env, args.id));
    const res = await callApiOrExit(
      env,
      'DELETE',
      `/api/habits/${encodeURIComponent(args.id)}/completions`,
      { date },
    );
    if (res.status === 204) {
      process.stdout.write('{"ok":true}\n');
      process.exit(0);
    }
    printJson(res.json);
    exitWithStatus(res);
  },
});

// --- habit root -------------------------------------------------------------

const habitGroup = defineCommand({
  meta: { name: 'habit', description: 'Habits CRUD + streak + completion commands.' },
  subCommands: {
    list: habitList,
    create: habitCreate,
    show: habitShow,
    update: habitUpdate,
    delete: habitDelete,
    done: habitDone,
    undone: habitUndone,
  },
});

// --- push: shared helpers ---------------------------------------------------

/**
 * Parse a comma-separated weekday list like "mon,wed,fri" or "0,2,4" into a
 * deduped + sorted array of ISO weekdays (0=Mon..6=Sun).
 */
function parseWeekdayList(raw: string): number[] {
  const tokens = raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    throw new Error('--weekdays must contain at least one day.');
  }
  const out: number[] = [];
  for (const tok of tokens) out.push(parseWeekday(tok));
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

/** Validate a "HH:MM" 24h string; throw with a clear message otherwise. */
function assertTimeOfDay(s: string): string {
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(s)) {
    throw new Error(`--time must be "HH:MM" 24-hour (got "${s}").`);
  }
  return s;
}

interface ScheduleRow {
  id: string;
  routineId: string | null;
  habitId: string | null;
  time: string;
  weekdays: number[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function printScheduleRow(s: ScheduleRow): void {
  const subject = s.routineId
    ? `routine=${s.routineId}`
    : s.habitId
      ? `habit=${s.habitId}`
      : '(no subject?)';
  const days = s.weekdays.map((w) => WEEKDAY_LABELS[w]).join(' ');
  const flag = s.enabled ? '' : ' [paused]';
  process.stdout.write(`${s.id}  ${s.time}  ${days}  ${subject}${flag}\n`);
}

// --- push subscriptions list ------------------------------------------------

const pushSubscriptionsList = defineCommand({
  meta: { name: 'list', description: 'List the owner\'s push subscriptions (devices).' },
  async run() {
    const env = requireEnv();
    const res = await callApiOrExit(env, 'GET', '/api/push/subscriptions');
    if (res.status >= 400) {
      printJson(res.json);
      exitWithStatus(res);
    }
    const payload = res.json as {
      subscriptions?: Array<{ id: string; userAgent: string | null; createdAt: string; lastSeenAt: string }>;
    };
    const list = payload.subscriptions ?? [];
    if (list.length === 0) {
      process.stdout.write('(no subscriptions)\n');
      process.exit(0);
    }
    for (const s of list) {
      const ua = s.userAgent ?? '(no user agent)';
      process.stdout.write(`${s.id}  ${s.lastSeenAt}  ${ua}\n`);
    }
    process.exit(0);
  },
});

const pushSubscriptionsGroup = defineCommand({
  meta: { name: 'subscriptions', description: 'Browser push subscriptions.' },
  subCommands: { list: pushSubscriptionsList },
});

// --- push schedules list ----------------------------------------------------

const pushSchedulesList = defineCommand({
  meta: { name: 'list', description: 'List notification schedules (optionally filter by subject).' },
  args: {
    routine: { type: 'string', required: false, description: 'Restrict to a routine id.' },
    habit: { type: 'string', required: false, description: 'Restrict to a habit id.' },
  },
  async run({ args }) {
    const env = requireEnv();
    if (args.routine && args.habit) {
      process.stderr.write('manage: pass at most one of --routine / --habit.\n');
      process.exit(1);
    }
    const params = new URLSearchParams();
    if (args.routine) {
      params.set('subjectType', 'routine');
      params.set('subjectId', args.routine);
    } else if (args.habit) {
      params.set('subjectType', 'habit');
      params.set('subjectId', args.habit);
    }
    const qs = params.toString();
    const path = qs.length > 0 ? `/api/push/schedules?${qs}` : '/api/push/schedules';
    const res = await callApiOrExit(env, 'GET', path);
    if (res.status >= 400) {
      printJson(res.json);
      exitWithStatus(res);
    }
    const payload = res.json as { schedules?: ScheduleRow[] };
    const list = payload.schedules ?? [];
    if (list.length === 0) {
      process.stdout.write('(no schedules)\n');
      process.exit(0);
    }
    for (const s of list) printScheduleRow(s);
    process.exit(0);
  },
});

// --- push schedules add -----------------------------------------------------

const pushSchedulesAdd = defineCommand({
  meta: { name: 'add', description: 'Add a notification schedule for a routine or habit.' },
  args: {
    routine: { type: 'string', required: false, description: 'Routine id (mutually exclusive with --habit).' },
    habit: { type: 'string', required: false, description: 'Habit id (mutually exclusive with --routine).' },
    time: { type: 'string', required: true, description: 'Local fire time as HH:MM 24h.' },
    weekdays: { type: 'string', required: true, description: 'Comma list, e.g. "mon,wed,fri" or "0,2,4".' },
    disabled: { type: 'boolean', required: false, description: 'Create paused (enabled=false).' },
  },
  async run({ args }) {
    const env = requireEnv();
    if (Boolean(args.routine) === Boolean(args.habit)) {
      process.stderr.write('manage: pass exactly one of --routine / --habit.\n');
      process.exit(1);
    }
    let time: string;
    try {
      time = assertTimeOfDay(args.time);
    } catch (e) {
      process.stderr.write(`manage: ${(e as Error).message}\n`);
      process.exit(1);
    }
    let weekdays: number[];
    try {
      weekdays = parseWeekdayList(args.weekdays);
    } catch (e) {
      process.stderr.write(`manage: ${(e as Error).message}\n`);
      process.exit(1);
    }
    const body = {
      subjectType: args.routine ? 'routine' : 'habit',
      subjectId: (args.routine ?? args.habit)!,
      time,
      weekdays,
      enabled: !args.disabled,
    };
    const res = await callApiOrExit(env, 'POST', '/api/push/schedules', body);
    printJson(res.json);
    exitWithStatus(res);
  },
});

// --- push schedules update --------------------------------------------------

const pushSchedulesUpdate = defineCommand({
  meta: { name: 'update', description: 'Update a notification schedule.' },
  args: {
    id: { type: 'positional', required: true, description: 'Schedule id (uuid).' },
    time: { type: 'string', required: false, description: 'New HH:MM time.' },
    weekdays: { type: 'string', required: false, description: 'Comma list of weekdays.' },
    enabled: { type: 'boolean', required: false, description: 'Set enabled=true.' },
    disabled: { type: 'boolean', required: false, description: 'Set enabled=false.' },
  },
  async run({ args }) {
    const env = requireEnv();
    if (args.enabled && args.disabled) {
      process.stderr.write('manage: --enabled and --disabled are mutually exclusive.\n');
      process.exit(1);
    }
    const body: Record<string, unknown> = {};
    if (args.time !== undefined) {
      try {
        body.time = assertTimeOfDay(args.time);
      } catch (e) {
        process.stderr.write(`manage: ${(e as Error).message}\n`);
        process.exit(1);
      }
    }
    if (args.weekdays !== undefined) {
      try {
        body.weekdays = parseWeekdayList(args.weekdays);
      } catch (e) {
        process.stderr.write(`manage: ${(e as Error).message}\n`);
        process.exit(1);
      }
    }
    if (args.enabled) body.enabled = true;
    if (args.disabled) body.enabled = false;
    if (Object.keys(body).length === 0) {
      process.stderr.write(
        'manage: pass at least one of --time / --weekdays / --enabled / --disabled.\n',
      );
      process.exit(1);
    }
    const res = await callApiOrExit(
      env,
      'PATCH',
      `/api/push/schedules/${encodeURIComponent(args.id)}`,
      body,
    );
    printJson(res.json);
    exitWithStatus(res);
  },
});

// --- push schedules delete --------------------------------------------------

const pushSchedulesDelete = defineCommand({
  meta: { name: 'delete', description: 'Delete a notification schedule.' },
  args: {
    id: { type: 'positional', required: true, description: 'Schedule id (uuid).' },
    yes: { type: 'boolean', required: false, description: 'Skip the confirm prompt.' },
  },
  async run({ args }) {
    const env = requireEnv();
    if (!args.yes) {
      const ok = await confirmPrompt(`Delete schedule ${args.id}?`);
      if (!ok) {
        process.stderr.write('manage: cancelled.\n');
        process.exit(1);
      }
    }
    const res = await callApiOrExit(
      env,
      'DELETE',
      `/api/push/schedules/${encodeURIComponent(args.id)}`,
    );
    if (res.status === 204) {
      process.stdout.write('{"ok":true}\n');
      process.exit(0);
    }
    printJson(res.json);
    exitWithStatus(res);
  },
});

const pushSchedulesGroup = defineCommand({
  meta: { name: 'schedules', description: 'Notification schedule CRUD.' },
  subCommands: {
    list: pushSchedulesList,
    add: pushSchedulesAdd,
    update: pushSchedulesUpdate,
    delete: pushSchedulesDelete,
  },
});

// --- push dispatch-tick -----------------------------------------------------

const pushDispatchTick = defineCommand({
  meta: { name: 'dispatch-tick', description: 'Manually fire the push dispatcher (for testing).' },
  async run() {
    const env = requireEnv();
    const res = await callApiOrExit(env, 'POST', '/api/push/dispatch-tick');
    printJson(res.json);
    exitWithStatus(res);
  },
});

// --- push root --------------------------------------------------------------

const pushGroup = defineCommand({
  meta: { name: 'push', description: 'Push subscriptions, schedules, and dispatcher.' },
  subCommands: {
    subscriptions: pushSubscriptionsGroup,
    schedules: pushSchedulesGroup,
    'dispatch-tick': pushDispatchTick,
  },
});

// --- export / import --------------------------------------------------------
//
// Two top-level commands (not a group). `export` dumps the owner's data set to
// stdout or a file; `import` reads a previously-exported file and pushes it
// into the server. Both endpoints are owner-token only (see
// app/api/owner/{export,import}/route.ts).

/** Default backup filename: routineforge-export-YYYY-MM-DD.json in cwd. */
function defaultExportPath(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return resolve(process.cwd(), `routineforge-export-${y}-${m}-${d}.json`);
}

const exportCmd = defineCommand({
  meta: {
    name: 'export',
    description:
      'Dump the owner\'s full data set to JSON. Writes to a file by default; pass --stdout to pipe instead.',
  },
  args: {
    out: {
      type: 'string',
      required: false,
      description:
        'Output file path. Defaults to routineforge-export-YYYY-MM-DD.json in cwd.',
    },
    stdout: {
      type: 'boolean',
      required: false,
      description: 'Write the export JSON to stdout instead of a file.',
    },
    scope: {
      type: 'string',
      required: false,
      description: 'Export scope: "mine" (default) or "all".',
    },
  },
  async run({ args }) {
    const env = requireEnv();
    const scope = (args.scope as string | undefined) ?? 'mine';
    if (scope !== 'mine' && scope !== 'all') {
      process.stderr.write(
        `manage: --scope must be "mine" or "all" (got "${scope}").\n`,
      );
      process.exit(1);
    }
    const res = await callApiOrExit(env, 'POST', '/api/owner/export', {
      scope,
    });
    if (res.status >= 400) {
      printJson(res.json);
      exitWithStatus(res);
    }
    const payload = res.json;
    const serialised = JSON.stringify(payload, null, 2);

    if (args.stdout) {
      process.stdout.write(serialised + '\n');
      process.exit(0);
    }

    const outPath = (args.out as string | undefined) ?? defaultExportPath();
    try {
      await writeFile(outPath, serialised, 'utf8');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`manage: failed to write ${outPath}: ${msg}\n`);
      process.exit(1);
    }
    // Brief summary to stderr so a `> redirect` of stdout still gives feedback.
    const counts = (payload as {
      routines?: unknown[];
      habits?: unknown[];
      routineStepCompletions?: unknown[];
      habitCompletions?: unknown[];
      notificationSchedules?: unknown[];
    }) ?? {};
    process.stderr.write(
      `manage: wrote ${outPath} (` +
        `routines=${counts.routines?.length ?? 0}, ` +
        `habits=${counts.habits?.length ?? 0}, ` +
        `routineCompletions=${counts.routineStepCompletions?.length ?? 0}, ` +
        `habitCompletions=${counts.habitCompletions?.length ?? 0}, ` +
        `schedules=${counts.notificationSchedules?.length ?? 0})\n`,
    );
    process.exit(0);
  },
});

const importCmd = defineCommand({
  meta: {
    name: 'import',
    description:
      'Load a previously-exported JSON payload into the server. WARNING: --mode replace deletes the owner\'s existing data first.',
  },
  args: {
    path: {
      type: 'positional',
      required: true,
      description: 'Path to the export JSON file.',
    },
    mode: {
      type: 'string',
      required: false,
      description: 'Import mode: "replace" (default, deletes existing) or "merge" (skip duplicates).',
    },
    'dry-run': {
      type: 'boolean',
      required: false,
      description: 'Validate the payload + report counts, but do not write.',
    },
    yes: {
      type: 'boolean',
      required: false,
      description: 'Skip the confirm prompt on replace mode.',
    },
  },
  async run({ args }) {
    const env = requireEnv();
    const mode = ((args.mode as string | undefined) ?? 'replace') as
      | 'replace'
      | 'merge';
    if (mode !== 'replace' && mode !== 'merge') {
      process.stderr.write(
        `manage: --mode must be "replace" or "merge" (got "${mode}").\n`,
      );
      process.exit(1);
    }
    const dryRun = Boolean(args['dry-run']);

    let raw: string;
    try {
      raw = await readFile(args.path, 'utf8');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`manage: failed to read ${args.path}: ${msg}\n`);
      process.exit(1);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(
        `manage: ${args.path} is not valid JSON: ${msg}\n`,
      );
      process.exit(1);
    }

    // Confirmation guard for `replace` mode without --dry-run + --yes.
    // `replace` deletes the owner's existing data before inserting, so this
    // is the most destructive operation in the CLI. Refuse to proceed
    // without confirmation unless --yes is passed.
    if (mode === 'replace' && !dryRun && !args.yes) {
      const ok = await confirmPrompt(
        `Replace ALL existing data on ${env.baseUrl} with ${args.path}? This deletes routines, habits, and completions.`,
      );
      if (!ok) {
        process.stderr.write('manage: cancelled.\n');
        process.exit(1);
      }
    }

    // The import endpoint accepts mode/dryRun in the body OR query string.
    // We put them in the body for clarity. The endpoint also ignores unknown
    // fields in the payload, so adding mode/dryRun alongside the export shape
    // is fine.
    const body = {
      ...(payload as Record<string, unknown>),
      mode,
      dryRun,
    };
    const res = await callApiOrExit(env, 'POST', '/api/owner/import', body);
    printJson(res.json);
    exitWithStatus(res);
  },
});

// --- root -------------------------------------------------------------------

const main = defineCommand({
  meta: {
    name: 'manage',
    version: '0.5.0',
    description: 'RoutineForge owner CLI. Talks to API endpoints via OWNER_API_TOKEN.',
  },
  subCommands: {
    auth: authGroup,
    routine: routineGroup,
    habit: habitGroup,
    push: pushGroup,
    export: exportCmd,
    import: importCmd,
  },
});

void runMain(main);
