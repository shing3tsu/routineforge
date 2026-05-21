// @vitest-environment jsdom
/**
 * Signup page tests.
 *
 * The page is a client component that:
 *   - reads `?from=` to compute callbackUrl for the Google button
 *   - POSTs to /api/auth/signup
 *   - on 200, shows the neutral "Check your inbox" state (enumeration defence)
 *   - on 4xx/5xx, surfaces a friendly error in a role="alert" banner
 *
 * We mock next-auth/react and next/navigation. fetch is stubbed per-test via
 * vi.stubGlobal so we can control success / failure / latency. We avoid MSW
 * here — for two pages with a single endpoint each, stubGlobal is lighter and
 * has no extra runtime to boot.
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signIn = vi.fn();
vi.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

const searchParamsRef: { current: URLSearchParams } = {
  current: new URLSearchParams(),
};
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsRef.current,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import SignupPage from '@/app/(auth)/signup/page';

function setSearchParams(qs: string) {
  searchParamsRef.current = new URLSearchParams(qs);
}

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  signIn.mockReset();
  setSearchParams('');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SignupPage — rendering', () => {
  it('renders the form (name, email, password) and a submit button', () => {
    render(<SignupPage />);
    expect(
      screen.getByRole('heading', { name: /create your account/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create account/i }),
    ).toBeInTheDocument();
  });

  it('renders the Continue with Google button', () => {
    render(<SignupPage />);
    expect(
      screen.getByRole('button', { name: /continue with google/i }),
    ).toBeInTheDocument();
  });
});

describe('SignupPage — successful submission', () => {
  it('POSTs email + password (and optional name) to /api/auth/signup', async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchSpy);

    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/name/i), 'Alice');
    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'longenoughpw');
    await user.click(
      screen.getByRole('button', { name: /create account/i }),
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/auth/signup');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(init!.body as string) as Record<string, string>;
    expect(body).toEqual({
      email: 'alice@example.com',
      password: 'longenoughpw',
      name: 'Alice',
    });
  });

  it('omits name from the body when the name field is empty', async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchSpy);

    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'longenoughpw');
    await user.click(
      screen.getByRole('button', { name: /create account/i }),
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      fetchSpy.mock.calls[0]![1]!.body as string,
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty('name');
  });

  it('shows the neutral "Check your inbox" state on 200 with the email echoed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse(200, { ok: true })),
    );

    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'longenoughpw');
    await user.click(
      screen.getByRole('button', { name: /create account/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /check your inbox/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    // The success banner is a role="status" (non-assertive) per the source.
    expect(screen.getByRole('status')).toHaveTextContent(
      /verification link/i,
    );
  });

  it('shows the SAME neutral state even when the email already exists (enumeration defence)', async () => {
    // The signup API returns 200 regardless of whether the email exists, so the
    // UI must not differentiate. This test guards against any future change
    // that might leak existence by branching on the response body.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(makeResponse(200, { ok: true, _existing: true })),
    );

    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/email/i), 'existing@example.com');
    await user.type(screen.getByLabelText(/password/i), 'longenoughpw');
    await user.click(
      screen.getByRole('button', { name: /create account/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /check your inbox/i }),
      ).toBeInTheDocument(),
    );
    // Crucial: no text leaking "this email is already registered" / "in use"
    // / "exists" must surface. (We allow "Already verified? Sign in" in the
    // post-success footer — it's a navigation prompt, not an enumeration leak,
    // so we scope the search to the status banner.)
    const banner = screen.getByRole('status');
    expect(banner.textContent ?? '').not.toMatch(/already exists/i);
    expect(banner.textContent ?? '').not.toMatch(/in use/i);
    expect(banner.textContent ?? '').not.toMatch(/already registered/i);
  });
});

describe('SignupPage — error handling', () => {
  it('shows a role="alert" banner on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));

    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'longenoughpw');
    await user.click(
      screen.getByRole('button', { name: /create account/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/network error/i),
    );
  });

  it('shows the first field-error message from the API on 400 validation_error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse(400, {
          ok: false,
          error: 'validation_error',
          issues: {
            fieldErrors: {
              password: ['Password must be at least 8 characters.'],
            },
          },
        }),
      ),
    );

    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(
      screen.getByRole('button', { name: /create account/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /at least 8 characters/i,
      ),
    );
  });

  it('shows a generic message on 5xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse(500, { ok: false })),
    );

    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'longenoughpw');
    await user.click(
      screen.getByRole('button', { name: /create account/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /something went wrong/i,
      ),
    );
  });
});

describe('SignupPage — pending state', () => {
  it('marks the submit button aria-busy while the request is in flight', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(fetchPromise));

    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'longenoughpw');
    const btn = screen.getByRole('button', { name: /create account/i });
    await user.click(btn);

    expect(btn).toHaveAttribute('aria-busy', 'true');

    // Let the fetch resolve so the test can exit cleanly.
    resolveFetch(makeResponse(200, { ok: true }));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /check your inbox/i }),
      ).toBeInTheDocument(),
    );
  });
});

describe('SignupPage — Google sign-in', () => {
  it('calls signIn("google", { callbackUrl: "/" }) by default', async () => {
    const user = userEvent.setup();
    render(<SignupPage />);
    await user.click(
      screen.getByRole('button', { name: /continue with google/i }),
    );
    expect(signIn).toHaveBeenCalledWith('google', { callbackUrl: '/' });
  });

  it('forwards ?from= as the callbackUrl', async () => {
    setSearchParams('from=%2Faccount');
    const user = userEvent.setup();
    render(<SignupPage />);
    await user.click(
      screen.getByRole('button', { name: /continue with google/i }),
    );
    expect(signIn).toHaveBeenCalledWith('google', {
      callbackUrl: '/account',
    });
  });
});
