import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatNumber, getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { getContentCounts, getTranslationCoverage } from '@/server/domain/admin/analytics';
import { can } from '@/server/domain/guard';
import { AdminPage } from '@/components/admin/AdminPage';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: isAppLocale(locale) ? getTranslator(locale)('admin.dashboard') : 'Dashboard',
    // Nothing under /admin should ever be indexed.
    robots: { index: false, follow: false },
  };
}

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);

  const counts = await getContentCounts();
  // Coverage is measured against the *other* language: an Arabic editor wants
  // to know what is still missing in English, and vice versa.
  const targetLocale = locale === 'ar' ? 'en' : 'ar';
  const coverage = (await can('content:read')) ? await getTranslationCoverage(targetLocale) : [];

  const tiles = [
    { label: t('admin.destinations'), value: counts.destinations, sub: `${counts.publishedDestinations} ${t('admin.statusPublished').toLowerCase()}` },
    { label: t('admin.tours'), value: counts.tours, sub: `${counts.publishedTours} ${t('admin.statusPublished').toLowerCase()}` },
    { label: t('admin.scenes'), value: counts.scenes, sub: `${counts.hotspots} ${t('admin.hotspots').toLowerCase()}` },
    { label: t('admin.pois'), value: counts.pois, sub: '' },
    { label: t('admin.events'), value: counts.events, sub: '' },
    { label: t('admin.media'), value: counts.media, sub: '' },
  ];

  return (
    <AdminPage title={t('admin.dashboard')}>
      <section>
        <ul className="grid gap-px overflow-hidden rounded-md border border-[var(--hairline)] bg-[var(--hairline)] sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <li key={tile.label} className="bg-ink p-5">
              <p className="eyebrow">{tile.label}</p>
              <p className="mono mt-2 text-3xl text-lime">{formatNumber(locale, tile.value)}</p>
              {tile.sub && <p className="mt-1 text-xs text-lime-faint">{tile.sub}</p>}
            </li>
          ))}
        </ul>
      </section>

      {coverage.length > 0 && (
        <section className="mt-12">
          <h2 className="eyebrow mb-4">
            {t('admin.translations')} — {targetLocale.toUpperCase()}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {coverage.map((row) => {
              const percent = row.total === 0 ? 100 : Math.round((row.done / row.total) * 100);
              return (
                <li key={row.entity} className="rounded-md border border-[var(--hairline)] p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-lime">{row.entity}</span>
                    <span className="readout">
                      {row.done}/{row.total}
                    </span>
                  </div>
                  <div className="coverage mt-3">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <h2 className="eyebrow mb-4">{t('common.create')}</h2>
        <div className="flex flex-wrap gap-3">
          <Link href={`/${locale}/admin/destinations/new`} className="btn btn-quiet">
            + {t('admin.destinations')}
          </Link>
          <Link href={`/${locale}/admin/tours/new`} className="btn btn-quiet">
            + {t('admin.tours')}
          </Link>
          <Link href={`/${locale}/admin/media`} className="btn btn-quiet">
            + {t('admin.media')}
          </Link>
          <Link href={`/${locale}/admin/events/new`} className="btn btn-quiet">
            + {t('admin.events')}
          </Link>
        </div>
      </section>
    </AdminPage>
  );
}
