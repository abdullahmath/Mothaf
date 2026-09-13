import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { listDestinationsForAdmin } from '@/server/domain/admin/destinations';
import { listHeritageSitesForAdmin } from '@/server/domain/admin/heritage';
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
    title: isAppLocale(locale) ? getTranslator(locale)('admin.heritageSites') : 'Heritage sites',
    robots: { index: false, follow: false },
  };
}

export default async function HeritageSitesAdminPage({
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

  // Same fan-out as the POI list: heritage sites are scoped per destination,
  // and there is no single "list everything" query.
  const sitesByDestination = await Promise.all(
    destinations.map(async (destination) => ({
      destination,
      sites: await listHeritageSitesForAdmin(destination.id),
    })),
  );
  const sites = sitesByDestination.flatMap(({ destination, sites: rows }) =>
    rows.map((site) => ({ site, destination })),
  );

  const statusLabel = (status: string) =>
    status === 'published'
      ? t('admin.statusPublished')
      : status === 'archived'
        ? t('admin.statusArchived')
        : t('admin.statusDraft');

  return (
    <AdminPage
      title={t('admin.heritageSites')}
      actions={
        mayWrite ? (
          <Link href={`/${locale}/admin/heritage-sites/new`} className="btn btn-primary">
            + {t('common.create')}
          </Link>
        ) : null
      }
    >
      {sites.length === 0 ? (
        <EmptyState
          message={t('admin.emptyHeritageSites')}
          actionHref={mayWrite ? `/${locale}/admin/heritage-sites/new` : undefined}
          actionLabel={t('common.create')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">{t('admin.heritageSites')}</th>
                <th scope="col">{t('admin.destinations')}</th>
                <th scope="col">{t('admin.status')}</th>
                <th scope="col">
                  <span className="visually-hidden">{t('common.edit')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sites.map(({ site, destination }) => {
                const title =
                  site.translations.find((tr) => tr.locale === locale)?.title ??
                  site.translations[0]?.title ??
                  site.slug;
                const destName =
                  destination.translations.find((tr) => tr.locale === locale)?.name ??
                  destination.translations[0]?.name ??
                  destination.slug;
                return (
                  <tr key={site.id}>
                    <td>
                      <Link
                        href={`/${locale}/admin/heritage-sites/${site.id}`}
                        className="text-lime transition-colors hover:text-verdigris-bright"
                      >
                        {title}
                      </Link>
                      <p className="readout">{site.slug}</p>
                    </td>
                    <td className="text-sm text-lime-dim">{destName}</td>
                    <td>
                      <StatusPill status={site.status} label={statusLabel(site.status)} />
                    </td>
                    <td>
                      <div className="flex justify-end gap-3">
                        {site.status === 'published' && (
                          <Link
                            href={`/${locale}/destinations/${destination.slug}/heritage/${site.slug}`}
                            className="text-xs text-lime-faint transition-colors hover:text-lime"
                          >
                            {t('admin.preview')} ↗
                          </Link>
                        )}
                        <Link
                          href={`/${locale}/admin/heritage-sites/${site.id}`}
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
