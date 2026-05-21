// @vitest-environment jsdom
/**
 * Global /not-found page tests.
 *
 * The page is a server component that renders a static 404 surface. It must:
 *   - render the heading copy "not here." inside an <h1>
 *   - have exactly one <h1> on the page (single document headline)
 *   - render a link to "/" labeled "go to today" (the primary recovery CTA;
 *     `/` is the today view per `app/page.tsx`)
 *   - render a secondary link to "/login" for logged-out visitors that
 *     landed on a private URL
 *
 * The page wraps everything in a <main> landmark with an `aria-labelledby`
 * tying it to the h1.
 */

import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import NotFound from '@/app/not-found';

afterEach(() => {
  cleanup();
});

describe('NotFound — rendering', () => {
  it('renders the heading copy "not here." inside an h1', () => {
    render(<NotFound />);
    const heading = screen.getByRole('heading', { level: 1, name: /not here/i });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe('H1');
  });

  it('has exactly one h1', () => {
    const { container } = render(<NotFound />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('renders the body subtext', () => {
    render(<NotFound />);
    // We assert on a partial substring so an em-dash / typography variant
    // doesn't make the test fragile. The "let's get you back" half is the
    // most stable phrase in the copy.
    expect(screen.getByText(/let.?s get you back/i)).toBeInTheDocument();
  });

  it('renders a "go to today" link pointing to "/"', () => {
    render(<NotFound />);
    const link = screen.getByRole('link', { name: /go to today/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders a secondary "or sign in" link pointing to "/login"', () => {
    render(<NotFound />);
    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/login');
  });

  it('renders inside a <main> landmark labelled by the heading', () => {
    render(<NotFound />);
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    // The aria-labelledby wires the main to the h1's id.
    const headingId = main.getAttribute('aria-labelledby');
    expect(headingId).toBeTruthy();
    const heading = document.getElementById(headingId!);
    expect(heading?.tagName).toBe('H1');
  });
});
