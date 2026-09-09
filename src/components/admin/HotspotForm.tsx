'use client';

import { useState } from 'react';
import { deleteHotspotAction, saveHotspotAction } from '@/server/actions/content';
import { hotspotActionEnum } from '@/server/db/schema';
import type { AppLocale } from '@/lib/i18n/config';
import { AdminForm, Checkbox, Field, Select, TextInput } from './AdminForm';
import { TranslationFields, type TranslationValues } from './TranslationFields';

export type HotspotFormValues = {
  id?: string;
  sceneId: string;
  actionType: string;
  target: Record<string, string>;
  yawDeg: number | null;
  pitchDeg: number | null;
  icon: string;
  style: string;
  status: string;
  translations: TranslationValues;
};

/** One `<Field>` per action type's own target — matches payloadFromForm in content.ts. */
function TargetFields({
  actionType,
  target,
  options,
}: {
  actionType: string;
  target: Record<string, string>;
  options: HotspotFormProps['options'];
}) {
  switch (actionType) {
    case 'navigate':
      return (
        <Field label="Target scene" name="target.sceneId">
          <Select
            name="target.sceneId"
            defaultValue={target.sceneId}
            options={[{ value: '', label: '— choose —' }, ...options.scenes]}
          />
        </Field>
      );
    case 'poi':
      return (
        <Field label="Point of interest" name="target.poiId">
          <Select
            name="target.poiId"
            defaultValue={target.poiId}
            options={[{ value: '', label: '— choose —' }, ...options.pois]}
          />
        </Field>
      );
    case 'event':
      return (
        <Field label="Event" name="target.eventId">
          <Select
            name="target.eventId"
            defaultValue={target.eventId}
            options={[{ value: '', label: '— choose —' }, ...options.events]}
          />
        </Field>
      );
    case 'image':
    case 'audio':
    case 'video':
      return (
        <>
          <Field label="Media file" name="target.mediaId">
            <Select
              name="target.mediaId"
              defaultValue={target.mediaId}
              options={[{ value: '', label: '— choose —' }, ...options.media]}
            />
          </Field>
          {actionType === 'video' && (
            <Checkbox name="target.autoplay" label="Autoplay" defaultChecked={target.autoplay === 'true'} />
          )}
        </>
      );
    case 'link':
      return (
        <Field label="URL" name="target.url" hint="http(s) only.">
          <TextInput name="target.url" defaultValue={target.url} latin />
        </Field>
      );
    default:
      return null;
  }
}

type HotspotFormProps = {
  locale: AppLocale;
  values: HotspotFormValues;
  options: {
    scenes: { value: string; label: string }[];
    pois: { value: string; label: string }[];
    events: { value: string; label: string }[];
    media: { value: string; label: string }[];
  };
  onDone?: () => void;
};

export function HotspotForm({ locale, values, options, onDone }: HotspotFormProps) {
  const [actionType, setActionType] = useState(values.actionType);

  return (
    <AdminForm
      action={async (prev, formData) => {
        const result = await saveHotspotAction(prev, formData);
        if (result.ok) onDone?.();
        return result;
      }}
      submitLabel={values.id ? 'Save hotspot' : 'Add hotspot'}
      secondary={
        values.id && (
          <form action={deleteHotspotAction}>
            <input type="hidden" name="id" value={values.id} />
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="btn btn-quiet text-[var(--color-danger)]">
              Delete
            </button>
          </form>
        )
      }
    >
      {(state) => {
        const fieldError = (name: string) => (state && !state.ok ? state.fields?.[name] : undefined);
        return (
          <>
            {values.id && <input type="hidden" name="id" value={values.id} />}
            <input type="hidden" name="sceneId" value={values.sceneId} />
            <input type="hidden" name="locale" value={locale} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Yaw (bearing)" name="yawDeg" error={fieldError('yawDeg')}>
                <TextInput name="yawDeg" defaultValue={values.yawDeg} latin inputMode="decimal" />
              </Field>
              <Field label="Pitch" name="pitchDeg" error={fieldError('pitchDeg')}>
                <TextInput name="pitchDeg" defaultValue={values.pitchDeg} latin inputMode="decimal" />
              </Field>
            </div>

            <Field label="Action" name="actionType">
              <select
                name="actionType"
                value={actionType}
                onChange={(event) => setActionType(event.target.value)}
                className="admin-select"
              >
                {hotspotActionEnum.enumValues.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>

            <TargetFields actionType={actionType} target={values.target} options={options} />

            <Field label="Style" name="style">
              <Select
                name="style"
                defaultValue={values.style}
                options={[
                  { value: 'pulse', label: 'Pulse' },
                  { value: 'pin', label: 'Pin' },
                  { value: 'arrow', label: 'Arrow' },
                  { value: 'label', label: 'Label' },
                ]}
              />
            </Field>

            <TranslationFields
              legend="Label"
              values={values.translations}
              fields={[
                { name: 'label', label: 'Label' },
                { name: 'description', label: 'Description (for the "info" action)', kind: 'textarea', rows: 2 },
              ]}
            />
          </>
        );
      }}
    </AdminForm>
  );
}
