'use client';

import { saveSceneAction } from '@/server/actions/content';
import type { AppLocale } from '@/lib/i18n/config';
import { AdminForm, Checkbox, Field, Fieldset, Select, TextInput } from './AdminForm';
import { TranslationFields, type TranslationValues } from './TranslationFields';

export type SceneFormValues = {
  id?: string;
  tourId: string;
  slug: string;
  kind: string;
  status: string;
  isStart: boolean;
  backgroundMediaId: string | null;
  thumbnailMediaId: string | null;
  audioMediaId: string | null;
  yaw: number;
  pitch: number;
  fov: number;
  northOffsetDeg: number;
  translations: TranslationValues;
};

export function SceneForm({
  locale,
  values,
  imageOptions,
  audioOptions,
}: {
  locale: AppLocale;
  values: SceneFormValues;
  imageOptions: { value: string; label: string }[];
  audioOptions: { value: string; label: string }[];
}) {
  return (
    <AdminForm action={saveSceneAction} submitLabel={values.id ? 'Save changes' : 'Create'}>
      {(state) => {
        const fieldError = (name: string) => (state && !state.ok ? state.fields?.[name] : undefined);

        return (
          <>
            {values.id && <input type="hidden" name="id" value={values.id} />}
            <input type="hidden" name="tourId" value={values.tourId} />
            <input type="hidden" name="locale" value={locale} />

            <Fieldset legend="Identity">
              <Field
                label="URL slug"
                name="slug"
                hint="Unique within the tour."
                error={fieldError('slug')}
              >
                <TextInput name="slug" defaultValue={values.slug} latin required />
              </Field>

              <Field label="Kind" name="kind" error={fieldError('kind')}>
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

              <Checkbox
                name="isStart"
                label="Entry point of the tour"
                defaultChecked={values.isStart}
              />
            </Fieldset>

            <TranslationFields
              legend="Content"
              values={values.translations}
              fields={[
                { name: 'title', label: 'Title' },
                { name: 'summary', label: 'Summary', kind: 'textarea', rows: 2 },
                { name: 'description', label: 'Description', kind: 'textarea', rows: 4 },
              ]}
            />

            <Fieldset legend="Media">
              <Field
                label="Background (360° image)"
                name="backgroundMediaId"
                error={fieldError('backgroundMediaId')}
              >
                <Select
                  name="backgroundMediaId"
                  defaultValue={values.backgroundMediaId}
                  options={[{ value: '', label: '— none —' }, ...imageOptions]}
                />
              </Field>
              <Field label="Thumbnail" name="thumbnailMediaId">
                <Select
                  name="thumbnailMediaId"
                  defaultValue={values.thumbnailMediaId}
                  options={[{ value: '', label: '— use background —' }, ...imageOptions]}
                />
              </Field>
              <Field label="Ambient audio" name="audioMediaId">
                <Select
                  name="audioMediaId"
                  defaultValue={values.audioMediaId}
                  options={[{ value: '', label: '— none —' }, ...audioOptions]}
                />
              </Field>
            </Fieldset>

            <Fieldset
              legend="Starting camera"
              description="Where the visitor is looking when this scene loads, in degrees."
            >
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="Yaw" name="yaw" error={fieldError('yaw')}>
                  <TextInput name="yaw" defaultValue={values.yaw} latin inputMode="decimal" />
                </Field>
                <Field label="Pitch" name="pitch" error={fieldError('pitch')}>
                  <TextInput name="pitch" defaultValue={values.pitch} latin inputMode="decimal" />
                </Field>
                <Field label="Field of view" name="fov" error={fieldError('fov')}>
                  <TextInput name="fov" defaultValue={values.fov} latin inputMode="decimal" />
                </Field>
                <Field
                  label="North offset"
                  name="northOffsetDeg"
                  error={fieldError('northOffsetDeg')}
                >
                  <TextInput
                    name="northOffsetDeg"
                    defaultValue={values.northOffsetDeg}
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
