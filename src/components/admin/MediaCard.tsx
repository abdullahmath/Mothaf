'use client';

import { useState } from 'react';
import { deleteMediaAction, updateMediaTextAction } from '@/server/actions/media';
import { LOCALES, LOCALE_META, type AppLocale } from '@/lib/i18n/config';
import { AdminForm, Field, TextArea, TextInput } from './AdminForm';

export type MediaCardAsset = {
  id: string;
  kind: 'image' | 'panorama' | 'video' | 'audio';
  width: number | null;
  height: number | null;
  byteSize: number;
  mimeType: string;
  originalFilename: string | null;
  previewDataUri: string | null;
  thumbUrl: string;
  variantCount: number;
  translations: {
    locale: string;
    altText: string | null;
    caption: string | null;
    transcript: string | null;
  }[];
};

/**
 * One file in the library.
 *
 * The card leads with whether the file has alternative text, because that is
 * the property most likely to be missing and the one that decides whether the
 * image is usable by everyone. Dimensions and size sit in the data face —
 * they are figures, and an editor scans them rather than reads them.
 */
export function MediaCard({ asset, locale }: { asset: MediaCardAsset; locale: AppLocale }) {
  const [open, setOpen] = useState(false);

  const byLocale = new Map(asset.translations.map((tr) => [tr.locale, tr]));
  const missingAlt = LOCALES.filter((code) => !byLocale.get(code)?.altText);
  const isVisual = asset.kind === 'image' || asset.kind === 'panorama';

  return (
    <div className="overflow-hidden rounded-md border border-[var(--hairline)]">
      <div className="relative aspect-16/10 bg-stone">
        {isVisual ? (
          <img
            src={asset.thumbUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <span className="readout uppercase">{asset.kind}</span>
          </div>
        )}
        {asset.kind === 'panorama' && (
          <span className="chip absolute start-2 top-2 bg-[color-mix(in_oklab,var(--color-ink)_75%,transparent)] backdrop-blur">
            360°
          </span>
        )}
      </div>

      <div className="p-3">
        <p className="truncate text-sm text-lime" title={asset.originalFilename ?? undefined}>
          {asset.originalFilename ?? asset.id.slice(0, 8)}
        </p>
        <p className="readout mt-1">
          {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ''}
          {Math.round(asset.byteSize / 1024)} KB
          {asset.variantCount > 0 ? ` · ${asset.variantCount} variants` : ''}
        </p>

        {isVisual && missingAlt.length > 0 && (
          <p className="mt-2 text-xs" style={{ color: 'var(--color-saffron)' }}>
            No alt text in {missingAlt.map((code) => LOCALE_META[code].nativeName).join(', ')}
          </p>
        )}

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="btn btn-quiet mt-3 h-8 min-h-0 w-full px-3 text-xs"
        >
          {open ? 'Close' : 'Edit descriptions'}
        </button>

        {open && (
          <div className="mt-4 border-t border-[var(--hairline)] pt-4">
            <AdminForm action={updateMediaTextAction} submitLabel="Save descriptions">
              {() => (
                <div className="grid gap-4">
                  <input type="hidden" name="id" value={asset.id} />
                  <input type="hidden" name="locale" value={locale} />

                  {LOCALES.map((code) => {
                    const meta = LOCALE_META[code];
                    const tr = byLocale.get(code);
                    return (
                      <div key={code} className="grid gap-3">
                        <p className="eyebrow">{meta.nativeName}</p>
                        <Field label="Alt text" name={`altText.${code}`}>
                          <TextInput
                            name={`altText.${code}`}
                            defaultValue={tr?.altText}
                            dir={meta.direction}
                            lang={code}
                          />
                        </Field>
                        <Field label="Caption" name={`caption.${code}`}>
                          <TextInput
                            name={`caption.${code}`}
                            defaultValue={tr?.caption}
                            dir={meta.direction}
                            lang={code}
                          />
                        </Field>
                        {(asset.kind === 'audio' || asset.kind === 'video') && (
                          <Field
                            label="Transcript"
                            name={`transcript.${code}`}
                            hint="Shown in the page, so the narration is available to read."
                          >
                            <TextArea
                              name={`transcript.${code}`}
                              defaultValue={tr?.transcript}
                              dir={meta.direction}
                              rows={5}
                            />
                          </Field>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </AdminForm>

            <div className="mt-6 border-t border-[var(--hairline)] pt-4">
              <AdminForm action={deleteMediaAction} submitLabel="Delete this file">
                {() => (
                  <>
                    <input type="hidden" name="id" value={asset.id} />
                    <input type="hidden" name="locale" value={locale} />
                    <p className="text-xs text-lime-faint">
                      Refused while any scene still uses this file.
                    </p>
                  </>
                )}
              </AdminForm>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
