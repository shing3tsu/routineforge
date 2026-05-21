/**
 * Empty shim for Next.js's `server-only` package.
 *
 * In production, `import 'server-only'` is a build-time poison that errors if
 * the module is bundled into a client chunk. In Vitest we don't run a Next.js
 * bundler, so the package isn't installed (it's a peer of next) and the import
 * fails to resolve. We alias it to this empty module via `vitest.config.ts` so
 * server-only files like `lib/auth/owner.ts` load in tests without polluting
 * the source with test-aware conditionals.
 */
export {};
