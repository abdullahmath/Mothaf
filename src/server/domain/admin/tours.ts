import 'server-only';

import { and, asc, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db';
import { destinations, scenes, tours, tourTranslations } from '../../db/schema';
import { hasPermission } from '../../auth/permissions';
import { requirePermission } from '../guard';
import { notFound } from '../errors';
import {
  assertSlugAvailable,
  optionalText,
  recordAudit,
  replaceTranslations,
  slugSchema,
  statusSchema,
  type TranslationInput,
} from './shared';

export const TOUR_TRANSLATION_FIELDS = [
  'title',
  'summary',
  'description',
  'welcomeMessage',
] as const;

export const tourInputSchema = z.object({
  destinationId: z.string().uuid(),
  slug: slugSchema,
  kind: z.enum(['panorama', 'image', 'map', 'story']),
  status: statusSchema,
  coverMediaId: z.string().uuid().nullable().optional(),
  estimatedMinutes: z.coerce.number().int().min(1).max(600).nullable().optional(),
  autoRotate: z.coerce.boolean().optional(),
  showCompass: z.coerce.boolean().optional(),
  showSceneList: z.coerce.boolean().optional(),
  showHotspotLabels: z.coerce.boolean().optional(),
  note: optionalText(500).optional(),
});

export type TourInput = z.infer<typeof tourInputSchema>;

export async function listToursForAdmin(destinationId?: string) {
  await requirePermission('content:read');
  const db = await getDb();

  const rows = await db
    .select({ tour: tours, destinationSlug: destinations.slug })
    .from(tours)
    .innerJoin(destinations, eq(destinations.id, tours.destinationId))
    .where(destinationId ? eq(tours.destinationId, destinationId) : undefined)
    .orderBy(asc(tours.position), asc(tours.slug));

  if (rows.length === 0) return [];

  const [translations, sceneCounts] = await Promise.all([
    db.select().from(tourTranslations),
    db.select({ tourId: scenes.tourId, value: count() }).from(scenes).groupBy(scenes.tourId),
  ]);
  const sceneCountBy = new Map(sceneCounts.map((r) => [r.tourId, Number(r.value)]));

  return rows.map(({ tour, destinationSlug }) => ({
    ...tour,
    destinationSlug,
    translations: translations.filter((t) => t.tourId === tour.id),
    sceneCount: sceneCountBy.get(tour.id) ?? 0,
  }));
}

export async function getTourForAdmin(id: string) {
  await requirePermission('content:read');
  const db = await getDb();

  const [found] = await db
    .select({ tour: tours, destination: destinations })
    .from(tours)
    .innerJoin(destinations, eq(destinations.id, tours.destinationId))
    .where(eq(tours.id, id))
    .limit(1);
  if (!found) throw notFound('Tour not found');

  const [translations, sceneRows] = await Promise.all([
    db.select().from(tourTranslations).where(eq(tourTranslations.tourId, id)),
    db
      .select()
      .from(scenes)
      .where(eq(scenes.tourId, id))
      .orderBy(asc(scenes.position), asc(scenes.slug)),
  ]);

  return { ...found.tour, destination: found.destination, translations, scenes: sceneRows };
}

function settingsFrom(input: TourInput) {
  return {
    autoRotate: Boolean(input.autoRotate),
    autoRotateSpeed: 0.3,
    showCompass: input.showCompass !== false,
    showSceneList: input.showSceneList !== false,
    showHotspotLabels: Boolean(input.showHotspotLabels),
  };
}

export async function createTour(
  input: TourInput,
  translations: TranslationInput[],
): Promise<string> {
  const auth = await requirePermission('content:write');
  const db = await getDb();

  await assertSlugAvailable({
    table: tours,
    slugColumn: tours.slug,
    idColumn: tours.id,
    slug: input.slug,
    // Slugs are unique per destination, not globally: two sites may each have
    // a tour called "virtual-tour".
    scope: eq(tours.destinationId, input.destinationId),
  });

  const status =
    input.status === 'published' && !hasPermission(auth.user.role, 'content:publish')
      ? 'draft'
      : input.status;

  const [row] = await db
    .insert(tours)
    .values({
      destinationId: input.destinationId,
      slug: input.slug,
      kind: input.kind,
      status,
      publishedAt: status === 'published' ? new Date() : null,
      coverMediaId: input.coverMediaId ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      settings: settingsFrom(input),
    })
    .returning({ id: tours.id });

  await replaceTranslations({
    table: tourTranslations,
    parentColumn: tourTranslations.tourId,
    parentId: row!.id,
    rows: translations,
  });

  await recordAudit({
    actorId: auth.user.id,
    action: 'tour.create',
    entityType: 'tour',
    entityId: row!.id,
    metadata: { slug: input.slug },
  });

  return row!.id;
}

export async function updateTour(
  id: string,
  input: TourInput,
  translations: TranslationInput[],
): Promise<void> {
  const auth = await requirePermission('content:write');
  const db = await getDb();

  const [existing] = await db.select().from(tours).where(eq(tours.id, id)).limit(1);
  if (!existing) throw notFound('Tour not found');

  await assertSlugAvailable({
    table: tours,
    slugColumn: tours.slug,
    idColumn: tours.id,
    slug: input.slug,
    scope: eq(tours.destinationId, input.destinationId),
    excludeId: id,
  });

  const status =
    input.status === 'published' && !hasPermission(auth.user.role, 'content:publish')
      ? existing.status
      : input.status;

  await db
    .update(tours)
    .set({
      destinationId: input.destinationId,
      slug: input.slug,
      kind: input.kind,
      status,
      publishedAt:
        status === 'published' ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
      coverMediaId: input.coverMediaId ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      settings: settingsFrom(input),
      updatedAt: new Date(),
    })
    .where(eq(tours.id, id));

  await replaceTranslations({
    table: tourTranslations,
    parentColumn: tourTranslations.tourId,
    parentId: id,
    rows: translations,
  });

  await recordAudit({
    actorId: auth.user.id,
    action: 'tour.update',
    entityType: 'tour',
    entityId: id,
    metadata: { slug: input.slug, status },
  });
}

export async function setTourStatus(
  id: string,
  status: 'draft' | 'published' | 'archived',
): Promise<void> {
  const auth = await requirePermission(status === 'published' ? 'content:publish' : 'content:write');
  const db = await getDb();

  if (status === 'published') {
    // Publishing a tour with no published start scene produces a 404 for
    // every visitor who follows the link. Refuse rather than ship a dead end.
    const [startScene] = await db
      .select({ id: scenes.id })
      .from(scenes)
      .where(and(eq(scenes.tourId, id), eq(scenes.status, 'published')))
      .limit(1);
    if (!startScene) {
      throw notFound('Publish at least one scene before publishing the tour.');
    }
  }

  const [existing] = await db
    .select({ publishedAt: tours.publishedAt })
    .from(tours)
    .where(eq(tours.id, id))
    .limit(1);
  if (!existing) throw notFound('Tour not found');

  await db
    .update(tours)
    .set({
      status,
      publishedAt: status === 'published' ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(tours.id, id));

  await recordAudit({
    actorId: auth.user.id,
    action: `tour.${status}`,
    entityType: 'tour',
    entityId: id,
  });
}

export async function deleteTour(id: string): Promise<void> {
  const auth = await requirePermission('content:publish');
  const db = await getDb();
  await db.delete(tours).where(eq(tours.id, id));
  await recordAudit({
    actorId: auth.user.id,
    action: 'tour.delete',
    entityType: 'tour',
    entityId: id,
  });
}
