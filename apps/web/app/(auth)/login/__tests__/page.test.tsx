// @vitest-environment jsdom
/**
 * Login page tests.
 *
 * The page is a client component that:
 *   - reads query params (?verified, ?reason, ?error, ?from)
 *   - calls signIn('credentials', { redirect: false, ... }) on submit
 *   - maps result.error 'unverified' -> dedicated copy
 *   - maps any other result.error    -> generic "Invalid credentials"
 *   - on success, routes via next/navigation's useRouter().push
 *   - Google button: signIn('google', { callbackUrl })
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signIn = vi.fn();
vi.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

const routerPush = vi.fn();
const routerRefresh = vi.fn();
const searchParamsRef: { current: URLSearchParams } = {
  current: new URLSearchParams(),
};
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsRef.current,
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

import LoginPage from '@/app/(auth)/login/page';

function setSearchParams(qs: string) {
  searchParamsRef.current = new URLSearchParams(qs);
}

beforeEach(() => {
  signIn.mockReset();
  routerPush.mockReset();
  routerRefresh.mockReset();
  setSearchParams('');
});

afterEach(() => {
  cleanup();
});

describe('LoginPage — rendering', () => {
  it('renders email + password fields and a Sign in button', () => {
    render(<LoginPage />);
    expect(
      screen.getByRole('heading', { name: /welcome back/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^sign in$/i }),
    ).toBeInTheDocument();
  });

  it('renders the Continue with Google button', () => {
    render(<LoginPage />);
    expect(
      screen.getByRole('button', { name: /continue with google/i }),
    ).toBeInTheDocument();
  });

  it('renders a "Forgot?" link via the password labelAction slot', () => {
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: /forgot/i })).toBeInTheDocument();
  });
});

describe('LoginPage — credentials submit', () => {
  it('calls signIn("credentials", { email, password, redirect: false, callbackUrl: "/" })', async () => {
    signIn.mockResolvedValueOnce({ ok: true, url: '/' });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'pw1234');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(signIn).toHaveBeenCalledWith('credentials', {
      email: 'alice@example.com',
      password: 'pw1234',
      redirect: false,
      callbackUrl: '/',
    });
  });

  it('uses ?from= as the callbackUrl when present', async () => {
    setSearchParams('from=%2Faccount');
    signIn.mockResolvedValueOnce({ ok: true, url: '/account' });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(signIn).toHaveBeenCalled());
    expect(signIn.mock.calls[0]![1]).toMatchObject({
      callbackUrl: '/account',
    });
  });

  it('on successful sign-in, calls router.push(result.url) then router.refresh', async () => {
    signIn.mockResolvedValueOnce({ ok: true, url: '/account' });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/account'));
    expect(routerRefresh).toHaveBeenCalled();
  });

  it('shows "Email not verified" when result.error === "unverified"', async () => {
    signIn.mockResolvedValueOnce({ ok: false, error: 'unverified' });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/not verified/i),
    );
  });

  it('shows "Invalid credentials" on a CredentialsSignin error', async () => {
    signIn.mockResolvedValueOnce({ ok: false, error: 'CredentialsSignin' });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /invalid credentials/i,
      ),
    );
  });

  it('shows "Invalid credentials" for any other error code (no email enumeration)', async () => {
    signIn.mockResolvedValueOnce({ ok: false, error: 'SomeUnknownThing' });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /invalid credentials/i,
      ),
    );
  });

  it('shows a network-error banner when signIn rejects', async () => {
    signIn.mockRejectedValueOnce(new Error('net'));
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/network error/i),
    );
  });
});

describe('LoginPage — query-param banners', () => {
  it('shows a role="status" success banner on ?verified=1', () => {
    setSearchParams('verified=1');
    render(<LoginPage />);
    expect(screen.getByRole('status')).toHaveTextContent(
      /email verified/i,
    );
  });

  it('shows a role="alert" destructive banner on ?verified=0&reason=invalid_token', () => {
    setSearchParams('verified=0&reason=invalid_token');
    render(<LoginPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /no longer valid/i,
    );
  });

  it('uses friendly copy for reason=expired', () => {
    setSearchParams('verified=0&reason=expired');
    render(<LoginPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/expired/i);
  });

  it('falls back to generic copy for an unknown reason', () => {
    setSearchParams('verified=0&reason=mystery');
    render(<LoginPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /could not verify/i,
    );
  });

  it('shows the unverified message on ?error=unverified (initial state)', () => {
    setSearchParams('error=unverified');
    render(<LoginPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/not verified/i);
  });
});

describe('LoginPage — Google sign-in', () => {
  it('calls signIn("google", { callbackUrl: "/" }) by default', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(
      screen.getByRole('button', { name: /continue with google/i }),
    );
    expect(signIn).toHaveBeenCalledWith('google', { callbackUrl: '/' });
  });

  it('forwards ?from= to the Google callbackUrl', async () => {
    setSearchParams('from=%2Faccount');
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(
      screen.getByRole('button', { name: /continue with google/i }),
    );
    expect(signIn).toHaveBeenCalledWith('google', {
      callbackUrl: '/account',
    });
  });
});
