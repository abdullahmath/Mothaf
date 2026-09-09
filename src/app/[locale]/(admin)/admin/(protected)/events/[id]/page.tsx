import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { getEventForAdmin } from '@/server/domain/admin/events';
import { listDestinationsForAdmin } from '@/server/domain/admin/destinations';
import { listToursForAdmin } from '@/server/domain/admin/tours';
import { listMedia } from '@/server/domain/admin/media';
import { isDomainError } from '@/server/domain/errors';
import { AdminPage } from '@/components/admin/AdminPage';
import { EventForm } from '@/components/admin/EventForm';
import { ScheduleManager } from '@/components/admin/ScheduleManager';
import { toTranslationValues } from '@/lib/content/translations';
import { DangerZone } from '@/components/admin/DangerZone';
import { deleteEventAction } from '@/server/actions/content';
import { can } from '@/server/domain/guard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EventEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);

  const isNew = id === 'new';
  const [destinations, tours, media, mayDelete] = await Promise.all([
    listDestinationsForAdmin(),
    listToursForAdmin(),
    listMedia('all', 200),
    can('event:write'),
  ]);

  const destinationOptions = destinations.map((destination) => ({
    value: destination.id,
    label:
      destination.translations.find((tr) => tr.locale === locale)?.name ??
      destination.translations[0]?.name ??
      destination.slug,
  }));
  const tourOptions = tours.map((tour) => ({
    value: tour.id,
    label: `${tour.destinationSlug}/${tour.slug}`,
  }));
  const mediaOptions = media
    .filter((asset) => asset.kind === 'image' || asset.kind === 'panorama')
    .map((asset) => ({
      value: asset.id,
      label: asset.originalFilename ?? `${asset.kind} (${asset.id.slice(0, 8)})`,
    }));

  if (isNew) {
    if (destinationOptions.length === 0) {
      return (
        <AdminPage
          title={`${t('common.create')} — ${t('admin.events')}`}
          backHref={`/${locale}/admin/events`}
          backLabel={t('admin.events')}
        >
          <p className="text-sm text-lime-dim">Create a destination first.</p>
        </AdminPage>
      );
    }

    return (
      <AdminPage
        title={`${t('common.create')} — ${t('admin.events')}`}
        backHref={`/${locale}/admin/events`}
        backLabel={t('admin.events')}
      >
        <EventForm
          locale={locale}
          destinationOptions={destinationOptions}
          tourOptions={tourOptions}
          mediaOptions={mediaOptions}
          values={{
            destinationId: destinationOptions[0]!.value,
            tourId: null,
            slug: '',
            status: 'draft',
            startsAt: null,
            endsAt: null,
            timezone: 'UTC',
            coverMediaId: null,
            translations: {},
          }}
        />
      </AdminPage>
    );
  }

  const event = await getEventForAdmin(id).catch((error) => {
    if (isDomainError(error) && error.code === 'not_found') notFound();
    throw error;
  });

  const title =
    event.translations.find((tr) => tr.locale === locale)?.title ??
    event.translations[0]?.title ??
    event.slug;

  return (
    <AdminPage
      title={title}
      description={event.slug}
      backHref={`/${locale}/admin/events`}
      backLabel={t('admin.events')}
    >
      <EventForm
        locale={locale}
        destinationOptions={destinationOptions}
        tourOptions={tourOptions}
        mediaOptions={mediaOptions}
        values={{
          id: event.id,
          destinationId: event.destinationId,
          tourId: event.tourId,
          slug: event.slug,
          status: event.status,
          startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt.toISOString(),
          timezone: event.timezone,
          coverMediaId: event.coverMediaId,
          translations: toTranslationValues(event.translations),
        }}
      />

      <section className="mt-16">
        <h2 className="eyebrow mb-4">{t('events.scheduleTitle')}</h2>
        <ScheduleManager
          eventId={event.id}
          locale={locale}
          items={event.schedule.map((item) => ({
            id: item.id,
            startsAt: item.startsAt.toISOString(),
            translations: item.translations,
          }))}
        />
      </section>

      {mayDelete && (
        <DangerZone
          action={deleteEventAction}
          id={event.id}
          locale={locale}
          label={t('common.delete')}
          warning="This also removes its programme items. This cannot be undone."
        />
      )}
    </AdminPage>
  );
}
