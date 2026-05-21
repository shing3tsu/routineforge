/**
 * OfflineRetryButton — small client island used only on the /offline page.
 *
 * Reloads the current window. We expose this as a button (vs. an <a>
 * pointing at the current URL) because the offline page is precached; a
 * link with the same URL would re-serve the same precached HTML, while a
 * reload triggers the SW's network-first flow that may succeed once the
 * user is back online.
 */
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/Button';

export function OfflineRetryButton() {
  const handleRetry = () => {
    if (typeof window === 'undefined') return;
    window.location.reload();
  };
  return (
    <Button type="button" variant="primary" size="md" onClick={handleRetry}>
      Try again
    </Button>
  );
}
