// @vitest-environment jsdom
/**
 * LogoutButton tests.
 *
 * The button wraps `signOut` from next-auth/react. We mock the entire module
 * so the component's onClick handler invokes our spy rather than fetching the
 * NextAuth sign-out endpoint.
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signOut = vi.fn();
vi.mock('next-auth/react', () => ({
  signOut: (...args: unknown[]) => signOut(...args),
}));

import { LogoutButton } from '@/components/auth/LogoutButton';

beforeEach(() => {
  signOut.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('LogoutButton', () => {
  it('renders a "Sign out" button by default', () => {
    render(<LogoutButton />);
    expect(
      screen.getByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument();
  });

  it('applies the ghost variant class (per spec)', () => {
    render(<LogoutButton />);
    const btn = screen.getByRole('button', { name: 'Sign out' });
    expect(btn.className).toMatch(/variant-ghost/);
  });

  it('honors a custom child label', () => {
    render(<LogoutButton>Log me out</LogoutButton>);
    expect(
      screen.getByRole('button', { name: 'Log me out' }),
    ).toBeInTheDocument();
  });

  it('calls signOut({ callbackUrl: "/" }) on click (default)', async () => {
    const user = userEvent.setup();
    render(<LogoutButton />);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/' });
  });

  it('forwards a custom callbackUrl', async () => {
    const user = userEvent.setup();
    render(<LogoutButton callbackUrl="/login" />);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/login' });
  });

  it('calls signOut on Enter key press', async () => {
    const user = userEvent.setup();
    render(<LogoutButton />);
    const btn = screen.getByRole('button', { name: 'Sign out' });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('calls signOut on Space key press', async () => {
    const user = userEvent.setup();
    render(<LogoutButton />);
    const btn = screen.getByRole('button', { name: 'Sign out' });
    btn.focus();
    await user.keyboard(' ');
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('shows loading state after click (button becomes aria-busy)', async () => {
    const user = userEvent.setup();
    render(<LogoutButton />);
    const btn = screen.getByRole('button', { name: 'Sign out' });
    await user.click(btn);
    // Local pending state flips synchronously after onClick.
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });
});
