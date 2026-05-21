// design/screens/routines.jsx — Routines list + Routine detail (with DayStepEditor)

const ROUTINES_LIST = [
  { id: 'skincare', name: 'Morning skincare', icon: <IcoLeaf/>,     days: [0,1,2,3,4,5,6], stepsToday: 4, doneToday: 3, color: 'var(--c-wash-c)' },
  { id: 'pushday',  name: 'Push day',         icon: <IcoDumbbell/>, days: [0,2,4],         stepsToday: 6, doneToday: 0, color: 'var(--c-wash-a)' },
  { id: 'pullday',  name: 'Pull day',         icon: <IcoDumbbell/>, days: [1,3],           stepsToday: 0, doneToday: 0, color: 'var(--c-wash-c)' },
  { id: 'legs',     name: 'Leg day',          icon: <IcoDumbbell/>, days: [5],             stepsToday: 0, doneToday: 0, color: 'var(--c-wash-a)' },
  { id: 'winddown', name: 'Evening wind-down',icon: <IcoMoon/>,     days: [0,1,2,3,4,5,6], stepsToday: 3, doneToday: 0, color: 'var(--c-wash-c)' },
  { id: 'sunday',   name: 'Sunday reset',     icon: <IcoSparkle/>,  days: [6],             stepsToday: 0, doneToday: 0, color: 'var(--c-wash-a)' },
];

// ── one routine row — preview chip with day strip + step count
function RoutineListRow({ r, onClick }) {
  const todayIdx = 2; // Wednesday
  const active = r.days.includes(todayIdx);
  return (
    <div className="rf-card" onClick={onClick} style={{
      padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
      cursor: 'pointer', position: 'relative', overflow: 'hidden',
    }}>
      {/* watercolor swatch corner */}
      <div aria-hidden style={{
        position: 'absolute', top: -30, right: -30, width: 120, height: 120,
        borderRadius: '50%', background: r.color, filter: 'blur(20px)', opacity: .65,
      }}/>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
        <span style={{
          width: 36, height: 36, borderRadius: 12,
          background: 'var(--c-surface-sunken)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--c-text-secondary)',
        }}>{r.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 500, letterSpacing: 'var(--tr-snug)' }}>{r.name}</div>
          <div className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)', letterSpacing: 'var(--tr-wider)', textTransform: 'uppercase', marginTop: 2 }}>
            {active ? `${r.doneToday}/${r.stepsToday} today` : 'not today'}
          </div>
        </div>
        <IcoChevR size={18}/>
      </div>
      <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
        {DAYS.map((d, i) => (
          <span key={d} style={{
            flex: 1, height: 26, borderRadius: 8,
            background: r.days.includes(i) ? 'var(--c-brand-primary-subtle)' : 'transparent',
            color: r.days.includes(i) ? 'var(--c-brand-primary)' : 'var(--c-text-muted)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
            letterSpacing: 'var(--tr-wider)', textTransform: 'uppercase',
            opacity: !r.days.includes(i) && i === 5 ? .4 : 1,
            border: i === todayIdx ? '1.5px solid var(--c-brand-primary)' : '1px solid var(--c-border-subtle)',
          }}>{d.slice(0, 1)}</span>
        ))}
      </div>
    </div>
  );
}

function RoutinesMobile({ palette = 'bone', dark = false }) {
  return (
    <PhoneShell palette={palette} dark={dark}>
      <div className="rf-wash" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div style={{ padding: '8px 20px 120px 20px', position: 'relative' }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 18px 0' }}>
            <button className="rf-btn rf-btn--ghost rf-btn--sm" style={{ height: 36, padding: '0 8px' }}>
              <IcoChevL size={18}/>
            </button>
            <BrandLockup size={15}/>
            <button className="rf-btn rf-btn--ghost rf-btn--sm" style={{ height: 36, width: 36, padding: 0, borderRadius: 999 }}>
              <IcoSearch size={18}/>
            </button>
          </header>

          <Eyebrow>your library</Eyebrow>
          <h1 style={{ margin: '6px 0 6px 0', fontSize: 'var(--fs-4xl)', letterSpacing: 'var(--tr-tight)', fontWeight: 600 }}>Routines</h1>
          <div style={{ fontSize: 'var(--fs-base)', color: 'var(--c-text-secondary)', marginBottom: 22 }}>
            <span className="mono">6</span> routines · <span className="mono">3</span> active today
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ROUTINES_LIST.map(r => <RoutineListRow key={r.id} r={r}/>)}
          </div>
        </div>
        <Fab label="New routine"/>
        <BottomNav active="routines"/>
      </div>
    </PhoneShell>
  );
}

function RoutinesDesktop({ palette = 'bone', dark = false }) {
  return (
    <DesktopShell palette={palette} dark={dark} width={1280} height={820}>
      <SideNav active="routines"/>
      <main className="rf-wash" style={{ flex: 1, overflow: 'auto', padding: '40px 56px', position: 'relative' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 28 }}>
            <div>
              <Eyebrow>your library</Eyebrow>
              <h1 style={{ margin: '6px 0 0 0', fontSize: 'var(--fs-5xl)', letterSpacing: 'var(--tr-tight)', fontWeight: 600 }}>Routines</h1>
              <div style={{ fontSize: 'var(--fs-base)', color: 'var(--c-text-secondary)', marginTop: 6 }}>
                <span className="mono">6</span> routines · <span className="mono">3</span> active today
              </div>
            </div>
            <button className="rf-btn rf-btn--primary rf-btn--md"><IcoPlus size={18}/> New routine</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {ROUTINES_LIST.map(r => <RoutineListRow key={r.id} r={r}/>)}
          </div>
        </div>
      </main>
    </DesktopShell>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Routine detail — with DayStepEditor
// ──────────────────────────────────────────────────────────────────────
const PUSH_DAY = {
  name: 'Push day',
  description: 'Chest, shoulders, triceps. Heavy compound first, accessory last.',
  schedule: [0, 2, 4], // Mon, Wed, Fri (0-indexed Mon)
  perDay: {
    0: ['Bench press · 4×8', 'Overhead press · 4×8', 'Incline DB press · 3×10', 'Tricep dips · 3×10', 'Cable flyes · 3×12', 'Plank · 3×60s'],
    1: [],
    2: ['Bench press · 4×8', 'Overhead press · 4×8', 'Incline DB press · 3×10', 'Tricep dips · 3×10', 'Cable flyes · 3×12', 'Plank · 3×60s'],
    3: [],
    4: ['Bench press · 5×5', 'Pause bench · 3×5', 'Dips · 4×10', 'Lateral raise · 3×15', 'Skullcrusher · 3×12'],
    5: [], // Saturday — rest
    6: [],
  },
};

function DayStepEditor({ value, onChange }) {
  const [day, setDay] = React.useState(2); // Wednesday default
  const steps = PUSH_DAY.perDay[day] || [];
  const isRest = day === 5;
  return (
    <div className="rf-card" style={{ padding: 20 }}>
      <Eyebrow style={{ marginBottom: 12 }}>Steps by weekday</Eyebrow>
      <div className="rf-tabs" role="tablist" style={{ marginBottom: 18 }}>
        {DAYS.map((d, i) => (
          <button key={d} role="tab"
            aria-selected={day === i}
            data-rest={i === 5}
            className="rf-tab"
            onClick={() => setDay(i)}>{d.slice(0, 1)}</button>
        ))}
      </div>

      {isRest ? (
        <div style={{
          padding: '28px 20px', textAlign: 'center',
          borderRadius: 'var(--r-lg)', background: 'var(--c-surface-sunken)',
          color: 'var(--c-text-secondary)',
        }}>
          <div style={{ fontSize: 'var(--fs-2xl)', letterSpacing: 'var(--tr-tight)', marginBottom: 6 }}>Rest day</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-text-muted)' }}>No steps scheduled for Saturday. Tap to add — or leave it as rest.</div>
        </div>
      ) : steps.length === 0 ? (
        <div style={{
          padding: '28px 20px', textAlign: 'center',
          borderRadius: 'var(--r-lg)', border: '1.5px dashed var(--c-border-strong)',
          color: 'var(--c-text-muted)',
        }}>
          No steps for {DAYS[day]} yet. <button className="rf-btn rf-btn--ghost rf-btn--sm">+ Add</button>
        </div>
      ) : (
        <div>
          {steps.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 8px', borderRadius: 'var(--r-md)',
              borderBottom: i < steps.length - 1 ? '1px solid var(--c-border-subtle)' : 'none',
            }}>
              <span style={{ color: 'var(--c-text-muted)', cursor: 'grab' }}><IcoDrag size={18}/></span>
              <span className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)', width: 18 }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ flex: 1, fontSize: 'var(--fs-base)', color: 'var(--c-text-primary)' }}>{s}</span>
              <button className="rf-btn rf-btn--ghost rf-btn--sm" style={{ width: 32, height: 32, padding: 0, borderRadius: 999 }}><IcoMore size={16}/></button>
            </div>
          ))}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-start' }}>
            <button className="rf-btn rf-btn--ghost rf-btn--sm"><IcoPlus size={16}/> Add step</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RoutineDetailMobile({ palette = 'bone', dark = false }) {
  return (
    <PhoneShell palette={palette} dark={dark}>
      <div className="rf-wash" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div style={{ padding: '6px 20px 120px 20px' }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 18px 0' }}>
            <button className="rf-btn rf-btn--ghost rf-btn--sm" style={{ height: 36, padding: '0 8px' }}>
              <IcoChevL size={18}/> Routines
            </button>
            <button className="rf-btn rf-btn--ghost rf-btn--sm" style={{ height: 36, width: 36, padding: 0, borderRadius: 999 }}>
              <IcoMore size={18}/>
            </button>
          </header>

          <Eyebrow>routine</Eyebrow>
          <h1 style={{ margin: '6px 0 8px 0', fontSize: 'var(--fs-4xl)', letterSpacing: 'var(--tr-tight)', fontWeight: 600 }}>{PUSH_DAY.name}</h1>
          <p style={{ margin: 0, fontSize: 'var(--fs-base)', color: 'var(--c-text-secondary)', lineHeight: 1.5 }}>{PUSH_DAY.description}</p>

          <section style={{ marginTop: 24 }}>
            <Eyebrow style={{ marginBottom: 10 }}>Schedule</Eyebrow>
            <WeekdayChips value={PUSH_DAY.schedule}/>
            <div style={{
              marginTop: 10, fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)',
              letterSpacing: 'var(--tr-snug)',
            }}>Saturday left as a rest day.</div>
          </section>

          <section style={{ marginTop: 24 }}>
            <DayStepEditor/>
          </section>

          <section style={{ marginTop: 18, display: 'flex', gap: 12 }}>
            <button className="rf-btn rf-btn--secondary rf-btn--md" style={{ flex: 1 }}>Duplicate</button>
            <button className="rf-btn rf-btn--ghost rf-btn--md" style={{ color: 'var(--c-danger)' }}><IcoTrash size={16}/> Delete</button>
          </section>
        </div>
        <BottomNav active="routines"/>
      </div>
    </PhoneShell>
  );
}

function RoutineDetailDesktop({ palette = 'bone', dark = false }) {
  return (
    <DesktopShell palette={palette} dark={dark} width={1280} height={820}>
      <SideNav active="routines"/>
      <main className="rf-wash" style={{ flex: 1, overflow: 'auto', padding: '32px 56px 56px 56px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <button className="rf-btn rf-btn--ghost rf-btn--sm" style={{ marginBottom: 18 }}>
            <IcoChevL size={16}/> All routines
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
            <div style={{ flex: 1 }}>
              <Eyebrow>routine</Eyebrow>
              <h1 style={{ margin: '6px 0 8px 0', fontSize: 'var(--fs-5xl)', letterSpacing: 'var(--tr-tight)', fontWeight: 600 }}>{PUSH_DAY.name}</h1>
              <p style={{ margin: 0, fontSize: 'var(--fs-lg)', color: 'var(--c-text-secondary)', lineHeight: 1.5, maxWidth: 560 }}>{PUSH_DAY.description}</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="rf-btn rf-btn--secondary rf-btn--md">Duplicate</button>
              <button className="rf-btn rf-btn--ghost rf-btn--md" style={{ color: 'var(--c-danger)' }}><IcoTrash size={16}/></button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24, marginTop: 32 }}>
            <DayStepEditor/>
            <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="rf-card">
                <Eyebrow style={{ marginBottom: 12 }}>Schedule</Eyebrow>
                <WeekdayChips value={PUSH_DAY.schedule}/>
                <div style={{ marginTop: 10, fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)' }}>Saturday left as a rest day.</div>
              </div>
              <div className="rf-card">
                <Eyebrow style={{ marginBottom: 12 }}>Reminders</Eyebrow>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 'var(--fs-base)' }}>Notify at</span>
                  <span className="mono" style={{ fontSize: 'var(--fs-base)' }}>06 : 45</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)' }}>Push notification on scheduled days</div>
              </div>
              <div className="rf-card">
                <Eyebrow style={{ marginBottom: 8 }}>This week</Eyebrow>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span className="num" style={{ fontSize: 'var(--fs-4xl)', fontWeight: 600 }}>2</span>
                  <span style={{ color: 'var(--c-text-secondary)', fontSize: 'var(--fs-sm)' }}>of 3 sessions complete</span>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </DesktopShell>
  );
}

Object.assign(window, {
  RoutinesMobile, RoutinesDesktop, RoutineDetailMobile, RoutineDetailDesktop,
  DayStepEditor, RoutineListRow, ROUTINES_LIST, PUSH_DAY,
});
