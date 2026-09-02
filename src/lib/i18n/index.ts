import ar from './messages/ar.json';
import en from './messages/en.json';
import { DEFAULT_LOCALE, LOCALE_META, type AppLocale } from './config';

export * from './config';

/**
 * UI message catalogues.
 *
 * English is the structural source of truth: the `MessageKey` type is derived
 * from it, so referencing a key that does not exist is a compile error, and
 * removing a key breaks every call site rather than silently rendering a
 * placeholder at runtime.
 */
type Catalog = typeof en;

/** Dot-separated paths to every string leaf of the catalogue. */
type Leaves<T> = T extends object
  ? {
      [K in keyof T]-?: Leaves<T[K]> extends never
        ? `${K & string}`
        : `${K & string}.${Leaves<T[K]>}`;
    }[keyof T]
  : never;

export type MessageKey = Leaves<Catalog>;

const CATALOGS: Record<AppLocale, Catalog> = {
  en,
  // Arabic is checked against the English shape at build time by
  // tests/i18n/catalog.test.ts, which fails on any missing or extra key.
  ar: ar as Catalog,
};

export type MessageVars = Record<string, string | number>;

function lookup(catalog: unknown, key: string): string | undefined {
  let node: unknown = catalog;
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Replaces `{name}` placeholders. Unknown placeholders are left intact. */
function interpolate(template: string, vars: MessageVars | undefined): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export type Translator = (key: MessageKey, vars?: MessageVars) => string;

/**
 * Builds a translator for one locale.
 *
 * Resolution order is requested locale → default locale → the key itself. A
 * missing translation therefore degrades to another language rather than to a
 * blank space, and the visible key makes the gap obvious during review.
 */
export function getTranslator(locale: AppLocale): Translator {
  const primary = CATALOGS[locale];
  const fallback = CATALOGS[DEFAULT_LOCALE];

  return (key, vars) => {
    const message = lookup(primary, key) ?? lookup(fallback, key);
    if (message === undefined) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[i18n] missing message key: ${key}`);
      }
      return key;
    }
    return interpolate(message, vars);
  };
}

export function getCatalog(locale: AppLocale): Catalog {
  return CATALOGS[locale];
}

/* -------------------------------------------------------------------------- */
/*  Formatters                                                                */
/* -------------------------------------------------------------------------- */

/** The tag `Intl` should use for this locale. See LOCALE_META for the why. */
function intlTag(locale: AppLocale): string {
  return LOCALE_META[locale].intlTag;
}

export function formatNumber(locale: AppLocale, value: number): string {
  return new Intl.NumberFormat(intlTag(locale)).format(value);
}

/* -------------------------------------------------------------------------- */
/*  Counted nouns                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Formats "N somethings" using the locale's own plural rules.
 *
 * This is not a nicety in an Arabic-first product. English has two forms;
 * Arabic has six, and it distinguishes a dual (جولتان, "two tours") that has
 * no English counterpart. Concatenating a number with a fixed noun — the usual
 * shortcut — produces text that is simply ungrammatical in Arabic for most
 * values, which on a cultural institution's own site is not a small thing.
 *
 * `Intl.PluralRules` picks the category; the catalogue supplies the wording
 * for each one. Categories a language does not use are just absent from its
 * catalogue, and `other` is the guaranteed fallback.
 */
export type CountKey = keyof typeof en.counts;

export function formatCount(locale: AppLocale, key: CountKey, count: number): string {
  const catalog = CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE];
  const forms = catalog.counts[key] as Partial<Record<Intl.LDMLPluralRule, string>>;
  const category = new Intl.PluralRules(intlTag(locale)).select(count);
  const template = forms[category] ?? forms.other ?? '{count}';
  return interpolate(template, { count: formatNumber(locale, count) });
}

export function formatDate(
  locale: AppLocale,
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'long' },
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(intlTag(locale), options).format(date);
}

/** Formats a date range, collapsing a single-day range to one date. */
export function formatDateRange(
  locale: AppLocale,
  start: Date | string | number,
  end: Date | string | number,
  timeZone?: string,
): string {
  const from = start instanceof Date ? start : new Date(start);
  const to = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return '';

  const formatter = new Intl.DateTimeFormat(intlTag(locale), {
    dateStyle: 'long',
    ...(timeZone ? { timeZone } : {}),
  });

  const sameDay = formatter.format(from) === formatter.format(to);
  if (sameDay) return formatter.format(from);
  return formatter.formatRange(from, to);
}

export function formatTime(
  locale: AppLocale,
  value: Date | string | number,
  timeZone?: string,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(intlTag(locale), {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
