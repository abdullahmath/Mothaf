'use client';

import { useState } from 'react';
import { savePoiCategoryAction } from '@/server/actions/content';
import type { AppLocale } from '@/lib/i18n/config';
import { AdminForm, Field, TextInput } from './AdminForm';

/**
 * Inline category creation.
 *
 * `createCategory` in the domain layer has no matching update — categories are
 * add-only from the admin for now, which is enough to unblock assigning one to
 * a POI without a separate page.
 */
export function PoiCategoryQuickAdd({
  locale,
  destinationId,
  onDone,
}: {
  locale: AppLocale;
  destinationId: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-verdigris">
        + New category
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-[var(--hairline)] p-3">
      <AdminForm
        action={async (prev, formData) => {
          const result = await savePoiCategoryAction(prev, formData);
          if (result.ok) {
            setOpen(false);
            onDone?.();
          }
          return result;
        }}
        submitLabel="Add category"
      >
        {(state) => {
          const fieldError = (name: string) => (state && !state.ok ? state.fields?.[name] : undefined);
          return (
            <>
              <input type="hidden" name="destinationId" value={destinationId} />
              <input type="hidden" name="locale" value={locale} />
              <Field label="Slug" name="slug" error={fieldError('slug')}>
                <TextInput name="slug" latin required />
              </Field>
              <Field label="Colour" name="color" hint="Hex, e.g. #4FB3A0" error={fieldError('color')}>
                <TextInput name="color" latin defaultValue="#4FB3A0" required />
              </Field>
              <Field label="Name (Arabic)" name="name.ar">
                <TextInput name="name.ar" dir="rtl" lang="ar" />
              </Field>
              <Field label="Name (English)" name="name.en">
                <TextInput name="name.en" dir="ltr" lang="en" />
              </Field>
            </>
          );
        }}
      </AdminForm>
    </div>
  );
}
