// Auto-combined from design/icons.jsx + primitives.jsx + screens/*.jsx
// (Concatenated to keep Babel in-browser compile to a single pass.)

// ── design/icons.jsx ─────────────────────────────────────────
// design/icons.jsx
// Hand-drawn sketchy icons. Clean SVG paths get organic distortion via
// the rf-rough filter. Always render <RoughDefs/> once per document.

const ROUGH_STROKE = 1.75;

function RoughDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <filter id="rf-rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" result="turb"/>
          <feDisplacementMap in="SourceGraphic" in2="turb" scale="1.6"/>
        </filter>
        <filter id="rf-rough-soft" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="2" seed="7" result="t2"/>
          <feDisplacementMap in="SourceGraphic" in2="t2" scale="0.9"/>
        </filter>
      </defs>
    </svg>
  );
}

// Generic icon wrapper: 24x24 viewbox, stroke color = currentColor.
function Ico({ size = 22, children, soft = false, style }) {
  return (
    <span className="rf-icon" style={{ width: size, height: size, ...style }}>
      <svg viewBox="0 0 24 24" width={size} height={size}
           fill="none" stroke="currentColor"
           strokeWidth={ROUGH_STROKE}
           strokeLinecap="round" strokeLinejoin="round"
           filter={soft ? "url(#rf-rough-soft)" : "url(#rf-rough)"}>
        {children}
      </svg>
    </span>
  );
}

const IcoSun = (p) => (
  <Ico {...p}>
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>
  </Ico>
);
const IcoMoon = (p) => (
  <Ico {...p}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>
  </Ico>
);
const IcoHome = (p) => (
  <Ico {...p}>
    <path d="M3.5 11.5L12 4l8.5 7.5"/>
    <path d="M5.5 10.5V20h4v-5h5v5h4v-9.5"/>
  </Ico>
);
const IcoCheck = (p) => (
  <Ico {...p}>
    <path d="M5 12.5l4.5 4.5L19.5 7"/>
  </Ico>
);
const IcoX = (p) => (
  <Ico {...p}><path d="M6 6l12 12M18 6L6 18"/></Ico>
);
const IcoPlus = (p) => (
  <Ico {...p}><path d="M12 5v14M5 12h14"/></Ico>
);
const IcoMore = (p) => (
  <Ico {...p}><circle cx="6" cy="12" r=".6"/><circle cx="12" cy="12" r=".6"/><circle cx="18" cy="12" r=".6"/></Ico>
);
const IcoFlame = (p) => (
  <Ico {...p} soft>
    <path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7 0 1-1 2-2 2 0-2-1-5-4-7 0 4-5 6-5 12 0 4 3 7 7 7z"/>
    <path d="M12 22c2 0 3.5-1.5 3.5-3.5 0-1.5-1-2.5-1.5-3.5-.5 1-1.5 1.5-2 1.5-.5-1 0-2.5-1-3.5-1 2-2.5 3.5-2.5 5.5 0 2 1.5 3.5 3.5 3.5z"/>
  </Ico>
);
const IcoLeaf = (p) => (
  <Ico {...p} soft>
    <path d="M20 4c0 9-7 16-16 16 0-9 7-16 16-16z"/>
    <path d="M4 20c5-5 10-7 13-7"/>
  </Ico>
);
const IcoDroplet = (p) => (
  <Ico {...p} soft>
    <path d="M12 3c-3 5-6 8-6 12a6 6 0 0 0 12 0c0-4-3-7-6-12z"/>
  </Ico>
);
const IcoBook = (p) => (
  <Ico {...p}>
    <path d="M4 5c2-1 5-1 8 0v15c-3-1-6-1-8 0V5z"/>
    <path d="M12 5c3-1 6-1 8 0v15c-2-1-5-1-8 0"/>
    <path d="M12 5v15"/>
  </Ico>
);
const IcoDumbbell = (p) => (
  <Ico {...p}>
    <rect x="2" y="9" width="3" height="6" rx="1"/>
    <rect x="19" y="9" width="3" height="6" rx="1"/>
    <rect x="5" y="10" width="2" height="4" rx="1"/>
    <rect x="17" y="10" width="2" height="4" rx="1"/>
    <path d="M7 12h10"/>
  </Ico>
);
const IcoSparkle = (p) => (
  <Ico {...p} soft>
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>
    <path d="M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>
  </Ico>
);
const IcoBell = (p) => (
  <Ico {...p}>
    <path d="M6 10c0-3 3-6 6-6s6 3 6 6c0 4 1 6 2 7H4c1-1 2-3 2-7z"/>
    <path d="M10 19a2 2 0 0 0 4 0"/>
  </Ico>
);
const IcoUser = (p) => (
  <Ico {...p}><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3 4-5 7-5s6 2 7 5"/></Ico>
);
const IcoList = (p) => (
  <Ico {...p}>
    <path d="M8 6h12M8 12h12M8 18h12"/>
    <circle cx="4.5" cy="6" r=".6"/><circle cx="4.5" cy="12" r=".6"/><circle cx="4.5" cy="18" r=".6"/>
  </Ico>
);
const IcoCalendar = (p) => (
  <Ico {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2"/>
    <path d="M3.5 10h17M8 3v4M16 3v4"/>
  </Ico>
);
const IcoChevR = (p) => <Ico {...p}><path d="M9 6l6 6-6 6"/></Ico>;
const IcoChevL = (p) => <Ico {...p}><path d="M15 6l-6 6 6 6"/></Ico>;
const IcoChevD = (p) => <Ico {...p}><path d="M6 9l6 6 6-6"/></Ico>;
const IcoSearch = (p) => (
  <Ico {...p}><circle cx="11" cy="11" r="6"/><path d="M16 16l5 5"/></Ico>
);
const IcoSettings = (p) => (
  <Ico {...p}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2"/>
  </Ico>
);
const IcoDrag = (p) => (
  <Ico {...p}>
    <circle cx="9" cy="6" r=".7"/><circle cx="15" cy="6" r=".7"/>
    <circle cx="9" cy="12" r=".7"/><circle cx="15" cy="12" r=".7"/>
    <circle cx="9" cy="18" r=".7"/><circle cx="15" cy="18" r=".7"/>
  </Ico>
);
const IcoOffline = (p) => (
  <Ico {...p}>
    <path d="M3 8a13 13 0 0 1 18 0M6 12a8 8 0 0 1 12 0M9 16a4 4 0 0 1 6 0"/>
    <path d="M4 4l16 16"/>
  </Ico>
);
const IcoTrash = (p) => (
  <Ico {...p}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>
  </Ico>
);
const IcoEye = (p) => (
  <Ico {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
    <circle cx="12" cy="12" r="3"/>
  </Ico>
);
const IcoGoogle = ({ size = 22 }) => (
  <span className="rf-icon" style={{ width: size, height: size }}>
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4c-.2 1.3-.9 2.4-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.5z" fill="#4285F4"/>
      <path d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.6C4.7 19.8 8.1 22 12 22z" fill="#34A853"/>
      <path d="M6.4 13.9C6.2 13.3 6.1 12.7 6.1 12s.1-1.3.3-1.9V7.5H3a10 10 0 0 0 0 9l3.4-2.6z" fill="#FBBC05"/>
      <path d="M12 5.8c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17 2.9 14.7 2 12 2 8.1 2 4.7 4.2 3 7.5l3.4 2.6C7.2 7.6 9.4 5.8 12 5.8z" fill="#EA4335"/>
    </svg>
  </span>
);

// ── pure-CSS sparkle for the brand mark (no filter — sharp logotype) ──
const RFMark = ({ size = 32 }) => (
  <span className="rf-icon" style={{ width: size, height: size }} aria-label="RoutineForge mark">
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none">
      <defs>
        <filter id="rf-mark-rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="9"/>
          <feDisplacementMap in="SourceGraphic" scale="1.2"/>
        </filter>
      </defs>
      <g filter="url(#rf-mark-rough)" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <circle cx="16" cy="16" r="11"/>
        <path d="M10 16l4 4 8-9"/>
      </g>
    </svg>
  </span>
);

// share to window so other Babel scripts can use these
Object.assign(window, {
  RoughDefs, Ico, RFMark,
  IcoSun, IcoMoon, IcoHome, IcoCheck, IcoX, IcoPlus, IcoMore, IcoFlame,
  IcoLeaf, IcoDroplet, IcoBook, IcoDumbbell, IcoSparkle, IcoBell, IcoUser,
  IcoList, IcoCalendar, IcoChevR, IcoChevL, IcoChevD, IcoSearch,
  IcoSettings, IcoDrag, IcoOffline, IcoTrash, IcoEye, IcoGoogle,
});


// ── design/primitives.jsx ─────────────────────────────────────────
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


// ── design/screens/today.jsx ─────────────────────────────────────────
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


// ── design/screens/routines.jsx ─────────────────────────────────────────
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


// ── design/screens/habits.jsx ─────────────────────────────────────────
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


// ── design/screens/auth.jsx ─────────────────────────────────────────
// design/screens/auth.jsx — Signup, Login

// shared shell for centered auth screen (mobile + desktop)
function AuthFrame({ children, mode, dark, palette, desktop = false }) {
  if (desktop) {
    return (
      <DesktopShell palette={palette} dark={dark} width={1280} height={820}>
        <div style={{ flex: 1, display: 'flex' }}>
          {/* left: marketing wash panel */}
          <div className="rf-wash" style={{
            flex: '1.1', display: 'flex', flexDirection: 'column',
            padding: '64px 56px', position: 'relative',
          }}>
            <BrandLockup size={18}/>
            <div style={{ marginTop: 'auto', maxWidth: 460 }}>
              <Eyebrow>RoutineForge</Eyebrow>
              <h2 style={{
                margin: '12px 0 16px 0', fontSize: 'var(--fs-5xl)',
                letterSpacing: 'var(--tr-tight)', fontWeight: 600, lineHeight: 1.05,
              }}>One quiet list.<br/>Every day, on time.</h2>
              <p style={{
                margin: 0, fontSize: 'var(--fs-lg)', color: 'var(--c-text-secondary)',
                lineHeight: 1.5,
              }}>Routines you can build by weekday. Habits that count themselves. Notifications that don't shout. Installs to your phone in a tap.</p>
            </div>
          </div>
          {/* right: form */}
          <div style={{
            flex: 1, background: 'var(--c-surface-elevated)',
            padding: '64px 56px', display: 'flex', flexDirection: 'column',
            justifyContent: 'center',
          }}>
            <div style={{ maxWidth: 380, width: '100%' }}>{children}</div>
          </div>
        </div>
      </DesktopShell>
    );
  }
  return (
    <PhoneShell palette={palette} dark={dark}>
      <div className="rf-wash" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div style={{ padding: '12px 24px 40px 24px', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
          <BrandLockup size={15}/>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 0' }}>
            {children}
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}

function AuthFormBody({ mode }) {
  const isSignup = mode === 'signup';
  return (
    <div>
      <Eyebrow>{isSignup ? 'create your account' : 'welcome back'}</Eyebrow>
      <h1 style={{ margin: '6px 0 28px 0', fontSize: 'var(--fs-4xl)', letterSpacing: 'var(--tr-tight)', fontWeight: 600, lineHeight: 1.1 }}>
        {isSignup ? <>Start the<br/>quiet streak.</> : <>Pick up<br/>where you left off.</>}
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isSignup && (
          <div className="rf-field">
            <label className="rf-field__label">Name</label>
            <div className="rf-field__input-wrap">
              <input className="rf-field__input" defaultValue="Anna Novak" placeholder="What should we call you?"/>
            </div>
          </div>
        )}
        <div className="rf-field">
          <label className="rf-field__label">Email</label>
          <div className="rf-field__input-wrap">
            <input className="rf-field__input" defaultValue="anna@hey.com" placeholder="you@somewhere.com"/>
          </div>
        </div>
        <div className="rf-field">
          <label className="rf-field__label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Password</span>
            {!isSignup && <button className="rf-btn rf-btn--ghost rf-btn--sm" style={{ height: 'auto', padding: 0, fontSize: 'var(--fs-sm)' }}>Forgot?</button>}
          </label>
          <div className="rf-field__input-wrap">
            <input className="rf-field__input" type="password" defaultValue="••••••••••"/>
            <span className="rf-field__trailing"><IcoEye size={18}/></span>
          </div>
          {isSignup && <div className="rf-field__hint">At least 10 characters · one number.</div>}
        </div>
      </div>

      <button className="rf-btn rf-btn--primary rf-btn--lg rf-btn--block" style={{ marginTop: 22 }}>
        {isSignup ? 'Create account' : 'Sign in'}
      </button>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0',
        color: 'var(--c-text-muted)', fontSize: 'var(--fs-xs)',
        letterSpacing: 'var(--tr-wider)', textTransform: 'uppercase',
        fontFamily: 'var(--font-mono)',
      }}>
        <span style={{ flex: 1, height: 1, background: 'var(--c-border-subtle)' }}/>
        or
        <span style={{ flex: 1, height: 1, background: 'var(--c-border-subtle)' }}/>
      </div>

      <button className="rf-btn rf-btn--secondary rf-btn--lg rf-btn--block">
        <IcoGoogle size={18}/> Continue with Google
      </button>

      <div style={{ marginTop: 24, fontSize: 'var(--fs-sm)', color: 'var(--c-text-secondary)', textAlign: 'center' }}>
        {isSignup
          ? <>Already have an account? <a style={{ color: 'var(--c-brand-primary)', fontWeight: 500 }}>Sign in</a></>
          : <>New here? <a style={{ color: 'var(--c-brand-primary)', fontWeight: 500 }}>Create an account</a></>
        }
      </div>
    </div>
  );
}

function SignupMobile(p) { return <AuthFrame mode="signup" {...p}><AuthFormBody mode="signup"/></AuthFrame>; }
function SignupDesktop(p) { return <AuthFrame mode="signup" desktop {...p}><AuthFormBody mode="signup"/></AuthFrame>; }
function LoginMobile(p) { return <AuthFrame mode="login" {...p}><AuthFormBody mode="login"/></AuthFrame>; }
function LoginDesktop(p) { return <AuthFrame mode="login" desktop {...p}><AuthFormBody mode="login"/></AuthFrame>; }

Object.assign(window, { SignupMobile, SignupDesktop, LoginMobile, LoginDesktop, AuthFrame, AuthFormBody });


// ── design/screens/edges.jsx ─────────────────────────────────────────
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


