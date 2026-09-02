import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslator, formatCount, isAppLocale, type AppLocale } from '@/lib/i18n';
import { getDestinationPage } from '@/server/domain/public/destinations';
import { isDomainError } from '@/server/domain/errors';
import { EventCard } from '@/components/content/EventCard';
import { buildSrcSet } from '@/lib/media/srcset';

export const revalidate = 300;

type Params = Promise<{ locale: string; destination: string }>;

async function load(params: Params) {
  const { locale, destination } = await params;
  if (!isAppLocale(locale)) notFound();
  try {
    return { locale: locale as AppLocale, page: await getDestinationPage(destination, locale) };
  } catch (error) {
    // A draft or missing destination is a 404 either way — telling an
    // anonymous visitor that a slug exists but is unpublished is a leak.
    if (isDomainError(error) && error.code === 'not_found') notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { page } = await load(params);
  return {
    title: page.name,
    description: page.summary ?? page.tagline ?? undefined,
    openGraph: {
      title: page.name,
      description: page.summary ?? undefined,
      images: page.cover ? [{ url: page.cover.src }] : undefined,
    },
  };
}

export default async function DestinationPage({ params }: { params: Params }) {
  const { locale, page } = await load(params);
  const t = getTranslator(locale);

  return (
    <article>
      {/* ---- Masthead ---------------------------------------------------- */}
      <header className="relative h-[52dvh] min-h-[380px] overflow-hidden border-b border-[var(--hairline)]">
        {page.cover ? (
          <img
            src={page.cover.src}
            srcSet={buildSrcSet(page.cover.sources)}
            sizes="100vw"
            alt={page.cover.alt ?? ''}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-stone-2 to-ink" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_oklab,var(--color-ink)_92%,transparent)] via-[color-mix(in_oklab,var(--color-ink)_40%,transparent)] to-transparent" />

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-[1400px] px-5 pb-10 sm:px-8">
            <h1 className="display max-w-3xl text-3xl text-lime sm:text-5xl">{page.name}</h1>
            {page.tagline && <p className="mt-3 max-w-2xl text-lg text-lime-dim">{page.tagline}</p>}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-16 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-16">
          {/* ---- Tours --------------------------------------------------- */}
          <section>
            <header className="mb-8 flex items-baseline justify-between border-b border-[var(--hairline)] pb-4">
              <h2 className="display text-2xl text-lime">{t('destination.toursTitle')}</h2>
              <span className="readout">{String(page.tours.length).padStart(2, '0')}</span>
            </header>

            {page.tours.length === 0 ? (
              <p className="text-lime-dim">{t('destination.toursEmpty')}</p>
            ) : (
              <ul className="grid gap-6 sm:grid-cols-2">
                {page.tours.map((tour) => (
                  <li key={tour.id}>
                    <Link
                      href={`/${locale}/tour/${page.slug}/${tour.slug}`}
                      className="group block"
                    >
                      <div className="relative aspect-16/10 overflow-hidden rounded-md border border-[var(--hairline)] bg-stone">
                        {tour.cover ? (
                          <img
                            src={tour.cover.src}
                            srcSet={buildSrcSet(tour.cover.sources)}
                            sizes="(min-width: 640px) 40vw, 92vw"
                            alt={tour.cover.alt ?? ''}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                          />
                        ) : (
                          <div className="h-full w-full bg-gradient-to-br from-stone-2 to-ink" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_oklab,var(--color-ink)_70%,transparent)] to-transparent" />
                        <span className="btn btn-primary absolute bottom-3 end-3 h-9 min-h-0 px-3 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                          {t('destination.startTour')}
                        </span>
                      </div>
                      <h3 className="display mt-3 text-lg text-lime transition-colors group-hover:text-verdigris-bright">
                        {tour.title}
                      </h3>
                      <p className="readout mt-1">
                        {formatCount(locale, 'scenes', tour.sceneCount)}
                        {tour.estimatedMinutes
                          ? ` · ${formatCount(locale, 'minutes', tour.estimatedMinutes)}`
                          : ''}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---- About and history --------------------------------------- */}
          {(page.description || page.historicalContext) && (
            <section className="grid gap-10">
              {page.description && (
                <div>
                  <h2 className="eyebrow mb-3">{t('destination.aboutTitle')}</h2>
                  <div className="prose-body max-w-prose">
                    {page.description.split('\n\n').map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              )}
              {page.historicalContext && (
                <div className="border-s-2 border-verdigris-deep ps-5">
                  <h2 className="eyebrow mb-3">{t('destination.historyTitle')}</h2>
                  <div className="prose-body max-w-prose">
                    {page.historicalContext.split('\n\n').map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* ---- Aside: POIs and events ------------------------------------ */}
        <aside className="grid gap-12 lg:sticky lg:top-24 lg:self-start">
          {page.pois.length > 0 && (
            <section>
              <h2 className="eyebrow mb-4">{t('destination.poisTitle')}</h2>
              <ul className="grid gap-3">
                {page.pois.map((poi) => (
                  <li key={poi.id} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-2 w-2 shrink-0 rotate-45"
                      style={{ background: poi.category?.color ?? 'var(--color-verdigris)' }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-lime">{poi.title}</p>
                      {poi.shortDescription && (
                        <p className="text-sm text-lime-faint">{poi.shortDescription}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {page.events.length > 0 && (
            <section>
              <h2 className="eyebrow mb-4">{t('destination.eventsTitle')}</h2>
              <ul className="grid gap-3">
                {page.events.map((event) => (
                  <li key={event.id}>
                    <EventCard event={event} locale={locale} t={t} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {page.latitude !== null && page.longitude !== null && (
            <section>
              <h2 className="eyebrow mb-2">{t('destination.locationTitle')}</h2>
              <p className="readout">
                {page.latitude.toFixed(5)}, {page.longitude.toFixed(5)}
              </p>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}
