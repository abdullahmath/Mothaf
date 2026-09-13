'use client';

import { changePasswordAction } from '@/server/actions/auth';
import type { AppLocale } from '@/lib/i18n/config';
import { AdminForm, Field, TextInput } from './AdminForm';

export function ChangePasswordForm({ locale }: { locale: AppLocale }) {
  return (
    <AdminForm action={changePasswordAction} submitLabel="Change password">
      {(state) => {
        const fieldError = (name: string) => (state && !state.ok ? state.fields?.[name] : undefined);

        return (
          <>
            <input type="hidden" name="locale" value={locale} />

            <Field
              label="Current password"
              name="currentPassword"
              error={fieldError('currentPassword')}
            >
              <TextInput
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                latin
                required
              />
            </Field>

            <Field
              label="New password"
              name="newPassword"
              hint="At least 12 characters."
              error={fieldError('newPassword')}
            >
              <TextInput
                name="newPassword"
                type="password"
                autoComplete="new-password"
                latin
                required
              />
            </Field>

            <Field
              label="Confirm new password"
              name="confirmPassword"
              error={fieldError('confirmPassword')}
            >
              <TextInput
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                latin
                required
              />
            </Field>

            <p className="text-xs text-lime-faint">
              Changing your password signs you out of every device, including this one — you will
              need to sign in again.
            </p>
          </>
        );
      }}
    </AdminForm>
  );
}
