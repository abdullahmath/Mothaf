import 'server-only';

import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db';
import {
  eventMedia,
  eventScheduleItems,
  eventScheduleItemTranslations,
  events,
  eventTranslations,
  mediaAssets,
  scenes,
  tours,
} from '../../db/schema';
import { hasPermission } from '../../auth/permissions';
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

export const EVENT_TRANSLATION_FIELDS = [
  'title',
  'summary',
  'description',
  'organizer',
  'venue',
  'admissionInfo',
] as const;

export const SCHEDULE_TRANSLATION_FIELDS = [
  'title',
  'description',
  'performer',
  'location',
] as const;

/**
 * A timezone the runtime actually knows.
 *
 * Validated by asking `Intl` rather than by matching a pattern: the tz
 * database changes, and a regex would either reject valid zones or accept
 * strings that later blow up inside `DateTimeFormat` when a visitor loads the
 * page.
 */
const timezoneSchema = z
  .string()
  .trim()
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown timezone. Use an IANA name such as Asia/Damascus.');

export const eventInputSchema = z
  .object({
    destinationId: z.string().uuid(),
    tourId: z.string().uuid().nullable().optional(),
    slug: slugSchema,
    status: statusSchema,
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    timezone: timezoneSchema,
    coverMediaId: z.string().uuid().nullable().optional(),
    latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
    /** Ids from the media library, in display order. */
    galleryMediaIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .refine((value) => value.endsAt >= value.startsAt, {
    message: 'The end date must not be before the start date.',
    path: ['endsAt'],
  });

export type EventInput = z.infer<typeof eventInputSchema>;

/**
 * Replaces an event's gallery.
 *
 * Media is a shared library, not destination-scoped, so existence is the
 * only requirement — but it *is* required: a client-supplied id list must
 * not be trusted to already exist, or a stale or forged id would sit in the
 * gallery as a silent broken image.
 */
async function replaceGallery(eventId: string, mediaIds: string[]): Promise<void> {
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
    await tx.delete(eventMedia).where(eq(eventMedia.eventId, eventId));
    if (uniqueIds.length > 0) {
      await tx.insert(eventMedia).values(
        uniqueIds.map((mediaId, index) => ({
          eventId,
          mediaId,
          role: 'gallery' as const,
          position: index,
        })),
      );
    }
  });
}

/**
 * Confirms the related tour actually belongs to the event's own destination.
 *
 * Without this, an event could link to another destination's tour — the
 * public event page would then send "explore the venue" to the wrong place.
 * Same class of gap as `assertCategoryInDestination` for POIs.
 */
async function assertTourInDestination(tourId: string, destinationId: string): Promise<void> {
  const db = await getDb();
  const [tour] = await db
    .select({ id: tours.id })
    .from(tours)
    .where(and(eq(tours.id, tourId), eq(tours.destinationId, destinationId)))
    .limit(1);
  if (!tour) {
    throw validation('That tour belongs to a different destination.', {
      tourId: 'Choose a tour from this destination',
    });
  }
}

export async function listEventsForAdmin(destinationId?: string) {
  await requirePermission('event:read');
  const db = await getDb();

  const rows = await db
    .select()
    .from(events)
    .where(destinationId ? eq(events.destinationId, destinationId) : undefined)
    .orderBy(asc(events.startsAt));

  if (rows.length === 0) return [];
  const translations = await db.select().from(eventTranslations);

  return rows.map((event) => ({
    ...event,
    translations: translations.filter((t) => t.eventId === event.id),
  }));
}

export async function getEventForAdmin(id: string) {
  await requirePermission('event:read');
  const db = await getDb();

  const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!event) throw notFound('Event not found');

  const [translations, schedule, galleryRows] = await Promise.all([
    db.select().from(eventTranslations).where(eq(eventTranslations.eventId, id)),
    db
      .select()
      .from(eventScheduleItems)
      .where(eq(eventScheduleItems.eventId, id))
      .orderBy(asc(eventScheduleItems.startsAt)),
    db
      .select({ mediaId: eventMedia.mediaId })
      .from(eventMedia)
      .where(eq(eventMedia.eventId, id))
      .orderBy(asc(eventMedia.position)),
  ]);

  const scheduleTranslations = schedule.length
    ? await db.select().from(eventScheduleItemTranslations)
    : [];

  return {
    ...event,
    translations,
    galleryMediaIds: galleryRows.map((r) => r.mediaId),
    schedule: schedule.map((item) => ({
      ...item,
      translations: scheduleTranslations.filter((t) => t.itemId === item.id),
    })),
  };
}

export async function createEvent(
  input: EventInput,
  translations: TranslationInput[],
): Promise<string> {
  const auth = await requirePermission('event:write');
  const db = await getDb();

  await assertSlugAvailable({
    table: events,
    slugColumn: events.slug,
    idColumn: events.id,
    slug: input.slug,
    scope: eq(events.destinationId, input.destinationId),
  });
  if (input.tourId) await assertTourInDestination(input.tourId, input.destinationId);

  const status =
    input.status === 'published' && !hasPermission(auth.user.role, 'event:publish')
      ? 'draft'
      : input.status;

  const [row] = await db
    .insert(events)
    .values({
      destinationId: input.destinationId,
      tourId: input.tourId ?? null,
      slug: input.slug,
      status,
      publishedAt: status === 'published' ? new Date() : null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: input.timezone,
      coverMediaId: input.coverMediaId ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    })
    .returning({ id: events.id });

  await Promise.all([
    replaceTranslations({
      table: eventTranslations,
      parentColumn: eventTranslations.eventId,
      parentId: row!.id,
      rows: translations,
    }),
    replaceGallery(row!.id, input.galleryMediaIds),
  ]);

  await recordAudit({
    actorId: auth.user.id,
    action: 'event.create',
    entityType: 'event',
    entityId: row!.id,
    metadata: { slug: input.slug },
  });

  return row!.id;
}

export async function updateEvent(
  id: string,
  input: EventInput,
  translations: TranslationInput[],
): Promise<void> {
  const auth = await requirePermission('event:write');
  const db = await getDb();

  const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!existing) throw notFound('Event not found');

  await assertSlugAvailable({
    table: events,
    slugColumn: events.slug,
    idColumn: events.id,
    slug: input.slug,
    scope: eq(events.destinationId, input.destinationId),
    excludeId: id,
  });
  if (input.tourId) await assertTourInDestination(input.tourId, input.destinationId);

  const status =
    input.status === 'published' && !hasPermission(auth.user.role, 'event:publish')
      ? existing.status
      : input.status;

  await db
    .update(events)
    .set({
      destinationId: input.destinationId,
      tourId: input.tourId ?? null,
      slug: input.slug,
      status,
      publishedAt:
        status === 'published' ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: input.timezone,
      coverMediaId: input.coverMediaId ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      updatedAt: new Date(),
    })
    .where(eq(events.id, id));

  await Promise.all([
    replaceTranslations({
      table: eventTranslations,
      parentColumn: eventTranslations.eventId,
      parentId: id,
      rows: translations,
    }),
    replaceGallery(id, input.galleryMediaIds),
  ]);

  await recordAudit({
    actorId: auth.user.id,
    action: 'event.update',
    entityType: 'event',
    entityId: id,
  });
}

export async function deleteEvent(id: string): Promise<void> {
  const auth = await requirePermission('event:write');
  const db = await getDb();
  await db.delete(events).where(eq(events.id, id));
  await recordAudit({
    actorId: auth.user.id,
    action: 'event.delete',
    entityType: 'event',
    entityId: id,
  });
}

/* -------------------------------------------------------------------------- */
/*  Schedule                                                                  */
/* -------------------------------------------------------------------------- */

export const scheduleItemSchema = z
  .object({
    eventId: z.string().uuid(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().nullable().optional(),
    sceneId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => !value.endsAt || value.endsAt >= value.startsAt, {
    message: 'The end time must not be before the start time.',
    path: ['endsAt'],
  });

export async function addScheduleItem(
  input: z.infer<typeof scheduleItemSchema>,
  translations: TranslationInput[],
): Promise<string> {
  await requirePermission('event:write');
  const db = await getDb();

  const [event] = await db
    .select({ startsAt: events.startsAt, endsAt: events.endsAt, destinationId: events.destinationId })
    .from(events)
    .where(eq(events.id, input.eventId))
    .limit(1);
  if (!event) throw notFound('Event not found');

  // A programme item outside the festival's own dates is almost always a
  // typo, and one that would sort strangely in the visitor's schedule.
  if (input.startsAt < event.startsAt || input.startsAt > event.endsAt) {
    throw validation('This item falls outside the event’s dates.', {
      startsAt: 'Choose a time within the event',
    });
  }

  // The scene, if any, must belong to the same destination as the event —
  // otherwise a programme item could point at a scene nobody can reach from
  // this event's own venue.
  if (input.sceneId) {
    const [scene] = await db
      .select({ id: scenes.id })
      .from(scenes)
      .innerJoin(tours, eq(tours.id, scenes.tourId))
      .where(and(eq(scenes.id, input.sceneId), eq(tours.destinationId, event.destinationId)))
      .limit(1);
    if (!scene) {
      throw validation('That scene belongs to a different destination.', {
        sceneId: 'Choose a scene from this event’s destination',
      });
    }
  }

  const [row] = await db
    .insert(eventScheduleItems)
    .values({
      eventId: input.eventId,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      sceneId: input.sceneId ?? null,
    })
    .returning({ id: eventScheduleItems.id });

  await replaceTranslations({
    table: eventScheduleItemTranslations,
    parentColumn: eventScheduleItemTranslations.itemId,
    parentId: row!.id,
    rows: translations,
  });

  return row!.id;
}

export async function deleteScheduleItem(id: string): Promise<void> {
  await requirePermission('event:write');
  const db = await getDb();
  await db.delete(eventScheduleItems).where(eq(eventScheduleItems.id, id));
}
