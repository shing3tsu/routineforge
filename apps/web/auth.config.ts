/**
 * Edge-safe NextAuth config.
 *
 * This file MUST NOT import the Drizzle adapter, the pg driver, bcryptjs, or
 * anything else that pulls in Node-only APIs. Next.js middleware runs on the
 * Edge runtime by default, and `auth()` calls in middleware.ts dereference
 * this config.
 *
 * The full config (with adapter + Credentials.authorize) lives in `auth.ts`
 * and extends this one.
 */

import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  // No providers here — middleware only needs jwt/session callbacks for
  // session resolution. Real providers are added in auth.ts.
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // `user.id` is set by either the Credentials authorize() or the
        // DrizzleAdapter on OAuth signup. Persist it on the JWT so the
        // session callback can expose it.
        token.id = (user as { id?: string }).id ?? token.sub ?? token.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id && session.user) {
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
    // Restrict middleware-level access here (cheaper than running auth()
    // in middleware). middleware.ts does its own redirect — this just
    // signals "user is authorized" / "is not".
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
};
