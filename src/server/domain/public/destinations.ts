import 'server-only';

import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import {
  destinations,
  destinationTranslations,
  mediaAssets,
  mediaTranslations,
  poiCategories,
  poiCategoryTranslations,
  poiTranslations,
  pointsOfInterest,
  scenes,
  tours,
  tourTranslations,
  type MediaAsset,
} from '../../db/schema';
import { toMediaDTO } from '../../media/urls';
import type { MediaDTO } from '@/lib/tour/types';
import type {
  DestinationCardDTO,
  DestinationPageDTO,
  PoiCardDTO,
  TourCardDTO,
} from '@/lib/content/types';
import type { AppLocale } from '@/lib/i18n/config';
import { groupByParent, mergeTranslations } from '../i18n/resolve';
import { notFound } from '../errors';
import { CACHE_TAGS, cachedRead } from './cache';
import { listEventsForDestination } from './events';

/**
 * Visitor-side reads for destinations.
 *
 * Every query here filters `status = 'published'` inside the query builder.
 * There is no parameter that relaxes it, so no caller — present or future —
 * can accidentally expose a draft. Admin reads live in a separate module with
 * their own queries and their own authorization.
 */

/** Loads media rows plus locale-resolved translations, keyed by id. */
async function loadMedia(
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
  const map = new Map<string, MediaDTO>();
  for (const asset of assets as MediaAsset[]) {
    map.set(
      asset.id,
      toMediaDTO(asset, mergeTranslations(byParent.get(asset.id) ?? [], locale, defaultLocale)),
    );
  }
  return map;
}

async function listDestinationsUncached(locale: AppLocale): Promise<DestinationCardDTO[]> {
  const db = await getDb();

  const rows = await db
    .select()
    .from(destinations)
    .where(eq(destinations.status, 'published'))
    .orderBy(asc(destinations.position), asc(destinations.slug));

  if (rows.length === 0) return [];

  const ids = rows.map((d) => d.id);

  const [translations, media, tourCounts, poiCounts] = await Promise.all([
    db
      .select()
      .from(destinationTranslations)
      .where(inArray(destinationTranslations.destinationId, ids)),
    loadMedia(
      rows.map((d) => d.coverMediaId),
      locale,
      // Cards may span destinations with different defaults, so each row's own
      // default is applied below; this pass only needs the media text.
      rows[0]?.defaultLocale ?? locale,
    ),
    db
      .select({ destinationId: tours.destinationId, value: count() })
      .from(tours)
      .where(and(inArray(tours.destinationId, ids), eq(tours.status, 'published')))
      .groupBy(tours.destinationId),
    db
      .select({ destinationId: pointsOfInterest.destinationId, value: count() })
      .from(pointsOfInterest)
      .where(
        and(inArray(pointsOfInterest.destinationId, ids), eq(pointsOfInterest.status, 'published')),
      )
      .groupBy(pointsOfInterest.destinationId),
  ]);

  const trByParent = groupByParent(translations, 'destinationId');
  const tourCountBy = new Map(tourCounts.map((r) => [r.destinationId, Number(r.value)]));
  const poiCountBy = new Map(poiCounts.map((r) => [r.destinationId, Number(r.value)]));

  return rows.map((destination) => {
    const tr = mergeTranslations(
      trByParent.get(destination.id) ?? [],
      locale,
      destination.defaultLocale,
    );
    return {
      id: destination.id,
      slug: destination.slug,
      name: tr.name ?? destination.slug,
      tagline: tr.tagline ?? null,
      summary: tr.summary ?? null,
      cover: destination.coverMediaId ? (media.get(destination.coverMediaId) ?? null) : null,
      tourCount: tourCountBy.get(destination.id) ?? 0,
      poiCount: poiCountBy.get(destination.id) ?? 0,
      countryCode: destination.countryCode,
      latitude: destination.latitude,
      longitude: destination.longitude,
    };
  });
}

async function getDestinationPageUncached(
  slug: string,
  locale: AppLocale,
): Promise<DestinationPageDTO> {
  const db = await getDb();

  const [destination] = await db
    .select()
    .from(destinations)
    .where(and(eq(destinations.slug, slug), eq(destinations.status, 'published')))
    .limit(1);

  if (!destination) throw notFound('Destination not found');
  const defaultLocale = destination.defaultLocale;

  const [destTr, tourRows, poiRows, events] = await Promise.all([
    db
      .select()
      .from(destinationTranslations)
      .where(eq(destinationTranslations.destinationId, destination.id)),
    db
      .select()
      .from(tours)
      .where(and(eq(tours.destinationId, destination.id), eq(tours.status, 'published')))
      .orderBy(asc(tours.position), asc(tours.slug)),
    db
      .select()
      .from(pointsOfInterest)
      .where(
        and(
          eq(pointsOfInterest.destinationId, destination.id),
          eq(pointsOfInterest.status, 'published'),
        ),
      )
      .orderBy(asc(pointsOfInterest.position)),
    listEventsForDestination(destination.id, locale, defaultLocale),
  ]);

  const tourIds = tourRows.map((t) => t.id);
  const poiIds = poiRows.map((p) => p.id);
  const categoryIds = [
    ...new Set(poiRows.map((p) => p.categoryId).filter((id): id is string => id !== null)),
  ];

  const [tourTr, sceneCounts, poiTr, categoryRows, categoryTr, media] = await Promise.all([
    tourIds.length
      ? db.select().from(tourTranslations).where(inArray(tourTranslations.tourId, tourIds))
      : [],
    tourIds.length
      ? db
          .select({ tourId: scenes.tourId, value: count() })
          .from(scenes)
          .where(and(inArray(scenes.tourId, tourIds), eq(scenes.status, 'published')))
          .groupBy(scenes.tourId)
      : [],
    poiIds.length
      ? db.select().from(poiTranslations).where(inArray(poiTranslations.poiId, poiIds))
      : [],
    categoryIds.length
      ? db.select().from(poiCategories).where(inArray(poiCategories.id, categoryIds))
      : [],
    categoryIds.length
      ? db
          .select()
          .from(poiCategoryTranslations)
          .where(inArray(poiCategoryTranslations.categoryId, categoryIds))
      : [],
    loadMedia(
      [
        destination.coverMediaId,
        ...tourRows.map((t) => t.coverMediaId),
        ...poiRows.map((p) => p.coverMediaId),
      ],
      locale,
      defaultLocale,
    ),
  ]);

  const tourTrBy = groupByParent(tourTr, 'tourId');
  const sceneCountBy = new Map(sceneCounts.map((r) => [r.tourId, Number(r.value)]));
  const poiTrBy = groupByParent(poiTr, 'poiId');
  const categoryTrBy = groupByParent(categoryTr, 'categoryId');

  const categoryById = new Map(
    categoryRows.map((category) => {
      const tr = mergeTranslations(categoryTrBy.get(category.id) ?? [], locale, defaultLocale);
      return [
        category.id,
        {
          slug: category.slug,
          name: tr.name ?? category.slug,
          color: category.color,
          icon: category.icon,
        },
      ] as const;
    }),
  );

  const dtr = mergeTranslations(destTr, locale, defaultLocale);

  const tourCards: TourCardDTO[] = tourRows.map((tour) => {
    const tr = mergeTranslations(tourTrBy.get(tour.id) ?? [], locale, defaultLocale);
    return {
      id: tour.id,
      slug: tour.slug,
      title: tr.title ?? tour.slug,
      summary: tr.summary ?? null,
      kind: tour.kind,
      cover: tour.coverMediaId ? (media.get(tour.coverMediaId) ?? null) : null,
      sceneCount: sceneCountBy.get(tour.id) ?? 0,
      estimatedMinutes: tour.estimatedMinutes,
    };
  });

  const poiCards: PoiCardDTO[] = poiRows.map((poi) => {
    const tr = mergeTranslations(poiTrBy.get(poi.id) ?? [], locale, defaultLocale);
    return {
      id: poi.id,
      slug: poi.slug,
      title: tr.title ?? poi.slug,
      shortDescription: tr.shortDescription ?? null,
      cover: poi.coverMediaId ? (media.get(poi.coverMediaId) ?? null) : null,
      category: poi.categoryId ? (categoryById.get(poi.categoryId) ?? null) : null,
    };
  });

  return {
    id: destination.id,
    slug: destination.slug,
    name: dtr.name ?? destination.slug,
    tagline: dtr.tagline ?? null,
    summary: dtr.summary ?? null,
    description: dtr.description ?? null,
    historicalContext: dtr.historicalContext ?? null,
    cover: destination.coverMediaId ? (media.get(destination.coverMediaId) ?? null) : null,
    latitude: destination.latitude,
    longitude: destination.longitude,
    countryCode: destination.countryCode,
    sketchfabModelId: destination.sketchfabModelId,
    tours: tourCards,
    pois: poiCards,
    events,
  };
}

/**
 * Slugs for static generation and the sitemap. Published only — an unpublished
 * destination must not appear even as a URL.
 */
export async function listDestinationSlugs(): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ slug: destinations.slug })
    .from(destinations)
    .where(eq(destinations.status, 'published'));
  return rows.map((r) => r.slug);
}

export async function listPublishedTourPaths(): Promise<
  { destination: string; tour: string }[]
> {
  const db = await getDb();
  const rows = await db
    .select({ destination: destinations.slug, tour: tours.slug })
    .from(tours)
    .innerJoin(destinations, eq(destinations.id, tours.destinationId))
    .where(and(eq(tours.status, 'published'), eq(destinations.status, 'published')));
  return rows;
}

/** Total published destinations, for the home page's counter. */
export async function countPublishedDestinations(): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ value: count() })
    .from(destinations)
    .where(eq(destinations.status, 'published'));
  return Number(row?.value ?? 0);
}

export { sql };

/* -------------------------------------------------------------------------- */
/*  Cached entry points                                                       */
/* -------------------------------------------------------------------------- */

export const listDestinations = cachedRead(listDestinationsUncached, ['listDestinations'], [
  CACHE_TAGS.destinations,
]);

export const getDestinationPage = cachedRead(
  getDestinationPageUncached,
  ['getDestinationPage'],
  [CACHE_TAGS.destinations, CACHE_TAGS.tours, CACHE_TAGS.events],
);
