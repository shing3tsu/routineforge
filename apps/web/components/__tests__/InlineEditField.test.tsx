// @vitest-environment jsdom
/**
 * InlineEditField — RTL tests.
 *
 * Covers:
 *   - Empty value renders an "+ add …" affordance with the configured copy.
 *   - Non-empty value renders the value as a clickable button.
 *   - Click → edit mode reveals the input pre-populated with the value.
 *   - Enter and blur both commit; Escape reverts.
 *   - Empty input (cleared and committed) sends `null` to `onSave`.
 *   - PATCH 500 (rejected `onSave`) reverts the local state.
 *   - maxLength is wired to the underlying input.
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { InlineEditField } from '@/components/ui/InlineEditField';

beforeEach(() => {
  // no-op
});

afterEach(() => {
  cleanup();
});

describe('InlineEditField — display mode', () => {
  it('renders the value as a button when non-empty', () => {
    render(
      <InlineEditField
        value="Wellness"
        onSave={vi.fn()}
        label="Category"
        emptyPlaceholder="+ add category"
      />,
    );
    expect(
      screen.getByRole('button', { name: /category: wellness\. edit/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveTextContent('Wellness');
  });

  it('renders the empty placeholder when value is null', () => {
    render(
      <InlineEditField
        value={null}
        onSave={vi.fn()}
        label="Category"
        emptyPlaceholder="+ add category"
      />,
    );
    const btn = screen.getByRole('button', { name: /edit category/i });
    expect(btn).toHaveTextContent('+ add category');
  });
});

describe('InlineEditField — entering edit mode', () => {
  it('reveals an input pre-populated with the current value on click', async () => {
    const user = userEvent.setup();
    render(
      <InlineEditField
        value="Wellness"
        onSave={vi.fn()}
        label="Category"
        emptyPlaceholder="+ add category"
      />,
    );
    await user.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox', { name: /category/i });
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('Wellness');
  });

  it('reveals an empty input when starting from a null value', async () => {
    const user = userEvent.setup();
    render(
      <InlineEditField
        value={null}
        onSave={vi.fn()}
        label="Category"
        emptyPlaceholder="+ add category"
      />,
    );
    await user.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox', { name: /category/i });
    expect((input as HTMLInputElement).value).toBe('');
  });
});

describe('InlineEditField — commit + revert', () => {
  it('commits via Enter and calls onSave with the trimmed value', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <InlineEditField
        value={null}
        onSave={onSave}
        label="Category"
        emptyPlaceholder="+ add category"
      />,
    );
    await user.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox', { name: /category/i });
    await user.type(input, '  Fitness  ');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Fitness'));
  });

  it('commits on blur', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <>
        <InlineEditField
          value={null}
          onSave={onSave}
          label="Category"
          emptyPlaceholder="+ add category"
        />
        <button>elsewhere</button>
      </>,
    );
    await user.click(screen.getByRole('button', { name: /edit category/i }));
    const input = screen.getByRole('textbox', { name: /category/i });
    await user.type(input, 'Health');
    // Move focus away → triggers blur → triggers commit.
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Health'));
  });

  it('sends `null` when the user clears the input and commits', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <InlineEditField
        value="Wellness"
        onSave={onSave}
        label="Category"
        emptyPlaceholder="+ add category"
      />,
    );
    await user.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox', { name: /category/i });
    await user.clear(input);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
  });

  it('reverts on Escape without calling onSave', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <InlineEditField
        value="Wellness"
        onSave={onSave}
        label="Category"
        emptyPlaceholder="+ add category"
      />,
    );
    await user.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox', { name: /category/i });
    await user.clear(input);
    await user.type(input, 'Health');
    await user.keyboard('{Escape}');
    // No save call, and we are back in display mode showing the original.
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: /category: wellness\. edit/i }),
    ).toBeInTheDocument();
  });

  it('does not call onSave when the value is unchanged', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <InlineEditField
        value="Wellness"
        onSave={onSave}
        label="Category"
        emptyPlaceholder="+ add category"
      />,
    );
    await user.click(screen.getByRole('button'));
    await user.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('reverts to the original value on PATCH 500 (rejected onSave)', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValue(new Error('Update failed.'));
    const user = userEvent.setup();
    render(
      <InlineEditField
        value="Wellness"
        onSave={onSave}
        label="Category"
        emptyPlaceholder="+ add category"
      />,
    );
    await user.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox', { name: /category/i });
    await user.clear(input);
    await user.type(input, 'Health');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // After the failure, we revert to the original display.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /category: wellness\. edit/i }),
      ).toBeInTheDocument(),
    );
  });
});

describe('InlineEditField — input constraints', () => {
  it('applies the default maxLength of 50', async () => {
    const user = userEvent.setup();
    render(
      <InlineEditField
        value={null}
        onSave={vi.fn()}
        label="Category"
        emptyPlaceholder="+ add category"
      />,
    );
    await user.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox', { name: /category/i });
    expect((input as HTMLInputElement).maxLength).toBe(50);
  });
});
