import Link from 'next/link';
import { getTranslator, type AppLocale } from '@/lib/i18n';
import { LocaleSwitcher } from './LocaleSwitcher';
import { Wordmark } from './Wordmark';

export function SiteHeader({ locale }: { locale: AppLocale }) {
  const t = getTranslator(locale);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-[color-mix(in_oklab,var(--color-ink)_82%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2 sm:h-16 sm:flex-nowrap sm:gap-6 sm:py-0 sm:px-8">
        <Link
          href={`/${locale}`}
          className="flex items-center gap-2.5 text-lime transition-colors hover:text-verdigris-bright"
        >
          <Wordmark />
          <span className="display text-lg">{t('common.appName')}</span>
        </Link>

        <nav
          aria-label={t('a11y.mainNavigation')}
          className="flex items-center gap-1 sm:ms-auto"
        >
          <Link
            href={`/${locale}/destinations`}
            className="rounded-sm px-2 py-2 text-sm text-lime-dim transition-colors hover:text-lime sm:px-3"
          >
            {t('nav.destinations')}
          </Link>
          <Link
            href={`/${locale}/events`}
            className="rounded-sm px-2 py-2 text-sm text-lime-dim transition-colors hover:text-lime sm:px-3"
          >
            {t('nav.events')}
          </Link>
        </nav>

        <div className="sm:border-s sm:border-[var(--hairline)] sm:ps-4">
          <LocaleSwitcher locale={locale} label={t('a11y.languageSwitcher')} />
        </div>
      </div>
    </header>
  );
}
