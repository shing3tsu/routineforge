// @vitest-environment jsdom
/**
 * TextField primitive tests.
 *
 * Focuses on the accessibility contract documented in TextField.tsx:
 *   - label is associated with the input via htmlFor / id
 *   - hint / error wire through aria-describedby
 *   - error toggles aria-invalid + renders role="alert"
 *   - required mirrors to aria-required (and the native attr)
 *   - hideLabel keeps the label accessible but visually hidden
 *   - auto-id when no id supplied; provided id takes precedence
 *   - leading / trailing / labelAction slots render
 */

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextField } from '@/components/ui/TextField';

afterEach(() => {
  cleanup();
});

describe('TextField — label & id wiring', () => {
  it('associates the visible label with the input', () => {
    render(<TextField label="Email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toBeInstanceOf(HTMLInputElement);
  });

  it('auto-generates a stable id when none supplied (label htmlFor matches input id)', () => {
    render(<TextField label="Email" />);
    const input = screen.getByLabelText('Email') as HTMLInputElement;
    expect(input.id).toBeTruthy();
    expect(input.id).toMatch(/^tf-/);
  });

  it('honors a provided id rather than auto-generating', () => {
    render(<TextField label="Email" id="custom-email" />);
    const input = screen.getByLabelText('Email') as HTMLInputElement;
    expect(input.id).toBe('custom-email');
  });

  it('keeps the label accessible but hides it visually when hideLabel is true', () => {
    render(<TextField label="Search" hideLabel />);
    // getByLabelText still finds the input — the label is in the DOM, just
    // wearing the `visually-hidden` class.
    const input = screen.getByLabelText('Search');
    expect(input).toBeInTheDocument();
    const label = screen.getByText('Search');
    expect(label.className).toMatch(/visually-hidden/);
  });

  it('renders labelAction next to the label', () => {
    render(
      <TextField
        label="Password"
        labelAction={<a href="/forgot">Forgot?</a>}
      />,
    );
    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Forgot?' })).toBeInTheDocument();
  });
});

describe('TextField — hint, error, aria-describedby', () => {
  it('renders the hint and links it via aria-describedby', () => {
    render(<TextField label="Email" hint="We never share it." />);
    const input = screen.getByLabelText('Email');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const hint = screen.getByText('We never share it.');
    expect(hint.id).toBe(describedBy);
  });

  it('does not set aria-invalid when there is no error', () => {
    render(<TextField label="Email" />);
    const input = screen.getByLabelText('Email');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('renders the error, sets aria-invalid=true, and links the error id via aria-describedby', () => {
    render(<TextField label="Email" error="Required" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    // Error message is a role="alert" so screen readers announce it.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Required');
    expect(describedBy?.split(/\s+/)).toContain(alert.id);
  });

  it('hides the hint and shows only the error when both are supplied', () => {
    // The source renders error OR hint, not both — verify the hint disappears
    // when there is an error so the assistive-tech experience is unambiguous.
    render(<TextField label="Email" hint="Tip" error="Bad" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Bad');
    expect(screen.queryByText('Tip')).not.toBeInTheDocument();
  });
});

describe('TextField — required, slots', () => {
  it('mirrors required to aria-required and the native attr', () => {
    render(<TextField label="Email" required />);
    const input = screen.getByLabelText(/Email/);
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toBeRequired();
  });

  it('renders a "required" hint inside the label when required', () => {
    render(<TextField label="Email" required />);
    expect(screen.getByText('required')).toBeInTheDocument();
  });

  it('renders the leading slot content', () => {
    render(
      <TextField
        label="Search"
        leading={<span data-testid="lead-icon">L</span>}
      />,
    );
    expect(screen.getByTestId('lead-icon')).toBeInTheDocument();
  });

  it('renders the trailing slot content', () => {
    render(
      <TextField
        label="Search"
        trailing={<span data-testid="trail-icon">T</span>}
      />,
    );
    expect(screen.getByTestId('trail-icon')).toBeInTheDocument();
  });
});

describe('TextField — interactions', () => {
  it('updates value via the controlled onChange callback', async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [v, setV] = React.useState('');
      return (
        <TextField label="Email" value={v} onChange={(e) => setV(e.target.value)} />
      );
    }
    render(<Wrapper />);
    const input = screen.getByLabelText('Email') as HTMLInputElement;
    await user.type(input, 'abc');
    expect(input.value).toBe('abc');
  });

  it('forwards a ref to the underlying input', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<TextField label="Email" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('respects the disabled prop', () => {
    render(<TextField label="Email" disabled />);
    expect(screen.getByLabelText('Email')).toBeDisabled();
  });

  it('respects the readOnly prop', () => {
    render(<TextField label="Email" readOnly />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
  });
});
