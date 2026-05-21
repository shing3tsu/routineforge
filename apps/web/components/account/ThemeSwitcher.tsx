/**
 * ThemeSwitcher — three-way pill (System / Light / Dark) using `.rf-tabs`.
 *
 * Visual target: `design/screens/edges.jsx → AccountBody → "Appearance" →
 * "Theme"`. Same shape as the DayStepEditor's day tabs. Each segment pairs
 * the label with the matching hand-drawn icon (auto / sun / moon) — the
 * icon reinforces meaning at full size without sacrificing the readable
 * label.
 *
 * Mechanics:
 *   - "System" maps to `null` (clears the cookie and lets the
 *     `prefers-color-scheme` selector chain in tokens.css decide).
 *   - "Light" / "Dark" set the cookie explicitly.
 *   - Calls `setThemeAction`; `revalidatePath('/', 'layout')` propagates
 *     the new `<html data-theme>` attribute.
 */
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { setThemeAction } from '@/lib/theme/actions';
import type { ResolvedTheme } from '@/lib/theme/theme';
import { IconSun, IconMoon, IconAuto } from '@/components/ui/icons';

type ThemeChoice = ResolvedTheme | null;

const OPTIONS: ReadonlyArray<{
  value: 'system' | 'light' | 'dark';
  label: string;
  icon: React.ReactElement;
}> = [
  { value: 'system', label: 'System', icon: <IconAuto size={16} /> },
  { value: 'light', label: 'Light', icon: <IconSun size={16} /> },
  { value: 'dark', label: 'Dark', icon: <IconMoon size={16} /> },
];

function toThemeChoice(value: 'system' | 'light' | 'dark'): ThemeChoice {
  return value === 'system' ? null : value;
}

function fromThemeChoice(choice: ThemeChoice): 'system' | 'light' | 'dark' {
  return choice ?? 'system';
}

export type ThemeSwitcherProps = {
  current: ThemeChoice;
};

export function ThemeSwitcher({ current }: ThemeSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [active, setActive] = React.useState<'system' | 'light' | 'dark'>(
    fromThemeChoice(current),
  );

  React.useEffect(() => {
    setActive(fromThemeChoice(current));
  }, [current]);

  const handlePick = (value: 'system' | 'light' | 'dark') => {
    if (pending) return;
    setActive(value);
    startTransition(() => {
      void setThemeAction(toThemeChoice(value)).then(() => {
        router.refresh();
      });
    });
  };

  return (
    <div className="rf-tabs" role="tablist" aria-label="Theme">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          className="rf-tab rf-tab--with-icon"
          aria-selected={active === opt.value}
          onClick={() => handlePick(opt.value)}
          disabled={pending}
        >
          <span className="rf-tab__icon" aria-hidden="true">
            {opt.icon}
          </span>
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
