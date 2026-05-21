// One-off demo seeder for local dev. Not part of the app.
// Run with: node scripts/seed-demo.mjs

const TOKEN = process.env.OWNER_API_TOKEN ?? '1b4202cf903d6b90b086ed9edcab92485792731581816dc66fdc8033b05fa4c9';
const BASE = process.env.APP_BASE_URL ?? 'http://127.0.0.1:4000';

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status} ${text}`);
  }
  return res.status === 204 ? null : await res.json();
}

const ymdLocal = (d = new Date()) => {
  // Local date in YYYY-MM-DD (LA timezone for these seeded entities).
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d);
};
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymdLocal(d);
};

const STEPS_SKINCARE = ['Cleanser', 'Toner', 'Moisturizer'];
const STEPS_PUSH = ['Warm up (5 min)', 'Bench press 3x8', 'Shoulder press 3x10', 'Triceps pushdown 3x12'];

const unwrapRoutine = (r) => r.routine ?? r;
const unwrapHabit = (r) => r.habit ?? r;

async function wipeExisting() {
  const routinesResp = await api('GET', '/api/routines');
  const routines = routinesResp.routines ?? routinesResp;
  for (const r of routines) {
    await api('DELETE', `/api/routines/${r.id}`);
  }
  const habitsResp = await api('GET', '/api/habits');
  const habits = habitsResp.habits ?? habitsResp;
  for (const h of habits) {
    await api('DELETE', `/api/habits/${h.id}`);
  }
  console.log(`wiped ${routines.length} routine(s) + ${habits.length} habit(s)`);
}

async function main() {
  console.log('--- cleaning existing data ---');
  await wipeExisting();
  console.log();

  console.log('--- routine: Morning skincare (all 7 days) ---');
  const r1 = unwrapRoutine(await api('POST', '/api/routines', {
    name: 'Morning skincare',
    description: 'A calm 5-minute start to the day.',
    timezone: 'America/Los_Angeles',
  }));
  console.log(`  id=${r1.id}`);
  for (let wd = 0; wd <= 6; wd++) {
    for (const title of STEPS_SKINCARE) {
      await api('POST', `/api/routines/${r1.id}/steps`, { weekday: wd, title });
    }
  }
  console.log(`  ${STEPS_SKINCARE.length} steps × 7 weekdays`);

  console.log('--- routine: Push day (Mon Wed Fri) ---');
  const r2 = unwrapRoutine(await api('POST', '/api/routines', {
    name: 'Push day',
    description: 'Chest, shoulders, triceps.',
    timezone: 'America/Los_Angeles',
  }));
  console.log(`  id=${r2.id}`);
  for (const wd of [0, 2, 4]) {
    for (const title of STEPS_PUSH) {
      await api('POST', `/api/routines/${r2.id}/steps`, { weekday: wd, title });
    }
  }
  console.log(`  ${STEPS_PUSH.length} steps × M/W/F`);

  console.log('--- habit: Drink 2L water (daily) + 5-day streak ---');
  const h1 = unwrapHabit(await api('POST', '/api/habits', {
    name: 'Drink 2L water',
    description: 'Refill the bottle 3 times.',
    timezone: 'America/Los_Angeles',
    cadence: { kind: 'daily' },
  }));
  console.log(`  id=${h1.id}`);
  for (let n = 4; n >= 0; n--) {
    const d = daysAgo(n);
    await api('POST', `/api/habits/${h1.id}/completions`, { date: d });
    process.stdout.write(`  +${d}\n`);
  }

  console.log('--- habit: Read 20 minutes (daily) + 3-day streak ---');
  const h2 = unwrapHabit(await api('POST', '/api/habits', {
    name: 'Read 20 minutes',
    timezone: 'America/Los_Angeles',
    cadence: { kind: 'daily' },
  }));
  console.log(`  id=${h2.id}`);
  for (let n = 2; n >= 0; n--) {
    const d = daysAgo(n);
    await api('POST', `/api/habits/${h2.id}/completions`, { date: d });
    process.stdout.write(`  +${d}\n`);
  }

  console.log('--- habit: Stretch (Mon Wed Fri) ---');
  const h3 = unwrapHabit(await api('POST', '/api/habits', {
    name: 'Stretch',
    timezone: 'America/Los_Angeles',
    cadence: { kind: 'specific_weekdays', weekdays: [0, 2, 4] },
  }));
  console.log(`  id=${h3.id}`);

  console.log('--- habit: Meditate (3 / week) ---');
  const h4 = unwrapHabit(await api('POST', '/api/habits', {
    name: 'Meditate',
    description: '10 minutes of stillness.',
    timezone: 'America/Los_Angeles',
    cadence: { kind: 'weekly_count', perWeek: 3, weekStart: 0 },
  }));
  console.log(`  id=${h4.id}`);

  console.log();
  console.log('=== final state ===');
  const rResp = await api('GET', '/api/routines');
  const routines = rResp.routines ?? rResp;
  console.log(`Routines (${routines.length}):`);
  for (const r of routines) {
    console.log(`  ${r.name} — weekdays ${JSON.stringify(r.scheduleWeekdays)}`);
  }
  const hResp = await api('GET', '/api/habits');
  const habits = hResp.habits ?? hResp;
  console.log(`Habits (${habits.length}):`);
  for (const h of habits) {
    console.log(
      `  ${h.name} (${h.cadence.kind}) — streak ${h.currentStreak}, longest ${h.longestStreak}, total ${h.totalCompletions}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
