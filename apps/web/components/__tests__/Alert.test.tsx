// @vitest-environment jsdom
/**
 * Alert primitive tests.
 *
 * Per Alert.tsx docstring:
 *   - `danger` variant uses role="alert" (assertive — actual failures only)
 *   - all other variants (success / warning / info) use role="status" (polite)
 *   - optional `title`, `children` message body
 *   - optional dismiss button when `onDismiss` provided
 *
 * Style hooks are CSS-module classes named `variant-${variant}` so we assert
 * those alongside the ARIA role, but we anchor primary queries on role +
 * accessible name per agent guidance.
 */

import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Alert } from '@/components/ui/Alert';

afterEach(() => {
  cleanup();
});

describe('Alert — variants & ARIA role', () => {
  it('renders danger variant with role="alert" (assertive)', () => {
    render(<Alert variant="danger">Something failed.</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('Something failed.');
  });

  it('renders success variant with role="status" (polite)', () => {
    render(<Alert variant="success">Saved.</Alert>);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent('Saved.');
    // Important contract: success is NOT role="alert" (no assertive yelling
    // for happy paths).
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders info variant with role="status" (polite)', () => {
    render(<Alert variant="info">Heads up.</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Heads up.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders warning variant with role="status" (polite)', () => {
    // Per the source: only `danger` is role="alert"; warning is role="status".
    // Tests the source-of-truth, not the dispatch's "warning -> alert" wording.
    render(<Alert variant="warning">Watch out.</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Watch out.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['success', 'danger', 'warning', 'info'] as const)(
    'applies the variant-%s class for variant=%s',
    (variant) => {
      const { container } = render(<Alert variant={variant}>x</Alert>);
      const root = container.firstElementChild as HTMLElement;
      expect(root.className).toMatch(new RegExp(`variant-${variant}`));
    },
  );
});

describe('Alert — content composition', () => {
  it('renders children as the message body', () => {
    render(<Alert variant="info">Hello world</Alert>);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders title above the message when supplied', () => {
    render(
      <Alert variant="info" title="Heads up">
        Body text
      </Alert>,
    );
    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(screen.getByText('Body text')).toBeInTheDocument();
  });

  it('renders only the title when no children are passed', () => {
    render(<Alert variant="info" title="Just a title" />);
    expect(screen.getByText('Just a title')).toBeInTheDocument();
  });

  it('renders ReactNode children (e.g. nested elements)', () => {
    render(
      <Alert variant="info">
        <span data-testid="nested">Nested</span>
      </Alert>,
    );
    expect(screen.getByTestId('nested')).toBeInTheDocument();
  });

  it('forwards extra HTMLDivAttributes (data-*, id, className)', () => {
    const { container } = render(
      <Alert
        variant="info"
        id="alert-1"
        data-foo="bar"
        className="custom-cls"
      >
        x
      </Alert>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('id', 'alert-1');
    expect(root).toHaveAttribute('data-foo', 'bar');
    expect(root.className).toMatch(/custom-cls/);
  });
});

describe('Alert — dismiss button', () => {
  it('does NOT render the dismiss button when onDismiss is not supplied', () => {
    render(<Alert variant="info">x</Alert>);
    expect(
      screen.queryByRole('button', { name: 'Dismiss' }),
    ).not.toBeInTheDocument();
  });

  it('renders the dismiss button with accessible name "Dismiss" when onDismiss is supplied', () => {
    render(
      <Alert variant="info" onDismiss={() => {}}>
        x
      </Alert>,
    );
    expect(
      screen.getByRole('button', { name: 'Dismiss' }),
    ).toBeInTheDocument();
  });

  it('invokes onDismiss when the dismiss button is clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <Alert variant="info" onDismiss={onDismiss}>
        x
      </Alert>,
    );
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('invokes onDismiss on Enter key (keyboard parity)', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <Alert variant="info" onDismiss={onDismiss}>
        x
      </Alert>,
    );
    const btn = screen.getByRole('button', { name: 'Dismiss' });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
