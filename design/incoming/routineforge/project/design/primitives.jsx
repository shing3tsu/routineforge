// design/primitives.jsx — shared UI atoms used across all screens.
// React + base.css. Import after icons.jsx.

// ── animated checkbox ─────────────────────────────────────────────────
function RFCheck({ checked, onClick, size = 'md', label }) {
  const cls = 'rf-check' + (size === 'lg' ? ' rf-check--lg' : size === 'xl' ? ' rf-check--xl' : '');
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={cls}
    >
      <svg className="rf-check__svg" viewBox="0 0 28 28" aria-hidden="true">
        <path d="M7 14.5 l4 4 l10 -10" />
      </svg>
    </button>
  );
}

function Checkrow({ checked, onToggle, children, meta, size = 'md' }) {
  return (
    <div className="rf-checkrow" role="button" data-done={!!checked} onClick={onToggle}>
      <RFCheck checked={checked} onClick={(e) => { e.stopPropagation(); onToggle && onToggle(); }} size={size} />
      <div className="rf-checkrow__label">{children}</div>
      {meta != null && <div className="rf-checkrow__meta" style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--fs-sm)',
        color: 'var(--c-text-muted)',
        letterSpacing: 'var(--tr-tight)',
      }}>{meta}</div>}
    </div>
  );
}

// ── progress dots — small horizontal pip row ─────────────────────────
function ProgressDots({ done, total, size = 8 }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {[...Array(total)].map((_, i) => (
        <span key={i} style={{
          width: size, height: size, borderRadius: '50%',
          background: i < done ? 'var(--c-brand-primary)' : 'var(--c-border-subtle)',
          transition: 'background 220ms cubic-bezier(.22,.61,.36,1)',
        }}/>
      ))}
    </div>
  );
}

// ── progress bar — slim filled track ─────────────────────────────────
function ProgressBar({ value, max = 1, height = 3 }) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div style={{
      height, width: '100%', borderRadius: 999,
      background: 'var(--c-border-subtle)', overflow: 'hidden',
    }}>
      <div style={{
        height: '100%', width: (pct * 100) + '%',
        background: 'var(--c-brand-primary)', borderRadius: 999,
        transition: 'width 280ms cubic-bezier(.22,.61,.36,1)',
      }}/>
    </div>
  );
}

// ── progress ring — bigger, on the today header ─────────────────────
function ProgressRing({ value, max = 1, size = 64, stroke = 6, label }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke="var(--c-border-subtle)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke="var(--c-brand-primary)" strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 280ms cubic-bezier(.22,.61,.36,1)' }}/>
      {label != null && (
        <text x={size/2} y={size/2 + 4} textAnchor="middle"
          fontFamily="var(--font-mono)" fontSize={size * 0.28} fontWeight="600"
          fill="var(--c-text-primary)" letterSpacing="-0.04em">{label}</text>
      )}
    </svg>
  );
}

// ── streak badge ─────────────────────────────────────────────────────
function StreakBadge({ count, lg = false, best }) {
  return (
    <span className={"rf-streak" + (lg ? " rf-streak--lg" : "")}>
      <span className="rf-streak__num">{count}</span>
      <span className="rf-streak__unit">day{count === 1 ? '' : 's'}</span>
      {best != null && lg && (
        <span style={{
          marginLeft: 12, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)',
          letterSpacing: 'var(--tr-wider)', textTransform: 'uppercase',
          color: 'var(--c-text-muted)', alignSelf: 'center',
        }}>best · {best}</span>
      )}
    </span>
  );
}

// ── weekday chips ────────────────────────────────────────────────────
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
function WeekdayChips({ value = [], onToggle, restDays = [] }) {
  return (
    <div className="rf-chips" role="group" aria-label="weekdays">
      {DAYS.map((d, i) => {
        const isRest = restDays.includes(i);
        const sel = value.includes(i);
        return (
          <button key={d} type="button"
            aria-pressed={sel}
            className={"rf-chip" + (isRest ? " rf-chip--rest" : "")}
            onClick={() => onToggle && onToggle(i)}>
            {d.slice(0, 3).toLowerCase()}
          </button>
        );
      })}
    </div>
  );
}

// ── eyebrow text ─────────────────────────────────────────────────────
function Eyebrow({ children, style }) {
  return <div className="rf-eyebrow" style={style}>{children}</div>;
}

// ── brand mark + word ────────────────────────────────────────────────
function BrandLockup({ size = 18, mono = false }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--c-text-primary)' }}>
      <span style={{ color: 'var(--c-brand-primary)' }}><RFMark size={size + 4}/></span>
      <span style={{
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        fontSize: size, fontWeight: 600, letterSpacing: 'var(--tr-tight)',
      }}>routineforge</span>
    </div>
  );
}

// ── bottom nav (mobile) ──────────────────────────────────────────────
function BottomNav({ active = 'today' }) {
  const items = [
    { key: 'today',    label: 'Today',    icon: <IcoSun size={22}/> },
    { key: 'routines', label: 'Routines', icon: <IcoList size={22}/> },
    { key: 'habits',   label: 'Habits',   icon: <IcoFlame size={22}/> },
    { key: 'account',  label: 'You',      icon: <IcoUser size={22}/> },
  ];
  return (
    <nav className="rf-bottomnav" aria-label="primary">
      {items.map(it => (
        <button key={it.key} className="rf-bottomnav__item" data-active={active === it.key}>
          {it.icon}<span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ── side nav (desktop) ───────────────────────────────────────────────
function SideNav({ active = 'today' }) {
  const items = [
    { key: 'today',    label: 'Today',    icon: <IcoSun size={20}/> },
    { key: 'routines', label: 'Routines', icon: <IcoList size={20}/> },
    { key: 'habits',   label: 'Habits',   icon: <IcoFlame size={20}/> },
    { key: 'account',  label: 'Account',  icon: <IcoUser size={20}/> },
  ];
  return (
    <aside className="rf-sidenav" style={{
      borderRight: '1px solid var(--c-border-subtle)',
      background: 'transparent', height: '100%', flex: '0 0 220px',
    }}>
      <div style={{ padding: '4px 12px 24px 12px' }}><BrandLockup/></div>
      {items.map(it => (
        <button key={it.key} className="rf-sidenav__item" data-active={active === it.key}>
          {it.icon}<span>{it.label}</span>
        </button>
      ))}
      <div style={{ flex: 1 }}/>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
        borderTop: '1px solid var(--c-border-subtle)', marginTop: 12,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--c-wash-c), var(--c-wash-a))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--c-text-primary)', fontSize: 12, fontWeight: 600,
        }}>AN</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>Anna Novak</div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>anna@hey.com</div>
        </div>
      </div>
    </aside>
  );
}

// ── floating action button (compose / add) ───────────────────────────
function Fab({ label, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      position: 'absolute', right: 20, bottom: 88,
      height: 56, minWidth: 56, padding: '0 20px',
      borderRadius: 999, border: 0,
      background: 'var(--c-brand-primary)', color: 'var(--c-brand-on-primary)',
      display: 'inline-flex', alignItems: 'center', gap: 8,
      fontWeight: 600, fontSize: 'var(--fs-base)',
      boxShadow: 'var(--sh-lg)',
      cursor: 'pointer', zIndex: 20,
    }}>
      <IcoPlus size={20}/> {label}
    </button>
  );
}

// ── mobile shell — bezel + safe areas + frame ────────────────────────
function PhoneShell({ children, dark, palette = 'bone', style }) {
  return (
    <div data-palette={palette} data-theme={dark ? 'dark' : 'light'} style={{
      width: 390, height: 844, borderRadius: 44,
      background: 'var(--c-surface-base)',
      position: 'relative', overflow: 'hidden',
      boxShadow: dark ? '0 0 0 1px #2a2a2a, 0 30px 80px rgba(0,0,0,.4)'
                     : '0 0 0 1px var(--c-border-strong), 0 30px 80px rgba(60,40,20,.18)',
      ...style,
    }}>
      {/* notch */}
      <div style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
        width: 110, height: 28, borderRadius: 16, background: '#000', zIndex: 50,
      }}/>
      <div style={{
        position: 'absolute', inset: 0, paddingTop: 50, paddingBottom: 0,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* status bar */}
        <div style={{
          position: 'absolute', top: 14, left: 28, right: 28, height: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600,
          color: 'var(--c-text-primary)', zIndex: 51, letterSpacing: '-0.01em',
        }}>
          <span>9:41</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <svg width="18" height="11" viewBox="0 0 18 11" fill="currentColor"><rect x="0" y="6" width="3" height="5" rx="1"/><rect x="5" y="3" width="3" height="8" rx="1"/><rect x="10" y="0" width="3" height="11" rx="1"/><rect x="15" y="0" width="3" height="11" rx="1" opacity=".3"/></svg>
            <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M.7 4a10 10 0 0 1 14.6 0M3 6.5a6.5 6.5 0 0 1 10 0M5.5 9a3 3 0 0 1 5 0"/></svg>
            <svg width="26" height="11" viewBox="0 0 26 11" fill="none" stroke="currentColor" strokeWidth="1"><rect x=".5" y=".5" width="22" height="10" rx="2.5"/><rect x="2" y="2" width="14" height="7" rx="1.2" fill="currentColor"/><rect x="23.5" y="3.5" width="1.5" height="4" rx=".5" fill="currentColor"/></svg>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
        {/* home indicator */}
        <div style={{
          position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          width: 134, height: 5, borderRadius: 5,
          background: dark ? '#fff' : '#000', opacity: .85, zIndex: 51,
        }}/>
      </div>
    </div>
  );
}

// ── desktop shell — browser window-ish chrome (or none) ──────────────
function DesktopShell({ children, dark, palette = 'bone', width = 1280, height = 800 }) {
  return (
    <div data-palette={palette} data-theme={dark ? 'dark' : 'light'} style={{
      width, height, borderRadius: 16,
      background: 'var(--c-surface-base)', color: 'var(--c-text-primary)',
      position: 'relative', overflow: 'hidden',
      boxShadow: dark ? '0 0 0 1px #1a1a1a, 0 30px 80px rgba(0,0,0,.4)'
                     : '0 0 0 1px var(--c-border-subtle), 0 30px 80px rgba(60,40,20,.12)',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 36,
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px',
        borderBottom: '1px solid var(--c-border-subtle)',
        background: 'color-mix(in oklab, var(--c-surface-elevated) 70%, transparent)',
        zIndex: 5,
      }}>
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ed6a5e' }}/>
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#f4bf4f' }}/>
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#62c554' }}/>
        <div style={{
          flex: 1, textAlign: 'center', fontSize: 12,
          color: 'var(--c-text-muted)', letterSpacing: '-0.01em',
        }}>routineforge.app</div>
      </div>
      <div style={{ position: 'absolute', inset: '36px 0 0 0', display: 'flex' }}>
        {children}
      </div>
    </div>
  );
}

Object.assign(window, {
  RFCheck, Checkrow, ProgressDots, ProgressBar, ProgressRing, StreakBadge,
  WeekdayChips, Eyebrow, BrandLockup, BottomNav, SideNav, Fab,
  PhoneShell, DesktopShell, DAYS,
});
