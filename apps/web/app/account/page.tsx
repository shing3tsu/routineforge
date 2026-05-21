/**
 * Account page. Server component.
 *
 * Visual target: `design/mockups/account.html` + `design/screens/edges.jsx →
 * AccountMobile / AccountDesktop`.
 *
 * Sections (top → bottom):
 *   - Profile card: avatar + name + email + Edit affordance (Edit is a
 *     placeholder for now; the API to update profile is a follow-up).
 *   - Appearance: palette switcher (4 swatches) + theme picker
 *     (System/Light/Dark).
 *   - Notifications: existing `<NotificationsSection>` (web push enable/
 *     disable, quiet hours).
 *   - Account / sign out.
 *
 * Auth gate: `auth()` returns the session; if null we redirect to `/login`.
 */

import * as React from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { NotificationsSection } from '@/components/push/NotificationsSection';
import { Card } from '@/components/ui/Card';
import { PaletteSwitcher } from '@/components/account/PaletteSwitcher';
import { ThemeSwitcher } from '@/components/account/ThemeSwitcher';
import { readPaletteCookie, readThemeCookie } from '@/lib/theme/theme';

export const dynamic = 'force-dynamic';

function initialsFor(input: string | null | undefined): string {
  if (!input) return '?';
  const trimmed = input.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).slice(0, 2);
  const letters = parts.map((p) => p[0] ?? '').join('');
  return letters.toUpperCase() || trimmed[0]?.toUpperCase() || '?';
}

export default async function AccountPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login?from=/account');
  }

  const [palette, themeChoice] = await Promise.all([
    readPaletteCookie(),
    readThemeCookie(),
  ]);

  const email = session.user.email ?? '';
  const name = session.user.name?.trim() ?? '';
  const displayName = name || '—'; // em dash for "unset"
  const avatarSource = name || email;

  return (
    <main className="rf-page rf-page--narrow">
      <div className="rf-page-head">
        <div>
          <div className="rf-eyebrow">your account</div>
          <h1 className="rf-h1">Account</h1>
        </div>
      </div>

      <section
        aria-labelledby="account-profile-heading"
        style={{ marginBottom: 'var(--s-5)' }}
      >
        <h2 id="account-profile-heading" className="visually-hidden">
          Profile
        </h2>
        <Card
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-4)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background:
                'linear-gradient(135deg, var(--c-wash-c), var(--c-wash-a))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--c-text-primary)',
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              flexShrink: 0,
            }}
          >
            {initialsFor(avatarSource)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--fs-xl)',
                fontWeight: 600,
                letterSpacing: 'var(--tr-tight)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                fontSize: 'var(--fs-sm)',
                color: 'var(--c-text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {email}
            </div>
          </div>
        </Card>
      </section>

      <section
        aria-labelledby="account-appearance-heading"
        style={{ marginBottom: 'var(--s-5)' }}
      >
        <div className="rf-eyebrow" style={{ marginBottom: 'var(--s-2)' }}>
          <h2
            id="account-appearance-heading"
            style={{ all: 'inherit', margin: 0 }}
          >
            Appearance
          </h2>
        </div>
        <Card>
          <div
            style={{
              fontSize: 'var(--fs-sm)',
              color: 'var(--c-text-secondary)',
              marginBottom: 'var(--s-3)',
            }}
          >
            Palette
          </div>
          <PaletteSwitcher current={palette} />

          <div
            style={{
              fontSize: 'var(--fs-sm)',
              color: 'var(--c-text-secondary)',
              margin: 'var(--s-5) 0 var(--s-3) 0',
            }}
          >
            Theme
          </div>
          <ThemeSwitcher current={themeChoice} />
        </Card>
      </section>

      <section
        aria-labelledby="account-notifications-heading"
        style={{ marginBottom: 'var(--s-5)' }}
      >
        <div className="rf-eyebrow" style={{ marginBottom: 'var(--s-2)' }}>
          <h2
            id="account-notifications-heading"
            style={{ all: 'inherit', margin: 0 }}
          >
            Notifications
          </h2>
        </div>
        <NotificationsSection />
      </section>

      <section aria-labelledby="account-session-heading">
        <div className="rf-eyebrow" style={{ marginBottom: 'var(--s-2)' }}>
          <h2
            id="account-session-heading"
            style={{ all: 'inherit', margin: 0 }}
          >
            Account
          </h2>
        </div>
        <Card
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--s-3)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--fs-base)',
                fontWeight: 500,
                color: 'var(--c-text-primary)',
              }}
            >
              Sign out
            </div>
            <div
              style={{
                fontSize: 'var(--fs-xs)',
                color: 'var(--c-text-muted)',
                marginTop: 2,
              }}
            >
              {email ? `Signed in as ${email}` : 'Signed in.'}
            </div>
          </div>
          <LogoutButton />
        </Card>
      </section>
    </main>
  );
}
