/**
 * New habit page — client component (form has state + segmented control + per-
 * cadence sub-controls).
 *
 * Form fields:
 *   - name (required, 1..100)
 *   - description (optional, ≤500)
 *   - timezone (default: browser-resolved via Intl.DateTimeFormat)
 *   - cadence kind (Daily / N per week / Specific weekdays)
 *     - Daily: no sub-fields
 *     - Weekly count: perWeek (1..7), weekStart (default Monday)
 *     - Specific weekdays: WeekdayChips picker
 *
 * Submit POSTs to /api/habits. On 201 we redirect to /habits/[id].
 * On 400 validation_error we map issues to per-field errors. Other errors -> banner.
 */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { WeekdayChips } from '@/components/ui/WeekdayChips';
import type { HabitCadence } from '@/db/schema';
import styles from './page.module.css';

type CadenceKind = 'daily' | 'weekly_count' | 'specific_weekdays';

type FieldErrors = Partial<{
  name: string;
  description: string;
  timezone: string;
  cadence: string;
  category: string;
  location: string;
}>;

const WEEKDAY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
];

function resolveBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.length > 0 ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

export default function NewHabitPage() {
  const router = useRouter();

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [timezone, setTimezone] = React.useState<string>(() =>
    typeof window === 'undefined' ? 'UTC' : resolveBrowserTimezone(),
  );

  // Cadence state
  const [cadenceKind, setCadenceKind] = React.useState<CadenceKind>('daily');
  const [perWeek, setPerWeek] = React.useState<number>(3);
  const [weekStart, setWeekStart] = React.useState<number>(0); // Monday
  const [weekdays, setWeekdays] = React.useState<number[]>([0, 2, 4]); // Mon / Wed / Fri default

  const [submitting, setSubmitting] = React.useState(false);
  const [bannerError, setBannerError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});

  function buildCadence(): { ok: true; cadence: HabitCadence } | { ok: false; error: string } {
    if (cadenceKind === 'daily') {
      return { ok: true, cadence: { kind: 'daily' } };
    }
    if (cadenceKind === 'weekly_count') {
      if (!Number.isInteger(perWeek) || perWeek < 1 || perWeek > 7) {
        return { ok: false, error: 'Choose how many times per week (1–7).' };
      }
      return {
        ok: true,
        cadence: { kind: 'weekly_count', perWeek, weekStart },
      };
    }
    // specific_weekdays
    if (weekdays.length === 0) {
      return { ok: false, error: 'Pick at least one weekday.' };
    }
    return {
      ok: true,
      cadence: {
        kind: 'specific_weekdays',
        weekdays: [...weekdays].sort((a, b) => a - b),
      },
    };
  }

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
    const cadenceResult = buildCadence();
    if (!cadenceResult.ok) {
      clientErrors.cadence = cadenceResult.error;
    }
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description: trimmedDesc.length > 0 ? trimmedDesc : undefined,
          timezone: trimmedTz,
          cadence: cadenceResult.ok ? cadenceResult.cadence : undefined,
          category: trimmedCategory.length > 0 ? trimmedCategory : undefined,
          location: trimmedLocation.length > 0 ? trimmedLocation : undefined,
        }),
      });

      if (res.status === 401) {
        router.push('/login?from=/habits/new');
        return;
      }

      const data = (await res.json().catch(() => null)) as
        | {
            ok: boolean;
            habit?: { id: string };
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
          if (fe.cadence?.[0]) mapped.cadence = fe.cadence[0];
          if (fe.category?.[0]) mapped.category = fe.category[0];
          if (fe.location?.[0]) mapped.location = fe.location[0];
          setFieldErrors(mapped);
          if (Object.keys(mapped).length === 0 && data.issues.formErrors?.[0]) {
            setBannerError(data.issues.formErrors[0]);
          }
          return;
        }
        setBannerError(
          data?.message ?? 'Could not create habit. Please try again.',
        );
        return;
      }

      const newId = data.habit?.id;
      if (!newId) {
        setBannerError('Created the habit but no id was returned.');
        return;
      }
      router.push(`/habits/${newId}`);
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
        <Link href="/habits" className={styles.crumbLink}>
          Habits
        </Link>
        <span className={styles.crumbSep} aria-hidden="true">
          /
        </span>
        <span className={styles.crumbCurrent}>New habit</span>
      </nav>

      <header className={styles.pageHead}>
        <h1>New habit</h1>
        <p>Pick something small you&apos;d like to repeat.</p>
      </header>

      {bannerError ? (
        <div className={styles.alertWrap}>
          <Alert variant="danger" title="Could not create habit">
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
          placeholder="e.g. Drink 2L water"
          autoComplete="off"
          autoFocus
          error={fieldErrors.name}
        />

        <TextField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          placeholder="Optional. Why does this matter to you?"
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

        {/* Cadence ----------------------------------------------------------- */}
        <fieldset className={styles.cadence}>
          <legend className={styles.cadenceLegend}>Cadence</legend>
          <div
            role="radiogroup"
            aria-label="Cadence kind"
            className={styles.segmented}
          >
            {(
              [
                { value: 'daily', label: 'Daily' },
                { value: 'weekly_count', label: 'N per week' },
                { value: 'specific_weekdays', label: 'Specific weekdays' },
              ] as ReadonlyArray<{ value: CadenceKind; label: string }>
            ).map((opt) => {
              const selected = opt.value === cadenceKind;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={[
                    styles.segment,
                    selected && styles.segmentSelected,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setCadenceKind(opt.value)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Per-kind sub-controls */}
          {cadenceKind === 'daily' ? (
            <p className={styles.cadenceHint}>Due every day. Simple.</p>
          ) : null}

          {cadenceKind === 'weekly_count' ? (
            <div className={styles.weeklyRow}>
              <label className={styles.subLabel}>
                <span>Times per week</span>
                <input
                  type="number"
                  min={1}
                  max={7}
                  step={1}
                  value={perWeek}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    if (Number.isFinite(n)) setPerWeek(n);
                  }}
                  className={styles.numberInput}
                  inputMode="numeric"
                  aria-label="Times per week (1 to 7)"
                />
              </label>
              <label className={styles.subLabel}>
                <span>Week starts on</span>
                <select
                  className={styles.select}
                  value={weekStart}
                  onChange={(e) => setWeekStart(Number(e.target.value))}
                  aria-label="Week starts on"
                >
                  {WEEKDAY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {cadenceKind === 'specific_weekdays' ? (
            <div className={styles.weekdaysRow}>
              <span id="cadence-weekday-label" className={styles.subLabel}>
                Which days
              </span>
              <WeekdayChips
                selected={weekdays}
                onChange={setWeekdays}
                aria-labelledby="cadence-weekday-label"
              />
            </div>
          ) : null}

          {fieldErrors.cadence ? (
            <div className={styles.cadenceError} role="alert">
              {fieldErrors.cadence}
            </div>
          ) : null}
        </fieldset>

        <TextField
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          maxLength={50}
          placeholder="e.g. Wellness, Mind, Fitness"
          hint="Optional. Used to group habits."
          error={fieldErrors.category}
          autoComplete="off"
        />

        <TextField
          label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={50}
          placeholder="e.g. home, gym, anywhere"
          hint="Optional. Where this happens."
          error={fieldErrors.location}
          autoComplete="off"
        />

        <div className={styles.actions}>
          <Link href="/habits" className={styles.cancelLink}>
            Cancel
          </Link>
          <Button type="submit" loading={submitting}>
            Create habit
          </Button>
        </div>
      </form>
    </main>
  );
}
