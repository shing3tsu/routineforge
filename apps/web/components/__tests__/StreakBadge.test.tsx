// @vitest-environment jsdom
/**
 * StreakBadge tests.
 *
 * Per StreakBadge.tsx:
 *   - Zero-state (currentStreak <= 0): label is "Start your streak"; the
 *     counter shows "0" but is aria-hidden; aria-label = "No current streak
 *     yet — start your streak"; the .subtle visual variant is applied.
 *   - Non-zero: label is "day streak" (the count lives in the aria-hidden
 *     counter, not the visible label string); aria-label is "Current streak: N
 *     day" (singular when N === 1) or "Current streak: N days".
 *   - Escalation:
 *       streak >= 30 (and < 100): .ring30 class on the root.
 *       streak >= 100:            .ring100 class on the root (distinct from 30).
 *   - longestStreak interaction:
 *       longestStreak > currentStreak  -> renders " · best N" suffix and
 *         appends ", best N" to the aria-label.
 *       currentStreak >= longestStreak && longestStreak > 0  -> renders
 *         "— best so far" suffix and appends ", all-time best" to aria.
 *       showBestSuffix=false suppresses both suffixes.
 *       longestStreak omitted entirely -> no suffix.
 *   - Size: 'lg' → .large class on the root; 'sm' and 'md' → .inline class.
 *   - role="status" so screen readers announce streak changes.
 *
 * We assert class fragments via `expect(el.className).toMatch(...)` because
 * CSS modules transform class names to hashed strings (e.g. "_ring30_abc12");
 * the source token name remains a substring.
 */

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StreakBadge } from '@/components/ui/StreakBadge';

afterEach(() => {
  cleanup();
});

describe('StreakBadge — zero-state', () => {
  it('renders the "Start your streak" copy when currentStreak is 0', () => {
    render(<StreakBadge currentStreak={0} />);
    expect(screen.getByText('Start your streak')).toBeInTheDocument();
  });

  it('renders the "Start your streak" copy when currentStreak is negative', () => {
    // Defensive: the source treats anything <= 0 as the zero-state.
    render(<StreakBadge currentStreak={-3} />);
    expect(screen.getByText('Start your streak')).toBeInTheDocument();
  });

  it('uses the natural-language aria-label "No current streak yet — start your streak"', () => {
    render(<StreakBadge currentStreak={0} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute(
      'aria-label',
      'No current streak yet — start your streak',
    );
  });

  it('applies the .subtle visual variant in the zero-state', () => {
    render(<StreakBadge currentStreak={0} />);
    const status = screen.getByRole('status');
    expect(status.className).toMatch(/subtle/);
  });

  it('does NOT apply ring30 or ring100 escalations in the zero-state, even if longestStreak is high', () => {
    render(<StreakBadge currentStreak={0} longestStreak={200} />);
    const status = screen.getByRole('status');
    expect(status.className).not.toMatch(/ring30/);
    expect(status.className).not.toMatch(/ring100/);
  });

  it('does NOT render a "best" suffix in the zero-state, even with longestStreak set', () => {
    // Per the source: "we don't crow about a 'best' when the user is at zero".
    render(<StreakBadge currentStreak={0} longestStreak={42} />);
    expect(screen.queryByText(/best/)).not.toBeInTheDocument();
  });
});

describe('StreakBadge — singular / plural label', () => {
  it('uses the singular phrasing for currentStreak = 1 ("Current streak: 1 day")', () => {
    render(<StreakBadge currentStreak={1} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Current streak: 1 day');
  });

  it('uses the plural phrasing for currentStreak = 5 ("Current streak: 5 days")', () => {
    render(<StreakBadge currentStreak={5} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Current streak: 5 days');
  });

  it('renders the count in the (aria-hidden) counter circle', () => {
    render(<StreakBadge currentStreak={5} />);
    // The visible counter is `aria-hidden="true"` and contains the bare number.
    // We query by text and then check the aria-hidden ancestry.
    const counter = screen.getByText('5');
    expect(counter).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the static "day streak" label tail for any non-zero streak', () => {
    render(<StreakBadge currentStreak={5} />);
    // The visible label is literally "day streak" (the digit lives in the
    // counter circle); we assert presence of that exact phrase.
    expect(screen.getByText('day streak')).toBeInTheDocument();
  });
});

describe('StreakBadge — escalation rings', () => {
  it('applies the ring30 class for currentStreak = 30 (no ring100)', () => {
    render(<StreakBadge currentStreak={30} />);
    const status = screen.getByRole('status');
    expect(status.className).toMatch(/ring30/);
    expect(status.className).not.toMatch(/ring100/);
  });

  it('keeps the ring30 visual treatment all the way up to currentStreak = 99', () => {
    render(<StreakBadge currentStreak={99} />);
    const status = screen.getByRole('status');
    expect(status.className).toMatch(/ring30/);
    expect(status.className).not.toMatch(/ring100/);
  });

  it('upgrades to the ring100 class at currentStreak = 100 (no ring30)', () => {
    render(<StreakBadge currentStreak={100} />);
    const status = screen.getByRole('status');
    expect(status.className).toMatch(/ring100/);
    expect(status.className).not.toMatch(/ring30/);
  });

  it('does NOT apply any escalation ring for currentStreak below 30', () => {
    render(<StreakBadge currentStreak={29} />);
    const status = screen.getByRole('status');
    expect(status.className).not.toMatch(/ring30/);
    expect(status.className).not.toMatch(/ring100/);
  });
});

describe('StreakBadge — longestStreak ("best") suffix', () => {
  it('renders " · best N" when longestStreak > currentStreak', () => {
    render(<StreakBadge currentStreak={47} longestStreak={120} />);
    // The visible suffix text is "· best 120".
    expect(screen.getByText('· best 120')).toBeInTheDocument();
    // And the aria-label gets a ", best 120" tail.
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Current streak: 47 days, best 120',
    );
  });

  it('renders "— best so far" when currentStreak equals longestStreak (and > 0)', () => {
    render(<StreakBadge currentStreak={47} longestStreak={47} />);
    expect(screen.getByText('— best so far')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Current streak: 47 days, all-time best',
    );
  });

  it('does NOT render a suffix when longestStreak is omitted entirely', () => {
    render(<StreakBadge currentStreak={47} />);
    expect(screen.queryByText(/best/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Current streak: 47 days',
    );
  });

  it('does NOT render either suffix when showBestSuffix=false (HabitListItem use case)', () => {
    render(
      <StreakBadge
        currentStreak={47}
        longestStreak={120}
        showBestSuffix={false}
      />,
    );
    expect(screen.queryByText(/best/)).not.toBeInTheDocument();
    // aria-label collapses back to the bare current-streak phrasing.
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Current streak: 47 days',
    );
  });
});

describe('StreakBadge — size variants', () => {
  it('applies the .large class when size="lg"', () => {
    render(<StreakBadge currentStreak={5} size="lg" />);
    const status = screen.getByRole('status');
    expect(status.className).toMatch(/large/);
    expect(status.className).not.toMatch(/inline/);
  });

  it('applies the .inline class for size="md" (default)', () => {
    render(<StreakBadge currentStreak={5} />);
    const status = screen.getByRole('status');
    expect(status.className).toMatch(/inline/);
    expect(status.className).not.toMatch(/large/);
  });

  it('applies the .inline class for size="sm" (sm and md collapse to inline per the source)', () => {
    render(<StreakBadge currentStreak={5} size="sm" />);
    const status = screen.getByRole('status');
    expect(status.className).toMatch(/inline/);
    expect(status.className).not.toMatch(/large/);
  });
});

describe('StreakBadge — accessibility role & class composition', () => {
  it('renders with role="status" so SR users hear streak updates', () => {
    render(<StreakBadge currentStreak={5} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('forwards a custom className to the root', () => {
    render(<StreakBadge currentStreak={5} className="my-extra-class" />);
    const status = screen.getByRole('status');
    expect(status.className).toMatch(/my-extra-class/);
  });
});
