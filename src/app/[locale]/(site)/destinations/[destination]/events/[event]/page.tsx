import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  formatDateRange,
  formatTime,
  getTranslator,
  isAppLocale,
  type AppLocale,
} from '@/lib/i18n';
import { getEventDetail } from '@/server/domain/public/events';
import { isDomainError } from '@/server/domain/errors';
import { MediaFigure } from '@/components/tour/MediaFigure';
import { buildSrcSet } from '@/lib/media/srcset';

// Rendered on request, with the underlying queries served from the data
// cache (see server/domain/public/cache.ts). Prerendering these at build
// time would make `next build` require the production database.
export const dynamic = 'force-dynamic';

type Params = Promise<{ locale: string; destination: string; event: string }>;

async function load(params: Params) {
  const { locale, destination, event } = await params;
  if (!isAppLocale(locale)) notFound();
  try {
    return {
      locale: locale as AppLocale,
      event: await getEventDetail(destination, event, locale as AppLocale),
    };
  } catch (error) {
    if (isDomainError(error) && error.code === 'not_found') notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { event } = await load(params);
  return { title: event.title, description: event.summary ?? undefined };
}

export default async function EventPage({ params }: { params: Params }) {
  const { locale, event } = await load(params);
  const t = getTranslator(locale);

  const phaseLabel =
    event.phase === 'current'
      ? t('events.onNow')
      : event.phase === 'upcoming'
        ? t('events.upcoming')
        : t('events.past');

  return (
    <article className="mx-auto max-w-[1100px] px-5 py-16 sm:px-8">
      <p className="eyebrow mb-3">
        <Link
          href={`/${locale}/destinations/${event.destinationSlug}`}
          className="transition-colors hover:text-lime"
        >
          {event.destinationName}
        </Link>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <span
          className="text-2xs font-medium uppercase tracking-widest"
          style={{
            color: event.phase === 'past' ? 'var(--color-lime-faint)' : 'var(--color-saffron)',
          }}
        >
          {phaseLabel}
        </span>
        <span className="readout">
          {formatDateRange(locale, event.startsAt, event.endsAt, event.timezone)}
        </span>
      </div>

      <h1 className="display mt-3 text-3xl text-lime sm:text-5xl">{event.title}</h1>
      {event.summary && <p className="mt-4 max-w-2xl text-lg text-lime-dim">{event.summary}</p>}

      {event.cover && (
        <img
          src={event.cover.src}
          srcSet={buildSrcSet(event.cover.sources)}
          sizes="(min-width: 1100px) 1100px, 92vw"
          alt={event.cover.alt ?? ''}
          className="mt-8 w-full rounded-md border border-[var(--hairline)] bg-stone"
        />
      )}

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-12">
          {event.description && (
            <section>
              <div className="prose-body max-w-prose">
                {event.description.split('\n\n').map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </section>
          )}

          {event.schedule.length > 0 && (
            <section>
              <h2 className="eyebrow mb-5">{t('events.scheduleTitle')}</h2>
              <ol className="grid">
                {event.schedule.map((item) => (
                  <li
                    key={item.id}
                    className="grid grid-cols-[auto_1fr] gap-5 border-t border-[var(--hairline)] py-4"
                  >
                    <time
                      className="readout pt-1"
                      dateTime={item.startsAt}
                    >
                      {formatTime(locale, item.startsAt, event.timezone)}
                    </time>
                    <div>
                      <h3 className="text-lime">{item.title}</h3>
                      {item.performer && (
                        <p className="text-sm text-verdigris">{item.performer}</p>
                      )}
                      {item.location && (
                        <p className="text-sm text-lime-faint">{item.location}</p>
                      )}
                      {item.description && (
                        <p className="prose-body mt-1 text-sm">{item.description}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {event.gallery.length > 0 && (
            <section>
              <h2 className="eyebrow mb-5">{t('media.gallery')}</h2>
              <div className="grid gap-6 sm:grid-cols-2">
                {event.gallery.map((media) => (
                  <MediaFigure key={media.id} media={media} t={t} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="grid gap-8 lg:sticky lg:top-24 lg:self-start">
          {event.tour && (
            <Link
              href={`/${locale}/tour/${event.destinationSlug}/${event.tour.slug}`}
              className="btn btn-primary w-full"
            >
              {t('events.relatedTour')}
            </Link>
          )}

          <dl className="grid gap-5">
            <Detail label={t('events.dates')}>
              {formatDateRange(locale, event.startsAt, event.endsAt, event.timezone)}
            </Detail>
            {event.venue && <Detail label={t('events.venue')}>{event.venue}</Detail>}
            {event.organizer && <Detail label={t('events.organizer')}>{event.organizer}</Detail>}
            {event.admissionInfo && (
              <Detail label={t('events.admission')}>{event.admissionInfo}</Detail>
            )}
          </dl>
        </aside>
      </div>
    </article>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--hairline)] pt-3">
      <dt className="eyebrow mb-1">{label}</dt>
      <dd className="text-sm text-lime-dim">{children}</dd>
    </div>
  );
}
