'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getTranslator, isAppLocale, DEFAULT_LOCALE } from '@/lib/i18n';

/**
 * Catches an unexpected error anywhere under `[locale]` — the site, the
 * admin, and the immersive tour all lack their own `error.tsx`, so this is
 * the one boundary for all three.
 *
 * An error boundary cannot read route params (the error may be *why* they
 * never resolved), so the locale comes from the pathname instead — the one
 * part of the URL that's already in hand.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();
  const segment = pathname?.split('/')[1];
  const locale = isAppLocale(segment) ? segment : DEFAULT_LOCALE;
  const t = getTranslator(locale);

  useEffect(() => {
    console.error('[error boundary]', error);
  }, [error]);

  return (
    <div className="mx-auto grid min-h-[60dvh] max-w-xl place-items-center px-5 text-center">
      <div>
        <h1 className="display text-3xl text-lime">{t('errors.serverError')}</h1>
        <p className="prose-body mt-3">{t('errors.serverErrorBody')}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={reset} className="btn btn-primary">
            {t('common.retry')}
          </button>
          <a href={`/${locale}`} className="btn btn-quiet">
            {t('errors.goHome')}
          </a>
        </div>
      </div>
    </div>
  );
}
