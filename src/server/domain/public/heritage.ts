import 'server-only';

import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db';
import {
  destinations,
  destinationTranslations,
  heritageSiteMedia,
  heritageSiteTranslations,
  heritageSites,
  mediaAssets,
  mediaTranslations,
  type MediaAsset,
} from '../../db/schema';
import { toMediaDTO } from '../../media/urls';
import type { MediaDTO } from '@/lib/tour/types';
import type { HeritageSiteCardDTO, HeritageSiteDetailDTO } from '@/lib/content/types';
import type { AppLocale } from '@/lib/i18n/config';
import { groupByParent, mergeTranslations } from '../i18n/resolve';
import { notFound } from '../errors';
import { CACHE_TAGS, cachedRead } from './cache';

/**
 * Visitor-side reads for heritage sites.
 *
 * Same shape as every other public read in this directory: every query
 * filters `status = 'published'` inside the query itself, so no caller can
 * accidentally expose a draft.
 */

async function loadMediaMap(
  ids: (string | null)[],
  locale: AppLocale,
  defaultLocale: string,
): Promise<Map<string, MediaDTO>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();

  const db = await getDb();
  const [assets, translations] = await Promise.all([
    db.select().from(mediaAssets).where(inArray(mediaAssets.id, unique)),
    db.select().from(mediaTranslations).where(inArray(mediaTranslations.mediaId, unique)),
  ]);
  const byParent = groupByParent(translations, 'mediaId');
  return new Map(
    (assets as MediaAsset[]).map((asset) => [
      asset.id,
      toMediaDTO(asset, mergeTranslations(byParent.get(asset.id) ?? [], locale, defaultLocale)),
    ]),
  );
}

/** Published heritage sites for one destination, in display order. */
export async function listHeritageSitesForDestinationUncached(
  destinationId: string,
  locale: AppLocale,
  defaultLocale: string,
): Promise<HeritageSiteCardDTO[]> {
  const db = await getDb();

  const rows = await db
    .select()
    .from(heritageSites)
    .where(and(eq(heritageSites.destinationId, destinationId), eq(heritageSites.status, 'published')))
    .orderBy(asc(heritageSites.position), asc(heritageSites.slug));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [translations, media] = await Promise.all([
    db.select().from(heritageSiteTranslations).where(inArray(heritageSiteTranslations.heritageSiteId, ids)),
    loadMediaMap(
      rows.map((r) => r.coverMediaId),
      locale,
      defaultLocale,
    ),
  ]);
  const trBy = groupByParent(translations, 'heritageSiteId');

  return rows.map((site) => {
    const tr = mergeTranslations(trBy.get(site.id) ?? [], locale, defaultLocale);
    return {
      id: site.id,
      slug: site.slug,
      title: tr.title ?? site.slug,
      shortDescription: tr.shortDescription ?? null,
      cover: site.coverMediaId ? (media.get(site.coverMediaId) ?? null) : null,
    };
  });
}

async function getHeritageSiteDetailUncached(
  destinationSlug: string,
  siteSlug: string,
  locale: AppLocale,
): Promise<HeritageSiteDetailDTO> {
  const db = await getDb();

  const [found] = await db
    .select({ site: heritageSites, destination: destinations })
    .from(heritageSites)
    .innerJoin(destinations, eq(destinations.id, heritageSites.destinationId))
    .where(
      and(
        eq(destinations.slug, destinationSlug),
        eq(heritageSites.slug, siteSlug),
        eq(heritageSites.status, 'published'),
        eq(destinations.status, 'published'),
      ),
    )
    .limit(1);

  if (!found) throw notFound('Heritage site not found');
  const { site, destination } = found;
  const defaultLocale = destination.defaultLocale;

  const [siteTr, galleryRows, destTr] = await Promise.all([
    db.select().from(heritageSiteTranslations).where(eq(heritageSiteTranslations.heritageSiteId, site.id)),
    db
      .select()
      .from(heritageSiteMedia)
      .where(eq(heritageSiteMedia.heritageSiteId, site.id))
      .orderBy(asc(heritageSiteMedia.position)),
    db.select().from(destinationTranslations).where(eq(destinationTranslations.destinationId, destination.id)),
  ]);

  const media = await loadMediaMap(
    [site.coverMediaId, ...galleryRows.map((g) => g.mediaId)],
    locale,
    defaultLocale,
  );

  const tr = mergeTranslations(siteTr, locale, defaultLocale);
  const dtr = mergeTranslations(destTr, locale, defaultLocale);

  return {
    id: site.id,
    slug: site.slug,
    destinationSlug: destination.slug,
    destinationName: dtr.name ?? destination.slug,
    title: tr.title ?? site.slug,
    shortDescription: tr.shortDescription ?? null,
    description: tr.description ?? null,
    cover: site.coverMediaId ? (media.get(site.coverMediaId) ?? null) : null,
    gallery: galleryRows
      .map((g) => media.get(g.mediaId))
      .filter((m): m is MediaDTO => m !== undefined),
    latitude: site.latitude,
    longitude: site.longitude,
  };
}

/** Slugs for the sitemap. Published only, same rule as every other path. */
export async function listPublishedHeritageSitePaths(): Promise<
  { destination: string; site: string }[]
> {
  const db = await getDb();
  const rows = await db
    .select({ destination: destinations.slug, site: heritageSites.slug })
    .from(heritageSites)
    .innerJoin(destinations, eq(destinations.id, heritageSites.destinationId))
    .where(and(eq(heritageSites.status, 'published'), eq(destinations.status, 'published')));
  return rows;
}

/* -------------------------------------------------------------------------- */
/*  Cached entry points                                                       */
/* -------------------------------------------------------------------------- */

export const listHeritageSitesForDestination = cachedRead(
  listHeritageSitesForDestinationUncached,
  ['listHeritageSitesForDestination'],
  [CACHE_TAGS.destinations],
);

export const getHeritageSiteDetail = cachedRead(
  getHeritageSiteDetailUncached,
  ['getHeritageSiteDetail'],
  [CACHE_TAGS.destinations],
);
