/**
 * Per-field translation fallback.
 *
 * A tour that is fully written in Arabic and half-translated into English must
 * render as English where English exists and Arabic everywhere else — not as a
 * page of blanks, and not as a wholesale switch back to Arabic the moment one
 * field is missing. Merging field by field is what makes partial translation a
 * usable state rather than a broken one.
 */

type LocalisedRow = { locale: string };

/** Treats null, undefined and whitespace-only strings as "not translated". */
function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

export type Translated<T extends LocalisedRow> = Partial<Omit<T, 'locale'>>;

export function mergeTranslations<T extends LocalisedRow>(
  rows: readonly T[],
  locale: string,
  defaultLocale: string,
): Translated<T> {
  if (rows.length === 0) return {};

  const requested = rows.find((r) => r.locale === locale);
  const fallback = rows.find((r) => r.locale === defaultLocale);
  // Last resort: any language at all beats an empty page.
  const anyRow = requested ?? fallback ?? rows[0];

  const merged: Record<string, unknown> = {};
  for (const source of [anyRow, fallback, requested]) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (key === 'locale') continue;
      if (isPresent(value)) merged[key] = value;
    }
  }
  return merged as Translated<T>;
}

/** Groups translation rows by the id of their parent. */
export function groupByParent<T extends LocalisedRow>(
  rows: readonly T[],
  key: keyof T,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = row[key];
    if (typeof id !== 'string') continue;
    const bucket = map.get(id);
    if (bucket) bucket.push(row);
    else map.set(id, [row]);
  }
  return map;
}

/**
 * How complete a translation is, for the admin's coverage indicator.
 *
 * Counts only fields the default locale actually fills — a field left blank in
 * the source language is not a translation gap, and counting it as one would
 * make full coverage unreachable.
 */
export function translationCoverage<T extends LocalisedRow>(
  rows: readonly T[],
  locale: string,
  defaultLocale: string,
  fields: readonly (keyof Omit<T, 'locale'>)[],
): { done: number; total: number } {
  const source = rows.find((r) => r.locale === defaultLocale);
  const target = rows.find((r) => r.locale === locale);
  if (!source) return { done: 0, total: 0 };

  const applicable = fields.filter((f) => isPresent(source[f as keyof T]));
  if (!target) return { done: 0, total: applicable.length };

  const done = applicable.filter((f) => isPresent(target[f as keyof T])).length;
  return { done, total: applicable.length };
}
