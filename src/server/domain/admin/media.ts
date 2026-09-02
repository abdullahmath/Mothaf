import 'server-only';

import { desc, eq, inArray, or, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { mediaAssets, mediaTranslations, scenes } from '../../db/schema';
import { getClientIp } from '../../auth/cookies';
import { consumeRateLimit, ipKey, RATE_LIMITS } from '../../auth/rate-limit';
import { deleteMedia, ingestMedia } from '../../media/ingest';
import { requirePermission } from '../guard';
import { conflict, notFound, rateLimited, validation } from '../errors';
import { recordAudit, replaceTranslations, type TranslationInput } from './shared';

/**
 * The media library.
 *
 * Uploads are the most dangerous input the application accepts, so the order
 * here is deliberate: authorize, rate-limit, then hand the bytes to the
 * ingestion pipeline, which does the sniffing, the decode-bomb check and the
 * re-encode. Nothing in this file trusts the filename or the declared type.
 */

export type MediaKindFilter = 'all' | 'image' | 'panorama' | 'video' | 'audio';

export async function listMedia(filter: MediaKindFilter = 'all', limit = 120) {
  await requirePermission('media:read');
  const db = await getDb();

  const rows = await db
    .select()
    .from(mediaAssets)
    .where(filter === 'all' ? undefined : eq(mediaAssets.kind, filter))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const translations = await db
    .select()
    .from(mediaTranslations)
    .where(
      inArray(
        mediaTranslations.mediaId,
        rows.map((r) => r.id),
      ),
    );

  return rows.map((asset) => ({
    ...asset,
    translations: translations.filter((t) => t.mediaId === asset.id),
  }));
}

export async function getMediaForAdmin(id: string) {
  await requirePermission('media:read');
  const db = await getDb();

  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  if (!asset) throw notFound('File not found');

  const translations = await db
    .select()
    .from(mediaTranslations)
    .where(eq(mediaTranslations.mediaId, id));

  return { ...asset, translations };
}

/** Bytes larger than this are refused before the pipeline decodes anything. */
export async function uploadMedia(options: {
  file: File;
  kind: 'image' | 'panorama' | 'video' | 'audio';
  translations?: TranslationInput[];
}) {
  const auth = await requirePermission('media:write');

  // Uploads are expensive — a 50 MB panorama produces half a dozen
  // re-encodes — so they get their own limit, separate from login.
  const ip = await getClientIp();
  const limit = await consumeRateLimit(ipKey('upload', ip), RATE_LIMITS.upload);
  if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds);

  if (!(options.file instanceof File) || options.file.size === 0) {
    throw validation('Choose a file to upload.', { file: 'No file was received' });
  }

  const buffer = Buffer.from(await options.file.arrayBuffer());

  const asset = await ingestMedia(buffer, {
    filename: options.file.name,
    clientMimeType: options.file.type,
    kind: options.kind,
    uploadedBy: auth.user.id,
  });

  if (options.translations?.length) {
    await replaceTranslations({
      table: mediaTranslations,
      parentColumn: mediaTranslations.mediaId,
      parentId: asset.id,
      rows: options.translations,
    });
  }

  await recordAudit({
    actorId: auth.user.id,
    action: 'media.upload',
    entityType: 'media',
    entityId: asset.id,
    metadata: {
      kind: asset.kind,
      bytes: asset.byteSize,
      dimensions: asset.width && asset.height ? `${asset.width}x${asset.height}` : null,
    },
  });

  return asset;
}

export async function updateMediaText(
  id: string,
  translations: TranslationInput[],
): Promise<void> {
  const auth = await requirePermission('media:write');
  await replaceTranslations({
    table: mediaTranslations,
    parentColumn: mediaTranslations.mediaId,
    parentId: id,
    rows: translations,
  });
  await recordAudit({
    actorId: auth.user.id,
    action: 'media.describe',
    entityType: 'media',
    entityId: id,
  });
}

/**
 * Removes a file.
 *
 * Refuses while a scene still uses it as a background. The database would
 * refuse too — that foreign key is `ON DELETE RESTRICT` precisely so a
 * panorama cannot vanish out from under a published scene — but catching it
 * here produces a message an editor can act on rather than a constraint error.
 */
export async function removeMedia(id: string): Promise<void> {
  const auth = await requirePermission('media:delete');
  const db = await getDb();

  const inUse = await db
    .select({ slug: scenes.slug })
    .from(scenes)
    .where(
      or(
        eq(scenes.backgroundMediaId, id),
        eq(scenes.thumbnailMediaId, id),
        eq(scenes.audioMediaId, id),
      ),
    )
    .limit(3);

  if (inUse.length > 0) {
    throw conflict(
      `This file is still used by ${inUse.length} scene(s): ${inUse.map((s) => s.slug).join(', ')}. Replace it there first.`,
    );
  }

  await deleteMedia(id);

  await recordAudit({
    actorId: auth.user.id,
    action: 'media.delete',
    entityType: 'media',
    entityId: id,
  });
}

/** Storage totals for the dashboard. */
export async function mediaStats() {
  await requirePermission('media:read');
  const db = await getDb();
  const rows = await db
    .select({
      kind: mediaAssets.kind,
      files: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${mediaAssets.byteSize}), 0)::bigint`,
    })
    .from(mediaAssets)
    .groupBy(mediaAssets.kind);

  return rows.map((row) => ({ ...row, bytes: Number(row.bytes), files: Number(row.files) }));
}
