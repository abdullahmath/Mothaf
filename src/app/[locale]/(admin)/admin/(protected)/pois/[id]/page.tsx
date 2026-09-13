import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { getPoiForAdmin, listCategories } from '@/server/domain/admin/pois';
import { listDestinationsForAdmin } from '@/server/domain/admin/destinations';
import { listMedia } from '@/server/domain/admin/media';
import { mediaUrl } from '@/server/media/urls';
import { isDomainError } from '@/server/domain/errors';
import { AdminPage } from '@/components/admin/AdminPage';
import { PoiForm } from '@/components/admin/PoiForm';
import { toTranslationValues } from '@/lib/content/translations';
import { DangerZone } from '@/components/admin/DangerZone';
import { deletePoiAction } from '@/server/actions/content';
import { can } from '@/server/domain/guard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Category options across every destination.
 *
 * `listCategories` is scoped to one destination — there is no "everyone's
 * categories" query — so this fans out the same way the POI list page fans
 * out `listPoisForAdmin`. Small, admin-only data; the destination name in the
 * label is what lets an editor tell them apart, since a POI's destination is
 * chosen in the same form and this list is not filtered to match it.
 */
async function loadCategoryOptions(
  destinations: Awaited<ReturnType<typeof listDestinationsForAdmin>>,
  locale: AppLocale,
) {
  const perDestination = await Promise.all(
    destinations.map(async (destination) => ({
      destination,
      categories: await listCategories(destination.id),
    })),
  );
  return perDestination.flatMap(({ destination, categories }) => {
    const destName =
      destination.translations.find((tr) => tr.locale === locale)?.name ??
      destination.translations[0]?.name ??
      destination.slug;
    return categories.map((category) => ({
      value: category.id,
      label: `${destName} — ${category.translations.find((tr) => tr.locale === locale)?.name ?? category.slug}`,
    }));
  });
}

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
  const categoryOptions = await loadCategoryOptions(destinations, locale);

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
      thumbUrl: mediaUrl(
        asset.variants.find((v) => v.name === 'thumb')?.storageKey ?? asset.storageKey,
      ),
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
          categoryOptions={categoryOptions}
          mediaOptions={mediaOptions}
          values={{
            destinationId: destinationOptions[0]!.value,
            categoryId: null,
            slug: '',
            status: 'draft',
            coverMediaId: null,
            latitude: null,
            longitude: null,
            tags: '',
            galleryMediaIds: [],
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
        categoryOptions={categoryOptions}
        mediaOptions={mediaOptions}
        values={{
          id: poi.id,
          destinationId: poi.destinationId,
          categoryId: poi.categoryId,
          slug: poi.slug,
          status: poi.status,
          coverMediaId: poi.coverMediaId,
          latitude: poi.latitude,
          longitude: poi.longitude,
          tags: poi.tags.join(', '),
          galleryMediaIds: poi.galleryMediaIds,
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
