'use client';

import { useState } from 'react';
import { uploadMediaAction } from '@/server/actions/media';
import type { AppLocale } from '@/lib/i18n/config';
import { AdminForm, Field, Select, TextInput } from './AdminForm';

/**
 * Upload form.
 *
 * The kind selector is not cosmetic: choosing "360° panorama" makes the server
 * enforce a 2:1 equirectangular ratio and produce the half-resolution texture
 * the viewer needs. Uploading a normal photograph as a panorama is a mistake
 * worth catching at the door rather than discovering as a smeared scene.
 *
 * The `accept` attribute below is a convenience for the file picker only. The
 * server identifies the format from the file's own bytes and ignores both the
 * extension and the browser's declared type.
 */
export function MediaUploader({ locale }: { locale: AppLocale }) {
  const [kind, setKind] = useState('image');

  return (
    <div className="rounded-md border border-[var(--hairline)] p-5">
      <AdminForm action={uploadMediaAction} submitLabel="Upload">
        {(state) => (
          <div className="grid gap-5">
            <input type="hidden" name="locale" value={locale} />

            <Field
              label="What kind of file is this?"
              name="kind"
              hint={
                kind === 'panorama'
                  ? 'Must be a 2:1 equirectangular image, as produced by a 360° camera.'
                  : undefined
              }
            >
              <select
                id="kind"
                name="kind"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
                className="admin-select"
              >
                <option value="image">Image</option>
                <option value="panorama">360° panorama</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
              </select>
            </Field>

            <Field label="File" name="file" error={state && !state.ok ? state.fields?.file : undefined}>
              <input
                id="file"
                name="file"
                type="file"
                required
                accept={
                  kind === 'video'
                    ? 'video/mp4,video/webm'
                    : kind === 'audio'
                      ? 'audio/mpeg,audio/mp4,audio/ogg,audio/wav'
                      : 'image/jpeg,image/png,image/webp,image/avif'
                }
                className="admin-input file:me-3 file:rounded-sm file:border-0 file:bg-[var(--color-stone-2)] file:px-3 file:py-1.5 file:text-sm file:text-lime"
              />
            </Field>

            <Field
              label="Alternative text (Arabic)"
              name="altText.ar"
              hint="What the image shows, for anyone who cannot see it. Leave blank only if it is purely decorative."
            >
              <TextInput name="altText.ar" dir="rtl" lang="ar" />
            </Field>

            <Field label="Alternative text (English)" name="altText.en">
              <TextInput name="altText.en" dir="ltr" lang="en" />
            </Field>
          </div>
        )}
      </AdminForm>
    </div>
  );
}

export { Select };
