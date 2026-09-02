import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { listDestinations } from '@/server/domain/public/destinations';
import { DestinationCard } from '@/components/content/DestinationCard';

// Rendered on request, with the underlying queries served from the data
// cache (see server/domain/public/cache.ts). Prerendering these at build
// time would make `next build` require the production database.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  return { title: getTranslator(locale)('home.destinationsTitle') };
}

export default async function DestinationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);
  const destinations = await listDestinations(locale);

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8">
      <header className="mb-12 border-b border-[var(--hairline)] pb-6">
        <p className="eyebrow mb-3">{t('home.heroKicker')}</p>
        <h1 className="display text-3xl text-lime sm:text-4xl">{t('home.destinationsTitle')}</h1>
      </header>

      {destinations.length === 0 ? (
        <p className="text-lime-dim">{t('home.destinationsEmpty')}</p>
      ) : (
        <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((destination) => (
            <li key={destination.id}>
              <DestinationCard destination={destination} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
