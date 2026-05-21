/**
 * /not-found — global 404 page. Next.js renders this for any unmatched
 * route, including from explicit `notFound()` calls in server components
 * that don't have a closer `not-found.tsx` (e.g. `/some/random/url`).
 *
 * Server component on purpose: no client interactivity is required —
 * `next/link` works fine in server components, and rendering on the server
 * keeps the page lightweight and indexable.
 *
 * Visual rhythm matches the (auth) pages — the calmest, most minimal
 * surfaces in the app. Watercolor wash backdrop, single-column centered
 * layout, lowercase sentence-case copy, no emoji, no exclamation marks.
 *
 * Two CTAs:
 *   - primary "go to today" → `/today` (the app's home)
 *   - secondary "or sign in" → `/login` (covers the case where a logged-
 *     out visitor landed on a private URL and was bounced here)
 *
 * Tokens consumed: `--s-*` spacing, `--fs-*` type, `--c-text-*` colors,
 * `--c-brand-primary` (CTA bg), `--c-brand-on-primary`, `--c-border-subtle`,
 * `--c-focus-ring`, `--r-full`, `--sh-sm`. No hardcoded values.
 */
import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Not here — RoutineForge',
  description: "this page doesn't exist — or it never did.",
};

export default function NotFound() {
  return (
    <main
      className="rf-wash"
      aria-labelledby="not-found-heading"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 'var(--s-8) var(--s-5)',
        position: 'relative',
      }}
    >
      <div
        style={{
          maxWidth: '36rem',
          width: '100%',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          className="rf-eyebrow"
          style={{
            marginBottom: 'var(--s-3)',
            color: 'var(--c-text-muted)',
          }}
        >
          404
        </div>
        <h1
          id="not-found-heading"
          style={{
            fontSize: 'var(--fs-4xl)',
            fontWeight: 600,
            letterSpacing: 'var(--tr-tight)',
            lineHeight: 1.1,
            color: 'var(--c-text-primary)',
            margin: '0 0 var(--s-4) 0',
          }}
        >
          not here.
        </h1>
        <p
          style={{
            fontSize: 'var(--fs-lg)',
            color: 'var(--c-text-secondary)',
            lineHeight: 1.5,
            margin: '0 auto var(--s-7) auto',
            maxWidth: '36ch',
          }}
        >
          this page doesn&rsquo;t exist &mdash; or it never did. let&rsquo;s
          get you back.
        </p>

        <div
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--s-4)',
          }}
        >
          <Link
            href="/"
            className="rf-btn rf-btn--primary rf-btn--lg"
            style={{ textDecoration: 'none' }}
          >
            <span className="rf-btn__label">go to today</span>
          </Link>
          <Link
            href="/login"
            style={{
              fontSize: 'var(--fs-sm)',
              color: 'var(--c-text-secondary)',
            }}
          >
            or sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
