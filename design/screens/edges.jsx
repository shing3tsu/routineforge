// design/screens/edges.jsx — Account, Empty, Offline, Install prompt

// ── settings row helpers ─────────────────────────────────────────────
function Row({ label, value, trailing, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px', minHeight: 56,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-base)', color: 'var(--c-text-primary)' }}>{label}</div>
        {value && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-text-muted)', marginTop: 2 }}>{value}</div>}
      </div>
      {trailing}
    </div>
  );
}

function Toggle({ on }) {
  return (
    <span style={{
      width: 44, height: 26, borderRadius: 999, position: 'relative',
      background: on ? 'var(--c-brand-primary)' : 'var(--c-surface-sunken)',
      boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--c-border-subtle)',
      transition: 'background 220ms cubic-bezier(.22,.61,.36,1)',
    }}>
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3,
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        transition: 'left 220ms cubic-bezier(.22,.61,.36,1)',
      }}/>
    </span>
  );
}

function TimePicker({ value }) {
  return (
    <span className="mono" style={{
      fontSize: 'var(--fs-base)', color: 'var(--c-text-primary)',
      letterSpacing: 'var(--tr-tight)',
      padding: '6px 10px', borderRadius: 'var(--r-md)',
      background: 'var(--c-surface-sunken)',
    }}>{value}</span>
  );
}

// ── Account screen ──────────────────────────────────────────────────
function AccountBody({ desktop = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* profile card */}
      <div className="rf-card" style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: 20,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--c-wash-c), var(--c-wash-a))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--c-text-primary)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em',
        }}>AN</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, letterSpacing: 'var(--tr-tight)' }}>Anna Novak</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-text-muted)' }}>anna@hey.com · since Mar 2024</div>
        </div>
        <button className="rf-btn rf-btn--ghost rf-btn--sm">Edit</button>
      </div>

      {/* notifications */}
      <div>
        <Eyebrow style={{ marginBottom: 8, paddingLeft: 4 }}>Notifications</Eyebrow>
        <div className="rf-card" style={{ padding: 0, overflow: 'hidden' }}>
          <Row label="Push notifications" value="Web Push · this device" trailing={<Toggle on/>}/>
          <div style={{ height: 1, background: 'var(--c-border-subtle)', margin: '0 16px' }}/>
          <Row label="Quiet hours" value="22:00 — 06:30" trailing={<Toggle on/>}/>
        </div>
      </div>

      {/* per-routine reminders */}
      <div>
        <Eyebrow style={{ marginBottom: 8, paddingLeft: 4 }}>Routine reminders</Eyebrow>
        <div className="rf-card" style={{ padding: 0, overflow: 'hidden' }}>
          <Row label="Morning skincare" trailing={<TimePicker value="07 : 15"/>}/>
          <div style={{ height: 1, background: 'var(--c-border-subtle)', margin: '0 16px' }}/>
          <Row label="Push day" trailing={<TimePicker value="06 : 45"/>}/>
          <div style={{ height: 1, background: 'var(--c-border-subtle)', margin: '0 16px' }}/>
          <Row label="Evening wind-down" trailing={<TimePicker value="21 : 30"/>}/>
        </div>
      </div>

      {/* habit reminders */}
      <div>
        <Eyebrow style={{ marginBottom: 8, paddingLeft: 4 }}>Habit reminders</Eyebrow>
        <div className="rf-card" style={{ padding: 0, overflow: 'hidden' }}>
          <Row label="Drink 2L water" trailing={<TimePicker value="10 : 00"/>}/>
          <div style={{ height: 1, background: 'var(--c-border-subtle)', margin: '0 16px' }}/>
          <Row label="Read 20 min" trailing={<TimePicker value="22 : 00"/>}/>
          <div style={{ height: 1, background: 'var(--c-border-subtle)', margin: '0 16px' }}/>
          <Row label="Stretch" trailing={<TimePicker value="14 : 30"/>}/>
        </div>
      </div>

      {/* appearance */}
      <div>
        <Eyebrow style={{ marginBottom: 8, paddingLeft: 4 }}>Appearance</Eyebrow>
        <div className="rf-card" style={{ padding: 0, overflow: 'hidden' }}>
          <Row label="Theme" trailing={
            <div className="rf-tabs" style={{ padding: 3 }}>
              <button className="rf-tab" aria-selected="false" style={{ minWidth: 56 }}>System</button>
              <button className="rf-tab" aria-selected="true" style={{ minWidth: 56 }}>Light</button>
              <button className="rf-tab" aria-selected="false" style={{ minWidth: 56 }}>Dark</button>
            </div>
          }/>
        </div>
      </div>

      <button className="rf-btn rf-btn--ghost rf-btn--md" style={{ color: 'var(--c-danger)', alignSelf: 'flex-start' }}>
        Sign out
      </button>
    </div>
  );
}

function AccountMobile({ palette = 'bone', dark = false }) {
  return (
    <PhoneShell palette={palette} dark={dark}>
      <div className="rf-wash" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div style={{ padding: '8px 20px 120px 20px' }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 18px 0' }}>
            <BrandLockup size={15}/>
            <button className="rf-btn rf-btn--ghost rf-btn--sm" style={{ height: 36, width: 36, padding: 0, borderRadius: 999 }}>
              <IcoSettings size={18}/>
            </button>
          </header>
          <Eyebrow>your account</Eyebrow>
          <h1 style={{ margin: '6px 0 22px 0', fontSize: 'var(--fs-4xl)', letterSpacing: 'var(--tr-tight)', fontWeight: 600 }}>You</h1>
          <AccountBody/>
        </div>
        <BottomNav active="account"/>
      </div>
    </PhoneShell>
  );
}
function AccountDesktop({ palette = 'bone', dark = false }) {
  return (
    <DesktopShell palette={palette} dark={dark} width={1280} height={820}>
      <SideNav active="account"/>
      <main className="rf-wash" style={{ flex: 1, overflow: 'auto', padding: '40px 56px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Eyebrow>your account</Eyebrow>
          <h1 style={{ margin: '6px 0 24px 0', fontSize: 'var(--fs-5xl)', letterSpacing: 'var(--tr-tight)', fontWeight: 600 }}>Account</h1>
          <AccountBody desktop/>
        </div>
      </main>
    </DesktopShell>
  );
}

// ── Empty state — first run ────────────────────────────────────────
function EmptyBody({ allDone = false }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 360, margin: '0 auto', padding: '20px 0' }}>
      {/* big sketchy mark */}
      <div style={{
        width: 120, height: 120, margin: '0 auto 28px auto',
        borderRadius: '50%',
        background: 'radial-gradient(circle at 30% 30%, var(--c-wash-c), var(--c-wash-a))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--c-brand-primary)',
      }}>
        {allDone ? <IcoCheck size={56}/> : <IcoSparkle size={56}/>}
      </div>
      <Eyebrow>{allDone ? 'all done' : 'nothing yet'}</Eyebrow>
      <h2 style={{ margin: '8px 0 12px 0', fontSize: 'var(--fs-3xl)', letterSpacing: 'var(--tr-tight)', fontWeight: 600, lineHeight: 1.15 }}>
        {allDone ? <>Nothing left for today.<br/>Close the app.</> : <>Build your first routine.</>}
      </h2>
      <p style={{
        margin: '0 0 24px 0', fontSize: 'var(--fs-base)',
        color: 'var(--c-text-secondary)', lineHeight: 1.5,
      }}>
        {allDone
          ? "Seven things, seven checks. We don't celebrate — you just did the thing. Tomorrow's plan is already loaded."
          : "Routines are checklists per weekday. Start with something small — a morning skincare, a 10-minute stretch."
        }
      </p>
      {!allDone && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <button className="rf-btn rf-btn--primary rf-btn--lg" style={{ minWidth: 220 }}>
            <IcoPlus size={18}/> Create a routine
          </button>
          <button className="rf-btn rf-btn--ghost rf-btn--md">
            or start with a habit instead
          </button>
        </div>
      )}
      {allDone && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8, color: 'var(--c-text-muted)', fontSize: 'var(--fs-sm)' }}>
          <span className="mono">7/7</span> done · streak <span className="mono">+1</span>
        </div>
      )}
    </div>
  );
}
function EmptyMobile({ palette = 'bone', dark = false, allDone = false }) {
  return (
    <PhoneShell palette={palette} dark={dark}>
      <div className="rf-wash" style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 24px' }}><BrandLockup size={15}/></div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
          <EmptyBody allDone={allDone}/>
        </div>
        <BottomNav active="today"/>
      </div>
    </PhoneShell>
  );
}
function EmptyDesktop({ palette = 'bone', dark = false, allDone = false }) {
  return (
    <DesktopShell palette={palette} dark={dark} width={1280} height={820}>
      <SideNav active="today"/>
      <main className="rf-wash" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyBody allDone={allDone}/>
      </main>
    </DesktopShell>
  );
}

// ── Offline read-only ──────────────────────────────────────────────
function OfflineBanner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', margin: '0 0 16px 0',
      borderRadius: 'var(--r-full)',
      background: 'var(--c-surface-sunken)',
      color: 'var(--c-text-secondary)',
      border: '1px dashed var(--c-border-strong)',
      fontSize: 'var(--fs-sm)',
    }}>
      <IcoOffline size={18}/>
      <span style={{ flex: 1 }}>You're offline. Today is read-only — checks will sync when you're back.</span>
      <span className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)' }}>seen 14m ago</span>
    </div>
  );
}
function OfflineMobile({ palette = 'bone', dark = false }) {
  // similar to Today but with banner and disabled checks
  const totals = _today_totals();
  return (
    <PhoneShell palette={palette} dark={dark}>
      <div className="rf-wash" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div style={{ padding: '8px 20px 110px 20px' }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 14px 0' }}>
            <BrandLockup size={15}/>
            <span className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)', letterSpacing: 'var(--tr-wider)', textTransform: 'uppercase' }}>offline</span>
          </header>
          <OfflineBanner/>
          <div style={{ opacity: .85, pointerEvents: 'none' }}>
            <TodayHero totals={totals}/>
            <section style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <RoutineCard r={TODAY_DATA.routines[0]} hero/>
              <RoutineCard r={TODAY_DATA.routines[1]}/>
            </section>
          </div>
        </div>
        <BottomNav active="today"/>
      </div>
    </PhoneShell>
  );
}
function OfflineDesktop({ palette = 'bone', dark = false }) {
  const totals = _today_totals();
  return (
    <DesktopShell palette={palette} dark={dark} width={1280} height={820}>
      <SideNav active="today"/>
      <main className="rf-wash" style={{ flex: 1, padding: '32px 56px', overflow: 'auto' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <OfflineBanner/>
          <div style={{ opacity: .85, pointerEvents: 'none' }}>
            <TodayHero totals={totals} compact/>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, marginTop: 28 }}>
              <RoutineCard r={TODAY_DATA.routines[0]} hero/>
              <RoutineCard r={TODAY_DATA.routines[1]}/>
            </div>
          </div>
        </div>
      </main>
    </DesktopShell>
  );
}

// ── Install prompt ─────────────────────────────────────────────────
function InstallBanner() {
  return (
    <div style={{
      position: 'absolute', left: 12, right: 12, bottom: 80,
      padding: 14, borderRadius: 'var(--r-xl)',
      background: 'var(--c-surface-elevated)',
      boxShadow: 'var(--sh-lg)',
      display: 'flex', alignItems: 'center', gap: 12,
      zIndex: 30,
    }}>
      <span style={{
        width: 44, height: 44, borderRadius: 12,
        background: 'var(--c-brand-primary)', color: 'var(--c-brand-on-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><RFMark size={26}/></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-base)', fontWeight: 500, letterSpacing: 'var(--tr-snug)' }}>Add to home screen</div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)', marginTop: 2 }}>Faster, offline, full-screen.</div>
      </div>
      <button className="rf-btn rf-btn--primary rf-btn--sm">Install</button>
      <button className="rf-btn rf-btn--ghost rf-btn--sm" aria-label="Dismiss" style={{ width: 32, height: 32, padding: 0, borderRadius: 999 }}>
        <IcoX size={16}/>
      </button>
    </div>
  );
}
function InstallMobile({ palette = 'bone', dark = false }) {
  const totals = _today_totals();
  return (
    <PhoneShell palette={palette} dark={dark}>
      <div className="rf-wash" style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{ padding: '8px 20px 110px 20px' }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 18px 0' }}>
            <BrandLockup size={15}/>
            <button className="rf-btn rf-btn--ghost rf-btn--sm" style={{ height: 36, width: 36, padding: 0, borderRadius: 999 }}>
              <IcoSearch size={18}/>
            </button>
          </header>
          <TodayHero totals={totals}/>
          <section style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <RoutineCard r={TODAY_DATA.routines[0]} hero/>
          </section>
        </div>
        <InstallBanner/>
        <BottomNav active="today"/>
      </div>
    </PhoneShell>
  );
}
function InstallDesktop({ palette = 'bone', dark = false }) {
  const totals = _today_totals();
  return (
    <DesktopShell palette={palette} dark={dark} width={1280} height={820}>
      <SideNav active="today"/>
      <main className="rf-wash" style={{ flex: 1, padding: '40px 56px', overflow: 'auto', position: 'relative' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <TodayHero totals={totals} compact/>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, marginTop: 32 }}>
            <RoutineCard r={TODAY_DATA.routines[0]} hero/>
            <RoutineCard r={TODAY_DATA.routines[1]}/>
          </div>
        </div>
        {/* desktop install banner: bottom-right toast */}
        <div style={{
          position: 'absolute', right: 32, bottom: 32, width: 360,
          padding: 18, borderRadius: 'var(--r-xl)',
          background: 'var(--c-surface-elevated)',
          boxShadow: 'var(--sh-xl)',
          display: 'flex', alignItems: 'center', gap: 14,
          zIndex: 30,
        }}>
          <span style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'var(--c-brand-primary)', color: 'var(--c-brand-on-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><RFMark size={28}/></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--fs-base)', fontWeight: 500 }}>Install RoutineForge</div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)', marginTop: 2 }}>One click. Lives in your dock.</div>
          </div>
          <button className="rf-btn rf-btn--primary rf-btn--sm">Install</button>
        </div>
      </main>
    </DesktopShell>
  );
}

Object.assign(window, {
  AccountMobile, AccountDesktop,
  EmptyMobile, EmptyDesktop,
  OfflineMobile, OfflineDesktop,
  InstallMobile, InstallDesktop,
});
