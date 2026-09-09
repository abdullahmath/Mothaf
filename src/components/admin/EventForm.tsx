'use client';

import { saveEventAction } from '@/server/actions/content';
import type { AppLocale } from '@/lib/i18n/config';
import { AdminForm, Field, Fieldset, Select, TextInput } from './AdminForm';
import { TranslationFields, type TranslationValues } from './TranslationFields';

/** `YYYY-MM-DDTHH:mm`, what `<input type="datetime-local">` needs and returns. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type EventFormValues = {
  id?: string;
  destinationId: string;
  tourId: string | null;
  slug: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  coverMediaId: string | null;
  translations: TranslationValues;
};

export function EventForm({
  locale,
  values,
  destinationOptions,
  tourOptions,
  mediaOptions,
}: {
  locale: AppLocale;
  values: EventFormValues;
  destinationOptions: { value: string; label: string }[];
  tourOptions: { value: string; label: string }[];
  mediaOptions: { value: string; label: string }[];
}) {
  return (
    <AdminForm action={saveEventAction} submitLabel={values.id ? 'Save changes' : 'Create'}>
      {(state) => {
        const fieldError = (name: string) => (state && !state.ok ? state.fields?.[name] : undefined);

        return (
          <>
            {values.id && <input type="hidden" name="id" value={values.id} />}
            <input type="hidden" name="locale" value={locale} />

            <Fieldset legend="Identity">
              <Field label="Destination" name="destinationId" error={fieldError('destinationId')}>
                <Select
                  name="destinationId"
                  defaultValue={values.destinationId}
                  options={destinationOptions}
                />
              </Field>
              <Field
                label="Related tour"
                name="tourId"
                hint="Optional — lets a visitor jump from the event to the venue's tour."
              >
                <Select
                  name="tourId"
                  defaultValue={values.tourId}
                  options={[{ value: '', label: '— none —' }, ...tourOptions]}
                />
              </Field>
              <Field label="URL slug" name="slug" error={fieldError('slug')}>
                <TextInput name="slug" defaultValue={values.slug} latin required />
              </Field>
              <Field label="Status" name="status" error={fieldError('status')}>
                <Select
                  name="status"
                  defaultValue={values.status}
                  options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'published', label: 'Published' },
                    { value: 'archived', label: 'Archived' },
                  ]}
                />
              </Field>
            </Fieldset>

            <Fieldset legend="Dates">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Starts" name="startsAt" error={fieldError('startsAt')}>
                  <input
                    type="datetime-local"
                    id="startsAt"
                    name="startsAt"
                    defaultValue={toLocalInput(values.startsAt)}
                    required
                    className="admin-input"
                    data-latin="true"
                  />
                </Field>
                <Field label="Ends" name="endsAt" error={fieldError('endsAt')}>
                  <input
                    type="datetime-local"
                    id="endsAt"
                    name="endsAt"
                    defaultValue={toLocalInput(values.endsAt)}
                    required
                    className="admin-input"
                    data-latin="true"
                  />
                </Field>
              </div>
              <Field
                label="Timezone"
                name="timezone"
                hint="IANA name, e.g. Asia/Damascus."
                error={fieldError('timezone')}
              >
                <TextInput name="timezone" defaultValue={values.timezone} latin />
              </Field>
            </Fieldset>

            <TranslationFields
              legend="Content"
              values={values.translations}
              fields={[
                { name: 'title', label: 'Title' },
                { name: 'summary', label: 'Summary', kind: 'textarea', rows: 2 },
                { name: 'description', label: 'Description', kind: 'textarea', rows: 5 },
                { name: 'organizer', label: 'Organiser' },
                { name: 'venue', label: 'Venue' },
                { name: 'admissionInfo', label: 'Admission', kind: 'textarea', rows: 2 },
              ]}
            />

            <Fieldset legend="Presentation">
              <Field label="Cover image" name="coverMediaId">
                <Select
                  name="coverMediaId"
                  defaultValue={values.coverMediaId}
                  options={[{ value: '', label: '— none —' }, ...mediaOptions]}
                />
              </Field>
            </Fieldset>
          </>
        );
      }}
    </AdminForm>
  );
}
