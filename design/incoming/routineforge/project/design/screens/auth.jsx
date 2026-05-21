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
