'use client';

import { useState } from 'react';
import { LOCALES, LOCALE_META, type AppLocale } from '@/lib/i18n/config';
import { Field, TextArea, TextInput } from './AdminForm';

/**
 * The translation editor.
 *
 * Languages are tabs over the *same* form, not separate forms, so one save
 * writes every language at once. An editor working on both at the same time —
 * which is the normal case here — never has to remember which tab they left
 * unsaved.
 *
 * Every locale's inputs stay mounted and merely hidden. Unmounting them would
 * drop their values from the submitted FormData, silently wiping the language
 * the editor was not looking at when they hit save.
 */

export type TranslationField = {
  name: string;
  label: string;
  kind?: 'text' | 'textarea';
  rows?: number;
  hint?: string;
};

export type TranslationValues = Record<string, Record<string, string | null | undefined>>;

export function TranslationFields({
  fields,
  values,
  legend,
}: {
  fields: TranslationField[];
  /** `values[locale][fieldName]` — the rows already stored. */
  values: TranslationValues;
  legend: string;
}) {
  const [active, setActive] = useState<AppLocale>(LOCALES[0]);

  return (
    <fieldset className="grid gap-4 border-t border-[var(--hairline)] pt-6">
      <legend className="eyebrow">{legend}</legend>

      <div role="tablist" aria-label={legend} className="flex gap-1">
        {LOCALES.map((locale) => {
          const meta = LOCALE_META[locale];
          const filled = fields.filter((f) => values[locale]?.[f.name]).length;
          return (
            <button
              key={locale}
              type="button"
              role="tab"
              aria-selected={active === locale}
              onClick={() => setActive(locale)}
              className={[
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                active === locale
                  ? 'bg-[color-mix(in_oklab,var(--color-lime)_10%,transparent)] text-lime'
                  : 'text-lime-faint hover:text-lime',
              ].join(' ')}
              lang={locale}
            >
              {meta.nativeName}
              {/* Coverage at a glance, so a half-translated language is
                  visible without opening its tab. */}
              <span className="readout ms-2">
                {filled}/{fields.length}
              </span>
            </button>
          );
        })}
      </div>

      {LOCALES.map((locale) => {
        const meta = LOCALE_META[locale];
        return (
          <div key={locale} hidden={active !== locale} className="grid gap-4">
            {fields.map((fieldDef) => {
              const name = `${fieldDef.name}.${locale}`;
              const value = values[locale]?.[fieldDef.name] ?? '';
              return (
                <Field key={name} label={fieldDef.label} name={name} hint={fieldDef.hint}>
                  {fieldDef.kind === 'textarea' ? (
                    <TextArea
                      name={name}
                      defaultValue={value}
                      rows={fieldDef.rows ?? 4}
                      dir={meta.direction}
                    />
                  ) : (
                    <TextInput name={name} defaultValue={value} dir={meta.direction} lang={locale} />
                  )}
                </Field>
              );
            })}
          </div>
        );
      })}
    </fieldset>
  );
}

/** Reshapes translation rows from the database into `values[locale][field]`. */
export function toTranslationValues(
  rows: readonly { locale: string; [key: string]: unknown }[],
): TranslationValues {
  const values: TranslationValues = {};
  for (const row of rows) {
    const entry: Record<string, string | null | undefined> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === 'locale') continue;
      entry[key] = typeof value === 'string' ? value : null;
    }
    values[row.locale] = entry;
  }
  return values;
}
