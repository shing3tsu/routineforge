/**
 * Habit not-found page. Rendered when `getHabitDetail` returns null —
 * either the habit doesn't exist or it's not owned by the user.
 *
 * Per the API contract, we deliberately don't distinguish these cases.
 */
import * as React from 'react';
import Link from 'next/link';
import styles from './not-found.module.css';

export default function HabitNotFound() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Habit not found</h1>
      <p className={styles.body}>
        We couldn&apos;t find a habit at this address. It may have been
        deleted, or you may not have access to it.
      </p>
      <Link href="/habits" className={styles.cta}>
        Back to habits
      </Link>
    </main>
  );
}
