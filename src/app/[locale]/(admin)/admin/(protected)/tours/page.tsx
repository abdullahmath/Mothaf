import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatCount, getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { listToursForAdmin } from '@/server/domain/admin/tours';
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
    title: isAppLocale(locale) ? getTranslator(locale)('admin.tours') : 'Tours',
    robots: { index: false, follow: false },
  };
}

export default async function ToursAdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);

  const [tours, mayWrite] = await Promise.all([listToursForAdmin(), can('content:write')]);

  const statusLabel = (status: string) =>
    status === 'published'
      ? t('admin.statusPublished')
      : status === 'archived'
        ? t('admin.statusArchived')
        : t('admin.statusDraft');

  return (
    <AdminPage
      title={t('admin.tours')}
      actions={
        mayWrite ? (
          <Link href={`/${locale}/admin/tours/new`} className="btn btn-primary">
            + {t('common.create')}
          </Link>
        ) : null
      }
    >
      {tours.length === 0 ? (
        <EmptyState
          message={t('admin.emptyTours')}
          actionHref={mayWrite ? `/${locale}/admin/tours/new` : undefined}
          actionLabel={t('common.create')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">{t('admin.tours')}</th>
                <th scope="col">{t('admin.status')}</th>
                <th scope="col">{t('admin.scenes')}</th>
                <th scope="col">
                  <span className="visually-hidden">{t('common.edit')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tours.map((tour) => {
                const title =
                  tour.translations.find((tr) => tr.locale === locale)?.title ??
                  tour.translations[0]?.title ??
                  tour.slug;
                return (
                  <tr key={tour.id}>
                    <td>
                      <Link
                        href={`/${locale}/admin/tours/${tour.id}`}
                        className="text-lime transition-colors hover:text-verdigris-bright"
                      >
                        {title}
                      </Link>
                      <p className="readout">
                        {tour.destinationSlug}/{tour.slug} · {tour.kind}
                      </p>
                    </td>
                    <td>
                      <StatusPill status={tour.status} label={statusLabel(tour.status)} />
                    </td>
                    <td className="readout">{formatCount(locale, 'scenes', tour.sceneCount)}</td>
                    <td>
                      <div className="flex justify-end gap-3">
                        {tour.status === 'published' && (
                          <Link
                            href={`/${locale}/tour/${tour.destinationSlug}/${tour.slug}`}
                            className="text-xs text-lime-faint transition-colors hover:text-lime"
                          >
                            {t('admin.preview')} ↗
                          </Link>
                        )}
                        <Link
                          href={`/${locale}/admin/tours/${tour.id}`}
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
