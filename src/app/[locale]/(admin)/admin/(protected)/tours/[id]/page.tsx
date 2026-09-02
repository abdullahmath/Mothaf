import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { getTourForAdmin } from '@/server/domain/admin/tours';
import { listDestinationsForAdmin } from '@/server/domain/admin/destinations';
import { listMedia } from '@/server/domain/admin/media';
import { can } from '@/server/domain/guard';
import { isDomainError } from '@/server/domain/errors';
import { AdminPage, StatusPill } from '@/components/admin/AdminPage';
import { TourForm } from '@/components/admin/TourForm';
import { toTranslationValues } from '@/components/admin/TranslationFields';
import { DangerZone } from '@/components/admin/DangerZone';
import { deleteTourAction } from '@/server/actions/content';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function TourEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);

  const isNew = id === 'new';
  const [canPublish, destinations, media] = await Promise.all([
    can('content:publish'),
    listDestinationsForAdmin(),
    listMedia('all', 200),
  ]);

  const destinationOptions = destinations.map((destination) => ({
    value: destination.id,
    label:
      destination.translations.find((tr) => tr.locale === locale)?.name ??
      destination.translations[0]?.name ??
      destination.slug,
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
          title={`${t('common.create')} — ${t('admin.tours')}`}
          backHref={`/${locale}/admin/tours`}
          backLabel={t('admin.tours')}
        >
          <p className="text-sm text-lime-dim">
            Create a destination first — a tour belongs to one.
          </p>
          <Link href={`/${locale}/admin/destinations/new`} className="btn btn-primary mt-5">
            + {t('admin.destinations')}
          </Link>
        </AdminPage>
      );
    }

    return (
      <AdminPage
        title={`${t('common.create')} — ${t('admin.tours')}`}
        backHref={`/${locale}/admin/tours`}
        backLabel={t('admin.tours')}
      >
        <TourForm
          locale={locale}
          canPublish={canPublish}
          destinationOptions={destinationOptions}
          mediaOptions={mediaOptions}
          values={{
            destinationId: destinationOptions[0]!.value,
            slug: '',
            kind: 'panorama',
            status: 'draft',
            coverMediaId: null,
            estimatedMinutes: null,
            settings: {},
            translations: {},
          }}
        />
      </AdminPage>
    );
  }

  const tour = await getTourForAdmin(id).catch((error) => {
    if (isDomainError(error) && error.code === 'not_found') notFound();
    throw error;
  });

  const title =
    tour.translations.find((tr) => tr.locale === locale)?.title ??
    tour.translations[0]?.title ??
    tour.slug;

  return (
    <AdminPage
      title={title}
      description={`${tour.destination.slug}/${tour.slug}`}
      backHref={`/${locale}/admin/tours`}
      backLabel={t('admin.tours')}
    >
      <TourForm
        locale={locale}
        canPublish={canPublish}
        destinationOptions={destinationOptions}
        mediaOptions={mediaOptions}
        values={{
          id: tour.id,
          destinationId: tour.destinationId,
          slug: tour.slug,
          kind: tour.kind,
          status: tour.status,
          coverMediaId: tour.coverMediaId,
          estimatedMinutes: tour.estimatedMinutes,
          settings: tour.settings,
          translations: toTranslationValues(tour.translations),
        }}
      />

      {/* Scenes are listed rather than edited here: the scene editor is a
          different kind of screen, built around a picture rather than a form. */}
      <section className="mt-16">
        <h2 className="eyebrow mb-4">{t('admin.scenes')}</h2>
        {tour.scenes.length === 0 ? (
          <p className="text-sm text-lime-faint">
            No scenes yet. A panoramic tour needs at least one published scene before it can go
            live.
          </p>
        ) : (
          <ol className="grid gap-2">
            {tour.scenes.map((scene, index) => (
              <li
                key={scene.id}
                className="flex items-center gap-4 rounded-md border border-[var(--hairline)] p-3"
              >
                <span className="readout">{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-lime">{scene.slug}</p>
                  <p className="readout">
                    {scene.kind}
                    {scene.isStart ? ' · start' : ''}
                  </p>
                </div>
                <StatusPill
                  status={scene.status}
                  label={
                    scene.status === 'published'
                      ? t('admin.statusPublished')
                      : t('admin.statusDraft')
                  }
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      {canPublish && (
        <DangerZone
          action={deleteTourAction}
          id={tour.id}
          locale={locale}
          label={t('common.delete')}
          warning="Deleting this tour also removes its scenes and their hotspots. This cannot be undone."
        />
      )}
    </AdminPage>
  );
}
