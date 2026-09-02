'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LOCALES, LOCALE_META, type AppLocale } from '@/lib/i18n/config';

/**
 * Language switch.
 *
 * Swaps the locale segment in place, so the visitor stays exactly where they
 * are — including deep inside a tour — rather than being returned to the home
 * page. The choice is recorded in a cookie the middleware reads, so a later
 * visit to a bare URL opens in the same language.
 *
 * Rendered as real links, not buttons: a language version of a page is a
 * different URL, and it should be shareable, openable in a new tab, and
 * visible to a crawler.
 */
export function LocaleSwitcher({
  locale,
  label,
}: {
  locale: AppLocale;
  label: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const swap = (target: AppLocale) => {
    const segments = pathname.split('/');
    segments[1] = target;
    return segments.join('/') || `/${target}`;
  };

  const remember = (target: AppLocale) => {
    // A year is long enough to be useful and short enough not to outlive the
    // visitor's interest. Lax keeps it off cross-site requests.
    document.cookie = `mothaf_locale=${target}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <nav aria-label={label} className="flex items-center gap-1">
      {LOCALES.map((code) => {
        const meta = LOCALE_META[code];
        const isCurrent = code === locale;
        return (
          <a
            key={code}
            href={swap(code)}
            hrefLang={code}
            lang={code}
            aria-current={isCurrent ? 'true' : undefined}
            onClick={(event) => {
              // Client-side navigation keeps the tour's scene state alive
              // across the switch; the href remains correct without JS.
              event.preventDefault();
              remember(code);
              router.push(swap(code));
              router.refresh();
            }}
            className={[
              'px-2.5 py-1.5 text-sm transition-colors rounded-sm',
              isCurrent
                ? 'text-lime'
                : 'text-lime-faint hover:text-verdigris-bright',
            ].join(' ')}
            style={{ fontFamily: code === 'ar' ? 'var(--font-amiri)' : 'var(--font-ui)' }}
          >
            {meta.nativeName}
          </a>
        );
      })}
    </nav>
  );
}
