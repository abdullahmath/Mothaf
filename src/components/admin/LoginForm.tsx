'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction } from '@/server/actions/auth';
import type { ActionResult } from '@/server/domain/admin/shared';
import type { AppLocale } from '@/lib/i18n/config';

/**
 * Sign-in form.
 *
 * A plain `<form action={...}>`, so it works before hydration and cannot be
 * left in a broken state by a JavaScript failure. `useActionState` adds the
 * error rendering; `useFormStatus` disables the button while the request is in
 * flight, which is what stops an impatient double-submit from burning two of
 * the account's rate-limit tokens.
 */
export function LoginForm({
  locale,
  next,
  labels,
}: {
  locale: AppLocale;
  next?: string;
  labels: { email: string; password: string; submit: string; submitting: string };
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(loginAction, null);

  return (
    <form action={formAction} className="mt-8 grid gap-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {next && <input type="hidden" name="next" value={next} />}

      {state && !state.ok && (
        // `alert` announces the failure to a screen reader without the user
        // having to hunt for what changed.
        <p role="alert" className="rounded-md border border-[var(--color-danger)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {state.message}
        </p>
      )}

      <label className="grid gap-1.5">
        <span className="text-sm text-lime-dim">{labels.email}</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          dir="ltr"
          className="admin-input"
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm text-lime-dim">{labels.password}</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          dir="ltr"
          className="admin-input"
        />
      </label>

      <Submit label={labels.submit} pendingLabel={labels.submitting} />
    </form>
  );
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary mt-2" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
