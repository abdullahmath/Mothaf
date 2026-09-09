import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { getPoiForAdmin } from '@/server/domain/admin/pois';
import { listDestinationsForAdmin } from '@/server/domain/admin/destinations';
import { listMedia } from '@/server/domain/admin/media';
import { isDomainError } from '@/server/domain/errors';
import { AdminPage } from '@/components/admin/AdminPage';
import { PoiForm } from '@/components/admin/PoiForm';
import { toTranslationValues } from '@/lib/content/translations';
import { DangerZone } from '@/components/admin/DangerZone';
import { deletePoiAction } from '@/server/actions/content';
import { can } from '@/server/domain/guard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PoiEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);

  const isNew = id === 'new';
  const [destinations, media, mayDelete] = await Promise.all([
    listDestinationsForAdmin(),
    listMedia('all', 200),
    can('content:publish'),
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
          title={`${t('common.create')} — ${t('admin.pois')}`}
          backHref={`/${locale}/admin/pois`}
          backLabel={t('admin.pois')}
        >
          <p className="text-sm text-lime-dim">Create a destination first.</p>
        </AdminPage>
      );
    }

    return (
      <AdminPage
        title={`${t('common.create')} — ${t('admin.pois')}`}
        backHref={`/${locale}/admin/pois`}
        backLabel={t('admin.pois')}
      >
        <PoiForm
          locale={locale}
          destinationOptions={destinationOptions}
          mediaOptions={mediaOptions}
          values={{
            destinationId: destinationOptions[0]!.value,
            slug: '',
            status: 'draft',
            coverMediaId: null,
            latitude: null,
            longitude: null,
            tags: '',
            translations: {},
          }}
        />
      </AdminPage>
    );
  }

  const poi = await getPoiForAdmin(id).catch((error) => {
    if (isDomainError(error) && error.code === 'not_found') notFound();
    throw error;
  });

  const title =
    poi.translations.find((tr) => tr.locale === locale)?.title ??
    poi.translations[0]?.title ??
    poi.slug;

  return (
    <AdminPage
      title={title}
      description={poi.slug}
      backHref={`/${locale}/admin/pois`}
      backLabel={t('admin.pois')}
    >
      <PoiForm
        locale={locale}
        destinationOptions={destinationOptions}
        mediaOptions={mediaOptions}
        values={{
          id: poi.id,
          destinationId: poi.destinationId,
          slug: poi.slug,
          status: poi.status,
          coverMediaId: poi.coverMediaId,
          latitude: poi.latitude,
          longitude: poi.longitude,
          tags: poi.tags.join(', '),
          translations: toTranslationValues(poi.translations),
        }}
      />

      {mayDelete && (
        <DangerZone
          action={deletePoiAction}
          id={poi.id}
          locale={locale}
          label={t('common.delete')}
          warning="This cannot be undone."
        />
      )}
    </AdminPage>
  );
}
