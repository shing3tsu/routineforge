/**
 * Server-side theme + palette resolution.
 *
 * We render `<html data-palette="..." data-theme="...">` on the server so there
 * is NEVER a flash of the wrong palette. The rules:
 *
 *   1. Palette: read `rf_palette` cookie. Defaults to `'graphite'` (the
 *      ship default palette — true neutral + plum). `data-palette` is ALWAYS
 *      set on `<html>` — the new tokens.css does not declare a `:root`
 *      fallback for palette colors, so omitting `data-palette` leaves every
 *      `--c-*` variable undefined.
 *   2. Theme: read `rf_theme` cookie. If the user has explicitly chosen a
 *      theme, the cookie value (`light` | `dark`) wins and `data-theme` is
 *      set on `<html>`. If the cookie is absent, we leave `data-theme` unset
 *      and let CSS `prefers-color-scheme` decide via tokens.css selectors
 *      that match `[data-palette="X"]:not([data-theme="dark"])`.
 *
 * A future palette/theme picker (account page) will write these cookies. The
 * UI itself is intentionally out of scope here — only the infrastructure
 * ships now.
 */
import 'server-only';
import { cookies } from 'next/headers';

export type ResolvedTheme = 'light' | 'dark';
export type ThemeChoice = ResolvedTheme | null;

export type Palette = 'bone' | 'fog' | 'sage' | 'graphite';

const THEME_COOKIE = 'rf_theme';
const PALETTE_COOKIE = 'rf_palette';

const PALETTES: ReadonlyArray<Palette> = ['bone', 'fog', 'sage', 'graphite'];

const DEFAULT_PALETTE: Palette = 'graphite';

/**
 * Read the user's explicit theme choice from the cookie. Returns `null` if no
 * choice has been made (so the client can fall through to `prefers-color-scheme`).
 */
export async function readThemeCookie(): Promise<ThemeChoice> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  if (value === 'light' || value === 'dark') return value;
  return null;
}

/**
 * Read the user's palette choice from the cookie. Always resolves to one of
 * the four ship palettes — defaults to `'graphite'` when the cookie is
 * absent or holds an unknown value. The dispatch's design ships with no
 * `:root` palette fallback, so something MUST be on `<html data-palette>`
 * at first paint or every `--c-*` color is undefined.
 */
export async function readPaletteCookie(): Promise<Palette> {
  const store = await cookies();
  const value = store.get(PALETTE_COOKIE)?.value;
  if (value && (PALETTES as ReadonlyArray<string>).includes(value)) {
    return value as Palette;
  }
  return DEFAULT_PALETTE;
}

/**
 * Server action to set the palette cookie. Mirror of (a future) theme-setter.
 *
 * The cookie is `httpOnly: false` so a client-side palette switcher can
 * also read it without an extra round trip — but writes always go through
 * this server action so we can validate the value once, here, instead of
 * trusting the client. Lifetime: 1 year (preference, not session).
 */
export async function setPaletteCookie(palette: Palette): Promise<void> {
  if (!(PALETTES as ReadonlyArray<string>).includes(palette)) {
    throw new Error(`Unknown palette: ${palette}`);
  }
  const store = await cookies();
  store.set(PALETTE_COOKIE, palette, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    // Not httpOnly: a future client-side switcher needs to read the current
    // value to decide what's selected.
    httpOnly: false,
  });
}

/**
 * Server action to set the theme cookie. Mirror of `setPaletteCookie`.
 *
 * Passing `null` clears the explicit choice and lets `prefers-color-scheme`
 * win on the next render (the absence of `data-theme` on `<html>` enables
 * the `:not([data-theme="dark"])` selectors in `tokens.css`).
 *
 * The cookie is `httpOnly: false` for the same reason as the palette cookie
 * — a future client-side theme switcher should be able to read the current
 * value without a network round-trip. Validation always happens server-side.
 */
export async function setThemeCookie(
  choice: ResolvedTheme | null,
): Promise<void> {
  const store = await cookies();
  if (choice === null) {
    store.delete(THEME_COOKIE);
    return;
  }
  if (choice !== 'light' && choice !== 'dark') {
    throw new Error(`Unknown theme: ${choice as string}`);
  }
  store.set(THEME_COOKIE, choice, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
  });
}

export const THEME_COOKIE_NAME = THEME_COOKIE;
export const PALETTE_COOKIE_NAME = PALETTE_COOKIE;
export const DEFAULT_PALETTE_NAME = DEFAULT_PALETTE;
export const PALETTE_OPTIONS: ReadonlyArray<Palette> = PALETTES;
