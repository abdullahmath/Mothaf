'use client';

import { saveDestinationAction } from '@/server/actions/content';
import { LOCALES, LOCALE_META, type AppLocale } from '@/lib/i18n/config';
import {
  AdminForm,
  Field,
  Fieldset,
  Select,
  TextInput,
} from './AdminForm';
import { TranslationFields, type TranslationValues } from './TranslationFields';

export type DestinationFormValues = {
  id?: string;
  slug: string;
  defaultLocale: string;
  status: string;
  coverMediaId: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  translations: TranslationValues;
};

/**
 * Create and edit a destination.
 *
 * One form covers both, distinguished only by a hidden id, so the two paths
 * cannot drift apart in validation or in layout.
 */
export function DestinationForm({
  locale,
  values,
  canPublish,
  mediaOptions,
}: {
  locale: AppLocale;
  values: DestinationFormValues;
  canPublish: boolean;
  mediaOptions: { value: string; label: string }[];
}) {
  return (
    <AdminForm action={saveDestinationAction} submitLabel={values.id ? 'Save changes' : 'Create'}>
      {(state) => {
        const fieldError = (name: string) => (state && !state.ok ? state.fields?.[name] : undefined);

        return (
          <>
            {values.id && <input type="hidden" name="id" value={values.id} />}
            <input type="hidden" name="locale" value={locale} />

            <Fieldset legend="Identity">
              <Field
                label="URL slug"
                name="slug"
                hint="Appears in the address, e.g. /ar/destinations/roman-theatre-jableh"
                error={fieldError('slug')}
              >
                <TextInput name="slug" defaultValue={values.slug} latin required />
              </Field>

              <Field
                label="Source language"
                name="defaultLocale"
                hint="Used to fill any field a visitor's language has not translated, so nothing renders blank."
                error={fieldError('defaultLocale')}
              >
                <Select
                  name="defaultLocale"
                  defaultValue={values.defaultLocale}
                  options={LOCALES.map((code) => ({
                    value: code,
                    label: `${LOCALE_META[code].nativeName} (${code})`,
                  }))}
                />
              </Field>

              <Field
                label="Status"
                name="status"
                hint={canPublish ? undefined : 'You can save drafts. Publishing needs a reviewer.'}
                error={fieldError('status')}
              >
                <Select
                  name="status"
                  defaultValue={values.status}
                  options={[
                    { value: 'draft', label: 'Draft' },
                    ...(canPublish ? [{ value: 'published', label: 'Published' }] : []),
                    { value: 'archived', label: 'Archived' },
                  ]}
                />
              </Field>
            </Fieldset>

            <TranslationFields
              legend="Content"
              values={values.translations}
              fields={[
                { name: 'name', label: 'Name' },
                { name: 'tagline', label: 'Tagline', hint: 'One line, shown under the title.' },
                { name: 'summary', label: 'Summary', kind: 'textarea', rows: 3 },
                { name: 'description', label: 'Description', kind: 'textarea', rows: 6 },
                {
                  name: 'historicalContext',
                  label: 'Historical background',
                  kind: 'textarea',
                  rows: 6,
                  hint: 'Shown separately from the description, for readers who want the history.',
                },
              ]}
            />

            <Fieldset legend="Presentation">
              <Field label="Cover image" name="coverMediaId" error={fieldError('coverMediaId')}>
                <Select
                  name="coverMediaId"
                  defaultValue={values.coverMediaId}
                  options={[{ value: '', label: '— none —' }, ...mediaOptions]}
                />
              </Field>
            </Fieldset>

            <Fieldset
              legend="Location"
              description="Optional. Used for map placement and structured data."
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Country code" name="countryCode" error={fieldError('countryCode')}>
                  <TextInput
                    name="countryCode"
                    defaultValue={values.countryCode}
                    latin
                    maxLength={2}
                    placeholder="SY"
                  />
                </Field>
                <Field label="Latitude" name="latitude" error={fieldError('latitude')}>
                  <TextInput name="latitude" defaultValue={values.latitude} latin inputMode="decimal" />
                </Field>
                <Field label="Longitude" name="longitude" error={fieldError('longitude')}>
                  <TextInput
                    name="longitude"
                    defaultValue={values.longitude}
                    latin
                    inputMode="decimal"
                  />
                </Field>
              </div>
            </Fieldset>
          </>
        );
      }}
    </AdminForm>
  );
}
