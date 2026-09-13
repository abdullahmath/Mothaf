import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isAppLocale, type AppLocale } from '@/lib/i18n';
import { buildTourManifest } from '@/server/domain/tours/manifest';
import { isDomainError } from '@/server/domain/errors';
import { TourViewer } from '@/components/tour/TourViewer';
import { localeAlternates } from '@/lib/seo/alternates';

type Params = Promise<{ locale: string; destination: string; tour: string }>;

// Rendered on request, with the underlying queries served from the data
// cache (see server/domain/public/cache.ts). Prerendering these at build
// time would make `next build` require the production database.
export const dynamic = 'force-dynamic';

async function load(params: Params) {
  const { locale, destination, tour } = await params;
  if (!isAppLocale(locale)) notFound();
  try {
    const manifest = await buildTourManifest({
      destinationSlug: destination,
      tourSlug: tour,
      locale: locale as AppLocale,
    });
    return manifest;
  } catch (error) {
    if (isDomainError(error) && error.code === 'not_found') notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const manifest = await load(params);
  return {
    title: `${manifest.tour.title} — ${manifest.destination.name}`,
    description: manifest.tour.summary ?? undefined,
    alternates: isAppLocale(locale)
      ? localeAlternates(locale, `/tour/${manifest.destination.slug}/${manifest.tour.slug}`)
      : undefined,
    openGraph: {
      title: manifest.tour.title,
      description: manifest.tour.summary ?? undefined,
    },
  };
}

export default async function TourPage({ params }: { params: Params }) {
  const manifest = await load(params);
  return <TourViewer manifest={manifest} />;
}
