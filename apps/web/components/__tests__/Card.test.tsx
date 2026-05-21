// @vitest-environment jsdom
/**
 * Card primitive tests.
 *
 * Card is purely presentational. We assert the configurable bits described in
 * Card.tsx: `as` tag swap, `padded` class, `selected` class, slot composition
 * (Header / Body / Footer), and HTML pass-through.
 */

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/Card';

afterEach(() => {
  cleanup();
});

describe('Card', () => {
  it('renders children', () => {
    render(<Card>hello</Card>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('renders as a <section> by default', () => {
    const { container } = render(<Card>x</Card>);
    expect(container.querySelector('section')).not.toBeNull();
  });

  it('renders as a different element when `as` is supplied', () => {
    const { container } = render(<Card as="article">x</Card>);
    expect(container.querySelector('article')).not.toBeNull();
    expect(container.querySelector('section')).toBeNull();
  });

  it('applies the padded class when padded=true', () => {
    const { container } = render(<Card padded>x</Card>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toMatch(/padded/);
  });

  it('does not apply the padded class by default', () => {
    const { container } = render(<Card>x</Card>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).not.toMatch(/padded/);
  });

  it('applies the selected class when selected=true', () => {
    const { container } = render(<Card selected>x</Card>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toMatch(/selected/);
  });

  it('forwards arbitrary HTML attributes (aria-label, data-*)', () => {
    const { container } = render(
      <Card aria-label="My card" data-test="card-1">
        x
      </Card>,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveAttribute('aria-label', 'My card');
    expect(card).toHaveAttribute('data-test', 'card-1');
  });

  it('merges a user-supplied className with internal ones', () => {
    const { container } = render(<Card className="custom-cls">x</Card>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toMatch(/custom-cls/);
    expect(card.className).toMatch(/card/);
  });
});

describe('Card composition (Header / Body / Footer)', () => {
  it('renders the composed children inside a Card', () => {
    render(
      <Card>
        <CardHeader>head</CardHeader>
        <CardBody>body</CardBody>
        <CardFooter>foot</CardFooter>
      </Card>,
    );
    expect(screen.getByText('head')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(screen.getByText('foot')).toBeInTheDocument();
  });
});
