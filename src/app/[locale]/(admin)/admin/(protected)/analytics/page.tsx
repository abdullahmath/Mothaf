import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatNumber, getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { getAnalyticsSummary, type Period } from '@/server/domain/admin/analytics';
import { AdminPage } from '@/components/admin/AdminPage';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: isAppLocale(locale) ? getTranslator(locale)('admin.analytics') : 'Analytics',
    robots: { index: false, follow: false },
  };
}

const PERIODS: Period[] = [7, 30, 90];

export default async function AnalyticsAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);

  const { days: daysParam } = await searchParams;
  const days = (PERIODS.includes(Number(daysParam) as Period) ? Number(daysParam) : 30) as Period;

  const summary = await getAnalyticsSummary(days);

  const tiles = [
    { label: t('analytics.tourOpens'), value: summary.tourOpens },
    { label: t('analytics.sceneViews'), value: summary.sceneViews },
    { label: t('analytics.hotspotClicks'), value: summary.hotspotClicks },
    { label: t('analytics.poiViews'), value: summary.poiViews },
    { label: t('analytics.mediaPlays'), value: summary.mediaPlays },
    { label: t('analytics.tourCompletes'), value: summary.tourCompletes },
  ];

  const hasAnyData = tiles.some((tile) => tile.value > 0);
  const dailyMax = Math.max(1, ...summary.daily.map((row) => row.value));

  return (
    <AdminPage
      title={t('admin.analytics')}
      actions={
        <nav className="flex gap-1">
          {PERIODS.map((period) => (
            <a
              key={period}
              href={`?days=${period}`}
              aria-current={days === period ? 'true' : undefined}
              className={`chip transition-colors ${days === period ? 'border-verdigris text-verdigris' : ''}`}
            >
              {period}d
            </a>
          ))}
        </nav>
      }
    >
      {!hasAnyData ? (
        <p className="text-sm text-lime-dim">{t('analytics.noData')}</p>
      ) : (
        <>
          <ul className="grid gap-px overflow-hidden rounded-md border border-[var(--hairline)] bg-[var(--hairline)] sm:grid-cols-2 lg:grid-cols-3">
            {tiles.map((tile) => (
              <li key={tile.label} className="bg-ink p-5">
                <p className="eyebrow">{tile.label}</p>
                <p className="mono mt-2 text-3xl text-lime">{formatNumber(locale, tile.value)}</p>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-lime-dim">
            {summary.medianSceneDwellSeconds !== null && (
              <p>
                {t('analytics.avgDuration')}:{' '}
                <span className="mono text-lime">{summary.medianSceneDwellSeconds}s</span>
              </p>
            )}
            {summary.completionRatePercent !== null && (
              <p>
                {t('analytics.completionRate')}:{' '}
                <span className="mono text-lime">{summary.completionRatePercent}%</span>
              </p>
            )}
          </div>

          {summary.daily.length > 0 && (
            <section className="mt-12">
              <h2 className="eyebrow mb-4">{t('analytics.dailyTrend')}</h2>
              <div
                className="flex h-32 items-end gap-1 rounded-md border border-[var(--hairline)] p-4"
                role="img"
                aria-label={t('analytics.dailyTrend')}
              >
                {summary.daily.map((row) => (
                  <div
                    key={row.day}
                    className="group relative flex-1"
                    style={{ height: '100%' }}
                    title={`${row.day}: ${row.value}`}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-t-sm bg-verdigris transition-colors group-hover:bg-verdigris-bright"
                      style={{ height: `${Math.max(2, (row.value / dailyMax) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-2xs text-lime-faint">
                <span>{summary.daily[0]?.day}</span>
                <span>{summary.daily[summary.daily.length - 1]?.day}</span>
              </div>
            </section>
          )}

          <div className="mt-12 grid gap-10 sm:grid-cols-2">
            <section>
              <h2 className="eyebrow mb-4">{t('analytics.byLocale')}</h2>
              {summary.byLocale.length === 0 ? (
                <p className="text-sm text-lime-faint">—</p>
              ) : (
                <ul className="grid gap-2">
                  {summary.byLocale.map((row) => (
                    <li key={row.locale} className="flex items-center justify-between text-sm">
                      <span className="text-lime-dim">{row.locale}</span>
                      <span className="readout">{formatNumber(locale, row.value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="eyebrow mb-4">{t('analytics.byDevice')}</h2>
              {summary.byDevice.length === 0 ? (
                <p className="text-sm text-lime-faint">—</p>
              ) : (
                <ul className="grid gap-2">
                  {summary.byDevice.map((row) => (
                    <li key={row.device} className="flex items-center justify-between text-sm">
                      <span className="text-lime-dim">{row.device}</span>
                      <span className="readout">{formatNumber(locale, row.value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {summary.topScenes.length > 0 && (
            <section className="mt-12">
              <h2 className="eyebrow mb-4">{t('admin.scenes')}</h2>
              <ol className="grid gap-2">
                {summary.topScenes.map((row) => (
                  <li
                    key={row.sceneId}
                    className="flex items-center justify-between rounded-md border border-[var(--hairline)] p-3 text-sm"
                  >
                    <span className="text-lime">{row.title}</span>
                    <span className="readout">{formatNumber(locale, row.value)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {summary.topPois.length > 0 && (
            <section className="mt-12">
              <h2 className="eyebrow mb-4">{t('analytics.topPois')}</h2>
              <ol className="grid gap-2">
                {summary.topPois.map((row) => (
                  <li
                    key={row.poiId}
                    className="flex items-center justify-between rounded-md border border-[var(--hairline)] p-3 text-sm"
                  >
                    <span className="text-lime">{row.title}</span>
                    <span className="readout">{formatNumber(locale, row.value)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </AdminPage>
  );
}
