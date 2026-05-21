// design/screens/today.jsx — Today view (the centerpiece)
// Hero: huge mono numeral = "things left for today".
// Below: one open routine card (next up, expanded), other routines collapsed,
// then habits as a compact list.

const TODAY_DATA = {
  date: { day: 'WED', dd: '27', mon: 'MAY' },
  // step lists per routine, ordered, with done flags
  routines: [
    {
      id: 'skincare', name: 'Morning skincare', icon: <IcoLeaf size={18}/>,
      steps: [
        { id: 's1', text: 'Cleanser',         done: true },
        { id: 's2', text: 'Vitamin C serum',  done: true },
        { id: 's3', text: 'Moisturizer',      done: true },
        { id: 's4', text: 'SPF 50',           done: false },
      ],
      expanded: true,
    },
    {
      id: 'pushday', name: 'Push day', icon: <IcoDumbbell size={18}/>,
      steps: [
        { id: 'p1', text: 'Bench press · 4×8',     done: false },
        { id: 'p2', text: 'Overhead press · 4×8',  done: false },
        { id: 'p3', text: 'Incline DB · 3×10',     done: false },
        { id: 'p4', text: 'Tricep dips · 3×10',    done: false },
        { id: 'p5', text: 'Cable flyes · 3×12',    done: false },
        { id: 'p6', text: 'Plank · 3×60s',         done: false },
      ],
      expanded: false,
    },
    {
      id: 'winddown', name: 'Evening wind-down', icon: <IcoMoon size={18}/>,
      steps: [
        { id: 'w1', text: 'No screens · 30 min', done: false },
        { id: 'w2', text: 'Stretch · 5 min',     done: false },
        { id: 'w3', text: 'Journal · 3 lines',   done: false },
      ],
      expanded: false,
    },
  ],
  habits: [
    { id: 'water',   text: 'Drink 2L water',  streak: 12, done: false, icon: <IcoDroplet size={18}/> },
    { id: 'read',    text: 'Read 20 min',     streak: 47, done: true,  icon: <IcoBook    size={18}/> },
    { id: 'stretch', text: 'Stretch',         streak: 5,  done: false, icon: <IcoSparkle size={18}/> },
    { id: 'walk',    text: 'Walk 5,000 steps',streak: 23, done: false, icon: <IcoFlame   size={18}/> },
  ],
};

// ── computed totals ─────────────────────────────────────────────────
function _today_totals(d = TODAY_DATA) {
  const r = d.routines.reduce((acc, r) => {
    acc.done += r.steps.filter(s => s.done).length;
    acc.total += r.steps.length;
    return acc;
  }, { done: 0, total: 0 });
  const h = d.habits.reduce((acc, h) => {
    acc.done += h.done ? 1 : 0;
    acc.total += 1;
    return acc;
  }, { done: 0, total: 0 });
  return { done: r.done + h.done, total: r.total + h.total,
           rDone: r.done, rTotal: r.total, hDone: h.done, hTotal: h.total };
}

// ── BIG hero header — "4 things left" ───────────────────────────────
function TodayHero({ totals, compact = false }) {
  const left = totals.total - totals.done;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: compact ? 0 : '0 4px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Eyebrow style={{ marginBottom: 8 }}>
          {TODAY_DATA.date.day} · {TODAY_DATA.date.dd} {TODAY_DATA.date.mon}
        </Eyebrow>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8 }}>
          <div className="num" style={{
            fontSize: compact ? 'var(--fs-6xl)' : 'var(--fs-7xl)',
            lineHeight: 1, fontWeight: 600, letterSpacing: '-0.04em',
            color: 'var(--c-text-primary)',
            fontFeatureSettings: '"ss01"',
          }}>{left}</div>
          <div style={{
            fontSize: 'var(--fs-lg)', color: 'var(--c-text-secondary)',
            letterSpacing: 'var(--tr-snug)', maxWidth: 180,
            lineHeight: 1.2,
          }}>{left === 1 ? 'thing left' : 'things left'} <br/>for today</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <ProgressDots done={totals.done} total={totals.total} size={9}/>
          <span className="mono" style={{
            fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)',
            letterSpacing: 'var(--tr-wider)', textTransform: 'uppercase',
          }}>{totals.done} of {totals.total} done</span>
        </div>
      </div>
    </div>
  );
}

// ── routine card ────────────────────────────────────────────────────
function RoutineCard({ r, hero = false, onToggle }) {
  const done = r.steps.filter(s => s.done).length;
  const total = r.steps.length;
  const isComplete = done === total;
  // hero card shows all steps; collapsed shows max 2 + summary
  const shown = hero ? r.steps : r.steps.slice(0, Math.min(2, r.steps.length));
  return (
    <div className={"rf-card" + (hero ? " rf-card--hero" : "")} style={{
      padding: hero ? 'var(--s-5)' : 'var(--s-4)',
      borderRadius: hero ? 'var(--r-2xl)' : 'var(--r-xl)',
      position: 'relative',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: hero ? 14 : 10,
      }}>
        <span style={{ color: 'var(--c-text-secondary)' }}>{r.icon}</span>
        <div className="rf-eyebrow" style={{ flex: 1 }}>{r.name}</div>
        <span className="mono" style={{
          fontSize: 'var(--fs-xs)', color: isComplete ? 'var(--c-success)' : 'var(--c-text-muted)',
          letterSpacing: 'var(--tr-tight)',
        }}>{done}/{total}{isComplete ? ' ✓' : ''}</span>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '0 -8px' }}>
        {shown.map(s => (
          <Checkrow key={s.id} checked={s.done} onToggle={() => onToggle && onToggle(r.id, s.id)} size={hero ? 'lg' : 'md'}>
            {s.text}
          </Checkrow>
        ))}
        {!hero && r.steps.length > shown.length && (
          <div style={{
            padding: '8px 8px 4px 8px', fontSize: 'var(--fs-sm)',
            color: 'var(--c-text-muted)', display: 'flex',
            alignItems: 'center', gap: 6,
          }}>
            <IcoPlus size={14}/> {r.steps.length - shown.length} more · tap to expand
          </div>
        )}
      </div>
    </div>
  );
}

// ── habit row ───────────────────────────────────────────────────────
function HabitRow({ h, onToggle }) {
  return (
    <div className="rf-checkrow" data-done={h.done} onClick={onToggle} style={{ minHeight: 60 }}>
      <RFCheck checked={h.done} onClick={(e) => { e.stopPropagation(); onToggle && onToggle(); }} size="lg"/>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ color: 'var(--c-text-secondary)', flex: '0 0 auto' }}>{h.icon}</span>
        <span style={{
          fontSize: 'var(--fs-lg)', letterSpacing: 'var(--tr-snug)',
          color: h.done ? 'var(--c-text-muted)' : 'var(--c-text-primary)',
          textDecoration: h.done ? 'line-through' : 'none',
          textDecorationThickness: '1.5px',
          textDecorationColor: 'var(--c-text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{h.text}</span>
      </div>
      <span className="mono" style={{
        fontSize: 'var(--fs-sm)', color: 'var(--c-text-muted)',
        letterSpacing: 'var(--tr-tight)', whiteSpace: 'nowrap',
      }}>{h.streak}</span>
    </div>
  );
}

// ── TODAY · MOBILE ──────────────────────────────────────────────────
function TodayMobile({ palette = 'bone', dark = false }) {
  const totals = _today_totals();
  return (
    <PhoneShell palette={palette} dark={dark}>
      <div className="rf-wash" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div style={{ position: 'relative', padding: '8px 20px 110px 20px' }}>

          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 18px 0' }}>
            <BrandLockup size={15}/>
            <button className="rf-btn rf-btn--ghost rf-btn--sm" aria-label="search" style={{ padding: 8, height: 36, width: 36, borderRadius: 999 }}>
              <IcoSearch size={18}/>
            </button>
          </header>

          <TodayHero totals={totals}/>

          <section style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <RoutineCard r={TODAY_DATA.routines[0]} hero/>
            <RoutineCard r={TODAY_DATA.routines[1]}/>
            <RoutineCard r={TODAY_DATA.routines[2]}/>
          </section>

          <section style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 4px 8px 4px' }}>
              <Eyebrow>Habits</Eyebrow>
              <span className="mono" style={{
                fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)',
                letterSpacing: 'var(--tr-wider)', textTransform: 'uppercase',
              }}>{totals.hDone}/{totals.hTotal}</span>
            </div>
            <div className="rf-card" style={{ padding: '6px 4px' }}>
              {TODAY_DATA.habits.map((h, i) => (
                <div key={h.id} style={{
                  borderBottom: i < TODAY_DATA.habits.length - 1 ? '1px solid var(--c-border-subtle)' : 'none',
                }}>
                  <HabitRow h={h}/>
                </div>
              ))}
            </div>
          </section>
        </div>

        <BottomNav active="today"/>
      </div>
    </PhoneShell>
  );
}

// ── TODAY · DESKTOP ─────────────────────────────────────────────────
function TodayDesktop({ palette = 'bone', dark = false }) {
  const totals = _today_totals();
  return (
    <DesktopShell palette={palette} dark={dark} width={1280} height={820}>
      <SideNav active="today"/>
      <main className="rf-wash" style={{ flex: 1, padding: '40px 56px', overflow: 'auto', position: 'relative' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', position: 'relative' }}>
          <TodayHero totals={totals} compact/>

          <div style={{
            display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24,
            marginTop: 36, alignItems: 'start',
          }}>
            <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <RoutineCard r={TODAY_DATA.routines[0]} hero/>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <RoutineCard r={TODAY_DATA.routines[1]}/>
                <RoutineCard r={TODAY_DATA.routines[2]}/>
              </div>
            </section>

            <section>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 4px 10px 4px' }}>
                <Eyebrow>Habits</Eyebrow>
                <span className="mono" style={{
                  fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)',
                  letterSpacing: 'var(--tr-wider)', textTransform: 'uppercase',
                }}>{totals.hDone}/{totals.hTotal}</span>
              </div>
              <div className="rf-card" style={{ padding: '6px 4px' }}>
                {TODAY_DATA.habits.map((h, i) => (
                  <div key={h.id} style={{
                    borderBottom: i < TODAY_DATA.habits.length - 1 ? '1px solid var(--c-border-subtle)' : 'none',
                  }}>
                    <HabitRow h={h}/>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </DesktopShell>
  );
}

Object.assign(window, { TodayMobile, TodayDesktop, TODAY_DATA, RoutineCard, HabitRow, TodayHero, _today_totals });
