import type { MetadataRoute } from 'next';
import { LOCALES } from '@/lib/i18n/config';
import { listDestinationSlugs, listPublishedTourPaths } from '@/server/domain/public/destinations';
import { env } from '@/server/config/env';

// Queries the database, so this must stay dynamic — statically generating it
// at build time would (like every other content route in this app) make
// `next build` require a reachable production database.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = env().APP_ORIGIN;
  const [destinationSlugs, tourPaths] = await Promise.all([
    listDestinationSlugs(),
    listPublishedTourPaths(),
  ]);

  const entries: MetadataRoute.Sitemap = [];
  for (const locale of LOCALES) {
    entries.push({ url: `${origin}/${locale}`, changeFrequency: 'weekly', priority: 1 });
    entries.push({ url: `${origin}/${locale}/destinations`, changeFrequency: 'weekly' });
    entries.push({ url: `${origin}/${locale}/events`, changeFrequency: 'daily' });
    for (const slug of destinationSlugs) {
      entries.push({ url: `${origin}/${locale}/destinations/${slug}`, changeFrequency: 'monthly' });
    }
    for (const { destination, tour } of tourPaths) {
      entries.push({
        url: `${origin}/${locale}/tour/${destination}/${tour}`,
        changeFrequency: 'monthly',
      });
    }
  }
  return entries;
}
