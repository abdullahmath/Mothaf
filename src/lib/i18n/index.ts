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

/**
 * Numbers use Latin digits even in Arabic.
 *
 * Arabic-Indic digits are authentic, but counts and analytics figures sit
 * beside Latin-digit content throughout the admin, and mixing the two numeral
 * systems in one view reads as a bug rather than as a choice. Dates keep the
 * locale's own month and weekday names.
 */
function numberTag(locale: AppLocale): string {
  return locale === 'ar' ? 'ar-u-nu-latn' : LOCALE_META[locale].intlTag;
}

export function formatNumber(locale: AppLocale, value: number): string {
  return new Intl.NumberFormat(numberTag(locale)).format(value);
}

export function formatDate(
  locale: AppLocale,
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'long' },
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(numberTag(locale), options).format(date);
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

  const formatter = new Intl.DateTimeFormat(numberTag(locale), {
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
  return new Intl.DateTimeFormat(numberTag(locale), {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
