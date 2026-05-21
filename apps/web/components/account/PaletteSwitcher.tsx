/**
 * PaletteSwitcher — four-up palette swatch grid.
 *
 * Visual target: `design/mockups/account.html` + `design/screens/edges.jsx →
 * AccountBody → "Appearance" block`. Each palette is rendered as a small
 * card with a colour swatch + mono-caps name; the active one is highlighted
 * via `aria-pressed="true"` (and the corresponding `.rf-swatch[aria-pressed]`
 * rule in `globals.css`).
 *
 * Mechanics:
 *   - Calls the `setPaletteAction` server action on click; the action sets
 *     the cookie and then `revalidatePath('/', 'layout')` so the root
 *     `<html data-palette>` attribute updates on the next paint.
 *   - We ALSO call `router.refresh()` from a transition so the in-flight
 *     visual state is consistent.
 *
 * The swatch preview colours are CSS variables scoped per-palette via a
 * `data-palette` attribute on the wrapping element — `tokens.css` paints
 * the `--c-wash-*` colours appropriately when that attribute is present.
 */
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { setPaletteAction } from '@/lib/theme/actions';
import type { Palette } from '@/lib/theme/theme';

const PALETTE_OPTIONS: ReadonlyArray<{
  value: Palette;
  label: string;
}> = [
  { value: 'bone', label: 'Bone' },
  { value: 'fog', label: 'Fog' },
  { value: 'sage', label: 'Sage' },
  { value: 'graphite', label: 'Graphite' },
];

export type PaletteSwitcherProps = {
  current: Palette;
};

export function PaletteSwitcher({ current }: PaletteSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [active, setActive] = React.useState<Palette>(current);

  // Re-sync if server-rendered `current` changes after navigation.
  React.useEffect(() => {
    setActive(current);
  }, [current]);

  const handlePick = (value: Palette) => {
    if (pending) return;
    setActive(value); // optimistic
    startTransition(() => {
      void setPaletteAction(value).then(() => {
        router.refresh();
      });
    });
  };

  return (
    <div
      role="group"
      aria-label="Palette"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--s-3)',
      }}
    >
      {PALETTE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className="rf-swatch"
          aria-pressed={active === opt.value}
          aria-label={`${opt.label} palette`}
          onClick={() => handlePick(opt.value)}
          disabled={pending}
        >
          <span
            className="rf-swatch__chip"
            aria-hidden="true"
            data-palette={opt.value}
            style={{
              // Override the swatch chip's gradient using THIS palette's
              // wash colours by setting the CSS vars locally — tokens.css
              // scopes `--c-wash-*` under `[data-palette="X"]`, so the
              // chip below gets the previewed palette's colours even when
              // the rest of the page is on a different one.
            }}
          />
          <span className="rf-swatch__name">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
