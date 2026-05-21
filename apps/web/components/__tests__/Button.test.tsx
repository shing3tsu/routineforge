// @vitest-environment jsdom
/**
 * Button primitive tests.
 *
 * Cover variants/sizes via the rendered <button>'s class fragments
 * (Button.tsx composes them as `variant-${variant}` / `size-${size}`), but
 * prefer role + accessible name for the primary assertions per agent guidance.
 *
 * Interaction matrix:
 *   - default click works
 *   - disabled blocks click but remains focusable (keyboard discovery)
 *   - loading blocks click + sets aria-busy + renders the spinner
 *   - fullWidth class applied
 *   - keyboard activation via Enter and Space
 */

import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/Button';

afterEach(() => {
  cleanup();
});

describe('Button — rendering & variants', () => {
  it('renders a button with the supplied accessible name', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('defaults to type="button" so it does not submit forms by accident', () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole('button', { name: 'Click' })).toHaveAttribute(
      'type',
      'button',
    );
  });

  it('honors an overridden type (e.g. submit)', () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute(
      'type',
      'submit',
    );
  });

  it('default variant=primary / size=md produces variant-primary + size-md class fragments', () => {
    render(<Button>Primary md</Button>);
    const btn = screen.getByRole('button', { name: 'Primary md' });
    expect(btn.className).toMatch(/variant-primary/);
    expect(btn.className).toMatch(/size-md/);
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'applies the variant-%s class for variant=%s',
    (variant) => {
      render(<Button variant={variant}>v</Button>);
      const btn = screen.getByRole('button', { name: 'v' });
      expect(btn.className).toMatch(new RegExp(`variant-${variant}`));
    },
  );

  it.each(['sm', 'md', 'lg'] as const)(
    'applies the size-%s class for size=%s',
    (size) => {
      render(<Button size={size}>s</Button>);
      const btn = screen.getByRole('button', { name: 's' });
      expect(btn.className).toMatch(new RegExp(`size-${size}`));
    },
  );

  it('applies the fullWidth class when fullWidth is true', () => {
    render(<Button fullWidth>Wide</Button>);
    const btn = screen.getByRole('button', { name: 'Wide' });
    expect(btn.className).toMatch(/full/);
  });

  it('forwards extra props (e.g. data-*) to the underlying button', () => {
    render(<Button data-foo="bar">x</Button>);
    expect(screen.getByRole('button', { name: 'x' })).toHaveAttribute(
      'data-foo',
      'bar',
    );
  });

  it('forwards a ref to the underlying button element', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>r</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});

describe('Button — disabled state', () => {
  it('sets aria-disabled when disabled', () => {
    render(<Button disabled>Off</Button>);
    expect(screen.getByRole('button', { name: 'Off' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('does NOT set the native disabled attribute (so the button is still focusable)', () => {
    // The Button component intentionally uses aria-disabled rather than the
    // native `disabled` attr — see the docstring in Button.tsx. This means
    // keyboard users can still tab to and discover the label.
    render(<Button disabled>Off</Button>);
    const btn = screen.getByRole('button', { name: 'Off' });
    expect(btn).not.toBeDisabled();
  });

  it('blocks the click handler from firing when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Off
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Off' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('remains focusable when disabled (keyboard discovery)', () => {
    render(<Button disabled>Off</Button>);
    const btn = screen.getByRole('button', { name: 'Off' });
    btn.focus();
    expect(btn).toHaveFocus();
  });
});

describe('Button — loading state', () => {
  it('sets aria-busy and aria-disabled when loading', () => {
    render(<Button loading>Saving</Button>);
    const btn = screen.getByRole('button', { name: 'Saving' });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders an aria-hidden spinner alongside the label', () => {
    render(<Button loading>Saving</Button>);
    const btn = screen.getByRole('button', { name: 'Saving' });
    // Spinner svg is presentational and aria-hidden; verify by querying the
    // wrapper span rather than role. (We do NOT want an assertive a11y role
    // here — aria-busy on the button does the announcing.)
    const spinner = btn.querySelector('[aria-hidden="true"] svg');
    expect(spinner).not.toBeNull();
  });

  it('blocks the click handler from firing when loading', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Saving' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Button — click & keyboard activation', () => {
  it('fires onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick when Enter is pressed while focused', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const btn = screen.getByRole('button', { name: 'Go' });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick when Space is pressed while focused', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const btn = screen.getByRole('button', { name: 'Go' });
    btn.focus();
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
