// design/screens/habits.jsx — Habits list + Habit detail (with heatmap)

const HABITS_LIST = [
  { id: 'water',   name: 'Drink 2L water',  cadence: 'daily',             streak: 12, done: false, icon: <IcoDroplet/> },
  { id: 'read',    name: 'Read 20 min',     cadence: 'daily',             streak: 47, done: true,  icon: <IcoBook/> },
  { id: 'stretch', name: 'Stretch',         cadence: '3× per week',       streak: 5,  done: false, icon: <IcoSparkle/> },
  { id: 'walk',    name: 'Walk 5,000 steps',cadence: 'daily',             streak: 23, done: false, icon: <IcoFlame/> },
  { id: 'cold',    name: 'Cold plunge',     cadence: 'Mon · Wed · Fri',   streak: 8,  done: false, icon: <IcoDroplet/> },
  { id: 'lang',    name: 'Spanish · 10 min',cadence: '5× per week',       streak: 31, done: true,  icon: <IcoBook/> },
];

// 90-day heatmap, deterministic pattern (Math.random would shuffle each render)
const _heatmap90 = (seed = 12) => {
  const out = [];
  let s = seed;
  for (let i = 0; i < 90; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    // bias: more recent days → higher level
    const recency = (i / 90);
    const v = r + recency * 0.4;
    let level = 0;
    if (v > 0.5) level = 1;
    if (v > 0.75) level = 2;
    if (v > 0.92) level = 3;
    // a few misses sprinkled
    if (i % 19 === 3 || i % 23 === 7) level = 0;
    out.push(level);
  }
  return out;
};

function CalendarHeatmap({ days = _heatmap90() }) {
  // arrange as 13 cols × 7 rows (Mon-Sun)
  const cols = 13;
  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridAutoRows: '1fr', gap: 4,
      }}>
        {days.slice(0, cols * 7).map((lv, i) => (
          <div key={i} className="rf-heat__cell" data-level={lv}/>
        ))}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginTop: 14,
        fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)',
        fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tr-wider)', textTransform: 'uppercase',
      }}>
        <span>less</span>
        {[0,1,2,3].map(lv => (
          <div key={lv} className="rf-heat__cell" data-level={lv} style={{ width: 12, height: 12 }}/>
        ))}
        <span>more</span>
        <span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}>last 90 days</span>
      </div>
    </div>
  );
}

function HabitListRow({ h, onClick }) {
  return (
    <div className="rf-card" style={{
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
      cursor: 'pointer',
    }} onClick={onClick}>
      <RFCheck checked={h.done} size="lg"/>
      <span style={{
        color: 'var(--c-text-secondary)',
        width: 36, height: 36, borderRadius: 12,
        background: 'var(--c-surface-sunken)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{h.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--fs-lg)', fontWeight: 500, letterSpacing: 'var(--tr-snug)',
          color: h.done ? 'var(--c-text-muted)' : 'var(--c-text-primary)',
          textDecoration: h.done ? 'line-through' : 'none',
          textDecorationColor: 'var(--c-text-muted)',
        }}>{h.name}</div>
        <div className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)', letterSpacing: 'var(--tr-wider)', textTransform: 'uppercase', marginTop: 2 }}>
          {h.cadence}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="num" style={{
          fontSize: 'var(--fs-2xl)', fontWeight: 600, letterSpacing: 'var(--tr-tight)',
          color: h.streak > 0 ? 'var(--c-text-primary)' : 'var(--c-text-muted)',
          lineHeight: 1,
        }}>{h.streak}</div>
        <div style={{
          fontSize: 10, color: 'var(--c-text-muted)',
          fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tr-wider)',
          textTransform: 'uppercase', marginTop: 4,
        }}>day streak</div>
      </div>
    </div>
  );
}

function HabitsMobile({ palette = 'bone', dark = false }) {
  return (
    <PhoneShell palette={palette} dark={dark}>
      <div className="rf-wash" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div style={{ padding: '8px 20px 120px 20px' }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 18px 0' }}>
            <BrandLockup size={15}/>
            <button className="rf-btn rf-btn--ghost rf-btn--sm" style={{ height: 36, width: 36, padding: 0, borderRadius: 999 }}>
              <IcoSearch size={18}/>
            </button>
          </header>

          <Eyebrow>your habits</Eyebrow>
          <h1 style={{ margin: '6px 0 6px 0', fontSize: 'var(--fs-4xl)', letterSpacing: 'var(--tr-tight)', fontWeight: 600 }}>Habits</h1>
          <div style={{ fontSize: 'var(--fs-base)', color: 'var(--c-text-secondary)', marginBottom: 22 }}>
            <span className="mono">2</span> of <span className="mono">6</span> done today
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {HABITS_LIST.map(h => <HabitListRow key={h.id} h={h}/>)}
          </div>
        </div>
        <Fab label="New habit"/>
        <BottomNav active="habits"/>
      </div>
    </PhoneShell>
  );
}

function HabitsDesktop({ palette = 'bone', dark = false }) {
  return (
    <DesktopShell palette={palette} dark={dark} width={1280} height={820}>
      <SideNav active="habits"/>
      <main className="rf-wash" style={{ flex: 1, overflow: 'auto', padding: '40px 56px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 28 }}>
            <div>
              <Eyebrow>your habits</Eyebrow>
              <h1 style={{ margin: '6px 0 0 0', fontSize: 'var(--fs-5xl)', letterSpacing: 'var(--tr-tight)', fontWeight: 600 }}>Habits</h1>
              <div style={{ fontSize: 'var(--fs-base)', color: 'var(--c-text-secondary)', marginTop: 6 }}>
                <span className="mono">2</span> of <span className="mono">6</span> done today
              </div>
            </div>
            <button className="rf-btn rf-btn--primary rf-btn--md"><IcoPlus size={18}/> New habit</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {HABITS_LIST.map(h => <HabitListRow key={h.id} h={h}/>)}
          </div>
        </div>
      </main>
    </DesktopShell>
  );
}

// ── Habit detail ────────────────────────────────────────────────────
const READ_HABIT = {
  name: 'Read 20 min',
  description: '20 focused minutes of reading. Anything but feeds.',
  cadence: 'Daily',
  current: 47, longest: 92, total: 184,
  icon: <IcoBook/>,
};

function StatTile({ label, value, big = false }) {
  return (
    <div className="rf-card" style={{ padding: 16, textAlign: 'left' }}>
      <div style={{
        fontSize: big ? 'var(--fs-5xl)' : 'var(--fs-3xl)',
        fontWeight: 600, letterSpacing: 'var(--tr-tight)',
        fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
        lineHeight: 1,
      }}>{value}</div>
      <div style={{
        fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)',
        fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tr-wider)',
        textTransform: 'uppercase', marginTop: 8,
      }}>{label}</div>
    </div>
  );
}

function HabitDetailMobile({ palette = 'bone', dark = false }) {
  return (
    <PhoneShell palette={palette} dark={dark}>
      <div className="rf-wash" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div style={{ padding: '6px 20px 120px 20px' }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 18px 0' }}>
            <button className="rf-btn rf-btn--ghost rf-btn--sm" style={{ height: 36, padding: '0 8px' }}>
              <IcoChevL size={18}/> Habits
            </button>
            <button className="rf-btn rf-btn--ghost rf-btn--sm" style={{ height: 36, width: 36, padding: 0, borderRadius: 999 }}>
              <IcoMore size={18}/>
            </button>
          </header>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              width: 48, height: 48, borderRadius: 16,
              background: 'var(--c-brand-primary-subtle)',
              color: 'var(--c-brand-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{READ_HABIT.icon}</span>
            <div>
              <Eyebrow>habit · daily</Eyebrow>
              <h1 style={{ margin: '4px 0 0 0', fontSize: 'var(--fs-3xl)', letterSpacing: 'var(--tr-tight)', fontWeight: 600 }}>{READ_HABIT.name}</h1>
            </div>
          </div>
          <p style={{ margin: '12px 0 0 0', fontSize: 'var(--fs-base)', color: 'var(--c-text-secondary)', lineHeight: 1.5 }}>{READ_HABIT.description}</p>

          {/* hero streak block */}
          <div className="rf-card rf-card--hero" style={{ marginTop: 20, textAlign: 'center', padding: '28px 24px' }}>
            <Eyebrow>current streak</Eyebrow>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 10, marginTop: 10 }}>
              <span className="num" style={{ fontSize: 'var(--fs-7xl)', fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1 }}>{READ_HABIT.current}</span>
              <span style={{ fontSize: 'var(--fs-xl)', color: 'var(--c-text-secondary)' }}>days</span>
            </div>
            <button className="rf-btn rf-btn--primary rf-btn--lg" style={{ marginTop: 22, minWidth: 200 }}>
              <IcoCheck size={18}/> Mark today done
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            <StatTile label="longest" value={READ_HABIT.longest}/>
            <StatTile label="total" value={READ_HABIT.total}/>
          </div>

          <section style={{ marginTop: 20 }}>
            <Eyebrow style={{ marginBottom: 10 }}>History</Eyebrow>
            <div className="rf-card">
              <CalendarHeatmap/>
            </div>
          </section>
        </div>
        <BottomNav active="habits"/>
      </div>
    </PhoneShell>
  );
}

function HabitDetailDesktop({ palette = 'bone', dark = false }) {
  return (
    <DesktopShell palette={palette} dark={dark} width={1280} height={820}>
      <SideNav active="habits"/>
      <main className="rf-wash" style={{ flex: 1, overflow: 'auto', padding: '32px 56px 56px 56px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <button className="rf-btn rf-btn--ghost rf-btn--sm" style={{ marginBottom: 18 }}>
            <IcoChevL size={16}/> All habits
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{
                width: 60, height: 60, borderRadius: 18,
                background: 'var(--c-brand-primary-subtle)',
                color: 'var(--c-brand-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{READ_HABIT.icon}</span>
              <div>
                <Eyebrow>habit · {READ_HABIT.cadence.toLowerCase()}</Eyebrow>
                <h1 style={{ margin: '4px 0 6px 0', fontSize: 'var(--fs-5xl)', letterSpacing: 'var(--tr-tight)', fontWeight: 600 }}>{READ_HABIT.name}</h1>
                <p style={{ margin: 0, fontSize: 'var(--fs-base)', color: 'var(--c-text-secondary)', maxWidth: 520 }}>{READ_HABIT.description}</p>
              </div>
            </div>
            <button className="rf-btn rf-btn--primary rf-btn--lg"><IcoCheck size={18}/> Mark today done</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16, marginTop: 36 }}>
            <div className="rf-card rf-card--hero" style={{ padding: 28 }}>
              <Eyebrow>current streak</Eyebrow>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 8 }}>
                <span className="num" style={{ fontSize: 'var(--fs-7xl)', fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1 }}>{READ_HABIT.current}</span>
                <span style={{ fontSize: 'var(--fs-xl)', color: 'var(--c-text-secondary)' }}>days in a row</span>
              </div>
              <div style={{
                marginTop: 18, fontSize: 'var(--fs-sm)', color: 'var(--c-text-muted)',
              }}>Started <span className="mono">10 Apr 2026</span> · last done <span className="mono">yesterday</span></div>
            </div>
            <StatTile label="longest" value={READ_HABIT.longest} big/>
            <StatTile label="total" value={READ_HABIT.total} big/>
          </div>

          <section style={{ marginTop: 24 }}>
            <Eyebrow style={{ marginBottom: 12 }}>History · last 90 days</Eyebrow>
            <div className="rf-card" style={{ padding: 24 }}>
              <CalendarHeatmap/>
            </div>
          </section>
        </div>
      </main>
    </DesktopShell>
  );
}

Object.assign(window, {
  HabitsMobile, HabitsDesktop, HabitDetailMobile, HabitDetailDesktop,
  CalendarHeatmap, HabitListRow, HABITS_LIST, READ_HABIT,
});
