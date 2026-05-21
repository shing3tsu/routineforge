/**
 * Signup page. Client component (needs local form state).
 *
 * Match `design/mockups/signup.html`. Submits `email + password (+ optional
 * name)` to `POST /api/auth/signup`. Per the design + the route handler
 * contract: ALWAYS show the same neutral "check your inbox" success state on
 * HTTP 200, regardless of whether the email already exists — this is the
 * enumeration defence baked into the API.
 *
 * In development we also show a small hint that the verification link is
 * printed to the server console (the route handler logs it via `console.log`).
 *
 * Google auth uses `signIn('google', { callbackUrl: from ?? '/' })`. The
 * `?from=` query param is forwarded so the post-login destination matches the
 * one the middleware appended when it bounced the user here.
 */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import styles from '../auth-form.module.css';

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export default function SignupPage() {
  const searchParams = useSearchParams();
  const from = searchParams.get('from');
  const callbackUrl = from ?? '/';

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [name, setName] = React.useState('');
  const [state, setState] = React.useState<SubmitState>({ kind: 'idle' });

  const submitting = state.kind === 'submitting';
  const succeeded = state.kind === 'success';
  const formError = state.kind === 'error' ? state.message : undefined;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || succeeded) return;
    setState({ kind: 'submitting' });

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(name.trim() ? { name: name.trim() } : {}),
        }),
      });

      if (res.ok) {
        setState({ kind: 'success' });
        return;
      }

      // Validation failures from the API: surface a short message. We do NOT
      // expose whether the email exists — the server returns 200 in that case.
      let message = 'Something went wrong. Please try again.';
      try {
        const body = (await res.json()) as {
          error?: string;
          issues?: { fieldErrors?: Record<string, string[]> };
        };
        if (body.issues?.fieldErrors) {
          const first = Object.values(body.issues.fieldErrors).flat()[0];
          if (typeof first === 'string') message = first;
        } else if (body.error === 'invalid_json') {
          message = 'Invalid request.';
        }
      } catch {
        // fall through with default message
      }
      setState({ kind: 'error', message });
    } catch {
      setState({
        kind: 'error',
        message: 'Network error. Check your connection and try again.',
      });
    }
  }

  if (succeeded) {
    return (
      <>
        <div className={`rf-eyebrow ${styles.eyebrow}`}>almost there</div>
        <h1 className={styles.title}>Check your inbox</h1>
        <p className={styles.sub}>
          We sent a verification link to <strong>{email}</strong>. Click the
          link to finish setting up your account.
        </p>
        <div
          className={`${styles.banner} ${styles['banner-info']}`}
          role="status"
        >
          <span>
            Check your inbox for a verification link.
            {process.env.NODE_ENV !== 'production' ? (
              <span className={styles.devHint}>
                In development, the link is also printed to the server console.
              </span>
            ) : null}
          </span>
        </div>
        <p className={styles.footer}>
          Already verified? <Link href="/login">Sign in</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <div className={`rf-eyebrow ${styles.eyebrow}`}>start the quiet streak</div>
      <h1 className={styles.title}>Create your account</h1>
      <p className={styles.sub}>
        Build routines, track habits, and stay on it from any device.
      </p>

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
          label="Name"
          type="text"
          autoComplete="name"
          placeholder="Optional"
          value={name}
          disabled={submitting}
          onChange={(e) => setName(e.target.value)}
        />
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
          autoComplete="new-password"
          required
          placeholder="At least 12 characters"
          hint="12+ characters. Use a passphrase if you can."
          value={password}
          disabled={submitting}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
          className={styles.submit}
        >
          Create account
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
        Already have an account?{' '}
        <Link href={from ? `/login?from=${encodeURIComponent(from)}` : '/login'}>
          Sign in
        </Link>
      </p>
      <p className={styles.legal}>
        By creating an account, you agree to our Terms and Privacy Policy.
      </p>
    </>
  );
}
