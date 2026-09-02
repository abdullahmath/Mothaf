import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatNumber, getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { listMedia, mediaStats, type MediaKindFilter } from '@/server/domain/admin/media';
import { mediaUrl } from '@/server/media/urls';
import { AdminPage, EmptyState } from '@/components/admin/AdminPage';
import { MediaUploader } from '@/components/admin/MediaUploader';
import { MediaCard } from '@/components/admin/MediaCard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: isAppLocale(locale) ? getTranslator(locale)('admin.media') : 'Media',
    robots: { index: false, follow: false },
  };
}

const FILTERS: MediaKindFilter[] = ['all', 'panorama', 'image', 'video', 'audio'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function MediaLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  const t = getTranslator(locale);

  const { kind } = await searchParams;
  const filter: MediaKindFilter = FILTERS.includes(kind as MediaKindFilter)
    ? (kind as MediaKindFilter)
    : 'all';

  const [assets, stats] = await Promise.all([listMedia(filter), mediaStats()]);
  const totalBytes = stats.reduce((sum, row) => sum + row.bytes, 0);

  return (
    <AdminPage
      title={t('admin.media')}
      description={`${formatNumber(locale, stats.reduce((s, r) => s + r.files, 0))} files · ${formatBytes(totalBytes)}`}
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <nav className="mb-6 flex flex-wrap gap-2" aria-label="Filter by type">
            {FILTERS.map((value) => (
              <a
                key={value}
                href={`?kind=${value}`}
                aria-current={filter === value ? 'true' : undefined}
                className={[
                  'chip transition-colors',
                  filter === value
                    ? 'border-verdigris text-verdigris'
                    : 'hover:border-[color-mix(in_oklab,var(--color-lime)_25%,transparent)]',
                ].join(' ')}
              >
                {value}
                <span className="readout">
                  {value === 'all'
                    ? stats.reduce((s, r) => s + r.files, 0)
                    : (stats.find((r) => r.kind === value)?.files ?? 0)}
                </span>
              </a>
            ))}
          </nav>

          {assets.length === 0 ? (
            <EmptyState message="No files yet. Upload a panorama to start building a tour." />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <MediaCard
                    locale={locale}
                    asset={{
                      id: asset.id,
                      kind: asset.kind,
                      width: asset.width,
                      height: asset.height,
                      byteSize: asset.byteSize,
                      mimeType: asset.mimeType,
                      originalFilename: asset.originalFilename,
                      previewDataUri: asset.previewDataUri,
                      thumbUrl: mediaUrl(
                        asset.variants.find((v) => v.name === 'thumb')?.storageKey ??
                          asset.storageKey,
                      ),
                      variantCount: asset.variants.length,
                      translations: asset.translations.map((tr) => ({
                        locale: tr.locale,
                        altText: tr.altText,
                        caption: tr.caption,
                        transcript: tr.transcript,
                      })),
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <h2 className="eyebrow mb-4">Upload</h2>
          <MediaUploader locale={locale} />
        </aside>
      </div>
    </AdminPage>
  );
}
