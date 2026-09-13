import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslator, isAppLocale, type AppLocale } from '@/lib/i18n';
import { getHeritageSiteDetail } from '@/server/domain/public/heritage';
import { isDomainError } from '@/server/domain/errors';
import { HeritageSiteGallery } from '@/components/content/HeritageSiteGallery';
import { buildSrcSet } from '@/lib/media/srcset';
import { localeAlternates } from '@/lib/seo/alternates';
import { JsonLd } from '@/components/seo/JsonLd';
import { env } from '@/server/config/env';

// Rendered on request, with the underlying query served from the data cache
// (see server/domain/public/cache.ts) — the same reasoning as every other
// content route in this app: prerendering at build time would make `next
// build` require a reachable production database.
export const dynamic = 'force-dynamic';

type Params = Promise<{ locale: string; destination: string; site: string }>;

async function load(params: Params) {
  const { locale, destination, site } = await params;
  if (!isAppLocale(locale)) notFound();
  try {
    return {
      locale: locale as AppLocale,
      site: await getHeritageSiteDetail(destination, site, locale as AppLocale),
    };
  } catch (error) {
    if (isDomainError(error) && error.code === 'not_found') notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, site } = await load(params);
  const description = site.shortDescription ?? site.description?.slice(0, 200) ?? undefined;
  return {
    title: `${site.title} — ${site.destinationName}`,
    description,
    alternates: localeAlternates(
      locale,
      `/destinations/${site.destinationSlug}/heritage/${site.slug}`,
    ),
    openGraph: {
      title: site.title,
      description,
      images: site.cover ? [{ url: site.cover.src }] : undefined,
    },
  };
}

export default async function HeritageSitePage({ params }: { params: Params }) {
  const { locale, site } = await load(params);
  const t = getTranslator(locale);

  const origin = env().APP_ORIGIN;
  const destinationUrl = `${origin}/${locale}/destinations/${site.destinationSlug}`;
  const pageUrl = `${destinationUrl}/heritage/${site.slug}`;

  return (
    <article className="mx-auto max-w-[1100px] px-5 py-16 sm:px-8">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'TouristAttraction',
          name: site.title,
          description: site.shortDescription ?? site.description ?? undefined,
          url: pageUrl,
          image: site.cover ? site.cover.src : undefined,
          isPartOf: { '@type': 'TouristAttraction', name: site.destinationName, url: destinationUrl },
          ...(site.latitude !== null && site.longitude !== null
            ? {
                geo: {
                  '@type': 'GeoCoordinates',
                  latitude: site.latitude,
                  longitude: site.longitude,
                },
              }
            : {}),
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: site.destinationName, item: destinationUrl },
            { '@type': 'ListItem', position: 2, name: site.title, item: pageUrl },
          ],
        }}
      />

      <p className="eyebrow mb-3">
        <Link
          href={`/${locale}/destinations/${site.destinationSlug}`}
          className="transition-colors hover:text-lime"
        >
          {site.destinationName}
        </Link>
      </p>

      <h1 className="display text-3xl text-lime sm:text-5xl">{site.title}</h1>
      {site.shortDescription && (
        <p className="mt-4 max-w-2xl text-lg text-lime-dim">{site.shortDescription}</p>
      )}

      {site.cover && (
        <img
          src={site.cover.src}
          srcSet={buildSrcSet(site.cover.sources)}
          sizes="(min-width: 1100px) 1100px, 92vw"
          alt={site.cover.alt ?? ''}
          className="mt-8 w-full rounded-md border border-[var(--hairline)] bg-stone object-cover"
          style={{ aspectRatio: '16 / 9' }}
        />
      )}

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-12">
          {site.description && (
            <section>
              <div className="prose-body max-w-prose">
                {site.description.split('\n\n').map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </section>
          )}

          {site.gallery.length > 0 && (
            <section>
              <h2 className="eyebrow mb-5">{t('media.gallery')}</h2>
              <HeritageSiteGallery
                items={site.gallery}
                closeLabel={t('common.close')}
                previousLabel={t('common.previous')}
                nextLabel={t('common.next')}
              />
            </section>
          )}
        </div>

        {site.latitude !== null && site.longitude !== null && (
          <aside>
            <h2 className="eyebrow mb-2">{t('destination.locationTitle')}</h2>
            <p className="readout">
              {site.latitude.toFixed(5)}, {site.longitude.toFixed(5)}
            </p>
          </aside>
        )}
      </div>
    </article>
  );
}
