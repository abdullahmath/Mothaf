import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { listPastEvents, listUpcomingEvents } from '@/server/domain/public/events';
import { EventCard } from '@/components/content/EventCard';

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
  return { title: getTranslator(locale)('events.title') };
}

export default async function EventsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);

  const [upcoming, past] = await Promise.all([
    listUpcomingEvents(locale, 24),
    listPastEvents(locale, 12),
  ]);

  const current = upcoming.filter((event) => event.phase === 'current');
  const future = upcoming.filter((event) => event.phase === 'upcoming');

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8">
      <header className="mb-12 border-b border-[var(--hairline)] pb-6">
        <h1 className="display text-3xl text-lime sm:text-4xl">{t('events.title')}</h1>
        <p className="readout mt-3">{t('events.timezoneNote')}</p>
      </header>

      {upcoming.length === 0 && past.length === 0 && (
        <p className="text-lime-dim">{t('events.empty')}</p>
      )}

      {current.length > 0 && (
        <Section title={t('events.onNow')}>
          {current.map((event) => (
            <EventCard key={event.id} event={event} locale={locale} t={t} />
          ))}
        </Section>
      )}

      {future.length > 0 && (
        <Section title={t('events.upcoming')}>
          {future.map((event) => (
            <EventCard key={event.id} event={event} locale={locale} t={t} />
          ))}
        </Section>
      )}

      {past.length > 0 && (
        <Section title={t('events.past')}>
          {past.map((event) => (
            <EventCard key={event.id} event={event} locale={locale} t={t} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-14">
      <h2 className="eyebrow mb-5">{title}</h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.isArray(children)
          ? children.map((child, index) => <li key={index}>{child}</li>)
          : children}
      </ul>
    </section>
  );
}
