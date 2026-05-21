/**
 * NextAuth v5 — full configuration (Node runtime only).
 *
 * Strategy: JWT (sessions are not stored in the DB; the sessions table exists
 * for forward flexibility).
 *
 * Providers:
 *   - Credentials (email + bcrypt-hashed password). Rejects unverified users.
 *   - Google OAuth (only enabled when AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are set).
 *
 * Adapter: Drizzle adapter for user / account / verification token persistence.
 *
 * Why two files: middleware.ts runs on the Edge runtime, which can't load
 * `pg` / `bcryptjs`. The Edge-safe slice lives in `auth.config.ts`. This file
 * extends it for the Node runtime (API routes, server components).
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { authConfig } from './auth.config';
import { db } from '@/db';
import { users, accounts, sessions, verificationTokens } from '@/db/schema';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const googleEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Credentials({
      name: 'Email + password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);

        if (!user || !user.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          // Pass verification status through the user object so signIn can
          // reject unverified Credentials logins.
          emailVerified: user.emailVerified,
        };
      },
    }),
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
            allowDangerousEmailAccountLinking: false,
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      // Google OAuth: always allow — Google has verified the address.
      if (account?.provider === 'google') return true;

      // Credentials: require emailVerified.
      if (account?.provider === 'credentials') {
        const verified = (user as { emailVerified?: Date | null }).emailVerified;
        if (!verified) return '/login?error=unverified';
        return true;
      }

      return true;
    },
  },
});
