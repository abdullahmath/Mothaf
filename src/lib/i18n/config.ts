/**
 * Locale configuration for the *interface*.
 *
 * Content translations are database rows (see `*_translations` tables) and are
 * added by editors without touching code. This file governs only the UI shell:
 * which locales have a message catalogue and a URL prefix.
 *
 * Arabic is the default. That is deliberate — making RTL the primary path
 * means it is exercised constantly rather than being a mode someone remembers
 * to check before release.
 */

export const LOCALES = ['ar', 'en'] as const;

export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'ar';

export type Direction = 'ltr' | 'rtl';

type LocaleMeta = {
  code: AppLocale;
  /** Endonym — what speakers call the language themselves. */
  nativeName: string;
  englishName: string;
  direction: Direction;
  /**
   * The tag handed to `Intl` for dates, numbers and plural rules.
   *
   * It is not simply the language code, and both deviations are deliberate:
   *
   * - **`ar-SY`** — month names differ across the Arabic-speaking world. Plain
   *   `ar` yields the Egyptian/Gulf forms (سبتمبر), while the Levant uses
   *   أيلول. A platform whose first destination is in Syria should print the
   *   month the way people there write it. This is the single line to change
   *   for a deployment centred on another region.
   *
   * - **`-u-nu-latn`** — Latin digits rather than Arabic-Indic. Counts and
   *   dates sit beside Latin-digit content throughout the admin, and mixing
   *   two numeral systems in one view reads as a defect rather than a choice.
   */
  intlTag: string;
};

export const LOCALE_META: Record<AppLocale, LocaleMeta> = {
  ar: {
    code: 'ar',
    nativeName: 'العربية',
    englishName: 'Arabic',
    direction: 'rtl',
    intlTag: 'ar-SY-u-nu-latn',
  },
  en: {
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    direction: 'ltr',
    intlTag: 'en',
  },
};

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function directionOf(locale: AppLocale): Direction {
  return LOCALE_META[locale].direction;
}

/** Narrows an untrusted route parameter to a supported locale. */
export function resolveLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Picks the best supported locale from an `Accept-Language` header.
 *
 * Deliberately simple: quality-weighted, prefix-matched (`en-GB` → `en`), and
 * falling back to the default. Anything more elaborate would be guessing.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): AppLocale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.tag.length > 0 && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split('-')[0] ?? '';
    if (isAppLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
