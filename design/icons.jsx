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
