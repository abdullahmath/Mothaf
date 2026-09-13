import 'server-only';

import type { Metadata } from 'next';
import { LOCALES, DEFAULT_LOCALE, type AppLocale } from '../i18n/config';
import { env } from '@/server/config/env';

/**
 * Cross-locale `<link rel="alternate" hreflang>` entries plus a canonical
 * URL, for any page that exists at the same path under every locale.
 *
 * Every route here shares one path shape across locales — a slug is a
 * database value, not a translated string — so the caller only supplies the
 * locale-less part of the path (`/destinations/${slug}`, or `''` for the
 * homepage) and this fills in the rest.
 */
export function localeAlternates(locale: AppLocale, localePath: string): Metadata['alternates'] {
  const origin = env().APP_ORIGIN;
  const urlFor = (l: AppLocale) => `${origin}/${l}${localePath}`;

  return {
    canonical: urlFor(locale),
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [l, urlFor(l)])),
      'x-default': urlFor(DEFAULT_LOCALE),
    },
  };
}
