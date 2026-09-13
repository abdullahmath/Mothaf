import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatDateRange, getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { listEventsForAdmin } from '@/server/domain/admin/events';
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
    title: isAppLocale(locale) ? getTranslator(locale)('admin.events') : 'Events',
    robots: { index: false, follow: false },
  };
}

export default async function EventsAdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);

  const [events, mayWrite] = await Promise.all([
    listEventsForAdmin(),
    can('event:write'),
  ]);

  const statusLabel = (status: string) =>
    status === 'published'
      ? t('admin.statusPublished')
      : status === 'archived'
        ? t('admin.statusArchived')
        : t('admin.statusDraft');

  return (
    <AdminPage
      title={t('admin.events')}
      actions={
        mayWrite ? (
          <Link href={`/${locale}/admin/events/new`} className="btn btn-primary">
            + {t('common.create')}
          </Link>
        ) : null
      }
    >
      {events.length === 0 ? (
        <EmptyState
          message={t('admin.emptyEvents')}
          actionHref={mayWrite ? `/${locale}/admin/events/new` : undefined}
          actionLabel={t('common.create')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">{t('admin.events')}</th>
                <th scope="col">{t('events.dates')}</th>
                <th scope="col">{t('admin.status')}</th>
                <th scope="col">
                  <span className="visually-hidden">{t('common.edit')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const title =
                  event.translations.find((tr) => tr.locale === locale)?.title ??
                  event.translations[0]?.title ??
                  event.slug;
                return (
                  <tr key={event.id}>
                    <td>
                      <Link
                        href={`/${locale}/admin/events/${event.id}`}
                        className="text-lime transition-colors hover:text-verdigris-bright"
                      >
                        {title}
                      </Link>
                      <p className="readout">{event.slug}</p>
                    </td>
                    <td className="readout">
                      {formatDateRange(
                        locale,
                        event.startsAt.toISOString(),
                        event.endsAt.toISOString(),
                        event.timezone,
                      )}
                    </td>
                    <td>
                      <StatusPill status={event.status} label={statusLabel(event.status)} />
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <Link
                          href={`/${locale}/admin/events/${event.id}`}
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
