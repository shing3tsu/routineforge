/**
 * TextField — single-line input with label, hint, error, and optional leading
 * / trailing slots. Matches `design/components.md#TextField`.
 *
 * Consumes the `.rf-field*` family from `design/base.css`:
 *   - `.rf-field`              — column container
 *   - `.rf-field__label`       — label above the input
 *   - `.rf-field__input-wrap`  — 52px tall pill containing the input
 *   - `.rf-field__leading`     — optional icon before the input
 *   - `.rf-field__trailing`    — optional icon/action after the input
 *   - `.rf-field__input`       — the bare <input>
 *   - `.rf-field__hint`        — helper text below
 *   - `.rf-field--error`       — flips the wrap shadow + the hint colour
 *
 * Loading: the consumer renders a Spinner in the `trailing` slot — this
 * component doesn't own async state.
 *
 * ARIA:
 *   - Auto-generated id if none supplied (React.useId).
 *   - `aria-invalid` when `error` truthy.
 *   - `aria-describedby` wires hint + error.
 *   - `aria-required` mirrors the `required` prop.
 */
'use client';
import * as React from 'react';

type Size = 'md' | 'lg';

export type TextFieldProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'size'
> & {
  label: string;
  hint?: string;
  error?: string;
  /**
   * Visual size. Both sizes use the same `.rf-field` chrome; `lg` adds an
   * extra-tall input class for hero forms (auth pages). Default `md`.
   */
  size?: Size;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Hide the visual label but keep it accessible. */
  hideLabel?: boolean;
  /** Optional inline action rendered to the right of the label (e.g. "Forgot?" link). */
  labelAction?: React.ReactNode;
};

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      label,
      hint,
      error,
      size = 'md',
      leading,
      trailing,
      hideLabel = false,
      labelAction,
      id,
      required,
      readOnly,
      disabled,
      className,
      onFocus,
      onBlur,
      ...rest
    },
    ref,
  ) {
    const reactId = React.useId();
    const inputId = id ?? `tf-${reactId}`;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-err` : undefined;
    const describedBy =
      [hintId, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div
        className={classes(
          'rf-field',
          `rf-field--${size}`,
          error && 'rf-field--error',
          disabled && 'rf-field--disabled',
          readOnly && 'rf-field--readonly',
          className,
        )}
      >
        {labelAction ? (
          <div className="rf-field__label-row">
            <label
              htmlFor={inputId}
              className={hideLabel ? 'visually-hidden' : 'rf-field__label'}
            >
              {label}
              {required ? (
                <span className="rf-field__required"> required</span>
              ) : null}
            </label>
            {labelAction}
          </div>
        ) : (
          <label
            htmlFor={inputId}
            className={hideLabel ? 'visually-hidden' : 'rf-field__label'}
          >
            {label}
            {required ? (
              <span className="rf-field__required"> required</span>
            ) : null}
          </label>
        )}

        <div className="rf-field__input-wrap">
          {leading ? <span className="rf-field__leading">{leading}</span> : null}
          <input
            ref={ref}
            id={inputId}
            className="rf-field__input"
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            disabled={disabled}
            readOnly={readOnly}
            required={required}
            onFocus={(e) => {
              onFocus?.(e);
            }}
            onBlur={(e) => {
              onBlur?.(e);
            }}
            {...rest}
          />
          {trailing ? (
            <span className="rf-field__trailing">{trailing}</span>
          ) : null}
        </div>

        {error ? (
          <div id={errorId} className="rf-field__hint" role="alert">
            {error}
          </div>
        ) : hint ? (
          <div id={hintId} className="rf-field__hint">
            {hint}
          </div>
        ) : null}
      </div>
    );
  },
);
