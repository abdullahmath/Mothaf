import 'server-only';

import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db';
import {
  hotspots,
  hotspotTranslations,
  mediaAssets,
  sceneLinks,
  scenePois,
  scenes,
  sceneTranslations,
  tours,
} from '../../db/schema';
import { requirePermission } from '../guard';
import { notFound, validation } from '../errors';
import {
  applyOrder,
  assertSlugAvailable,
  recordAudit,
  replaceTranslations,
  slugSchema,
  statusSchema,
  type TranslationInput,
} from './shared';

export const SCENE_TRANSLATION_FIELDS = ['title', 'summary', 'description'] as const;

export const sceneInputSchema = z.object({
  tourId: z.string().uuid(),
  slug: slugSchema,
  kind: z.enum(['panorama', 'image', 'map', 'story']),
  status: statusSchema,
  isStart: z.coerce.boolean().optional(),
  backgroundMediaId: z.string().uuid().nullable().optional(),
  thumbnailMediaId: z.string().uuid().nullable().optional(),
  audioMediaId: z.string().uuid().nullable().optional(),
  yaw: z.coerce.number().min(-360).max(360).optional(),
  pitch: z.coerce.number().min(-90).max(90).optional(),
  fov: z.coerce.number().min(20).max(120).optional(),
  northOffsetDeg: z.coerce.number().min(-360).max(360).optional(),
});

export type SceneInput = z.infer<typeof sceneInputSchema>;

export async function getSceneForAdmin(id: string) {
  await requirePermission('content:read');
  const db = await getDb();

  const [found] = await db
    .select({ scene: scenes, tour: tours })
    .from(scenes)
    .innerJoin(tours, eq(tours.id, scenes.tourId))
    .where(eq(scenes.id, id))
    .limit(1);
  if (!found) throw notFound('Scene not found');

  const [translations, hotspotRows, links, siblings, background] = await Promise.all([
    db.select().from(sceneTranslations).where(eq(sceneTranslations.sceneId, id)),
    db
      .select()
      .from(hotspots)
      .where(eq(hotspots.sceneId, id))
      .orderBy(asc(hotspots.position)),
    db.select().from(sceneLinks).where(eq(sceneLinks.fromSceneId, id)),
    db
      .select()
      .from(scenes)
      .where(and(eq(scenes.tourId, found.scene.tourId), ne(scenes.id, id)))
      .orderBy(asc(scenes.position)),
    found.scene.backgroundMediaId
      ? db
          .select()
          .from(mediaAssets)
          .where(eq(mediaAssets.id, found.scene.backgroundMediaId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const hotspotIds = hotspotRows.map((h) => h.id);
  const hotspotTr = hotspotIds.length
    ? await db
        .select()
        .from(hotspotTranslations)
        .where(inArray(hotspotTranslations.hotspotId, hotspotIds))
    : [];

  const siblingIds = siblings.map((s) => s.id);
  const siblingTranslations = siblingIds.length
    ? await db.select().from(sceneTranslations).where(inArray(sceneTranslations.sceneId, siblingIds))
    : [];

  return {
    ...found.scene,
    tour: found.tour,
    translations,
    background: background[0] ?? null,
    hotspots: hotspotRows.map((hotspot) => ({
      ...hotspot,
      translations: hotspotTr.filter((t) => t.hotspotId === hotspot.id),
    })),
    linkedSceneIds: links.map((l) => l.toSceneId),
    siblings: siblings.map((s) => ({
      ...s,
      translations: siblingTranslations.filter((t) => t.sceneId === s.id),
    })),
  };
}

function viewFrom(input: SceneInput) {
  return {
    yaw: input.yaw ?? 0,
    pitch: input.pitch ?? 0,
    fov: input.fov ?? 78,
  };
}

/**
 * Makes one scene the tour's entry point.
 *
 * The database enforces at most one start per tour with a partial unique
 * index, so clearing the previous flag and setting the new one must happen in
 * a single transaction — doing it in two statements would momentarily violate
 * the index and fail.
 */
async function assignStartScene(tourId: string, sceneId: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(scenes)
      .set({ isStart: false })
      .where(and(eq(scenes.tourId, tourId), eq(scenes.isStart, true)));
    await tx.update(scenes).set({ isStart: true }).where(eq(scenes.id, sceneId));
  });
}

export async function createScene(
  input: SceneInput,
  translations: TranslationInput[],
): Promise<string> {
  const auth = await requirePermission('content:write');
  const db = await getDb();

  await assertSlugAvailable({
    table: scenes,
    slugColumn: scenes.slug,
    idColumn: scenes.id,
    slug: input.slug,
    scope: eq(scenes.tourId, input.tourId),
  });

  if (input.kind === 'panorama' && !input.backgroundMediaId) {
    throw validation('A panoramic scene needs a 360° image.', {
      backgroundMediaId: 'Choose a panorama from the media library',
    });
  }

  const [{ value: existingCount } = { value: 0 }] = await db
    .select({ value: scenes.id })
    .from(scenes)
    .where(eq(scenes.tourId, input.tourId))
    .limit(1)
    .then((rows) => [{ value: rows.length }]);

  const [row] = await db
    .insert(scenes)
    .values({
      tourId: input.tourId,
      slug: input.slug,
      kind: input.kind,
      status: input.status,
      // The first scene in a tour becomes the entry point automatically —
      // otherwise a new tour has no start and cannot be published.
      isStart: false,
      backgroundMediaId: input.backgroundMediaId ?? null,
      thumbnailMediaId: input.thumbnailMediaId ?? null,
      audioMediaId: input.audioMediaId ?? null,
      view: viewFrom(input),
      northOffsetDeg: input.northOffsetDeg ?? 0,
    })
    .returning({ id: scenes.id });

  const id = row!.id;

  if (input.isStart || existingCount === 0) {
    await assignStartScene(input.tourId, id);
  }

  await replaceTranslations({
    table: sceneTranslations,
    parentColumn: sceneTranslations.sceneId,
    parentId: id,
    rows: translations,
  });

  await recordAudit({
    actorId: auth.user.id,
    action: 'scene.create',
    entityType: 'scene',
    entityId: id,
    metadata: { slug: input.slug, tourId: input.tourId },
  });

  return id;
}

export async function updateScene(
  id: string,
  input: SceneInput,
  translations: TranslationInput[],
): Promise<void> {
  const auth = await requirePermission('content:write');
  const db = await getDb();

  const [existing] = await db.select().from(scenes).where(eq(scenes.id, id)).limit(1);
  if (!existing) throw notFound('Scene not found');

  await assertSlugAvailable({
    table: scenes,
    slugColumn: scenes.slug,
    idColumn: scenes.id,
    slug: input.slug,
    scope: eq(scenes.tourId, input.tourId),
    excludeId: id,
  });

  await db
    .update(scenes)
    .set({
      slug: input.slug,
      kind: input.kind,
      status: input.status,
      backgroundMediaId: input.backgroundMediaId ?? null,
      thumbnailMediaId: input.thumbnailMediaId ?? null,
      audioMediaId: input.audioMediaId ?? null,
      view: viewFrom(input),
      northOffsetDeg: input.northOffsetDeg ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(scenes.id, id));

  if (input.isStart && !existing.isStart) {
    await assignStartScene(existing.tourId, id);
  }

  await replaceTranslations({
    table: sceneTranslations,
    parentColumn: sceneTranslations.sceneId,
    parentId: id,
    rows: translations,
  });

  await recordAudit({
    actorId: auth.user.id,
    action: 'scene.update',
    entityType: 'scene',
    entityId: id,
    metadata: { slug: input.slug },
  });
}

export async function deleteScene(id: string): Promise<void> {
  const auth = await requirePermission('content:write');
  const db = await getDb();
  await db.delete(scenes).where(eq(scenes.id, id));
  await recordAudit({
    actorId: auth.user.id,
    action: 'scene.delete',
    entityType: 'scene',
    entityId: id,
  });
}

export async function reorderScenes(tourId: string, orderedIds: string[]): Promise<void> {
  await requirePermission('content:write');
  const db = await getDb();

  // Only reorder scenes that actually belong to this tour, so a crafted list
  // cannot renumber another tour's scenes.
  const owned = await db
    .select({ id: scenes.id })
    .from(scenes)
    .where(eq(scenes.tourId, tourId));
  const ownedIds = new Set(owned.map((s) => s.id));

  await applyOrder({
    table: scenes,
    idColumn: scenes.id,
    positionColumn: scenes.position,
    orderedIds: orderedIds.filter((id) => ownedIds.has(id)),
  });
}

/**
 * Replaces the outgoing navigation edges for a scene.
 *
 * Targets are intersected with the scenes of the same tour: a link across
 * tours would be meaningless to the viewer, which loads one tour's manifest.
 */
export async function setSceneLinks(sceneId: string, targetIds: string[]): Promise<void> {
  await requirePermission('content:write');
  const db = await getDb();

  const [scene] = await db
    .select({ tourId: scenes.tourId })
    .from(scenes)
    .where(eq(scenes.id, sceneId))
    .limit(1);
  if (!scene) throw notFound('Scene not found');

  const siblings = await db
    .select({ id: scenes.id })
    .from(scenes)
    .where(eq(scenes.tourId, scene.tourId));
  const allowed = new Set(siblings.map((s) => s.id));

  const valid = [...new Set(targetIds)].filter((id) => allowed.has(id) && id !== sceneId);

  await db.transaction(async (tx) => {
    await tx.delete(sceneLinks).where(eq(sceneLinks.fromSceneId, sceneId));
    if (valid.length > 0) {
      await tx
        .insert(sceneLinks)
        .values(valid.map((toSceneId, index) => ({ fromSceneId: sceneId, toSceneId, position: index })));
    }
  });
}

/** Attaches points of interest to a scene, scoped to the same destination. */
export async function setScenePois(sceneId: string, poiIds: string[]): Promise<void> {
  await requirePermission('content:write');
  const db = await getDb();

  await db.transaction(async (tx) => {
    await tx.delete(scenePois).where(eq(scenePois.sceneId, sceneId));
    if (poiIds.length > 0) {
      await tx
        .insert(scenePois)
        .values([...new Set(poiIds)].map((poiId, index) => ({ sceneId, poiId, position: index })));
    }
  });
}
