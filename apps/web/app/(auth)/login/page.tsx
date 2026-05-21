/**
 * Login page. Client component.
 *
 * Match `design/mockups/login.html`. Calls `signIn('credentials', …,
 * { redirect: false })` so we can surface auth errors inline rather than
 * letting NextAuth bounce to `/login?error=…`.
 *
 * Query-param behaviour driven by upstream redirects:
 *   - `?verified=1`         success banner after the user clicks the email
 *                           verification link.
 *   - `?verified=0&reason=` destructive banner; reason mapped to a friendly
 *                           message.
 *   - `?from=`              forwarded as the post-login `callbackUrl`.
 *
 * The `unverified` Credentials error originates from the `signIn` callback in
 * `auth.ts`, which redirects to `/login?error=unverified`. We translate it
 * client-side here. Other failures (bad password, missing user) collapse into
 * a single generic "Invalid credentials" message — by design we never reveal
 * whether the email exists.
 */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import styles from '../auth-form.module.css';

type FormState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

const VERIFY_REASON_COPY: Record<string, string> = {
  invalid_token:
    'That verification link is no longer valid. Request a new one by signing up again.',
  expired:
    'That verification link expired. Request a new one by signing up again.',
  bad_request: 'That verification link is malformed.',
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from');
  const callbackUrl = from ?? '/';

  const verified = searchParams.get('verified');
  const verifyReason = searchParams.get('reason') ?? undefined;
  const upstreamError = searchParams.get('error') ?? undefined;

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [state, setState] = React.useState<FormState>(() => {
    if (upstreamError === 'unverified') {
      return {
        kind: 'error',
        message: 'Email not verified — check your inbox.',
      };
    }
    return { kind: 'idle' };
  });

  const submitting = state.kind === 'submitting';
  const formError = state.kind === 'error' ? state.message : undefined;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setState({ kind: 'submitting' });

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (!result) {
        setState({
          kind: 'error',
          message: 'Something went wrong. Please try again.',
        });
        return;
      }

      if (result.error) {
        // NextAuth conflates "wrong password" and "unknown user" into the same
        // CredentialsSignin error — we intentionally do the same in UI. The
        // verification check redirects via the signIn callback, so it surfaces
        // through the `error` URL param (decoded by next-auth as `result.error`
        // when `redirect: false` is set).
        let message: string;
        if (result.error === 'unverified') {
          message = 'Email not verified — check your inbox.';
        } else if (result.error === 'CredentialsSignin') {
          message = 'Invalid credentials';
        } else {
          message = 'Invalid credentials';
        }
        setState({ kind: 'error', message });
        return;
      }

      router.push(result.url ?? callbackUrl);
      router.refresh();
    } catch {
      setState({
        kind: 'error',
        message: 'Network error. Check your connection and try again.',
      });
    }
  }

  return (
    <>
      <div className={`rf-eyebrow ${styles.eyebrow}`}>sign in</div>
      <h1 className={styles.title}>Welcome back</h1>
      <p className={styles.sub}>
        Pick up where you left off — sign in to your routines and habits.
      </p>

      {verified === '1' ? (
        <div
          className={`${styles.banner} ${styles['banner-success']}`}
          role="status"
        >
          <span>Email verified. You can sign in now.</span>
        </div>
      ) : null}

      {verified === '0' ? (
        <div
          className={`${styles.banner} ${styles['banner-danger']}`}
          role="alert"
        >
          <span>
            {(verifyReason && VERIFY_REASON_COPY[verifyReason]) ??
              'We could not verify that link.'}
          </span>
        </div>
      ) : null}

      {formError ? (
        <div
          className={`${styles.banner} ${styles['banner-danger']}`}
          role="alert"
        >
          <span>{formError}</span>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          disabled={submitting}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="Your password"
          value={password}
          disabled={submitting}
          onChange={(e) => setPassword(e.target.value)}
          labelAction={
            <Link href="/login" className={styles.forgot}>
              Forgot?
            </Link>
          }
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
          className={styles.submit}
        >
          Sign in
        </Button>
      </form>

      <div className={styles.divider}>or</div>

      <Button
        type="button"
        variant="secondary"
        size="lg"
        fullWidth
        disabled={submitting}
        onClick={() => void signIn('google', { callbackUrl })}
      >
        <GoogleIcon />
        <span>Continue with Google</span>
      </Button>

      <p className={styles.footer}>
        New here?{' '}
        <Link
          href={from ? `/signup?from=${encodeURIComponent(from)}` : '/signup'}
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
