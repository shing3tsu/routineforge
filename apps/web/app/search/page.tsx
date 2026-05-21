/**
 * Search — server component.
 *
 * Wraps the `<SearchClient>` island in the standard signed-in page chrome
 * (eyebrow + h1). All interactivity (input, debounce, fetch, results) lives
 * in the client island — this file only auth-gates and renders chrome.
 *
 * Anatomy:
 *   - Eyebrow ("find") + h1 ("Search").
 *   - `<SearchClient>` — the interactive search bar + results.
 *
 * Why a dedicated page instead of inline combobox: the existing app uses
 * full-height pages for every primary surface (Today / Routines / Habits /
 * Account). A search page slots in naturally next to those and gives results
 * room to breathe without competing with the side nav. See dispatch report
 * for the A/B rationale.
 *
 * Auth: redirect to /login if no session (defense-in-depth; middleware
 * already gates most paths). Mirrors the pattern in `/routines/page.tsx`.
 */

import * as React from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { SearchClient } from './SearchClient';

export const dynamic = 'force-dynamic';

export default async function SearchPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    redirect('/login?from=/search');
  }

  return (
    <main className="rf-page">
      <div className="rf-page-head">
        <div>
          <div className="rf-eyebrow">find</div>
          <h1 className="rf-h1">Search</h1>
          <p className="rf-page-head__meta">
            across your routines and habits
          </p>
        </div>
      </div>
      <SearchClient />
    </main>
  );
}
