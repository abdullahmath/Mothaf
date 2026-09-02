'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionResult } from '@/server/domain/admin/shared';

/**
 * Form primitives shared across the admin.
 *
 * They exist to make three things consistent everywhere: errors appear beside
 * the field they belong to, the submit button disables itself while a request
 * is in flight, and success is confirmed rather than silent. Editors work fast
 * and repetitively, and a form that gives no feedback gets double-submitted.
 */

export type AdminFormAction = (
  previous: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

export function AdminForm({
  action,
  children,
  submitLabel = 'Save',
  secondary,
}: {
  action: AdminFormAction;
  children: (state: ActionResult | null) => React.ReactNode;
  submitLabel?: string;
  secondary?: React.ReactNode;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(action, null);

  return (
    <form action={formAction} className="grid gap-8" noValidate>
      {state && (
        <p
          role={state.ok ? 'status' : 'alert'}
          className={[
            'rounded-md border px-3 py-2 text-sm',
            state.ok
              ? 'border-verdigris text-verdigris'
              : 'border-[var(--color-danger)] text-[var(--color-danger)]',
          ].join(' ')}
        >
          {state.ok ? (state.message ?? 'Saved.') : state.message}
        </p>
      )}

      {children(state)}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] pt-6">
        <SubmitButton label={submitLabel} />
        {secondary}
      </div>
    </form>
  );
}

export function SubmitButton({
  label,
  variant = 'primary',
}: {
  label: string;
  variant?: 'primary' | 'quiet';
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`btn ${variant === 'primary' ? 'btn-primary' : 'btn-quiet'}`}
    >
      {pending ? '…' : label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Fields                                                                    */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  name,
  hint,
  error,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const errorId = error ? `${name}-error` : undefined;
  const hintId = hint ? `${name}-hint` : undefined;

  return (
    <div className="grid gap-1.5">
      <label htmlFor={name} className="text-sm text-lime-dim">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-lime-faint">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={errorId} className="admin-field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({
  name,
  defaultValue,
  error,
  latin,
  type = 'text',
  ...rest
}: {
  name: string;
  defaultValue?: string | number | null;
  error?: string;
  /** Slugs, hex colours, coordinates: kept LTR even in an Arabic interface. */
  latin?: boolean;
  type?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'defaultValue' | 'type'>) {
  return (
    <input
      id={name}
      name={name}
      type={type}
      defaultValue={defaultValue ?? ''}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? `${name}-error` : undefined}
      data-latin={latin ? 'true' : undefined}
      className="admin-input"
      {...rest}
    />
  );
}

export function TextArea({
  name,
  defaultValue,
  error,
  rows = 4,
  dir,
}: {
  name: string;
  defaultValue?: string | null;
  error?: string;
  rows?: number;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <textarea
      id={name}
      name={name}
      rows={rows}
      dir={dir}
      defaultValue={defaultValue ?? ''}
      aria-invalid={error ? 'true' : undefined}
      className="admin-textarea"
    />
  );
}

export function Select({
  name,
  defaultValue,
  options,
  error,
}: {
  name: string;
  defaultValue?: string | null;
  options: { value: string; label: string }[];
  error?: string;
}) {
  return (
    <select
      id={name}
      name={name}
      defaultValue={defaultValue ?? ''}
      aria-invalid={error ? 'true' : undefined}
      className="admin-select"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-lime-dim">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="h-4 w-4 accent-[var(--color-verdigris)]"
      />
      {label}
    </label>
  );
}

export function Fieldset({
  legend,
  description,
  children,
}: {
  legend: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="grid gap-4 border-t border-[var(--hairline)] pt-6">
      <legend className="eyebrow">{legend}</legend>
      {description && <p className="-mt-2 text-xs text-lime-faint">{description}</p>}
      {children}
    </fieldset>
  );
}
