import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { DEFAULT_LOCALE } from '@/lib/i18n/config';
import { getDestinationForAdmin } from '@/server/domain/admin/destinations';
import { listMedia } from '@/server/domain/admin/media';
import { can } from '@/server/domain/guard';
import { isDomainError } from '@/server/domain/errors';
import { AdminPage } from '@/components/admin/AdminPage';
import { DestinationForm } from '@/components/admin/DestinationForm';
import { toTranslationValues } from '@/lib/content/translations';
import { DangerZone } from '@/components/admin/DangerZone';
import { deleteDestinationAction } from '@/server/actions/content';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** `new` is handled by the same route, so create and edit share one screen. */
export default async function DestinationEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);

  const isNew = id === 'new';
  const [canPublish, media] = await Promise.all([can('content:publish'), listMedia('all', 200)]);

  const mediaOptions = media
    .filter((asset) => asset.kind === 'image' || asset.kind === 'panorama')
    .map((asset) => ({
      value: asset.id,
      label:
        asset.originalFilename ??
        `${asset.kind} ${asset.width ?? '?'}×${asset.height ?? '?'} (${asset.id.slice(0, 8)})`,
    }));

  if (isNew) {
    return (
      <AdminPage
        title={`${t('common.create')} — ${t('admin.destinations')}`}
        backHref={`/${locale}/admin/destinations`}
        backLabel={t('admin.destinations')}
      >
        <DestinationForm
          locale={locale}
          canPublish={canPublish}
          mediaOptions={mediaOptions}
          values={{
            slug: '',
            defaultLocale: DEFAULT_LOCALE,
            status: 'draft',
            coverMediaId: null,
            countryCode: null,
            latitude: null,
            longitude: null,
            translations: {},
          }}
        />
      </AdminPage>
    );
  }

  const destination = await getDestinationForAdmin(id).catch((error) => {
    if (isDomainError(error) && error.code === 'not_found') notFound();
    throw error;
  });

  const name =
    destination.translations.find((tr) => tr.locale === locale)?.name ??
    destination.translations[0]?.name ??
    destination.slug;

  return (
    <AdminPage
      title={name}
      description={destination.slug}
      backHref={`/${locale}/admin/destinations`}
      backLabel={t('admin.destinations')}
    >
      <DestinationForm
        locale={locale}
        canPublish={canPublish}
        mediaOptions={mediaOptions}
        values={{
          id: destination.id,
          slug: destination.slug,
          defaultLocale: destination.defaultLocale,
          status: destination.status,
          coverMediaId: destination.coverMediaId,
          countryCode: destination.countryCode,
          latitude: destination.latitude,
          longitude: destination.longitude,
          translations: toTranslationValues(destination.translations),
        }}
      />

      {canPublish && (
        <DangerZone
          action={deleteDestinationAction}
          id={destination.id}
          locale={locale}
          label={t('common.delete')}
          warning="Deleting this destination also removes its tours, scenes, hotspots, points of interest and events. This cannot be undone."
        />
      )}
    </AdminPage>
  );
}
