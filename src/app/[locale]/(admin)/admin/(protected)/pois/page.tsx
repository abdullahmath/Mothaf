import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { listDestinationsForAdmin } from '@/server/domain/admin/destinations';
import { listPoisForAdmin } from '@/server/domain/admin/pois';
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
    title: isAppLocale(locale) ? getTranslator(locale)('admin.pois') : 'Points of interest',
    robots: { index: false, follow: false },
  };
}

export default async function PoisAdminPage({
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

  // POIs are scoped per destination; there is no single "list everything"
  // query, so the small admin-only destination list is fanned out here
  // instead of adding one.
  const poisByDestination = await Promise.all(
    destinations.map(async (destination) => ({
      destination,
      pois: await listPoisForAdmin(destination.id),
    })),
  );
  const pois = poisByDestination.flatMap(({ destination, pois: rows }) =>
    rows.map((poi) => ({ poi, destination })),
  );

  const statusLabel = (status: string) =>
    status === 'published'
      ? t('admin.statusPublished')
      : status === 'archived'
        ? t('admin.statusArchived')
        : t('admin.statusDraft');

  return (
    <AdminPage
      title={t('admin.pois')}
      actions={
        mayWrite ? (
          <Link href={`/${locale}/admin/pois/new`} className="btn btn-primary">
            + {t('common.create')}
          </Link>
        ) : null
      }
    >
      {pois.length === 0 ? (
        <EmptyState
          message={t('admin.emptyPois')}
          actionHref={mayWrite ? `/${locale}/admin/pois/new` : undefined}
          actionLabel={t('common.create')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">{t('admin.pois')}</th>
                <th scope="col">{t('admin.destinations')}</th>
                <th scope="col">{t('admin.status')}</th>
                <th scope="col">
                  <span className="visually-hidden">{t('common.edit')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pois.map(({ poi, destination }) => {
                const title =
                  poi.translations.find((tr) => tr.locale === locale)?.title ??
                  poi.translations[0]?.title ??
                  poi.slug;
                const destName =
                  destination.translations.find((tr) => tr.locale === locale)?.name ??
                  destination.translations[0]?.name ??
                  destination.slug;
                return (
                  <tr key={poi.id}>
                    <td>
                      <Link
                        href={`/${locale}/admin/pois/${poi.id}`}
                        className="text-lime transition-colors hover:text-verdigris-bright"
                      >
                        {title}
                      </Link>
                      <p className="readout">{poi.slug}</p>
                    </td>
                    <td className="text-sm text-lime-dim">{destName}</td>
                    <td>
                      <StatusPill status={poi.status} label={statusLabel(poi.status)} />
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <Link
                          href={`/${locale}/admin/pois/${poi.id}`}
                          className="text-xs text-lime-dim transition-colors hover:text-lime"
                        >
                          {t('common.edit')}
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminPage>
  );
}
