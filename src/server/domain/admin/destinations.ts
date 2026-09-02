import 'server-only';

import { asc, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db';
import {
  destinations,
  destinationTranslations,
  pointsOfInterest,
  tours,
} from '../../db/schema';
import { requirePermission } from '../guard';
import { notFound } from '../errors';
import {
  assertSlugAvailable,
  localeCodeSchema,
  optionalText,
  recordAudit,
  replaceTranslations,
  slugSchema,
  statusSchema,
  type TranslationInput,
} from './shared';

/**
 * Administration of destinations.
 *
 * Every function begins with `requirePermission`. The check is repeated rather
 * than factored into a wrapper so that reading any one of these tells you
 * exactly what it requires — and so that adding a function without a check
 * looks obviously wrong in review.
 */

/** Fields an editor translates on a destination. */
export const DESTINATION_TRANSLATION_FIELDS = [
  'name',
  'tagline',
  'summary',
  'description',
  'historicalContext',
] as const;

export const destinationInputSchema = z.object({
  slug: slugSchema,
  defaultLocale: localeCodeSchema,
  status: statusSchema,
  coverMediaId: z.string().uuid().nullable().optional(),
  countryCode: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/, 'Use a two-letter country code')
    .transform((value) => value.toUpperCase())
    .nullable()
    .optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  summaryNote: optionalText(500).optional(),
});

export type DestinationInput = z.infer<typeof destinationInputSchema>;

export async function listDestinationsForAdmin() {
  await requirePermission('content:read');
  const db = await getDb();

  const rows = await db
    .select()
    .from(destinations)
    .orderBy(asc(destinations.position), asc(destinations.slug));

  if (rows.length === 0) return [];

  const [translations, tourCounts, poiCounts] = await Promise.all([
    db.select().from(destinationTranslations),
    db
      .select({ destinationId: tours.destinationId, value: count() })
      .from(tours)
      .groupBy(tours.destinationId),
    db
      .select({ destinationId: pointsOfInterest.destinationId, value: count() })
      .from(pointsOfInterest)
      .groupBy(pointsOfInterest.destinationId),
  ]);

  const tourCountBy = new Map(tourCounts.map((r) => [r.destinationId, Number(r.value)]));
  const poiCountBy = new Map(poiCounts.map((r) => [r.destinationId, Number(r.value)]));

  return rows.map((destination) => ({
    ...destination,
    translations: translations.filter((t) => t.destinationId === destination.id),
    tourCount: tourCountBy.get(destination.id) ?? 0,
    poiCount: poiCountBy.get(destination.id) ?? 0,
  }));
}

export async function getDestinationForAdmin(id: string) {
  await requirePermission('content:read');
  const db = await getDb();

  const [destination] = await db
    .select()
    .from(destinations)
    .where(eq(destinations.id, id))
    .limit(1);
  if (!destination) throw notFound('Destination not found');

  const translations = await db
    .select()
    .from(destinationTranslations)
    .where(eq(destinationTranslations.destinationId, id));

  return { ...destination, translations };
}

export async function createDestination(
  input: DestinationInput,
  translations: TranslationInput[],
): Promise<string> {
  const auth = await requirePermission('content:write');
  const db = await getDb();

  await assertSlugAvailable({
    table: destinations,
    slugColumn: destinations.slug,
    idColumn: destinations.id,
    slug: input.slug,
  });

  // A new destination is a draft regardless of what the form asked for unless
  // the actor may publish; the status field is not a permission bypass.
  const status = await resolveStatus(input.status);

  const [row] = await db
    .insert(destinations)
    .values({
      slug: input.slug,
      defaultLocale: input.defaultLocale,
      status,
      publishedAt: status === 'published' ? new Date() : null,
      coverMediaId: input.coverMediaId ?? null,
      countryCode: input.countryCode ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    })
    .returning({ id: destinations.id });

  const id = row!.id;

  await replaceTranslations({
    table: destinationTranslations,
    parentColumn: destinationTranslations.destinationId,
    parentId: id,
    rows: translations,
  });

  await recordAudit({
    actorId: auth.user.id,
    action: 'destination.create',
    entityType: 'destination',
    entityId: id,
    metadata: { slug: input.slug },
  });

  return id;
}

export async function updateDestination(
  id: string,
  input: DestinationInput,
  translations: TranslationInput[],
): Promise<void> {
  const auth = await requirePermission('content:write');
  const db = await getDb();

  const [existing] = await db
    .select()
    .from(destinations)
    .where(eq(destinations.id, id))
    .limit(1);
  if (!existing) throw notFound('Destination not found');

  await assertSlugAvailable({
    table: destinations,
    slugColumn: destinations.slug,
    idColumn: destinations.id,
    slug: input.slug,
    excludeId: id,
  });

  const status = await resolveStatus(input.status, existing.status);

  await db
    .update(destinations)
    .set({
      slug: input.slug,
      defaultLocale: input.defaultLocale,
      status,
      // Stamped the first time it goes live and then left alone, so it means
      // "first published" rather than "last edited".
      publishedAt:
        status === 'published' ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
      coverMediaId: input.coverMediaId ?? null,
      countryCode: input.countryCode ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      updatedAt: new Date(),
    })
    .where(eq(destinations.id, id));

  await replaceTranslations({
    table: destinationTranslations,
    parentColumn: destinationTranslations.destinationId,
    parentId: id,
    rows: translations,
  });

  await recordAudit({
    actorId: auth.user.id,
    action: 'destination.update',
    entityType: 'destination',
    entityId: id,
    metadata: { slug: input.slug, status },
  });
}

export async function setDestinationStatus(
  id: string,
  status: 'draft' | 'published' | 'archived',
): Promise<void> {
  const auth = await requirePermission(status === 'published' ? 'content:publish' : 'content:write');
  const db = await getDb();

  const [existing] = await db
    .select({ publishedAt: destinations.publishedAt })
    .from(destinations)
    .where(eq(destinations.id, id))
    .limit(1);
  if (!existing) throw notFound('Destination not found');

  await db
    .update(destinations)
    .set({
      status,
      publishedAt: status === 'published' ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(destinations.id, id));

  await recordAudit({
    actorId: auth.user.id,
    action: `destination.${status}`,
    entityType: 'destination',
    entityId: id,
  });
}

export async function deleteDestination(id: string): Promise<void> {
  // Deleting a destination cascades to its tours, scenes, hotspots, POIs and
  // events, which is a large, irreversible action — hence the stricter gate.
  const auth = await requirePermission('content:publish');
  const db = await getDb();

  const [existing] = await db
    .select({ slug: destinations.slug })
    .from(destinations)
    .where(eq(destinations.id, id))
    .limit(1);
  if (!existing) throw notFound('Destination not found');

  await db.delete(destinations).where(eq(destinations.id, id));

  await recordAudit({
    actorId: auth.user.id,
    action: 'destination.delete',
    entityType: 'destination',
    entityId: id,
    metadata: { slug: existing.slug },
  });
}

/**
 * Downgrades a requested status when the actor may not publish.
 *
 * An editor without `content:publish` can save all day, but the form's status
 * field cannot be used to push work live. Silently downgrading rather than
 * refusing keeps their work saved — the UI does not offer them the option in
 * the first place, so reaching here means the request was crafted.
 */
async function resolveStatus(
  requested: 'draft' | 'published' | 'archived',
  fallback: 'draft' | 'published' | 'archived' = 'draft',
): Promise<'draft' | 'published' | 'archived'> {
  if (requested !== 'published') return requested;
  const { hasPermission } = await import('../../auth/permissions');
  const auth = await requirePermission('content:write');
  return hasPermission(auth.user.role, 'content:publish') ? 'published' : fallback;
}
