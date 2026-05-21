/**
 * InlineEditField — small click-to-edit affordance for short text fields.
 *
 * Used by routine/habit detail headers for `category` and `location` (and
 * intentionally re-usable for any other 50-char-ish label field). Mirrors
 * the existing inline-edit pattern already used for `name` / `description`
 * on the same surfaces: muted text in display, transparent-underline input
 * on edit, commit on Enter / blur, revert on Escape.
 *
 * Display modes:
 *   - When `value` is non-empty: shows the value as muted text. Clicking
 *     (or Enter / Space on focus) reveals the input.
 *   - When `value` is empty: shows the configured `placeholder` as an
 *     "add" affordance (e.g. "+ add category"). Same click-to-edit.
 *
 * The PATCH call is owned by the caller via `onSave`. This component is
 * purely a controlled affordance — it knows nothing about the network.
 *
 * Empty input → `onSave` is called with `null` (per the backend's
 * empty-string-to-null preprocessor convention).
 *
 * Loading state: while `onSave` is pending the field is read-only and
 * dimmed, with an aria-busy attribute on the wrapper. The caller is
 * responsible for surfacing PATCH errors via its own Alert banner — the
 * field reverts on rejected promise.
 */
'use client';

import * as React from 'react';

export type InlineEditFieldProps = {
  /** The current value, or `null` for empty. */
  value: string | null;
  /**
   * Called with the new value (`null` when the user cleared it). Should
   * resolve on success and reject on failure — on reject we revert the
   * local input back to `value`.
   */
  onSave: (next: string | null) => Promise<void>;
  /** Accessible label for the input (e.g. "Category"). */
  label: string;
  /** Placeholder shown when value is empty (e.g. "+ add category"). */
  emptyPlaceholder: string;
  /** Maximum length, matches the schema. Defaults to 50. */
  maxLength?: number;
  /** Optional `data-testid` for tests. */
  'data-testid'?: string;
};

const displayStyle: React.CSSProperties = {
  display: 'inline-block',
  cursor: 'text',
  fontSize: 'var(--fs-sm)',
  color: 'var(--c-text-muted)',
  background: 'transparent',
  border: 'none',
  padding: '4px 0',
  borderBottom: '1.5px solid transparent',
  textAlign: 'left',
  letterSpacing: 'var(--tr-snug)',
  fontFamily: 'inherit',
  lineHeight: 1.4,
  outline: 'none',
  transition: 'border-color var(--d-quick) var(--e-standard)',
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  background: 'transparent',
  border: 'none',
  borderBottom: '1.5px solid var(--c-text-muted)',
  fontFamily: 'inherit',
  fontSize: 'var(--fs-sm)',
  color: 'var(--c-text-primary)',
  padding: '4px 0',
  outline: 'none',
  letterSpacing: 'var(--tr-snug)',
  lineHeight: 1.4,
  transition: 'border-color var(--d-quick) var(--e-standard)',
};

export function InlineEditField({
  value,
  onSave,
  label,
  emptyPlaceholder,
  maxLength = 50,
  'data-testid': dataTestId,
}: InlineEditFieldProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<string>(value ?? '');
  const [pending, setPending] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Re-sync draft to value when the upstream value changes (e.g. on
  // router.refresh() after a successful save).
  React.useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  // Focus the input when we enter edit mode.
  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const beginEdit = () => {
    if (pending) return;
    setDraft(value ?? '');
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value ?? '');
    setEditing(false);
  };

  const commit = async () => {
    // Trim and normalise empty → null so we match the backend's contract.
    const trimmed = draft.trim();
    const current = value ?? '';
    if (trimmed === current.trim()) {
      // No change — exit without a network call.
      setEditing(false);
      setDraft(trimmed);
      return;
    }
    const next: string | null = trimmed.length === 0 ? null : trimmed;
    setPending(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      // Caller will surface its own error banner. Revert local state.
      setDraft(value ?? '');
      setEditing(false);
    } finally {
      setPending(false);
    }
  };

  // ── Edit mode ─────────────────────────────────────────────────────────
  if (editing) {
    return (
      <span aria-busy={pending || undefined} data-testid={dataTestId}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            void commit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          style={inputStyle}
          aria-label={label}
          maxLength={maxLength}
          disabled={pending}
        />
      </span>
    );
  }

  // ── Display mode ──────────────────────────────────────────────────────
  // Empty value → render the "+ add …" affordance with the muted style.
  // Non-empty → render the value with the muted style. Either way, the
  // affordance is a button so keyboard users can tab to it and press
  // Enter / Space to start editing.
  const labelText = value && value.length > 0 ? value : emptyPlaceholder;
  return (
    <button
      type="button"
      onClick={beginEdit}
      aria-label={
        value && value.length > 0 ? `${label}: ${value}. edit` : `edit ${label}`
      }
      style={displayStyle}
      data-testid={dataTestId}
    >
      {labelText}
    </button>
  );
}
