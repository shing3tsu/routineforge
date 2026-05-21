/**
 * LogoutButton — wraps `signOut` from `next-auth/react` in the shared Button
 * primitive. Lives in `components/auth/` because it has a client-side
 * dependency (next-auth's `signOut`) that the account page (a server
 * component) must hand off to a client island.
 *
 * Uses `variant="ghost"` per spec.
 */
'use client';

import * as React from 'react';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/Button';

export type LogoutButtonProps = {
  callbackUrl?: string;
  children?: React.ReactNode;
};

export function LogoutButton({
  callbackUrl = '/',
  children = 'Sign out',
}: LogoutButtonProps) {
  const [pending, setPending] = React.useState(false);

  return (
    <Button
      variant="ghost"
      type="button"
      loading={pending}
      onClick={() => {
        setPending(true);
        void signOut({ callbackUrl });
      }}
    >
      {children}
    </Button>
  );
}
