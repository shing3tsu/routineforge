/**
 * New routine page — client component (form has state).
 *
 * Form fields:
 *   - name (required, 1..100)
 *   - description (optional, ≤500)
 *   - timezone (default: browser-resolved via Intl.DateTimeFormat; overrideable
 *     via text field — validated server-side as a real IANA timezone).
 *
 * Submit POSTs to /api/routines. On success we navigate to /routines/:id.
 * On 400 validation_error we map issues to per-field errors. On other errors
 * we show a banner.
 */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

type FieldErrors = Partial<{
  name: string;
  description: string;
  timezone: string;
  category: string;
  location: string;
}>;

function resolveBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.length > 0 ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

export default function NewRoutinePage() {
  const router = useRouter();

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [location, setLocation] = React.useState('');
  // Initialize lazily so we don't read browser APIs during SSR snapshot.
  // `useState` initializer runs once on the client.
  const [timezone, setTimezone] = React.useState<string>(() =>
    typeof window === 'undefined' ? 'UTC' : resolveBrowserTimezone(),
  );

  const [submitting, setSubmitting] = React.useState(false);
  const [bannerError, setBannerError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setBannerError(null);
    setFieldErrors({});

    const trimmedName = name.trim();
    const trimmedDesc = description.trim();
    const trimmedTz = timezone.trim();
    const trimmedCategory = category.trim();
    const trimmedLocation = location.trim();

    // Light client-side checks; server is authoritative.
    const clientErrors: FieldErrors = {};
    if (trimmedName.length === 0) {
      clientErrors.name = 'Name is required.';
    } else if (trimmedName.length > 100) {
      clientErrors.name = 'Name must be 100 characters or fewer.';
    }
    if (trimmedDesc.length > 500) {
      clientErrors.description = 'Description must be 500 characters or fewer.';
    }
    if (trimmedTz.length === 0) {
      clientErrors.timezone = 'Timezone is required.';
    }
    if (trimmedCategory.length > 50) {
      clientErrors.category = 'Category must be 50 characters or fewer.';
    }
    if (trimmedLocation.length > 50) {
      clientErrors.location = 'Location must be 50 characters or fewer.';
    }
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description: trimmedDesc.length > 0 ? trimmedDesc : undefined,
          timezone: trimmedTz,
          category: trimmedCategory.length > 0 ? trimmedCategory : undefined,
          location: trimmedLocation.length > 0 ? trimmedLocation : undefined,
        }),
      });

      // 401 — session expired or never logged in. Send to login with return-to.
      if (res.status === 401) {
        router.push('/login?from=/routines/new');
        return;
      }

      const data = (await res.json().catch(() => null)) as
        | {
            ok: boolean;
            routine?: { id: string };
            error?: string;
            message?: string;
            issues?: {
              fieldErrors?: Record<string, string[]>;
              formErrors?: string[];
            };
          }
        | null;

      if (!res.ok || !data?.ok) {
        if (data?.error === 'validation_error' && data.issues?.fieldErrors) {
          const fe = data.issues.fieldErrors;
          const mapped: FieldErrors = {};
          if (fe.name?.[0]) mapped.name = fe.name[0];
          if (fe.description?.[0]) mapped.description = fe.description[0];
          if (fe.timezone?.[0]) mapped.timezone = fe.timezone[0];
          if (fe.category?.[0]) mapped.category = fe.category[0];
          if (fe.location?.[0]) mapped.location = fe.location[0];
          setFieldErrors(mapped);
          if (Object.keys(mapped).length === 0 && data.issues.formErrors?.[0]) {
            setBannerError(data.issues.formErrors[0]);
          }
          return;
        }
        setBannerError(
          data?.message ?? 'Could not create routine. Please try again.',
        );
        return;
      }

      const newId = data.routine?.id;
      if (!newId) {
        setBannerError('Created the routine but no id was returned.');
        return;
      }
      router.push(`/routines/${newId}`);
    } catch {
      setBannerError(
        'Could not reach the server. Check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.main}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link href="/routines" className={styles.crumbLink}>
          Routines
        </Link>
        <span className={styles.crumbSep} aria-hidden="true">
          /
        </span>
        <span className={styles.crumbCurrent}>New routine</span>
      </nav>

      <header className={styles.pageHead}>
        <h1>New routine</h1>
        <p>
          Give it a name, then add steps for each weekday on the next screen.
        </p>
      </header>

      {bannerError ? (
        <div className={styles.alertWrap}>
          <Alert variant="danger" title="Could not create routine">
            {bannerError}
          </Alert>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <TextField
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="e.g. Morning routine"
          autoComplete="off"
          autoFocus
          error={fieldErrors.name}
        />

        <TextField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          placeholder="Optional. What is this routine for?"
          hint="Optional. Keep it short."
          error={fieldErrors.description}
        />

        <TextField
          label="Timezone"
          required
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="e.g. America/Los_Angeles"
          hint={`Detected from your browser. IANA names like "Europe/London" or "Asia/Tokyo".`}
          error={fieldErrors.timezone}
          autoComplete="off"
          spellCheck={false}
        />

        <TextField
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          maxLength={50}
          placeholder="e.g. Wellness, Fitness, Work"
          hint="Optional. Used to group routines."
          error={fieldErrors.category}
          autoComplete="off"
        />

        <TextField
          label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={50}
          placeholder="e.g. home, gym, office"
          hint="Optional. Where this routine happens."
          error={fieldErrors.location}
          autoComplete="off"
        />

        <div className={styles.actions}>
          <Link href="/routines" className={styles.cancelLink}>
            Cancel
          </Link>
          <Button type="submit" loading={submitting}>
            Create routine
          </Button>
        </div>
      </form>
    </main>
  );
}
