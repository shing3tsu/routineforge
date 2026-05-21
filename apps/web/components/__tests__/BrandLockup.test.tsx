// @vitest-environment jsdom
/**
 * BrandLockup tests.
 *
 * BrandLockup is icon + wordmark with a single accessible name on the wrapper
 * (so screen readers say "RoutineForge", not "R RoutineForge"). The inner
 * mark + name spans are aria-hidden to avoid duplicate announcement.
 */

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BrandLockup } from '@/components/ui/BrandLockup';

afterEach(() => {
  cleanup();
});

describe('BrandLockup', () => {
  it('exposes "RoutineForge" as the accessible name', () => {
    render(<BrandLockup />);
    expect(screen.getByLabelText('RoutineForge')).toBeInTheDocument();
  });

  it('renders the visible wordmark by default', () => {
    render(<BrandLockup />);
    expect(screen.getByText('RoutineForge')).toBeInTheDocument();
  });

  it('hides the wordmark when hideName is true (icon-only)', () => {
    render(<BrandLockup hideName />);
    // The accessible name stays on the wrapper even when the visible text is
    // suppressed — so the lockup is still discoverable by screen readers.
    expect(screen.getByLabelText('RoutineForge')).toBeInTheDocument();
    expect(screen.queryByText('RoutineForge')).not.toBeInTheDocument();
  });

  it('applies a size-* class for the supplied size', () => {
    const { container } = render(<BrandLockup size="sm" />);
    const lockup = container.firstElementChild as HTMLElement;
    expect(lockup.className).toMatch(/size-sm/);
  });

  it('marks the internal "R" mark as aria-hidden so it is not announced twice', () => {
    const { container } = render(<BrandLockup />);
    const mark = container.querySelector('[aria-hidden="true"]');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('R');
  });
});
