'use client';

import { savePoiAction } from '@/server/actions/content';
import type { AppLocale } from '@/lib/i18n/config';
import { AdminForm, Field, Fieldset, Select, TextInput } from './AdminForm';
import { PoiCategoryQuickAdd } from './PoiCategoryQuickAdd';
import { TranslationFields, type TranslationValues } from './TranslationFields';

export type PoiFormValues = {
  id?: string;
  destinationId: string;
  categoryId: string | null;
  slug: string;
  status: string;
  coverMediaId: string | null;
  latitude: number | null;
  longitude: number | null;
  tags: string;
  translations: TranslationValues;
};

export function PoiForm({
  locale,
  values,
  destinationOptions,
  categoryOptions,
  mediaOptions,
}: {
  locale: AppLocale;
  values: PoiFormValues;
  destinationOptions: { value: string; label: string }[];
  categoryOptions: { value: string; label: string }[];
  mediaOptions: { value: string; label: string }[];
}) {
  return (
    <AdminForm action={savePoiAction} submitLabel={values.id ? 'Save changes' : 'Create'}>
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

              <Field
                label="Category"
                name="categoryId"
                hint="Must belong to the same destination as this point of interest."
                error={fieldError('categoryId')}
              >
                <Select
                  name="categoryId"
                  defaultValue={values.categoryId}
                  options={[{ value: '', label: '— none —' }, ...categoryOptions]}
                />
              </Field>
              <PoiCategoryQuickAdd locale={locale} destinationId={values.destinationId} />
            </Fieldset>

            <TranslationFields
              legend="Content"
              values={values.translations}
              fields={[
                { name: 'title', label: 'Title' },
                { name: 'shortDescription', label: 'Short description', kind: 'textarea', rows: 2 },
                { name: 'description', label: 'Description', kind: 'textarea', rows: 5 },
                {
                  name: 'historicalInfo',
                  label: 'Historical background',
                  kind: 'textarea',
                  rows: 5,
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
                label="Tags"
                name="tags"
                hint="Comma-separated, locale-independent keys (e.g. seating, stage)."
              >
                <TextInput name="tags" defaultValue={values.tags} latin />
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
