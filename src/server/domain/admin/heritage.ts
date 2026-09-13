import 'server-only';

import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db';
import {
  heritageSiteMedia,
  heritageSiteTranslations,
  heritageSites,
  mediaAssets,
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

export const HERITAGE_SITE_TRANSLATION_FIELDS = ['title', 'shortDescription', 'description'] as const;

export const heritageSiteInputSchema = z.object({
  destinationId: z.string().uuid(),
  slug: slugSchema,
  status: statusSchema,
  coverMediaId: z.string().uuid().nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  /** Ids from the media library, in display order. */
  galleryMediaIds: z.array(z.string().uuid()).max(50).default([]),
});

export type HeritageSiteInput = z.infer<typeof heritageSiteInputSchema>;

/**
 * Replaces a heritage site's gallery.
 *
 * Media is a shared library, not destination-scoped (the same reasoning
 * `validateAction`'s 'media' case uses for hotspots), so existence is the
 * only requirement — but it *is* required: a client-supplied id list must not
 * be trusted to already exist, or a stale or forged id would sit in the
 * gallery as a silent broken image.
 */
async function replaceGallery(heritageSiteId: string, mediaIds: string[]): Promise<void> {
  const db = await getDb();
  const uniqueIds = [...new Set(mediaIds)];

  if (uniqueIds.length > 0) {
    const found = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(inArray(mediaAssets.id, uniqueIds));
    if (found.length !== uniqueIds.length) {
      throw validation('One of the selected gallery images no longer exists.', {
        galleryMediaIds: 'Choose files from the media library',
      });
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(heritageSiteMedia).where(eq(heritageSiteMedia.heritageSiteId, heritageSiteId));
    if (uniqueIds.length > 0) {
      await tx.insert(heritageSiteMedia).values(
        uniqueIds.map((mediaId, index) => ({
          heritageSiteId,
          mediaId,
          role: 'gallery' as const,
          position: index,
        })),
      );
    }
  });
}

export async function listHeritageSitesForAdmin(destinationId?: string) {
  await requirePermission('content:read');
  const db = await getDb();

  const rows = await db
    .select()
    .from(heritageSites)
    .where(destinationId ? eq(heritageSites.destinationId, destinationId) : undefined)
    .orderBy(asc(heritageSites.position), asc(heritageSites.slug));

  if (rows.length === 0) return [];

  const translations = await db.select().from(heritageSiteTranslations);

  return rows.map((site) => ({
    ...site,
    translations: translations.filter((t) => t.heritageSiteId === site.id),
  }));
}

export async function getHeritageSiteForAdmin(id: string) {
  await requirePermission('content:read');
  const db = await getDb();

  const [site] = await db.select().from(heritageSites).where(eq(heritageSites.id, id)).limit(1);
  if (!site) throw notFound('Heritage site not found');

  const [translations, galleryRows] = await Promise.all([
    db.select().from(heritageSiteTranslations).where(eq(heritageSiteTranslations.heritageSiteId, id)),
    db
      .select({ mediaId: heritageSiteMedia.mediaId })
      .from(heritageSiteMedia)
      .where(eq(heritageSiteMedia.heritageSiteId, id))
      .orderBy(asc(heritageSiteMedia.position)),
  ]);

  return { ...site, translations, galleryMediaIds: galleryRows.map((r) => r.mediaId) };
}

export async function createHeritageSite(
  input: HeritageSiteInput,
  translations: TranslationInput[],
): Promise<string> {
  const auth = await requirePermission('content:write');
  const db = await getDb();

  await assertSlugAvailable({
    table: heritageSites,
    slugColumn: heritageSites.slug,
    idColumn: heritageSites.id,
    slug: input.slug,
    scope: eq(heritageSites.destinationId, input.destinationId),
  });

  const [row] = await db
    .insert(heritageSites)
    .values({
      destinationId: input.destinationId,
      slug: input.slug,
      status: input.status,
      publishedAt: input.status === 'published' ? new Date() : null,
      coverMediaId: input.coverMediaId ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    })
    .returning({ id: heritageSites.id });

  const id = row!.id;

  await Promise.all([
    replaceTranslations({
      table: heritageSiteTranslations,
      parentColumn: heritageSiteTranslations.heritageSiteId,
      parentId: id,
      rows: translations,
    }),
    replaceGallery(id, input.galleryMediaIds),
  ]);

  await recordAudit({
    actorId: auth.user.id,
    action: 'heritage_site.create',
    entityType: 'heritage_site',
    entityId: id,
    metadata: { slug: input.slug },
  });

  return id;
}

export async function updateHeritageSite(
  id: string,
  input: HeritageSiteInput,
  translations: TranslationInput[],
): Promise<void> {
  const auth = await requirePermission('content:write');
  const db = await getDb();

  const [existing] = await db.select().from(heritageSites).where(eq(heritageSites.id, id)).limit(1);
  if (!existing) throw notFound('Heritage site not found');

  await assertSlugAvailable({
    table: heritageSites,
    slugColumn: heritageSites.slug,
    idColumn: heritageSites.id,
    slug: input.slug,
    scope: eq(heritageSites.destinationId, input.destinationId),
    excludeId: id,
  });

  await db
    .update(heritageSites)
    .set({
      slug: input.slug,
      status: input.status,
      publishedAt: input.status === 'published' ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
      coverMediaId: input.coverMediaId ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      updatedAt: new Date(),
    })
    .where(eq(heritageSites.id, id));

  await Promise.all([
    replaceTranslations({
      table: heritageSiteTranslations,
      parentColumn: heritageSiteTranslations.heritageSiteId,
      parentId: id,
      rows: translations,
    }),
    replaceGallery(id, input.galleryMediaIds),
  ]);

  await recordAudit({
    actorId: auth.user.id,
    action: 'heritage_site.update',
    entityType: 'heritage_site',
    entityId: id,
  });
}

export async function deleteHeritageSite(id: string): Promise<void> {
  const auth = await requirePermission('content:write');
  const db = await getDb();
  await db.delete(heritageSites).where(eq(heritageSites.id, id));
  await recordAudit({
    actorId: auth.user.id,
    action: 'heritage_site.delete',
    entityType: 'heritage_site',
    entityId: id,
  });
}
