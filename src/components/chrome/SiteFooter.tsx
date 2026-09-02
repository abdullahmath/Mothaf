import Link from 'next/link';
import { getTranslator, type AppLocale } from '@/lib/i18n';

export function SiteFooter({ locale }: { locale: AppLocale }) {
  const t = getTranslator(locale);

  return (
    <footer className="border-t border-[var(--hairline)] mt-24">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:px-8">
        <p className="text-sm text-lime-faint">
          {t('common.appName')} — {t('common.tagline')}
        </p>
        <nav className="flex gap-5 sm:ms-auto" aria-label={t('a11y.mainNavigation')}>
          <Link
            href={`/${locale}/destinations`}
            className="text-sm text-lime-faint transition-colors hover:text-lime"
          >
            {t('nav.destinations')}
          </Link>
          <Link
            href={`/${locale}/events`}
            className="text-sm text-lime-faint transition-colors hover:text-lime"
          >
            {t('nav.events')}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
