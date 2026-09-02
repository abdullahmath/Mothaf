'use client';

import { saveTourAction } from '@/server/actions/content';
import type { AppLocale } from '@/lib/i18n/config';
import { AdminForm, Checkbox, Field, Fieldset, Select, TextInput } from './AdminForm';
import { TranslationFields, type TranslationValues } from './TranslationFields';

export type TourFormValues = {
  id?: string;
  destinationId: string;
  slug: string;
  kind: string;
  status: string;
  coverMediaId: string | null;
  estimatedMinutes: number | null;
  settings: {
    autoRotate?: boolean;
    showCompass?: boolean;
    showSceneList?: boolean;
    showHotspotLabels?: boolean;
  };
  translations: TranslationValues;
};

export function TourForm({
  locale,
  values,
  canPublish,
  destinationOptions,
  mediaOptions,
}: {
  locale: AppLocale;
  values: TourFormValues;
  canPublish: boolean;
  destinationOptions: { value: string; label: string }[];
  mediaOptions: { value: string; label: string }[];
}) {
  return (
    <AdminForm action={saveTourAction} submitLabel={values.id ? 'Save changes' : 'Create'}>
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
                label="URL slug"
                name="slug"
                hint="Unique within the destination. Two sites may each have a tour called virtual-tour."
                error={fieldError('slug')}
              >
                <TextInput name="slug" defaultValue={values.slug} latin required />
              </Field>

              <Field
                label="Experience type"
                name="kind"
                hint="Selects how scenes are rendered. Panorama and image ship today; map and story are reserved."
                error={fieldError('kind')}
              >
                <Select
                  name="kind"
                  defaultValue={values.kind}
                  options={[
                    { value: 'panorama', label: '360° panorama' },
                    { value: 'image', label: 'Flat image' },
                    { value: 'map', label: 'Map (not yet rendered)' },
                    { value: 'story', label: 'Story (not yet rendered)' },
                  ]}
                />
              </Field>

              <Field
                label="Status"
                name="status"
                hint={
                  canPublish
                    ? 'A tour cannot be published until at least one of its scenes is.'
                    : 'You can save drafts. Publishing needs a reviewer.'
                }
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
                { name: 'title', label: 'Title' },
                { name: 'summary', label: 'Summary', kind: 'textarea', rows: 3 },
                { name: 'description', label: 'Description', kind: 'textarea', rows: 5 },
                {
                  name: 'welcomeMessage',
                  label: 'Welcome message',
                  kind: 'textarea',
                  rows: 2,
                  hint: 'Shown once on entry, to orient the visitor.',
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
                label="Estimated minutes"
                name="estimatedMinutes"
                hint="Shown on the destination page so a visitor knows what they are committing to."
                error={fieldError('estimatedMinutes')}
              >
                <TextInput
                  name="estimatedMinutes"
                  defaultValue={values.estimatedMinutes}
                  latin
                  inputMode="numeric"
                />
              </Field>

              <div className="grid gap-3 pt-2">
                <Checkbox
                  name="showCompass"
                  label="Show the bearing rail"
                  defaultChecked={values.settings.showCompass !== false}
                />
                <Checkbox
                  name="showSceneList"
                  label="Show the scene list"
                  defaultChecked={values.settings.showSceneList !== false}
                />
                <Checkbox
                  name="showHotspotLabels"
                  label="Always show hotspot labels"
                  defaultChecked={Boolean(values.settings.showHotspotLabels)}
                />
                <Checkbox
                  name="autoRotate"
                  label="Drift slowly when idle"
                  defaultChecked={Boolean(values.settings.autoRotate)}
                />
                <p className="text-xs text-lime-faint">
                  Drift is suppressed automatically for visitors who ask for reduced motion.
                </p>
              </div>
            </Fieldset>
          </>
        );
      }}
    </AdminForm>
  );
}
