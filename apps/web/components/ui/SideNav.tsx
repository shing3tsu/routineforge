/**
 * SideNav — desktop primary navigation (220px left rail).
 *
 * Consumes `.rf-sidenav` + `.rf-sidenav__item` from `design/base.css`.
 * Pinned visible at ≥900px breakpoints; hidden on mobile via globals.css.
 *
 * Anatomy (per design/primitives.jsx → SideNav):
 *   - Top: BrandLockup
 *   - Middle: nav items (Today / Routines / Habits / Account)
 *   - Bottom (above user tile): QuickAppearance — compact palette dots +
 *     theme toggle, so switching palette / theme doesn't require a hop
 *     to /account. Only rendered when palette + themeChoice are supplied
 *     (i.e. inside the signed-in shell where the layout already reads
 *     the cookies).
 *   - Bottom: small "signed in as" tile with name + email
 *
 * The signed-in tile reads its values from props so this component stays
 * pure (server-renderable). The pages dispatch wires real session data.
 */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandLockup } from './BrandLockup';
import { QuickAppearance } from '@/components/account/QuickAppearance';
import type { Palette, ResolvedTheme } from '@/lib/theme/theme';
import {
  IconSun,
  IconList,
  IconFlame,
  IconSearch,
  IconUser,
} from './icons';

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactElement;
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: '/', label: 'Today', icon: <IconSun size={20} /> },
  { href: '/routines', label: 'Routines', icon: <IconList size={20} /> },
  { href: '/habits', label: 'Habits', icon: <IconFlame size={20} /> },
  { href: '/search', label: 'Search', icon: <IconSearch size={20} /> },
  { href: '/account', label: 'Account', icon: <IconUser size={20} /> },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type SideNavProps = {
  /** Optional signed-in user display info for the bottom tile. */
  user?: {
    name?: string | null;
    email?: string | null;
  };
  /**
   * Current palette (read from the `rf_palette` cookie on the server).
   * When omitted, the QuickAppearance footer widget is not rendered.
   */
  palette?: Palette;
  /**
   * Current theme choice (read from the `rf_theme` cookie on the server).
   * `null` means "follow system". When `palette` is omitted, this prop has
   * no effect — the widget is not rendered.
   */
  themeChoice?: ResolvedTheme | null;
};

export function SideNav({ user, palette, themeChoice }: SideNavProps = {}) {
  const pathname = usePathname();
  const initials = computeInitials(user?.name ?? user?.email ?? null);

  return (
    <aside
      className="rf-sidenav rf-sidenav--desktop"
      style={{
        borderRight: '1px solid var(--c-border-subtle)',
        height: '100%',
        flex: '0 0 220px',
      }}
    >
      <div
        style={{ padding: 'var(--s-1) var(--s-3) var(--s-6) var(--s-3)' }}
      >
        <BrandLockup size="md" />
      </div>
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="rf-sidenav__item"
            data-active={active || undefined}
            aria-current={active ? 'page' : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
      <div style={{ flex: 1 }} />
      {palette ? (
        <QuickAppearance
          palette={palette}
          themeChoice={themeChoice ?? null}
        />
      ) : null}
      {user ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-3)',
            padding: 'var(--s-2) var(--s-3)',
            // Skip the border + top margin when QuickAppearance is present
            // — its own borderTop already separates this region from the
            // nav items above, and the small gap below the theme toggle
            // is enough breathing room.
            borderTop: palette ? undefined : '1px solid var(--c-border-subtle)',
            marginTop: palette ? 0 : 'var(--s-3)',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background:
                'linear-gradient(135deg, var(--c-wash-c), var(--c-wash-a))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--c-text-primary)',
              fontSize: 12,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {user.name ? (
              <div
                style={{
                  fontSize: 'var(--fs-sm)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.name}
              </div>
            ) : null}
            {user.email ? (
              <div
                style={{
                  fontSize: 'var(--fs-xs)',
                  color: 'var(--c-text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.email}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function computeInitials(value: string | null): string {
  if (!value) return '·';
  const trimmed = value.trim();
  if (!trimmed) return '·';
  // Use the part before any @ as the initials source.
  const base = trimmed.split('@')[0]!;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return base.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}
