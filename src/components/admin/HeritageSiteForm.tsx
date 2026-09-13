'use client';

import { saveHeritageSiteAction } from '@/server/actions/content';
import type { AppLocale } from '@/lib/i18n/config';
import { AdminForm, Field, Fieldset, Select, TextInput } from './AdminForm';
import { TranslationFields, type TranslationValues } from './TranslationFields';

export type HeritageSiteFormValues = {
  id?: string;
  destinationId: string;
  slug: string;
  status: string;
  coverMediaId: string | null;
  latitude: number | null;
  longitude: number | null;
  galleryMediaIds: string[];
  translations: TranslationValues;
};

export function HeritageSiteForm({
  locale,
  values,
  destinationOptions,
  mediaOptions,
}: {
  locale: AppLocale;
  values: HeritageSiteFormValues;
  destinationOptions: { value: string; label: string }[];
  mediaOptions: { value: string; label: string }[];
}) {
  return (
    <AdminForm action={saveHeritageSiteAction} submitLabel={values.id ? 'Save changes' : 'Create'}>
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

            <TranslationFields
              legend="Content"
              values={values.translations}
              fields={[
                { name: 'title', label: 'Name' },
                { name: 'shortDescription', label: 'Short description', kind: 'textarea', rows: 2 },
                {
                  name: 'description',
                  label: 'Full description / historical content',
                  kind: 'textarea',
                  rows: 8,
                },
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

              <Field
                label="Gallery"
                name="galleryMediaIds"
                hint="Additional photos shown on the site's public page."
                error={fieldError('galleryMediaIds')}
              >
                {mediaOptions.length === 0 ? (
                  <p className="text-sm text-lime-faint">Upload images to the media library first.</p>
                ) : (
                  <div className="grid max-h-64 gap-2 overflow-y-auto rounded-md border border-[var(--hairline)] p-3 sm:grid-cols-2">
                    {mediaOptions.map((option) => (
                      <label key={option.value} className="flex items-center gap-2.5 text-sm text-lime-dim">
                        <input
                          type="checkbox"
                          name="galleryMediaIds"
                          value={option.value}
                          defaultChecked={values.galleryMediaIds.includes(option.value)}
                          className="h-4 w-4 accent-[var(--color-verdigris)]"
                        />
                        <span className="truncate">{option.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </Field>
            </Fieldset>

            <Fieldset legend="Location" description="Optional.">
              <div className="grid gap-4 sm:grid-cols-2">
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
