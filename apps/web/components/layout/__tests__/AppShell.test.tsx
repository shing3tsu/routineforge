// @vitest-environment jsdom
/**
 * AppShell tests.
 *
 * Covers the global Cmd/Ctrl+K shortcut wiring:
 *
 *   1. Pressing Ctrl+K from a non-search route navigates to `/search`.
 *   2. Pressing Cmd (metaKey)+K behaves identically.
 *   3. The shortcut is suppressed when the user is typing into an input /
 *      textarea / contenteditable that is NOT the search input (we don't
 *      want to steal Cmd+K from someone editing a routine name).
 *   4. The shortcut DOES fire when the focused input has `data-search-input`
 *      — that's the search field itself, so users can still mash Cmd+K to
 *      re-enter the page from a stale tab.
 *   5. When the user is already on `/search`, the global listener bows out
 *      so the page-scoped SearchClient listener (focus+select) wins.
 *
 * `next/navigation` is mocked so we can spy on `router.push` and control
 * `usePathname()` per-test.
 */

import * as React from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

// Mock next/navigation BEFORE importing AppShell.
const routerPush = vi.fn();
let mockPathname = '/today';
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
    refresh: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => mockPathname,
}));

import { AppShell } from '@/components/layout/AppShell';

beforeEach(() => {
  routerPush.mockClear();
  mockPathname = '/today';
});

afterEach(() => {
  cleanup();
});

function pressCtrlK(): void {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
    );
  });
}

function pressMetaK(): void {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
    );
  });
}

describe('AppShell — global Cmd/Ctrl+K shortcut', () => {
  it('navigates to /search when Ctrl+K is pressed from a non-search route', () => {
    mockPathname = '/today';
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );
    pressCtrlK();
    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith('/search');
  });

  it('also navigates when Cmd (metaKey)+K is pressed', () => {
    mockPathname = '/routines';
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );
    pressMetaK();
    expect(routerPush).toHaveBeenCalledWith('/search');
  });

  it('responds to uppercase K as well (Shift+Cmd+K)', () => {
    mockPathname = '/habits';
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'K',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    });
    expect(routerPush).toHaveBeenCalledWith('/search');
  });

  it('does NOT navigate when the user is typing into a non-search input', () => {
    mockPathname = '/routines';
    render(
      <AppShell>
        <input
          aria-label="routine name"
          data-testid="routine-name-input"
          type="text"
        />
      </AppShell>,
    );
    const input = screen.getByTestId(
      'routine-name-input',
    ) as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    pressCtrlK();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('does NOT navigate when focus is in a textarea', () => {
    mockPathname = '/routines';
    render(
      <AppShell>
        <textarea aria-label="notes" data-testid="notes" />
      </AppShell>,
    );
    const ta = screen.getByTestId('notes') as HTMLTextAreaElement;
    ta.focus();
    pressCtrlK();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('does NOT navigate when focus is in a contenteditable element', () => {
    mockPathname = '/account';
    render(
      <AppShell>
        <div
          contentEditable
          tabIndex={0}
          data-testid="ce"
          suppressContentEditableWarning
        >
          some editable content
        </div>
      </AppShell>,
    );
    const ce = screen.getByTestId('ce') as HTMLDivElement;
    ce.focus();
    expect(document.activeElement).toBe(ce);
    pressCtrlK();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('STILL navigates when focus is on the search input itself (data-search-input)', () => {
    // The global listener should not interfere with the page-scoped one on
    // /search, but on OTHER routes a focused search-style input should still
    // trigger navigation. (In practice the only place data-search-input
    // appears is /search, but the suppression carve-out is part of the
    // contract — assert it here.)
    mockPathname = '/today';
    render(
      <AppShell>
        <input aria-label="search" data-search-input data-testid="search" />
      </AppShell>,
    );
    const input = screen.getByTestId('search') as HTMLInputElement;
    input.focus();
    pressCtrlK();
    expect(routerPush).toHaveBeenCalledWith('/search');
  });

  it('does NOT navigate when already on /search (page-scoped listener owns it)', () => {
    mockPathname = '/search';
    render(
      <AppShell>
        <div>search page content</div>
      </AppShell>,
    );
    pressCtrlK();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('ignores plain K (no modifier)', () => {
    mockPathname = '/today';
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    });
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('ignores Alt+Cmd+K (modifier carve-out)', () => {
    mockPathname = '/today';
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          metaKey: true,
          altKey: true,
        }),
      );
    });
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('removes its keydown listener on unmount', () => {
    mockPathname = '/today';
    const { unmount } = render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );
    pressCtrlK();
    expect(routerPush).toHaveBeenCalledTimes(1);

    unmount();
    routerPush.mockClear();
    pressCtrlK();
    expect(routerPush).not.toHaveBeenCalled();
  });
});
