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
          message={t('admin.emptyDestinations')}
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
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/${locale}/admin/destinations/${destination.id}`}
                        className="text-lime transition-colors hover:text-verdigris-bright"
                      >
                        {nameOf(destination.translations, destination.slug)}
                      </Link>
                      {destination.latitude !== null && destination.longitude !== null && (
                        <a
                          href={`https://www.google.com/maps?q=${destination.latitude},${destination.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t('destination.locationTitle')}
                          aria-label={t('destination.locationTitle')}
                          className="text-lime-faint transition-colors hover:text-verdigris-bright"
                        >
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path
                              d="M10 18s6-5.686 6-10a6 6 0 1 0-12 0c0 4.314 6 10 6 10Z"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            />
                            <circle cx="10" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
                          </svg>
                        </a>
                      )}
                    </div>
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
