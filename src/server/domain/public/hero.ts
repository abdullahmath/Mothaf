import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../../db';
import {
  destinations,
  mediaAssets,
  mediaTranslations,
  scenes,
  tours,
} from '../../db/schema';
import { toMediaDTO } from '../../media/urls';
import type { MediaDTO } from '@/lib/tour/types';
import type { AppLocale } from '@/lib/i18n/config';
import { mergeTranslations } from '../i18n/resolve';

/**
 * Picks the panorama for the home page hero.
 *
 * The first published panoramic start scene, ordered the way an editor
 * arranged the destinations. Choosing it by ordering rather than by a
 * `featured` flag keeps one fewer piece of state for someone to forget to
 * update — the destination an editor put first is the one they want first.
 */
export async function getHeroScene(locale: AppLocale): Promise<{
  media: MediaDTO;
  destinationSlug: string;
  tourSlug: string;
} | null> {
  const db = await getDb();

  const [row] = await db
    .select({
      asset: mediaAssets,
      destinationSlug: destinations.slug,
      tourSlug: tours.slug,
      defaultLocale: destinations.defaultLocale,
    })
    .from(scenes)
    .innerJoin(tours, eq(tours.id, scenes.tourId))
    .innerJoin(destinations, eq(destinations.id, tours.destinationId))
    .innerJoin(mediaAssets, eq(mediaAssets.id, scenes.backgroundMediaId))
    .where(
      and(
        eq(scenes.status, 'published'),
        eq(scenes.kind, 'panorama'),
        eq(scenes.isStart, true),
        eq(tours.status, 'published'),
        eq(destinations.status, 'published'),
        eq(mediaAssets.kind, 'panorama'),
      ),
    )
    .orderBy(asc(destinations.position), asc(tours.position))
    .limit(1);

  if (!row) return null;

  const translations = await db
    .select()
    .from(mediaTranslations)
    .where(eq(mediaTranslations.mediaId, row.asset.id));

  return {
    media: toMediaDTO(row.asset, mergeTranslations(translations, locale, row.defaultLocale)),
    destinationSlug: row.destinationSlug,
    tourSlug: row.tourSlug,
  };
}
