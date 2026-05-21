/**
 * BottomNav — mobile primary navigation.
 *
 * Consumes `.rf-bottomnav` + `.rf-bottomnav__item` from `design/base.css`
 * (frosted glass strip pinned to the viewport bottom, four items: Today /
 * Routines / Habits / You).
 *
 * Hidden on desktop (≥900px). The visibility rule lives in `globals.css`.
 *
 * Active state is derived from the current pathname (`usePathname`). A path
 * is considered active when the pathname equals or starts with the item's
 * `href` (`/routines` matches `/routines/abc`).
 */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  { href: '/', label: 'Today', icon: <IconSun size={22} /> },
  { href: '/routines', label: 'Routines', icon: <IconList size={22} /> },
  { href: '/habits', label: 'Habits', icon: <IconFlame size={22} /> },
  { href: '/search', label: 'Search', icon: <IconSearch size={22} /> },
  { href: '/account', label: 'You', icon: <IconUser size={22} /> },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="rf-bottomnav rf-bottomnav--mobile" aria-label="Primary">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="rf-bottomnav__item"
            data-active={active || undefined}
            aria-current={active ? 'page' : undefined}
          >
            {item.icon}
            <span className="rf-bottomnav__label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
