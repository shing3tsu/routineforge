/**
 * Dialog — primitive for confirmation / destructive flows.
 *
 * Replaces the trio of `window.confirm()` calls scattered across detail
 * pages. The shape is intentionally narrow — this is a confirmation
 * dialog, not a generic modal framework. If/when we need a richer modal
 * (multi-step flows, free-form forms), we'll grow a second primitive
 * rather than retrofit this one.
 *
 * Visual + behavior reference: brief in the dispatch + design/components.md
 * card spec (specifically the `--hero` modifier which we mirror for the
 * pillowy 28px radius and lg shadow). Tokens consumed:
 *   --c-surface-elevated, --c-surface-overlay
 *   --c-text-primary, --c-text-secondary
 *   --r-2xl, --sh-xl, --sh-inner
 *   --s-2..--s-6, --fs-base, --fs-xl, --lh-xl, --lh-lg
 *   --d-glide, --e-soft, --e-standard
 *   --z-overlay, --z-modal
 *
 * Behavior contract (see dispatch):
 *   - Renders nothing when !open.
 *   - Portals to document.body.
 *   - Click on backdrop closes (unless pending).
 *   - Esc closes (unless pending).
 *   - Focus the primary action on open; restore previous focus on close.
 *   - Tab/Shift+Tab cycles within the dialog (hand-rolled trap; no deps).
 *   - Body scroll locked while open.
 *   - role="dialog" + aria-modal + aria-labelledby + (when desc) aria-describedby.
 *   - Pending state disables backdrop / Esc close so the user can't
 *     accidentally cancel a mid-flight action. The primary button itself
 *     mirrors `loading` via the Button primitive.
 *
 * The dialog does NOT auto-close after primaryAction.onClick — the call
 * site decides when to close (typically inside a useTransition wrapper
 * that calls `onClose()` after the async work resolves).
 */
'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import styles from './Dialog.module.css';

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Render the primary action with `variant="danger"`. */
  destructive?: boolean;
  primaryAction: {
    label: string;
    onClick: () => void | Promise<void>;
    pending?: boolean;
  };
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  /** Optional rich body — rendered below the description. */
  children?: React.ReactNode;
};

/**
 * Returns all keyboard-focusable elements inside `container`, in document
 * order. Filters out elements with negative tabindex and those that are
 * `inert` / hidden via `display: none`. Used by the Tab focus trap below.
 *
 * We intentionally avoid pulling in `focus-trap-react` — the surface is
 * narrow enough that a 20-line trap is justified.
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>(selector),
  );
  return nodes.filter((el) => {
    if (el.hasAttribute('inert')) return false;
    // Hidden-by-CSS check; offsetParent is null for display:none ancestors.
    // Note: position:fixed elements have null offsetParent too, but the
    // dialog itself is the topmost positioned element so descendants are
    // resolved correctly relative to it.
    return el.offsetParent !== null || el === document.activeElement;
  });
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  destructive = false,
  primaryAction,
  cancelLabel = 'Cancel',
  children,
}: DialogProps) {
  // Stable IDs for aria-labelledby / aria-describedby. useId is stable
  // across server / client renders, but the Dialog is mounted client-side
  // only (the portal target document.body doesn't exist on the server) so
  // this is mostly belt-and-braces.
  const reactId = React.useId();
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const primaryBtnRef = React.useRef<HTMLButtonElement | null>(null);
  // Remember which element opened the dialog so we can restore focus on close.
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);

  // SSR guard — only render the portal on the client. The first client
  // render flips this true; subsequent renders use the portal path.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const pending = !!primaryAction.pending;

  // ── Open / close side effects ───────────────────────────────────────
  React.useEffect(() => {
    if (!open) return;

    // Snapshot the focused element so we can restore it on close. Casts
    // because activeElement is typed as Element, not HTMLElement.
    previouslyFocusedRef.current =
      (document.activeElement as HTMLElement | null) ?? null;

    // Lock body scroll. We restore the prior overflow value rather than
    // hard-clearing it so we don't trample any other stack consumer.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the primary action (or the first focusable in `children` if
    // present — but the primary button is always present and is what the
    // brief asked for, so we keep this simple).
    // Use a microtask so the portal has mounted before we focus.
    const focusTimer = window.setTimeout(() => {
      primaryBtnRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
      // Restore focus only if the element is still in the document — if
      // the trigger was unmounted (e.g. nav happened), don't throw.
      const prev = previouslyFocusedRef.current;
      if (prev && document.contains(prev)) {
        prev.focus();
      }
      previouslyFocusedRef.current = null;
    };
  }, [open]);

  // ── Keyboard handling: Esc + Tab trap ───────────────────────────────
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        if (pending) return; // can't cancel mid-flight
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const card = cardRef.current;
      if (!card) return;
      const focusables = getFocusableElements(card);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !card.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !card.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose, pending],
  );

  // Backdrop click: only close when the click landed on the backdrop
  // itself, not bubbled up from the card. `currentTarget === target`
  // gives us that guarantee without needing stopPropagation on the card.
  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (pending) return;
    onClose();
  };

  if (!open) return null;
  if (!mounted) return null;

  // The primary button's onClick is the call-site's handler. We do not
  // call onClose() here — the call site is responsible for closing once
  // its async work completes (typically inside a useTransition).
  const handlePrimaryClick = () => {
    if (pending) return;
    void primaryAction.onClick();
  };

  const dialog = (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {description ? (
            <p id={descId} className={styles.description}>
              {description}
            </p>
          ) : null}
        </div>

        {children ? <div className={styles.body}>{children}</div> : null}

        <div className={styles.footer}>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              if (pending) return;
              onClose();
            }}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            ref={primaryBtnRef}
            variant={destructive ? 'danger' : 'primary'}
            size="lg"
            onClick={handlePrimaryClick}
            loading={pending}
          >
            {primaryAction.label}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
