import 'server-only';

import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db';
import {
  mediaAssets,
  poiCategories,
  poiCategoryTranslations,
  poiMedia,
  poiTranslations,
  pointsOfInterest,
} from '../../db/schema';
import { requirePermission } from '../guard';
import { notFound, validation } from '../errors';
import {
  assertSlugAvailable,
  recordAudit,
  replaceTranslations,
  slugSchema,
  statusSchema,
  type TranslationInput,
} from './shared';

export const POI_TRANSLATION_FIELDS = [
  'title',
  'shortDescription',
  'description',
  'historicalInfo',
] as const;

export const CATEGORY_TRANSLATION_FIELDS = ['name'] as const;

export const poiInputSchema = z.object({
  destinationId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  slug: slugSchema,
  status: statusSchema,
  coverMediaId: z.string().uuid().nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  /** Comma-separated in the form; normalised to a deduplicated array. */
  tags: z
    .string()
    .max(500)
    .optional()
    .transform((value) =>
      value
        ? [
            ...new Set(
              value
                .split(',')
                .map((tag) => tag.trim().toLowerCase())
                .filter((tag) => tag.length > 0 && tag.length <= 40),
            ),
          ].slice(0, 20)
        : [],
    ),
  /** Ids from the media library, in display order. */
  galleryMediaIds: z.array(z.string().uuid()).max(50).default([]),
});

export type PoiInput = z.infer<typeof poiInputSchema>;

/**
 * Replaces a POI's gallery.
 *
 * Media is a shared library, not destination-scoped, so existence is the
 * only requirement — but it *is* required: a client-supplied id list must
 * not be trusted to already exist, or a stale or forged id would sit in the
 * gallery as a silent broken image.
 */
async function replaceGallery(poiId: string, mediaIds: string[]): Promise<void> {
  const db = await getDb();
  const uniqueIds = [...new Set(mediaIds)];

  if (uniqueIds.length > 0) {
    const found = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(inArray(mediaAssets.id, uniqueIds));
    if (found.length !== uniqueIds.length) {
      throw validation('One of the selected gallery images no longer exists.', {
        galleryMediaIds: 'Choose files from the media library',
      });
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(poiMedia).where(eq(poiMedia.poiId, poiId));
    if (uniqueIds.length > 0) {
      await tx.insert(poiMedia).values(
        uniqueIds.map((mediaId, index) => ({
          poiId,
          mediaId,
          role: 'gallery' as const,
          position: index,
        })),
      );
    }
  });
}

/**
 * Confirms a category actually belongs to the POI's own destination.
 *
 * `categoryId` arrives as a bare id from the form; without this check, a
 * crafted request could file a point of interest under another
 * destination's category, the same cross-tenant reference the hotspot
 * registry already guards against.
 */
async function assertCategoryInDestination(categoryId: string, destinationId: string): Promise<void> {
  const db = await getDb();
  const [category] = await db
    .select({ id: poiCategories.id })
    .from(poiCategories)
    .where(and(eq(poiCategories.id, categoryId), eq(poiCategories.destinationId, destinationId)))
    .limit(1);
  if (!category) {
    throw validation('That category belongs to a different destination.', {
      categoryId: 'Choose a category from this destination',
    });
  }
}

export async function listPoisForAdmin(destinationId: string) {
  await requirePermission('content:read');
  const db = await getDb();

  const rows = await db
    .select()
    .from(pointsOfInterest)
    .where(eq(pointsOfInterest.destinationId, destinationId))
    .orderBy(asc(pointsOfInterest.position), asc(pointsOfInterest.slug));

  if (rows.length === 0) return [];

  const translations = await db.select().from(poiTranslations);

  return rows.map((poi) => ({
    ...poi,
    translations: translations.filter((t) => t.poiId === poi.id),
  }));
}

export async function getPoiForAdmin(id: string) {
  await requirePermission('content:read');
  const db = await getDb();

  const [poi] = await db
    .select()
    .from(pointsOfInterest)
    .where(eq(pointsOfInterest.id, id))
    .limit(1);
  if (!poi) throw notFound('Point of interest not found');

  const [translations, galleryRows] = await Promise.all([
    db.select().from(poiTranslations).where(eq(poiTranslations.poiId, id)),
    db
      .select({ mediaId: poiMedia.mediaId })
      .from(poiMedia)
      .where(eq(poiMedia.poiId, id))
      .orderBy(asc(poiMedia.position)),
  ]);

  return { ...poi, translations, galleryMediaIds: galleryRows.map((r) => r.mediaId) };
}

export async function createPoi(
  input: PoiInput,
  translations: TranslationInput[],
): Promise<string> {
  const auth = await requirePermission('content:write');
  const db = await getDb();

  await assertSlugAvailable({
    table: pointsOfInterest,
    slugColumn: pointsOfInterest.slug,
    idColumn: pointsOfInterest.id,
    slug: input.slug,
    scope: eq(pointsOfInterest.destinationId, input.destinationId),
  });
  if (input.categoryId) await assertCategoryInDestination(input.categoryId, input.destinationId);

  const [row] = await db
    .insert(pointsOfInterest)
    .values({
      destinationId: input.destinationId,
      categoryId: input.categoryId ?? null,
      slug: input.slug,
      status: input.status,
      coverMediaId: input.coverMediaId ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      tags: input.tags,
    })
    .returning({ id: pointsOfInterest.id });

  await Promise.all([
    replaceTranslations({
      table: poiTranslations,
      parentColumn: poiTranslations.poiId,
      parentId: row!.id,
      rows: translations,
    }),
    replaceGallery(row!.id, input.galleryMediaIds),
  ]);

  await recordAudit({
    actorId: auth.user.id,
    action: 'poi.create',
    entityType: 'poi',
    entityId: row!.id,
    metadata: { slug: input.slug },
  });

  return row!.id;
}

export async function updatePoi(
  id: string,
  input: PoiInput,
  translations: TranslationInput[],
): Promise<void> {
  const auth = await requirePermission('content:write');
  const db = await getDb();

  await assertSlugAvailable({
    table: pointsOfInterest,
    slugColumn: pointsOfInterest.slug,
    idColumn: pointsOfInterest.id,
    slug: input.slug,
    scope: eq(pointsOfInterest.destinationId, input.destinationId),
    excludeId: id,
  });
  if (input.categoryId) await assertCategoryInDestination(input.categoryId, input.destinationId);

  await db
    .update(pointsOfInterest)
    .set({
      destinationId: input.destinationId,
      categoryId: input.categoryId ?? null,
      slug: input.slug,
      status: input.status,
      coverMediaId: input.coverMediaId ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      tags: input.tags,
      updatedAt: new Date(),
    })
    .where(eq(pointsOfInterest.id, id));

  await Promise.all([
    replaceTranslations({
      table: poiTranslations,
      parentColumn: poiTranslations.poiId,
      parentId: id,
      rows: translations,
    }),
    replaceGallery(id, input.galleryMediaIds),
  ]);

  await recordAudit({
    actorId: auth.user.id,
    action: 'poi.update',
    entityType: 'poi',
    entityId: id,
  });
}

export async function deletePoi(id: string): Promise<void> {
  const auth = await requirePermission('content:write');
  const db = await getDb();
  await db.delete(pointsOfInterest).where(eq(pointsOfInterest.id, id));
  await recordAudit({
    actorId: auth.user.id,
    action: 'poi.delete',
    entityType: 'poi',
    entityId: id,
  });
}

/* -------------------------------------------------------------------------- */
/*  Categories                                                                */
/* -------------------------------------------------------------------------- */

export const categoryInputSchema = z.object({
  destinationId: z.string().uuid(),
  slug: slugSchema,
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour such as #4FB3A0'),
  icon: z.string().trim().max(48).default('marker'),
});

export async function listCategories(destinationId: string) {
  await requirePermission('content:read');
  const db = await getDb();

  const rows = await db
    .select()
    .from(poiCategories)
    .where(eq(poiCategories.destinationId, destinationId))
    .orderBy(asc(poiCategories.position));

  const translations = await db.select().from(poiCategoryTranslations);
  return rows.map((category) => ({
    ...category,
    translations: translations.filter((t) => t.categoryId === category.id),
  }));
}

export async function createCategory(
  input: z.infer<typeof categoryInputSchema>,
  translations: TranslationInput[],
): Promise<string> {
  const auth = await requirePermission('content:write');
  const db = await getDb();

  await assertSlugAvailable({
    table: poiCategories,
    slugColumn: poiCategories.slug,
    idColumn: poiCategories.id,
    slug: input.slug,
    scope: eq(poiCategories.destinationId, input.destinationId),
  });

  const [row] = await db
    .insert(poiCategories)
    .values({
      destinationId: input.destinationId,
      slug: input.slug,
      color: input.color,
      icon: input.icon,
    })
    .returning({ id: poiCategories.id });

  await replaceTranslations({
    table: poiCategoryTranslations,
    parentColumn: poiCategoryTranslations.categoryId,
    parentId: row!.id,
    rows: translations,
  });

  await recordAudit({
    actorId: auth.user.id,
    action: 'poi_category.create',
    entityType: 'poi_category',
    entityId: row!.id,
  });

  return row!.id;
}
