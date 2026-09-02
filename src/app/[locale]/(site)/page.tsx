import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { listDestinations } from '@/server/domain/public/destinations';
import { listUpcomingEvents } from '@/server/domain/public/events';
import { getHeroScene } from '@/server/domain/public/hero';
import { HeroPanorama } from '@/components/home/HeroPanorama';
import { DestinationCard } from '@/components/content/DestinationCard';
import { EventCard } from '@/components/content/EventCard';

// Content changes only when an editor publishes, so the page is rendered on
// demand and cached. A short window keeps a newly published destination from
// taking an hour to appear.
export const revalidate = 300;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);

  const [destinations, events, hero] = await Promise.all([
    listDestinations(locale),
    listUpcomingEvents(locale, 3),
    getHeroScene(locale),
  ]);

  return (
    <>
      {/* ---- Hero ------------------------------------------------------- */}
      <section className="relative h-[78dvh] min-h-[520px] w-full overflow-hidden border-b border-[var(--hairline)]">
        {hero ? (
          <HeroPanorama media={hero.media} label={t('a11y.panoramaView')} />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-stone-2 to-ink" />
        )}

        {/* The scrim only darkens the side the text sits on, so the panorama
            stays readable as an image on the other. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[color-mix(in_oklab,var(--color-ink)_88%,transparent)] via-[color-mix(in_oklab,var(--color-ink)_35%,transparent)] to-transparent" />

        <div className="pointer-events-none absolute inset-0 flex items-end">
          <div className="mx-auto w-full max-w-[1400px] px-5 pb-24 sm:px-8">
            <p className="eyebrow mb-3">{t('home.heroKicker')}</p>
            <h1 className="display max-w-3xl text-4xl text-lime sm:text-5xl lg:text-6xl">
              {t('home.heroTitle')}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-lime-dim">{t('home.heroBody')}</p>

            {hero && (
              <div className="pointer-events-auto mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href={`/${locale}/tour/${hero.destinationSlug}/${hero.tourSlug}`}
                  className="btn btn-primary"
                >
                  {t('destination.startTour')}
                  <span aria-hidden="true" className="rtl:rotate-180">
                    →
                  </span>
                </Link>
                <Link href={`/${locale}/destinations`} className="btn btn-quiet">
                  {t('home.exploreDestinations')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---- Destinations ------------------------------------------------ */}
      <section className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8">
        <header className="mb-10 flex items-baseline justify-between gap-6 border-b border-[var(--hairline)] pb-5">
          <h2 className="display text-2xl text-lime sm:text-3xl">{t('home.destinationsTitle')}</h2>
          <span className="readout">{String(destinations.length).padStart(2, '0')}</span>
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
      </section>

      {/* ---- Events ------------------------------------------------------ */}
      <section className="mx-auto max-w-[1400px] px-5 pb-8 sm:px-8">
        <header className="mb-10 flex items-baseline justify-between gap-6 border-b border-[var(--hairline)] pb-5">
          <h2 className="display text-2xl text-lime sm:text-3xl">{t('home.eventsTitle')}</h2>
          <Link
            href={`/${locale}/events`}
            className="text-sm text-lime-dim transition-colors hover:text-verdigris-bright"
          >
            {t('events.title')}
          </Link>
        </header>

        {events.length === 0 ? (
          <p className="text-lime-dim">{t('home.eventsEmpty')}</p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <li key={event.id}>
                <EventCard event={event} locale={locale} t={t} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
