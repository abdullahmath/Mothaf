import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatCount, getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { listDestinationsForAdmin } from '@/server/domain/admin/destinations';
import { can } from '@/server/domain/guard';
import { AdminPage, EmptyState, StatusPill } from '@/components/admin/AdminPage';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: isAppLocale(locale) ? getTranslator(locale)('admin.destinations') : 'Destinations',
    robots: { index: false, follow: false },
  };
}

export default async function DestinationsAdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);

  const [destinations, mayWrite] = await Promise.all([
    listDestinationsForAdmin(),
    can('content:write'),
  ]);

  const statusLabel = (status: string) =>
    status === 'published'
      ? t('admin.statusPublished')
      : status === 'archived'
        ? t('admin.statusArchived')
        : t('admin.statusDraft');

  /** The name in the admin's own language, falling back so nothing is blank. */
  const nameOf = (translations: { locale: string; name: string }[], slug: string) =>
    translations.find((tr) => tr.locale === locale)?.name ?? translations[0]?.name ?? slug;

  return (
    <AdminPage
      title={t('admin.destinations')}
      actions={
        mayWrite ? (
          <Link href={`/${locale}/admin/destinations/new`} className="btn btn-primary">
            + {t('common.create')}
          </Link>
        ) : null
      }
    >
      {destinations.length === 0 ? (
        <EmptyState
          message="No destinations yet. A destination is the place — a site, a museum, a landmark — that tours belong to."
          actionHref={mayWrite ? `/${locale}/admin/destinations/new` : undefined}
          actionLabel={t('common.create')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">{t('admin.destinations')}</th>
                <th scope="col">{t('admin.status')}</th>
                <th scope="col">{t('admin.tours')}</th>
                <th scope="col">{t('admin.pois')}</th>
                <th scope="col">
                  <span className="visually-hidden">{t('common.edit')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {destinations.map((destination) => (
                <tr key={destination.id}>
                  <td>
                    <Link
                      href={`/${locale}/admin/destinations/${destination.id}`}
                      className="text-lime transition-colors hover:text-verdigris-bright"
                    >
                      {nameOf(destination.translations, destination.slug)}
                    </Link>
                    <p className="readout">{destination.slug}</p>
                  </td>
                  <td>
                    <StatusPill
                      status={destination.status}
                      label={statusLabel(destination.status)}
                    />
                  </td>
                  <td className="readout">{formatCount(locale, 'tours', destination.tourCount)}</td>
                  <td className="readout">{formatCount(locale, 'pois', destination.poiCount)}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      {destination.status === 'published' && (
                        <Link
                          href={`/${locale}/destinations/${destination.slug}`}
                          className="text-xs text-lime-faint transition-colors hover:text-lime"
                        >
                          {t('admin.preview')} ↗
                        </Link>
                      )}
                      <Link
                        href={`/${locale}/admin/destinations/${destination.id}`}
                        className="text-xs text-lime-dim transition-colors hover:text-lime"
                      >
                        {t('common.edit')}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPage>
  );
}
