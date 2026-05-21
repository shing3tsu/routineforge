/**
 * Server actions for palette / theme switching.
 *
 * Wraps the cookie setters from `./theme.ts` so they can be invoked from a
 * `<form action={...}>` or from a client component via the `'use server'`
 * directive. Separating actions from the data accessors keeps `theme.ts`
 * importable from any server context (including non-action server
 * components) without forcing the whole module to be a server-action.
 *
 * Each action revalidates the root path so the new `<html data-palette>` /
 * `<html data-theme>` attribute is reflected on the next paint.
 */
'use server';

import { revalidatePath } from 'next/cache';
import {
  setPaletteCookie as setPaletteCookieRaw,
  setThemeCookie as setThemeCookieRaw,
  type Palette,
  type ResolvedTheme,
} from './theme';

export async function setPaletteAction(palette: Palette): Promise<void> {
  await setPaletteCookieRaw(palette);
  // Force a re-render of the root layout so `<html data-palette>` updates.
  revalidatePath('/', 'layout');
}

export async function setThemeAction(
  choice: ResolvedTheme | null,
): Promise<void> {
  await setThemeCookieRaw(choice);
  revalidatePath('/', 'layout');
}
