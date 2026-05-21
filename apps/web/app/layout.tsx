/**
 * Root layout. Server component. Four responsibilities:
 *
 *   1. Load Geist Sans + Geist Mono via `next/font/google`. The fonts expose
 *      themselves as `--font-geist-sans` and `--font-geist-mono`; we apply
 *      those class names to <html>. `design/tokens.css` then composes them
 *      ahead of the literal `"Geist"` family so the loaded webfont wins
 *      with a hard fallback to the bare family + system stack.
 *
 *   2. Resolve `data-palette` (always set — defaults to `graphite`) and
 *      `data-theme` (set only when the user has an explicit cookie choice)
 *      from `rf_palette` / `rf_theme` cookies. The design's `tokens.css`
 *      has NO `:root` palette fallback — without `data-palette` every
 *      `--c-*` variable is undefined, so this attribute is load-bearing.
 *
 *   3. Mount `<DefaultIconDefs />` once in the body. The hand-drawn icon
 *      set's wobble filter (`#rf-rough` / `#rf-rough-soft`) lives in an
 *      invisible SVG that every icon on the page references — having it
 *      here keeps it in the DOM across all routes.
 *
 *   4. Mount `<PushBootstrap />` and `<InstallPrompt />` (unchanged from
 *      the prior layout — these handle PWA push registration and the
 *      install-prompt UX).
 *
 * The previous inline `<style id="rf-tokens">` is gone. Token CSS now
 * ships through `apps/web/app/globals.css` which `@import`s
 * `design/tokens.css` + `design/base.css` + the bridge — see globals.css
 * for the full layering note.
 */
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { auth } from '@/auth';
import { readThemeCookie, readPaletteCookie } from '@/lib/theme/theme';
import { PushBootstrap } from '@/components/push/PushBootstrap';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { DefaultIconDefs } from '@/components/ui/icons';
import { AppShell } from '@/components/layout/AppShell';
import './globals.css';

// Geist Sans + Geist Mono via next/font/google. `variable` exposes a CSS
// custom property name we feed into `design/tokens.css`'s `--font-sans` /
// `--font-mono` composite chain. `display: 'swap'` keeps text visible
// during the woff2 fetch — a few hundred ms of fallback flicker beats
// blank text on a slow connection.
const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'RoutineForge',
  description: 'Routines you actually follow. Habits that actually stick.',
  // PWA discovery. Next's `metadata` export emits the right `<link>` /
  // `<meta>` tags into the document head at build time.
  manifest: '/manifest.webmanifest',
  applicationName: 'RoutineForge',
  appleWebApp: {
    // iOS doesn't read the manifest; it gets its install metadata from these
    // tags. `capable: true` enables standalone mode when added to home screen.
    capable: true,
    title: 'RoutineForge',
    statusBarStyle: 'default',
  },
  // Favicon + home-screen icons. We register both the SVG (modern browsers
  // tint via `currentColor` from the document's color-scheme) and the ICO
  // (legacy fallback for Chromium < 90 and corporate browsers that ignore
  // SVG favicons). The ICO is a multi-resolution 16/32/48 file so the OS can
  // pick the right size for the tab strip vs. the taskbar.
  //
  // `apple-touch-icon.png` is a flat 180x180 raster — iOS rounds the corners
  // and adds its own gloss. `shortcut` mirrors the ICO entry for browsers
  // that still honour the legacy `rel="shortcut icon"` link.
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-touch-icon.png',
    shortcut: '/favicon.ico',
  },
};

/**
 * Viewport metadata. Next 15+ wants this in its own export.
 *
 * The themeColor pair drives the mobile OS chrome (status bar / address bar)
 * background. We use the ship default `graphite` palette surface colors —
 * near-white `#F4F4F5` on light, near-black `#101012` on dark — so the
 * chrome blends into the app's surface instead of standing apart.
 *
 * NOTE: the palette switcher (account page) can change the page palette,
 * but themeColor here stays on the default `graphite` (it's a layout-static
 * export) — the mobile chrome doesn't update per-palette. A per-palette OS
 * chrome would require a client component that mutates a
 * `<meta name="theme-color">` at runtime. Out of scope for this dispatch.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F4F5' },
    { media: '(prefers-color-scheme: dark)', color: '#101012' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read cookies + session in parallel. Session is what decides whether to
  // wrap the page in the signed-in `<AppShell>` (bottom nav, side nav,
  // watercolor backdrop). The auth flow pages (/login, /signup, /verify)
  // are never reached with a session — middleware redirects authenticated
  // users away from them — so a session-only check naturally gives the
  // auth pages a flat layout. The /offline page is static and rendered
  // without auth resolution by the service worker, so it also stays flat.
  const [themeChoice, palette, session] = await Promise.all([
    readThemeCookie(),
    readPaletteCookie(),
    auth(),
  ]);

  const userId = (session?.user as { id?: string } | undefined)?.id;
  const isApp = !!userId;
  const userForShell = isApp && session?.user
    ? {
        name: session.user.name ?? null,
        email: session.user.email ?? null,
      }
    : undefined;

  // `data-palette` is ALWAYS rendered (defaults to `graphite`). The design's
  // tokens.css has no `:root` fallback for palette colors, so this attribute
  // is what makes every `--c-*` variable defined at first paint.
  //
  // `data-theme` is rendered only when the user has an explicit cookie. When
  // absent, the `[data-palette="X"]:not([data-theme="dark"])` selector in
  // tokens.css keeps the light palette, and the `prefers-color-scheme` media
  // query in globals.css flips `color-scheme` so native form widgets follow.
  const themeAttrs = themeChoice ? { 'data-theme': themeChoice } : {};

  return (
    <html
      lang="en"
      data-palette={palette}
      {...themeAttrs}
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        {/*
          Hand-drawn icon filter defs. Mount exactly once so every Icon on
          the tree resolves `filter="url(#rf-rough)"`. Invisible (0 by 0).
        */}
        <DefaultIconDefs />
        <PushBootstrap />
        {isApp ? (
          <AppShell
            user={userForShell}
            palette={palette}
            themeChoice={themeChoice}
          >
            {children}
          </AppShell>
        ) : (
          children
        )}
        {/*
         * InstallPrompt is rendered last on purpose: it's a non-critical
         * affordance and shouldn't delay first paint of the today view. It
         * mounts a fixed-position banner that only appears once the browser
         * fires `beforeinstallprompt` (Android/Chromium) or, on iOS Safari,
         * after a brief delay (iOS doesn't expose an install API).
         */}
        <InstallPrompt />
      </body>
    </html>
  );
}
