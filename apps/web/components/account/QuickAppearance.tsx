/**
 * QuickAppearance — compact palette + theme controls for the SideNav footer.
 *
 * Why this exists: the full `<PaletteSwitcher />` and `<ThemeSwitcher />` on
 * `/account` are the canonical surfaces, but cycling palettes/themes is a
 * frequent action and forcing a navigation hop dampens it. This is the
 * always-visible mini version pinned to the bottom of the desktop SideNav,
 * above the signed-in user tile. Mobile keeps `/account` as the canonical
 * spot — the bottom nav only has room for 4 tabs and adding clutter there
 * costs more than it earns.
 *
 * Anatomy:
 *   - Row 1: four 24×24 palette dots (bone / fog / sage / graphite). Each
 *     dot previews the palette's wash gradient via `[data-palette]` scoping
 *     — `tokens.css` paints the `--c-wash-*` colours when that attribute is
 *     present on any ancestor, so the chip below shows that palette's
 *     colours even though the rest of the page is on a different one.
 *   - Row 2: three-segment theme toggle using `.rf-tabs` + `.rf-tab`, with
 *     hand-drawn sun / auto / moon icons (Auto is the half-sun-half-moon
 *     disc, the industry-standard "follow system" glyph).
 *
 * Mechanics:
 *   - Reuses `setPaletteAction` + `setThemeAction` directly. No new server
 *     code.
 *   - Optimistic local state (active immediately on click) wrapped in a
 *     `useTransition` so the page can re-render with the new cookie value
 *     after the action returns. `router.refresh()` propagates the new
 *     `<html data-palette>` / `<html data-theme>` attribute.
 *   - The `current` props re-sync on every render (via the effect) so when
 *     someone changes the palette on `/account`, this widget reflects the
 *     new value on the next navigation.
 *
 * Accessibility:
 *   - Each palette button has `aria-label="<Name> palette"` and the active
 *     one is `aria-pressed="true"`.
 *   - The theme toggle is a `role="tablist"` with each segment a
 *     `role="tab"` and `aria-selected="true"` on the active one.
 *   - Tab navigates through swatches; Enter/Space activates them.
 *   - Icons are decorative — the segment label text is read by screen
 *     readers via a visually-hidden span.
 */
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { setPaletteAction, setThemeAction } from '@/lib/theme/actions';
import type { Palette, ResolvedTheme } from '@/lib/theme/theme';
import { IconSun, IconMoon, IconAuto } from '@/components/ui/icons';

type ThemeChoice = ResolvedTheme | null;
type ThemeSegment = 'system' | 'light' | 'dark';

const PALETTE_OPTIONS: ReadonlyArray<{ value: Palette; label: string }> = [
  { value: 'bone', label: 'Bone' },
  { value: 'fog', label: 'Fog' },
  { value: 'sage', label: 'Sage' },
  { value: 'graphite', label: 'Graphite' },
];

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemeSegment;
  label: string;
  icon: React.ReactElement;
}> = [
  { value: 'system', label: 'System', icon: <IconAuto size={13} /> },
  { value: 'light', label: 'Light', icon: <IconSun size={13} /> },
  { value: 'dark', label: 'Dark', icon: <IconMoon size={13} /> },
];

function toThemeChoice(value: ThemeSegment): ThemeChoice {
  return value === 'system' ? null : value;
}

function fromThemeChoice(choice: ThemeChoice): ThemeSegment {
  return choice ?? 'system';
}

export type QuickAppearanceProps = {
  /** Current palette (read from `rf_palette` cookie on the server). */
  palette: Palette;
  /** Current theme choice (read from `rf_theme` cookie on the server). */
  themeChoice: ThemeChoice;
};

export function QuickAppearance({
  palette,
  themeChoice,
}: QuickAppearanceProps): React.ReactElement {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [activePalette, setActivePalette] = React.useState<Palette>(palette);
  const [activeTheme, setActiveTheme] = React.useState<ThemeSegment>(
    fromThemeChoice(themeChoice),
  );

  // Re-sync if a server-rendered value changes (e.g. user changed it on
  // /account and navigated back).
  React.useEffect(() => {
    setActivePalette(palette);
  }, [palette]);

  React.useEffect(() => {
    setActiveTheme(fromThemeChoice(themeChoice));
  }, [themeChoice]);

  const handlePalette = (value: Palette) => {
    if (pending || value === activePalette) return;
    setActivePalette(value); // optimistic
    startTransition(() => {
      void setPaletteAction(value).then(() => {
        router.refresh();
      });
    });
  };

  const handleTheme = (value: ThemeSegment) => {
    if (pending || value === activeTheme) return;
    setActiveTheme(value);
    startTransition(() => {
      void setThemeAction(toThemeChoice(value)).then(() => {
        router.refresh();
      });
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-3)',
        padding: 'var(--s-3) var(--s-3) var(--s-2) var(--s-3)',
        borderTop: '1px solid var(--c-border-subtle)',
        marginTop: 'var(--s-3)',
      }}
    >
      <div className="rf-eyebrow" aria-hidden="true">
        Appearance
      </div>

      {/* Palette dots ------------------------------------------------- */}
      <div
        role="group"
        aria-label="Palette"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--s-2)',
        }}
      >
        {PALETTE_OPTIONS.map((opt) => {
          const active = activePalette === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              className="rf-quick-swatch"
              aria-pressed={active}
              aria-label={`${opt.label} palette`}
              title={opt.label}
              onClick={() => handlePalette(opt.value)}
              disabled={pending}
            >
              <span
                className="rf-quick-swatch__dot"
                aria-hidden="true"
                data-palette={opt.value}
              />
            </button>
          );
        })}
      </div>

      {/* Theme segmented control ------------------------------------- */}
      <div
        className="rf-tabs rf-tabs--compact"
        role="tablist"
        aria-label="Theme"
      >
        {THEME_OPTIONS.map((opt) => {
          const active = activeTheme === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              className="rf-tab rf-tab--compact"
              aria-selected={active}
              aria-label={`${opt.label} theme`}
              title={opt.label}
              onClick={() => handleTheme(opt.value)}
              disabled={pending}
            >
              {opt.icon}
              <span className="visually-hidden">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
