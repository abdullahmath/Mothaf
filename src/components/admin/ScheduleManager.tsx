'use client';

import { useState } from 'react';
import { addScheduleItemAction, deleteScheduleItemAction } from '@/server/actions/content';
import type { AppLocale } from '@/lib/i18n/config';
import { AdminForm, Field, TextInput } from './AdminForm';

export type ScheduleItemRow = {
  id: string;
  startsAt: string;
  translations: { locale: string; title: string }[];
};

export function ScheduleManager({
  eventId,
  locale,
  items,
}: {
  eventId: string;
  locale: AppLocale;
  items: ScheduleItemRow[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="grid gap-3">
      {items.length === 0 && <p className="text-sm text-lime-faint">No programme items yet.</p>}

      {items.map((item) => {
        const title = item.translations.find((t) => t.locale === locale)?.title ?? item.id;
        return (
          <div
            key={item.id}
            className="flex items-center justify-between gap-4 rounded-md border border-[var(--hairline)] p-3"
          >
            <div>
              <p className="text-sm text-lime">{title}</p>
              <p className="readout">{new Date(item.startsAt).toLocaleString(locale)}</p>
            </div>
            <form action={deleteScheduleItemAction}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="locale" value={locale} />
              <button type="submit" className="btn btn-quiet text-xs text-[var(--color-danger)]">
                Delete
              </button>
            </form>
          </div>
        );
      })}

      <button type="button" onClick={() => setAdding((v) => !v)} className="btn btn-quiet">
        {adding ? 'Cancel' : '+ Add programme item'}
      </button>

      {adding && (
        <div className="rounded-md border border-[var(--hairline)] p-3">
          <AdminForm
            action={async (prev, formData) => {
              const result = await addScheduleItemAction(prev, formData);
              if (result.ok) setAdding(false);
              return result;
            }}
            submitLabel="Add"
          >
            {(state) => {
              const fieldError = (name: string) =>
                state && !state.ok ? state.fields?.[name] : undefined;
              return (
                <>
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="locale" value={locale} />
                  <Field label="Starts" name="startsAt" error={fieldError('startsAt')}>
                    <input
                      type="datetime-local"
                      id="startsAt"
                      name="startsAt"
                      required
                      className="admin-input"
                      data-latin="true"
                    />
                  </Field>
                  <Field label="Title (Arabic)" name="title.ar">
                    <TextInput name="title.ar" dir="rtl" lang="ar" />
                  </Field>
                  <Field label="Title (English)" name="title.en">
                    <TextInput name="title.en" dir="ltr" lang="en" />
                  </Field>
                  <Field label="Performer" name="performer.en">
                    <TextInput name="performer.en" dir="ltr" />
                  </Field>
                  <Field label="Location" name="location.en">
                    <TextInput name="location.en" dir="ltr" />
                  </Field>
                </>
              );
            }}
          </AdminForm>
        </div>
      )}
    </div>
  );
}
