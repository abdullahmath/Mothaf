import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { getHeritageSiteForAdmin } from '@/server/domain/admin/heritage';
import { listDestinationsForAdmin } from '@/server/domain/admin/destinations';
import { listMedia } from '@/server/domain/admin/media';
import { isDomainError } from '@/server/domain/errors';
import { AdminPage } from '@/components/admin/AdminPage';
import { HeritageSiteForm } from '@/components/admin/HeritageSiteForm';
import { toTranslationValues } from '@/lib/content/translations';
import { DangerZone } from '@/components/admin/DangerZone';
import { deleteHeritageSiteAction } from '@/server/actions/content';
import { can } from '@/server/domain/guard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function HeritageSiteEditPage({
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
          title={`${t('common.create')} — ${t('admin.heritageSites')}`}
          backHref={`/${locale}/admin/heritage-sites`}
          backLabel={t('admin.heritageSites')}
        >
          <p className="text-sm text-lime-dim">Create a destination first.</p>
        </AdminPage>
      );
    }

    return (
      <AdminPage
        title={`${t('common.create')} — ${t('admin.heritageSites')}`}
        backHref={`/${locale}/admin/heritage-sites`}
        backLabel={t('admin.heritageSites')}
      >
        <HeritageSiteForm
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
            galleryMediaIds: [],
            translations: {},
          }}
        />
      </AdminPage>
    );
  }

  const site = await getHeritageSiteForAdmin(id).catch((error) => {
    if (isDomainError(error) && error.code === 'not_found') notFound();
    throw error;
  });

  const destination = destinations.find((d) => d.id === site.destinationId);
  const title =
    site.translations.find((tr) => tr.locale === locale)?.title ??
    site.translations[0]?.title ??
    site.slug;

  return (
    <AdminPage
      title={title}
      description={site.slug}
      backHref={`/${locale}/admin/heritage-sites`}
      backLabel={t('admin.heritageSites')}
      actions={
        site.status === 'published' && destination ? (
          <Link
            href={`/${locale}/destinations/${destination.slug}/heritage/${site.slug}`}
            className="text-sm text-lime-faint transition-colors hover:text-lime"
          >
            {t('admin.preview')} ↗
          </Link>
        ) : null
      }
    >
      <HeritageSiteForm
        locale={locale}
        destinationOptions={destinationOptions}
        mediaOptions={mediaOptions}
        values={{
          id: site.id,
          destinationId: site.destinationId,
          slug: site.slug,
          status: site.status,
          coverMediaId: site.coverMediaId,
          latitude: site.latitude,
          longitude: site.longitude,
          galleryMediaIds: site.galleryMediaIds,
          translations: toTranslationValues(site.translations),
        }}
      />

      {mayDelete && (
        <DangerZone
          action={deleteHeritageSiteAction}
          id={site.id}
          locale={locale}
          label={t('common.delete')}
          warning="This cannot be undone."
        />
      )}
    </AdminPage>
  );
}
