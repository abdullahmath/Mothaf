import Link from 'next/link';
import { getTranslator, DEFAULT_LOCALE } from '@/lib/i18n';

/**
 * A not-found page cannot read route params, so it renders in the default
 * locale. That is the one place in the product where the language is not taken
 * from the URL, and it is unavoidable: there is no matched route to read.
 */
export default function NotFound() {
  const t = getTranslator(DEFAULT_LOCALE);

  return (
    <div className="mx-auto grid min-h-[60dvh] max-w-xl place-items-center px-5 text-center">
      <div>
        <p className="readout mb-4">404</p>
        <h1 className="display text-3xl text-lime">{t('errors.notFound')}</h1>
        <p className="prose-body mt-3">{t('errors.notFoundBody')}</p>
        <Link href={`/${DEFAULT_LOCALE}`} className="btn btn-primary mt-8">
          {t('errors.goHome')}
        </Link>
      </div>
    </div>
  );
}
