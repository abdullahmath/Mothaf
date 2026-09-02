import { describe, expect, it } from 'vitest';
import ar from '@/lib/i18n/messages/ar.json';
import en from '@/lib/i18n/messages/en.json';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_META,
  directionOf,
  formatCount,
  formatDate,
  formatDateRange,
  getTranslator,
  isAppLocale,
  negotiateLocale,
} from '@/lib/i18n';
import { mergeTranslations, translationCoverage } from '@/server/domain/i18n/resolve';

/**
 * Interface translations and formatting.
 *
 * The catalogue parity test is the important one: English is the structural
 * source of truth, and a key added there but forgotten in Arabic would render
 * English text inside an Arabic page — the exact failure an Arabic-first
 * product cannot ship.
 */

function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('catalogue parity', () => {
  /**
   * `counts.*` is excluded from strict key parity on purpose.
   *
   * Plural categories are a property of the language, not of the catalogue:
   * English uses `one` and `other`, Arabic additionally uses `zero`, `two`,
   * `few` and `many`. Demanding identical keys would force either a
   * meaningless `two` in English or a missing dual in Arabic. The plural
   * subtree is checked separately, against what `Intl.PluralRules` actually
   * asks each language for.
   */
  const isCountKey = (key: string) => key.startsWith('counts.');
  const englishKeys = leafPaths(en).filter((k) => !isCountKey(k)).sort();
  const arabicKeys = leafPaths(ar).filter((k) => !isCountKey(k)).sort();

  it('has no key missing from Arabic', () => {
    const missing = englishKeys.filter((key) => !arabicKeys.includes(key));
    expect(missing, `missing in ar.json: ${missing.join(', ')}`).toEqual([]);
  });

  it('has no key in Arabic that English does not define', () => {
    const extra = arabicKeys.filter((key) => !englishKeys.includes(key));
    expect(extra, `not in en.json: ${extra.join(', ')}`).toEqual([]);
  });

  it('defines every count in both languages', () => {
    const countGroups = (catalog: typeof en) => Object.keys(catalog.counts).sort();
    expect(countGroups(ar as unknown as typeof en)).toEqual(countGroups(en));
  });

  it('supplies exactly the plural categories each language actually uses', () => {
    for (const locale of LOCALES) {
      const rules = new Intl.PluralRules(LOCALE_META[locale].intlTag);
      // The categories this language can ever select, over a realistic range.
      const used = new Set<string>();
      for (let n = 0; n <= 200; n += 1) used.add(rules.select(n));

      const catalog = (locale === 'en' ? en : ar) as unknown as typeof en;
      for (const [group, forms] of Object.entries(catalog.counts)) {
        const provided = new Set(Object.keys(forms));
        for (const category of used) {
          expect(
            provided.has(category),
            `${locale}: counts.${group} is missing the "${category}" form`,
          ).toBe(true);
        }
        for (const category of provided) {
          expect(
            used.has(category),
            `${locale}: counts.${group} defines "${category}", which this language never selects`,
          ).toBe(true);
        }
      }
    }
  });

  it('has no blank message in either language', () => {
    for (const [name, catalog] of [
      ['en', en],
      ['ar', ar],
    ] as const) {
      for (const key of leafPaths(catalog)) {
        const value = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalog);
        expect(String(value).trim().length, `${name}: ${key} is blank`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the same placeholders in both languages', () => {
    // A translation that drops `{count}` silently renders a sentence with a
    // hole in it. Plural forms are exempt: "جولة واحدة" and "1 tour" say the
    // same thing, one by spelling the number out and one by substituting it.
    const placeholders = (text: string) => (text.match(/\{(\w+)\}/g) ?? []).sort();

    for (const key of englishKeys) {
      const read = (catalog: unknown) =>
        key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalog);
      const englishText = String(read(en));
      const arabicText = String(read(ar));
      expect(placeholders(arabicText), `placeholders differ at ${key}`).toEqual(
        placeholders(englishText),
      );
    }
  });
});

describe('translator', () => {
  it('returns the message for the requested locale', () => {
    expect(getTranslator('en')('common.appName')).toBe('Mothaf');
    expect(getTranslator('ar')('common.appName')).toBe('متحف');
  });

  it('interpolates named placeholders', () => {
    expect(getTranslator('en')('admin.translationCoverage', { done: 3, total: 8 })).toBe(
      '3 of 8 fields translated',
    );
  });

  it('leaves an unknown placeholder untouched rather than printing undefined', () => {
    expect(getTranslator('en')('hotspot.navigate', {})).toContain('{target}');
  });
});

describe('locale negotiation', () => {
  it('picks a supported language from Accept-Language', () => {
    expect(negotiateLocale('en-GB,en;q=0.9')).toBe('en');
    expect(negotiateLocale('ar-SY,ar;q=0.9,en;q=0.5')).toBe('ar');
  });

  it('honours quality weighting rather than document order', () => {
    expect(negotiateLocale('fr;q=1.0,en;q=0.9,ar;q=0.95')).toBe('ar');
  });

  it('falls back to the default for unsupported or absent headers', () => {
    expect(negotiateLocale('fr-FR,de;q=0.8')).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale(null)).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale('')).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale('!!! garbage ;;;')).toBe(DEFAULT_LOCALE);
  });

  it('ignores a language explicitly weighted to zero', () => {
    expect(negotiateLocale('en;q=0,ar;q=0.5')).toBe('ar');
  });

  it('narrows an untrusted route parameter', () => {
    expect(isAppLocale('ar')).toBe(true);
    expect(isAppLocale('de')).toBe(false);
    expect(isAppLocale('../../etc/passwd')).toBe(false);
  });
});

describe('direction', () => {
  it('marks Arabic as right-to-left and English as left-to-right', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
  });

  it('defaults to Arabic, so RTL is the primary path', () => {
    expect(DEFAULT_LOCALE).toBe('ar');
    expect(LOCALES).toContain('ar');
  });
});

describe('counted nouns', () => {
  it('uses English singular and plural correctly', () => {
    expect(formatCount('en', 'tours', 1)).toBe('1 tour');
    expect(formatCount('en', 'tours', 0)).toBe('0 tours');
    expect(formatCount('en', 'tours', 5)).toBe('5 tours');
  });

  it('uses the Arabic dual, which English has no equivalent for', () => {
    // Concatenating a number with a fixed noun would produce "2 جولة" here,
    // which is simply ungrammatical.
    expect(formatCount('ar', 'tours', 1)).toBe('جولة واحدة');
    expect(formatCount('ar', 'tours', 2)).toBe('جولتان');
    expect(formatCount('ar', 'tours', 0)).toBe('لا جولات');
  });

  it('distinguishes the Arabic few and many forms', () => {
    // 3–10 take the plural; 11–99 take the singular after the number.
    expect(formatCount('ar', 'scenes', 4)).toBe('4 مشاهد');
    expect(formatCount('ar', 'scenes', 15)).toBe('15 مشهداً');
  });

  it('renders numbers with Latin digits in Arabic', () => {
    // Arabic-Indic digits are authentic but would sit beside Latin-digit
    // content everywhere else in the admin.
    expect(formatCount('ar', 'scenes', 15)).toContain('15');
    expect(formatCount('ar', 'scenes', 15)).not.toContain('١٥');
  });
});

describe('dates', () => {
  const date = new Date('2026-09-02T12:00:00Z');

  it('uses Levantine month names in Arabic, not Egyptian ones', () => {
    // A Syrian site should print أيلول, which is what people there write —
    // plain `ar` would give سبتمبر.
    expect(formatDate('ar', date)).toContain('أيلول');
    expect(formatDate('ar', date)).not.toContain('سبتمبر');
  });

  it('formats English normally', () => {
    expect(formatDate('en', date)).toMatch(/September/);
  });

  it('collapses a single-day range to one date', () => {
    const range = formatDateRange('en', date, date);
    expect(range).not.toContain('–');
    expect(range).toMatch(/September/);
  });

  it('returns an empty string for an invalid date rather than "Invalid Date"', () => {
    expect(formatDate('en', 'not-a-date')).toBe('');
    expect(formatDateRange('en', 'nope', 'nope')).toBe('');
  });

  it('declares an Intl tag for every locale', () => {
    for (const locale of LOCALES) {
      expect(() => new Intl.DateTimeFormat(LOCALE_META[locale].intlTag)).not.toThrow();
    }
  });
});

describe('content translation fallback', () => {
  type Row = { locale: string; title: string | null; summary: string | null };

  const rows: Row[] = [
    { locale: 'ar', title: 'المسرح', summary: 'ملخص بالعربية' },
    { locale: 'en', title: 'The theatre', summary: null },
  ];

  it('returns the requested locale where it has content', () => {
    expect(mergeTranslations(rows, 'en', 'ar').title).toBe('The theatre');
  });

  it('falls back field by field, not wholesale', () => {
    // English has a title but no summary. The page should show the English
    // title with the Arabic summary, rather than reverting entirely to Arabic
    // or rendering a blank.
    const merged = mergeTranslations(rows, 'en', 'ar');
    expect(merged.title).toBe('The theatre');
    expect(merged.summary).toBe('ملخص بالعربية');
  });

  it('treats a whitespace-only value as untranslated', () => {
    const withBlank: Row[] = [
      { locale: 'ar', title: 'العنوان', summary: 'ملخص' },
      { locale: 'en', title: '   ', summary: 'Summary' },
    ];
    expect(mergeTranslations(withBlank, 'en', 'ar').title).toBe('العنوان');
  });

  it('falls back to any available language rather than rendering nothing', () => {
    const onlyFrench = [{ locale: 'fr', title: 'Le théâtre', summary: null }];
    expect(mergeTranslations(onlyFrench, 'en', 'ar').title).toBe('Le théâtre');
  });

  it('returns an empty object when there are no translations at all', () => {
    expect(mergeTranslations([], 'en', 'ar')).toEqual({});
  });

  it('counts coverage only over fields the source language actually fills', () => {
    // A field left blank in the source is not a translation gap; counting it
    // as one would make 100% unreachable.
    const coverage = translationCoverage(rows, 'en', 'ar', ['title', 'summary']);
    expect(coverage.total).toBe(2);
    expect(coverage.done).toBe(1);
  });

  it('reports zero coverage when the target language is absent', () => {
    const coverage = translationCoverage(rows, 'fr', 'ar', ['title', 'summary']);
    expect(coverage.done).toBe(0);
    expect(coverage.total).toBe(2);
  });
});
