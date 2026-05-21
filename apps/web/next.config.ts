import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // - `web-push` is a Node-only library (uses `https`, `crypto`, etc.).
  //   Mark it external so Next.js doesn't try to bundle it for the Edge
  //   runtime when our `instrumentation.ts` is statically analysed.
  // - `@electric-sql/pglite` is dev-only (the dev fallback path in
  //   `db/index.ts` when `DATABASE_URL` is unset). It ships several MB of
  //   WASM and a custom Node-fs adapter; bundling it bloats the production
  //   server output for a branch prod never takes. External keeps it as a
  //   plain `require()` at runtime, which the prod path never executes.
  // - `pg`, `@auth/drizzle-adapter`, `drizzle-orm`, `bcryptjs`: keep these
  //   out of the Next 15 dev Jest worker that analyses route paths. When
  //   the `[...nextauth]` catch-all route was statically analysed, the
  //   worker pulled the entire `@/auth` import chain (drizzle adapter +
  //   pg Pool) and crashed, EPIPE-cascading every auth subroute to HTML
  //   500. Externalising them — combined with `force-dynamic` on the
  //   auth routes — keeps them out of the worker's analysis bundle.
  serverExternalPackages: [
    "web-push",
    "@electric-sql/pglite",
    "pg",
    "@auth/drizzle-adapter",
    "drizzle-orm",
    "bcryptjs",
  ],
  // Test-affordance only: `RF_NEXT_DIST_DIR` redirects the build/dev
  // output folder so a Playwright E2E `next dev` can coexist with the
  // user's foreground `next dev` (otherwise both processes contend for
  // `.next/trace` and one fails with EPERM on Windows). Production and
  // normal dev leave this unset and keep using the default `.next`.
  ...(process.env.RF_NEXT_DIST_DIR
    ? { distDir: process.env.RF_NEXT_DIST_DIR }
    : {}),
};

export default nextConfig;
