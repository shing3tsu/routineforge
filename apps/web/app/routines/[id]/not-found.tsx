/**
 * Routine not-found page. Rendered when `getRoutineForUser` returns null —
 * either the routine doesn't exist or it's not owned by the user.
 *
 * Per the API contract, we deliberately don't distinguish these cases.
 */
import * as React from 'react';
import Link from 'next/link';
import styles from './not-found.module.css';

export default function RoutineNotFound() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Routine not found</h1>
      <p className={styles.body}>
        We couldn&apos;t find a routine at this address. It may have been
        deleted, or you may not have access to it.
      </p>
      <Link href="/routines" className={styles.cta}>
        Back to routines
      </Link>
    </main>
  );
}
