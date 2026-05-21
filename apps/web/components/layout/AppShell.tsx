/**
 * AppShell — global layout wrapper for SIGNED-IN routes.
 *
 * Composes the new nav primitives into the page chrome the design specifies:
 *
 *   - Desktop (≥900px): a left rail `<SideNav />` of fixed 220px width pinned
 *     to the viewport, with the page content occupying the remainder. The
 *     watercolor wash backdrop (`.rf-wash`) is painted on the main column so
 *     the navigation rail stays a calm neutral.
 *
 *   - Mobile (<900px): the side rail collapses (hidden via `globals.css`
 *     media query) and a `<BottomNav />` is pinned to the bottom of the
 *     viewport via `.rf-bottomnav { position: absolute; bottom: 0 }` —
 *     anchored to the `.rf-wash` container, which sets `position: relative`.
 *
 * The `<BottomNav />` is `position: absolute` per `design/base.css`, so it
 * needs a containing block with `position: relative`. The wash class on the
 * inner container already includes `position: relative` for its watercolor
 * pseudo-element painting, and it also serves as the bottom-nav anchor.
 *
 * Safe-area: `.rf-bottomnav` in base.css already pads its bottom with
 * `max(var(--s-3), env(safe-area-inset-bottom))` so the iOS home indicator
 * doesn't sit on top of the nav items. We also add `padding-bottom` to the
 * content area (an extra 88px) so the bottom-anchored nav doesn't occlude
 * the final scrollable element on the page.
 *
 * Why a route group `(app)`?
 *
 *   We tried wrapping every page in `app/layout.tsx` and branching on the
 *   session, but: (1) the layout would need to be async (auth() is async),
 *   which is fine, but (2) the signed-out landing on `/` would still get
 *   the wash backdrop, which is wrong for the marketing card. A `(app)`
 *   route group cleanly scopes the shell to signed-in routes without
 *   changing URLs — the parens mean Next strips it from the path. The
 *   auth pages stay inside their existing `(auth)` group with their own
 *   layout. The signed-in landing also lives inside `(app)` and serves
 *   the today view; the signed-out landing is rendered by `(auth)/page.tsx`
 *   or branched in the `(app)/page.tsx`. We branch in `(app)/page.tsx`
 *   today: if the user has no session we render the marketing card with
 *   no shell, otherwise we render the today view with the shell.
 *
 * Client component because BottomNav and SideNav both use `usePathname()`
 * to decide which item is active.
 */
'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BottomNav } from '@/components/ui/BottomNav';
import { SideNav } from '@/components/ui/SideNav';
import type { Palette, ResolvedTheme } from '@/lib/theme/theme';

export type AppShellProps = {
  children: React.ReactNode;
  /** Optional signed-in user info for the SideNav signed-in tile. */
  user?: {
    name?: string | null;
    email?: string | null;
  };
  /**
   * Current palette (resolved from the `rf_palette` cookie in the root
   * layout). Forwarded to `<SideNav>` so the desktop QuickAppearance
   * footer widget can render with the right active state.
   */
  palette?: Palette;
  /**
   * Current theme choice (resolved from the `rf_theme` cookie). Same
   * purpose as `palette` — fed to the SideNav's QuickAppearance widget.
   */
  themeChoice?: ResolvedTheme | null;
};

export function AppShell({
  children,
  user,
  palette,
  themeChoice,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Global Cmd/Ctrl+K shortcut: navigate to /search from anywhere in the app.
  //
  // We skip the shortcut when the active element is a text input / textarea /
  // contenteditable that ISN'T the search input (`[data-search-input]`), so
  // users editing a routine name, description, etc. can still use Cmd+K for
  // browser/OS defaults. If the user is already on /search, the page-scoped
  // SearchClient listener owns the focus+select behaviour — we still call
  // router.push('/search'), which is a no-op when already there, but the
  // SearchClient handler runs first (page listener was registered later) and
  // calls preventDefault.
  //
  // The SearchClient's `<TextField autoFocus>` handles the navigation-then-
  // focus chain: when the user lands on /search via this shortcut, the input
  // mount focuses naturally — no extra wiring needed.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmdK =
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !e.altKey;
      if (!isCmdK) return;

      // Respect users typing in inputs that aren't the search input.
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const isSearchInput =
          active.hasAttribute('data-search-input') ||
          active.closest('[data-search-input]') !== null;
        if (!isSearchInput) {
          const tag = active.tagName;
          // Note: `isContentEditable` is a computed property that requires a
          // layout box; in test environments (jsdom) it can return false even
          // when the attribute is set. Check the attribute too for parity.
          const ceAttr = active.getAttribute('contenteditable');
          const isContentEditable =
            active.isContentEditable === true ||
            (ceAttr !== null && ceAttr !== 'false');
          const isTextField =
            tag === 'INPUT' || tag === 'TEXTAREA' || isContentEditable;
          if (isTextField) return;
        }
      }

      // If we're already on /search, let the page-scoped listener handle
      // focus+select; don't fight it with a navigation no-op + preventDefault
      // that could race with the page's own handler.
      if (pathname === '/search') return;

      e.preventDefault();
      router.push('/search');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, pathname]);

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100dvh',
        width: '100%',
        position: 'relative',
      }}
    >
      <SideNav user={user} palette={palette} themeChoice={themeChoice} />
      <div
        className="rf-wash"
        style={{
          flex: 1,
          minWidth: 0,
          position: 'relative',
          // Push content above the mobile bottom nav (88px) on small screens.
          // The bottom nav itself uses `.rf-bottomnav { position: absolute;
          // bottom: 0 }` so it sits at the bottom of THIS wash container.
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {children}
        <BottomNav />
      </div>
    </div>
  );
}
