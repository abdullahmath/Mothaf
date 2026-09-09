import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { getSceneForAdmin } from '@/server/domain/admin/scenes';
import { getTourForAdmin } from '@/server/domain/admin/tours';
import { listMedia } from '@/server/domain/admin/media';
import { listPoisForAdmin } from '@/server/domain/admin/pois';
import { listEventsForAdmin } from '@/server/domain/admin/events';
import { isDomainError } from '@/server/domain/errors';
import { AdminPage } from '@/components/admin/AdminPage';
import { SceneForm } from '@/components/admin/SceneForm';
import { HotspotManager } from '@/components/admin/HotspotManager';
import { SceneLinksForm } from '@/components/admin/SceneLinksForm';
import { DangerZone } from '@/components/admin/DangerZone';
import { toTranslationValues } from '@/lib/content/translations';
import { deleteSceneAction } from '@/server/actions/content';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SceneEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ tourId?: string }>;
}) {
  const { locale: raw, id } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);

  const isNew = id === 'new';
  const { tourId: tourIdParam } = await searchParams;

  const media = await listMedia('all', 200);
  const imageOptions = media
    .filter((asset) => asset.kind === 'image' || asset.kind === 'panorama')
    .map((asset) => ({
      value: asset.id,
      label: asset.originalFilename ?? `${asset.kind} (${asset.id.slice(0, 8)})`,
    }));
  const audioOptions = media
    .filter((asset) => asset.kind === 'audio')
    .map((asset) => ({ value: asset.id, label: asset.originalFilename ?? asset.id.slice(0, 8) }));
  const mediaOptions = media.map((asset) => ({
    value: asset.id,
    label: asset.originalFilename ?? `${asset.kind} (${asset.id.slice(0, 8)})`,
  }));

  if (isNew) {
    if (!tourIdParam) {
      return (
        <AdminPage title={`${t('common.create')} — ${t('admin.scenes')}`}>
          <p className="text-sm text-lime-dim">Open this from a tour&rsquo;s page — a scene needs one.</p>
        </AdminPage>
      );
    }

    const tour = await getTourForAdmin(tourIdParam).catch((error) => {
      if (isDomainError(error) && error.code === 'not_found') notFound();
      throw error;
    });

    return (
      <AdminPage
        title={`${t('common.create')} — ${t('admin.scenes')}`}
        backHref={`/${locale}/admin/tours/${tour.id}`}
        backLabel={t('admin.tours')}
      >
        <SceneForm
          locale={locale}
          imageOptions={imageOptions}
          audioOptions={audioOptions}
          values={{
            tourId: tour.id,
            slug: '',
            kind: tour.kind,
            status: 'draft',
            isStart: false,
            backgroundMediaId: null,
            thumbnailMediaId: null,
            audioMediaId: null,
            yaw: 0,
            pitch: 0,
            fov: 78,
            northOffsetDeg: 0,
            translations: {},
          }}
        />
        <p className="mt-6 text-xs text-lime-faint">
          Hotspots and scene connections become available once this scene is created.
        </p>
      </AdminPage>
    );
  }

  const scene = await getSceneForAdmin(id).catch((error) => {
    if (isDomainError(error) && error.code === 'not_found') notFound();
    throw error;
  });
  const [pois, events] = await Promise.all([
    listPoisForAdmin(scene.tour.destinationId),
    listEventsForAdmin(scene.tour.destinationId),
  ]);

  const title = scene.translations.find((tr) => tr.locale === locale)?.title ?? scene.slug;

  const poiOptions = pois.map((poi) => ({
    value: poi.id,
    label: poi.translations.find((tr) => tr.locale === locale)?.title ?? poi.slug,
  }));
  const eventOptions = events.map((event) => ({
    value: event.id,
    label: event.translations.find((tr) => tr.locale === locale)?.title ?? event.slug,
  }));
  const sceneOptions = scene.siblings.map((sibling) => ({
    value: sibling.id,
    label: sibling.translations.find((tr) => tr.locale === locale)?.title ?? sibling.slug,
  }));

  return (
    <AdminPage
      title={title}
      description={scene.slug}
      backHref={`/${locale}/admin/tours/${scene.tourId}`}
      backLabel={t('admin.tours')}
    >
      <SceneForm
        locale={locale}
        imageOptions={imageOptions}
        audioOptions={audioOptions}
        values={{
          id: scene.id,
          tourId: scene.tourId,
          slug: scene.slug,
          kind: scene.kind,
          status: scene.status,
          isStart: scene.isStart,
          backgroundMediaId: scene.backgroundMediaId,
          thumbnailMediaId: scene.thumbnailMediaId,
          audioMediaId: scene.audioMediaId,
          yaw: (scene.view as { yaw?: number }).yaw ?? 0,
          pitch: (scene.view as { pitch?: number }).pitch ?? 0,
          fov: (scene.view as { fov?: number }).fov ?? 78,
          northOffsetDeg: scene.northOffsetDeg,
          translations: toTranslationValues(scene.translations),
        }}
      />

      <section className="mt-16">
        <h2 className="eyebrow mb-4">{t('admin.hotspots')}</h2>
        <HotspotManager
          sceneId={scene.id}
          locale={locale}
          hotspots={scene.hotspots}
          options={{ scenes: sceneOptions, pois: poiOptions, events: eventOptions, media: mediaOptions }}
        />
      </section>

      <section className="mt-16">
        <h2 className="eyebrow mb-4">Connected scenes</h2>
        <SceneLinksForm
          sceneId={scene.id}
          locale={locale}
          siblings={sceneOptions.map((option) => ({ id: option.value, label: option.label }))}
          initialLinkedIds={scene.linkedSceneIds}
        />
      </section>

      <DangerZone
        action={deleteSceneAction}
        id={scene.id}
        locale={locale}
        label={t('common.delete')}
        warning="Deleting this scene also removes its hotspots. This cannot be undone."
      />
    </AdminPage>
  );
}
