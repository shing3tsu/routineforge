/**
 * Next.js instrumentation hook — runs once on server startup (both `next dev`
 * and `next build`-then-serve).
 *
 * Currently used to bootstrap the in-process push dispatcher when
 * `NODE_ENV !== 'production'`. In prod, Vercel Cron hits the dispatch
 * endpoint instead, so this is a no-op there.
 *
 * Why the positive `if (process.env.NEXT_RUNTIME === 'nodejs')` form: Next.js
 * `DefinePlugin`-substitutes `process.env.NEXT_RUNTIME` per bundle ('nodejs'
 * in the Node bundle, 'edge' in the Edge bundle). With the constant folded,
 * the entire body — including the dynamic `import(...)` — becomes
 * unreachable in the Edge bundle and webpack tree-shakes it away. That keeps
 * `web-push` (a Node-only module reached transitively via `dev-scheduler ->
 * dispatcher`) out of the Edge bundle without needing the
 * `new Function('return import(p)')` indirection (which previously caused
 * `ERR_MODULE_NOT_FOUND` at dev startup because the indirect path was opaque
 * to webpack and `dev-scheduler` never got emitted under `.next/server`).
 *
 * `web-push` is also marked in `serverExternalPackages` (`next.config.ts`)
 * so the Node bundle leaves it as a runtime `require`.
 *
 * Per Next.js docs (https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation),
 * `register()` is the canonical hook.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Skip during `next build` static analysis — the dispatcher reads
    // DATABASE_URL on first tick, which won't be set in build sandboxes.
    if (process.env.NEXT_PHASE === 'phase-production-build') return;

    const mod = await import('./lib/push/dev-scheduler');
    mod.startDevScheduler();
  }
}
