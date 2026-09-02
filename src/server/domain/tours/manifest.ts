import 'server-only';

import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db';
import {
  destinations,
  destinationTranslations,
  eventTranslations,
  events,
  hotspots,
  hotspotTranslations,
  mediaAssets,
  mediaTranslations,
  poiCategories,
  poiCategoryTranslations,
  poiMedia,
  poiTranslations,
  pointsOfInterest,
  sceneLinks,
  scenePois,
  scenes,
  sceneTranslations,
  tours,
  tourTranslations,
  type MediaAsset,
} from '../../db/schema';
import { toMediaDTO } from '../../media/urls';
import { collectReferences, parseActionPayload } from '@/lib/tour/actions';
import {
  DEFAULT_TOUR_SETTINGS,
  type EventSummaryDTO,
  type HotspotDTO,
  type MediaDTO,
  type PoiDTO,
  type SceneDTO,
  type TourManifest,
  type TourSettings,
} from '@/lib/tour/types';
import { directionOf, type AppLocale } from '@/lib/i18n/config';
import { mergeTranslations, groupByParent } from '../i18n/resolve';
import { notFound } from '../errors';

/**
 * Builds everything a visitor needs to run one tour.
 *
 * Two properties matter here and are worth the length of the function:
 *
 * 1. **Nothing unpublished escapes.** Every query filters on `published`, and
 *    the filter is written into the query rather than passed in by a caller.
 *
 * 2. **No reference dangles.** Hotspot payloads are re-validated against the
 *    action registry and then checked against the set of entities actually
 *    loaded. A hotspot pointing at a deleted POI, an unpublished scene, or a
 *    scene in a different tour is dropped from the manifest instead of
 *    reaching the browser and failing there. This is also what enforces scope:
 *    the candidate set only ever contains this tour's own content.
 *
 * Fetching is done in batched `IN` queries — roughly a dozen round trips for a
 * whole tour, regardless of how many scenes it has.
 */

export type ManifestRequest = {
  destinationSlug: string;
  tourSlug: string;
  locale: AppLocale;
};

function parseSettings(raw: Record<string, unknown>): TourSettings {
  const asBool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const asNum = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    autoRotate: asBool(raw.autoRotate, DEFAULT_TOUR_SETTINGS.autoRotate),
    autoRotateSpeed: asNum(raw.autoRotateSpeed, DEFAULT_TOUR_SETTINGS.autoRotateSpeed),
    showCompass: asBool(raw.showCompass, DEFAULT_TOUR_SETTINGS.showCompass),
    showSceneList: asBool(raw.showSceneList, DEFAULT_TOUR_SETTINGS.showSceneList),
    showHotspotLabels: asBool(raw.showHotspotLabels, DEFAULT_TOUR_SETTINGS.showHotspotLabels),
  };
}

export async function buildTourManifest(request: ManifestRequest): Promise<TourManifest> {
  const db = await getDb();
  const { locale } = request;

  /* ---- tour and destination -------------------------------------------- */

  const [found] = await db
    .select({ tour: tours, destination: destinations })
    .from(tours)
    .innerJoin(destinations, eq(destinations.id, tours.destinationId))
    .where(
      and(
        eq(destinations.slug, request.destinationSlug),
        eq(tours.slug, request.tourSlug),
        eq(tours.status, 'published'),
        eq(destinations.status, 'published'),
      ),
    )
    .limit(1);

  if (!found) throw notFound('Tour not found');
  const { tour, destination } = found;
  const defaultLocale = destination.defaultLocale;

  /* ---- scenes ----------------------------------------------------------- */

  const sceneRows = await db
    .select()
    .from(scenes)
    .where(and(eq(scenes.tourId, tour.id), eq(scenes.status, 'published')))
    .orderBy(asc(scenes.position), asc(scenes.slug));

  if (sceneRows.length === 0) throw notFound('Tour has no published scenes');

  const sceneIds = sceneRows.map((s) => s.id);
  const publishedSceneIds = new Set(sceneIds);

  const [
    tourTr,
    destTr,
    sceneTr,
    hotspotRows,
    linkRows,
    scenePoiRows,
  ] = await Promise.all([
    db.select().from(tourTranslations).where(eq(tourTranslations.tourId, tour.id)),
    db
      .select()
      .from(destinationTranslations)
      .where(eq(destinationTranslations.destinationId, destination.id)),
    db.select().from(sceneTranslations).where(inArray(sceneTranslations.sceneId, sceneIds)),
    db
      .select()
      .from(hotspots)
      .where(and(inArray(hotspots.sceneId, sceneIds), eq(hotspots.status, 'published')))
      .orderBy(asc(hotspots.position)),
    db
      .select()
      .from(sceneLinks)
      .where(inArray(sceneLinks.fromSceneId, sceneIds))
      .orderBy(asc(sceneLinks.position)),
    db.select().from(scenePois).where(inArray(scenePois.sceneId, sceneIds)),
  ]);

  const hotspotIds = hotspotRows.map((h) => h.id);
  const hotspotTr = hotspotIds.length
    ? await db
        .select()
        .from(hotspotTranslations)
        .where(inArray(hotspotTranslations.hotspotId, hotspotIds))
    : [];

  /* ---- candidate references from hotspot payloads ---------------------- */

  const referenced = { scene: new Set<string>(), poi: new Set<string>(), media: new Set<string>(), event: new Set<string>() };
  const parsedPayloads = new Map<string, Record<string, unknown>>();

  for (const hotspot of hotspotRows) {
    const parsed = parseActionPayload(hotspot.actionType, hotspot.actionPayload);
    if (!parsed.ok) continue;
    parsedPayloads.set(hotspot.id, parsed.payload);
    for (const { entity, ids } of collectReferences(parsed.type, parsed.payload)) {
      for (const id of ids) referenced[entity].add(id);
    }
  }

  /* ---- points of interest ---------------------------------------------- */

  const poiIdSet = new Set<string>([
    ...scenePoiRows.map((r) => r.poiId),
    ...referenced.poi,
  ]);

  const poiRows = poiIdSet.size
    ? await db
        .select()
        .from(pointsOfInterest)
        .where(
          and(
            inArray(pointsOfInterest.id, [...poiIdSet]),
            // Scope check: a POI must belong to this destination. Without this
            // a crafted payload could pull content from another destination.
            eq(pointsOfInterest.destinationId, destination.id),
            eq(pointsOfInterest.status, 'published'),
          ),
        )
        .orderBy(asc(pointsOfInterest.position))
    : [];

  const poiIds = poiRows.map((p) => p.id);
  const categoryIds = [...new Set(poiRows.map((p) => p.categoryId).filter((id): id is string => id !== null))];

  const [poiTr, poiMediaRows, categoryRows, categoryTr] = await Promise.all([
    poiIds.length
      ? db.select().from(poiTranslations).where(inArray(poiTranslations.poiId, poiIds))
      : [],
    poiIds.length
      ? db.select().from(poiMedia).where(inArray(poiMedia.poiId, poiIds)).orderBy(asc(poiMedia.position))
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
  ]);

  /* ---- events ----------------------------------------------------------- */

  const eventRows = referenced.event.size
    ? await db
        .select()
        .from(events)
        .where(
          and(
            inArray(events.id, [...referenced.event]),
            eq(events.destinationId, destination.id),
            eq(events.status, 'published'),
          ),
        )
    : [];

  const eventTr = eventRows.length
    ? await db
        .select()
        .from(eventTranslations)
        .where(inArray(eventTranslations.eventId, eventRows.map((e) => e.id)))
    : [];

  /* ---- media ------------------------------------------------------------ */

  const mediaIdSet = new Set<string>([...referenced.media]);
  for (const scene of sceneRows) {
    if (scene.backgroundMediaId) mediaIdSet.add(scene.backgroundMediaId);
    if (scene.thumbnailMediaId) mediaIdSet.add(scene.thumbnailMediaId);
    if (scene.audioMediaId) mediaIdSet.add(scene.audioMediaId);
  }
  for (const poi of poiRows) if (poi.coverMediaId) mediaIdSet.add(poi.coverMediaId);
  for (const row of poiMediaRows) mediaIdSet.add(row.mediaId);
  for (const event of eventRows) if (event.coverMediaId) mediaIdSet.add(event.coverMediaId);

  const mediaRows: MediaAsset[] = mediaIdSet.size
    ? await db.select().from(mediaAssets).where(inArray(mediaAssets.id, [...mediaIdSet]))
    : [];

  const mediaTr = mediaRows.length
    ? await db
        .select()
        .from(mediaTranslations)
        .where(inArray(mediaTranslations.mediaId, mediaRows.map((m) => m.id)))
    : [];

  /* ---- assembly --------------------------------------------------------- */

  const mediaTrByParent = groupByParent(mediaTr, 'mediaId');
  const mediaById = new Map<string, MediaDTO>();
  for (const asset of mediaRows) {
    const translation = mergeTranslations(
      mediaTrByParent.get(asset.id) ?? [],
      locale,
      defaultLocale,
    );
    mediaById.set(asset.id, toMediaDTO(asset, translation));
  }
  const media = (id: string | null): MediaDTO | null => (id ? (mediaById.get(id) ?? null) : null);

  // Categories
  const categoryTrByParent = groupByParent(categoryTr, 'categoryId');
  const categoryById = new Map<string, NonNullable<PoiDTO['category']>>();
  for (const category of categoryRows) {
    const tr = mergeTranslations(categoryTrByParent.get(category.id) ?? [], locale, defaultLocale);
    categoryById.set(category.id, {
      id: category.id,
      slug: category.slug,
      name: tr.name ?? category.slug,
      color: category.color,
      icon: category.icon,
    });
  }

  // POIs
  const poiTrByParent = groupByParent(poiTr, 'poiId');
  const poiMediaByPoi = new Map<string, string[]>();
  for (const row of poiMediaRows) {
    const bucket = poiMediaByPoi.get(row.poiId);
    if (bucket) bucket.push(row.mediaId);
    else poiMediaByPoi.set(row.poiId, [row.mediaId]);
  }

  const pois: PoiDTO[] = poiRows.map((poi) => {
    const tr = mergeTranslations(poiTrByParent.get(poi.id) ?? [], locale, defaultLocale);
    return {
      id: poi.id,
      slug: poi.slug,
      title: tr.title ?? poi.slug,
      shortDescription: tr.shortDescription ?? null,
      description: tr.description ?? null,
      historicalInfo: tr.historicalInfo ?? null,
      category: poi.categoryId ? (categoryById.get(poi.categoryId) ?? null) : null,
      cover: media(poi.coverMediaId),
      media: (poiMediaByPoi.get(poi.id) ?? [])
        .map((id) => mediaById.get(id))
        .filter((m): m is MediaDTO => m !== undefined),
      tags: poi.tags,
      latitude: poi.latitude,
      longitude: poi.longitude,
    };
  });
  const publishedPoiIds = new Set(pois.map((p) => p.id));

  // Events
  const eventTrByParent = groupByParent(eventTr, 'eventId');
  const eventSummaries: EventSummaryDTO[] = eventRows.map((event) => {
    const tr = mergeTranslations(eventTrByParent.get(event.id) ?? [], locale, defaultLocale);
    return {
      id: event.id,
      slug: event.slug,
      title: tr.title ?? event.slug,
      summary: tr.summary ?? null,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      timezone: event.timezone,
      cover: media(event.coverMediaId),
    };
  });
  const publishedEventIds = new Set(eventSummaries.map((e) => e.id));

  /**
   * Final referential check. A payload that survived schema validation can
   * still point at something that is unpublished, deleted, or outside this
   * destination — all of which were filtered out of the sets above.
   */
  const referenceResolves = (
    entity: 'scene' | 'poi' | 'media' | 'event',
    ids: string[],
  ): boolean =>
    ids.every((id) => {
      switch (entity) {
        case 'scene':
          return publishedSceneIds.has(id);
        case 'poi':
          return publishedPoiIds.has(id);
        case 'media':
          return mediaById.has(id);
        case 'event':
          return publishedEventIds.has(id);
      }
    });

  // Hotspots
  const hotspotTrByParent = groupByParent(hotspotTr, 'hotspotId');
  const hotspotsByScene = new Map<string, HotspotDTO[]>();

  for (const hotspot of hotspotRows) {
    const payload = parsedPayloads.get(hotspot.id);
    if (!payload) continue; // failed schema validation

    const references = collectReferences(hotspot.actionType, payload);
    if (!references.every(({ entity, ids }) => referenceResolves(entity, ids))) continue;

    const tr = mergeTranslations(hotspotTrByParent.get(hotspot.id) ?? [], locale, defaultLocale);
    const dto: HotspotDTO = {
      id: hotspot.id,
      actionType: hotspot.actionType,
      payload,
      yawDeg: hotspot.yawDeg,
      pitchDeg: hotspot.pitchDeg,
      x: hotspot.x,
      y: hotspot.y,
      icon: hotspot.icon,
      style: hotspot.style,
      label: tr.label ?? '',
      description: tr.description ?? null,
    };

    const bucket = hotspotsByScene.get(hotspot.sceneId);
    if (bucket) bucket.push(dto);
    else hotspotsByScene.set(hotspot.sceneId, [dto]);
  }

  // Scene links, filtered to published targets only.
  const linksByScene = new Map<string, string[]>();
  for (const link of linkRows) {
    if (!publishedSceneIds.has(link.toSceneId)) continue;
    const bucket = linksByScene.get(link.fromSceneId);
    if (bucket) bucket.push(link.toSceneId);
    else linksByScene.set(link.fromSceneId, [link.toSceneId]);
  }

  const poisByScene = new Map<string, string[]>();
  for (const row of scenePoiRows) {
    if (!publishedPoiIds.has(row.poiId)) continue;
    const bucket = poisByScene.get(row.sceneId);
    if (bucket) bucket.push(row.poiId);
    else poisByScene.set(row.sceneId, [row.poiId]);
  }

  const sceneTrByParent = groupByParent(sceneTr, 'sceneId');
  const sceneDTOs: SceneDTO[] = sceneRows.map((scene) => {
    const tr = mergeTranslations(sceneTrByParent.get(scene.id) ?? [], locale, defaultLocale);
    return {
      id: scene.id,
      slug: scene.slug,
      kind: scene.kind,
      title: tr.title ?? scene.slug,
      summary: tr.summary ?? null,
      description: tr.description ?? null,
      background: media(scene.backgroundMediaId),
      thumbnail: media(scene.thumbnailMediaId),
      audio: media(scene.audioMediaId),
      view: scene.view,
      northOffsetDeg: scene.northOffsetDeg,
      hotspots: hotspotsByScene.get(scene.id) ?? [],
      linkedSceneIds: linksByScene.get(scene.id) ?? [],
      poiIds: poisByScene.get(scene.id) ?? [],
      position: scene.position,
    };
  });

  const startScene = sceneRows.find((s) => s.isStart) ?? sceneRows[0]!;
  const tourTrMerged = mergeTranslations(tourTr, locale, defaultLocale);
  const destTrMerged = mergeTranslations(destTr, locale, defaultLocale);

  return {
    locale,
    direction: directionOf(locale),
    tour: {
      id: tour.id,
      slug: tour.slug,
      kind: tour.kind,
      title: tourTrMerged.title ?? tour.slug,
      summary: tourTrMerged.summary ?? null,
      description: tourTrMerged.description ?? null,
      welcomeMessage: tourTrMerged.welcomeMessage ?? null,
      estimatedMinutes: tour.estimatedMinutes,
      settings: parseSettings(tour.settings),
    },
    destination: {
      id: destination.id,
      slug: destination.slug,
      name: destTrMerged.name ?? destination.slug,
      tagline: destTrMerged.tagline ?? null,
    },
    startSceneId: startScene.id,
    scenes: sceneDTOs,
    pois,
    events: eventSummaries,
  };
}
