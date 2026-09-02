import 'server-only';

import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db';
import {
  poiCategories,
  poiCategoryTranslations,
  poiTranslations,
  pointsOfInterest,
} from '../../db/schema';
import { requirePermission } from '../guard';
import { notFound } from '../errors';
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
});

export type PoiInput = z.infer<typeof poiInputSchema>;

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

  const translations = await db
    .select()
    .from(poiTranslations)
    .where(eq(poiTranslations.poiId, id));

  return { ...poi, translations };
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

  await replaceTranslations({
    table: poiTranslations,
    parentColumn: poiTranslations.poiId,
    parentId: row!.id,
    rows: translations,
  });

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

  await db
    .update(pointsOfInterest)
    .set({
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

  await replaceTranslations({
    table: poiTranslations,
    parentColumn: poiTranslations.poiId,
    parentId: id,
    rows: translations,
  });

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
