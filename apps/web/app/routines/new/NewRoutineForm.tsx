/**
 * NewRoutineForm — client island for the /routines/new page.
 *
 * Why split out: the page (server component) needs to fetch the user's
 * existing distinct categories + locations to seed the `<datalist>`
 * suggestions on the Category / Location inputs. The form itself is
 * client-side (controlled inputs + submit handler).
 *
 * Submit POSTs to /api/routines. Empty `description` / `category` / `location`
 * are omitted from the body — the server's zod schema also normalizes empty
 * strings to null, so this is belt-and-suspenders. 50-char cap on each label
 * is enforced via `maxLength` and re-checked client-side before submit.
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

export type NewRoutineFormProps = {
  /** Distinct existing categories on the user's routines, for `<datalist>` suggestions. */
  categorySuggestions: string[];
  /** Distinct existing locations on the user's routines, for `<datalist>` suggestions. */
  locationSuggestions: string[];
};

export function NewRoutineForm({
  categorySuggestions,
  locationSuggestions,
}: NewRoutineFormProps) {
  const router = useRouter();

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  // Initialize lazily so we don't read browser APIs during SSR snapshot.
  // `useState` initializer runs once on the client.
  const [timezone, setTimezone] = React.useState<string>(() =>
    typeof window === 'undefined' ? 'UTC' : resolveBrowserTimezone(),
  );
  const [category, setCategory] = React.useState('');
  const [location, setLocation] = React.useState('');

  const [submitting, setSubmitting] = React.useState(false);
  const [bannerError, setBannerError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});

  // Stable list ids so multiple form instances on a page (shouldn't happen
  // but defensive) wouldn't collide. React.useId works in SSR + client.
  const reactId = React.useId();
  const categoryListId = `cat-suggestions-${reactId}`;
  const locationListId = `loc-suggestions-${reactId}`;

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
          // Omit empty category/location — the server treats absent as "leave
          // unset" and would also coerce '' → null, so this is just cleaner
          // wire shape.
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

        {/* Category — free-text + datalist of the user's existing values. */}
        <TextField
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          maxLength={50}
          autoComplete="off"
          hint="Optional. Used to group your routines."
          error={fieldErrors.category}
          // `list` is a native input attribute. TextField forwards unknown
          // props onto the underlying <input>.
          list={categoryListId}
        />

        {/* Location — same shape as category. */}
        <TextField
          label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={50}
          autoComplete="off"
          hint="Optional. Where does this routine happen?"
          error={fieldErrors.location}
          list={locationListId}
        />

        {/* Datalists — native HTML, no library. Rendered even when empty so
            the input keeps its "with suggestions" affordance for screen
            readers. */}
        <datalist id={categoryListId}>
          {categorySuggestions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id={locationListId}>
          {locationSuggestions.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>

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
