/**
 * Layout for the `(auth)` route group: `/signup` and `/login`.
 *
 * Visual target: `design/mockups/signup.html` + `design/mockups/login.html`
 * + `design/screens/auth.jsx → AuthFrame`.
 *
 * Mobile: single-column, brand at top, vertically-centered form, calm wash
 * backdrop.
 *
 * Desktop (≥1025px): two-column split. Left half = the watercolor wash
 * panel with brand mark + a marketing pull-quote ("One quiet list. Every
 * day, on time."). Right half = elevated surface with the form.
 */
import * as React from 'react';
import { BrandLockup } from '@/components/ui/BrandLockup';
import styles from './layout.module.css';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.frame}>
      <aside className={`${styles.side} rf-wash`} aria-hidden="true">
        <BrandLockup size="md" />
        <div className={styles.sideBody}>
          <div className="rf-eyebrow">RoutineForge</div>
          <h2>
            One quiet list.
            <br />
            Every day, on time.
          </h2>
          <p>
            Routines you can build by weekday. Habits that count themselves.
            Notifications that don&rsquo;t shout. Installs to your phone in a
            tap.
          </p>
        </div>
        <div className={styles.sideFooter}>v0.1 &middot; open beta</div>
      </aside>
      <div className={styles.formCol}>
        <div className={styles.card}>
          <div className={styles.brand}>
            <BrandLockup size="md" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
