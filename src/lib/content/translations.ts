/**
 * Reshapes translation rows from the database into `values[locale][field]`,
 * which is the shape the translation editor renders from.
 *
 * Lives here, in a plain module, rather than beside the editor component:
 * that component is `'use client'`, and a function exported from a client
 * module cannot be called by a Server Component — it is serialised as a
 * reference to be invoked in the browser, not as code the server can run. The
 * page that loads the rows is a Server Component, so the pure helper has to
 * sit outside the client boundary.
 */

export type TranslationValues = Record<string, Record<string, string | null | undefined>>;

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
