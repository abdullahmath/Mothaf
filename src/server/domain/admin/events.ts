import 'server-only';

import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db';
import {
  eventScheduleItems,
  eventScheduleItemTranslations,
  events,
  eventTranslations,
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
  })
  .refine((value) => value.endsAt >= value.startsAt, {
    message: 'The end date must not be before the start date.',
    path: ['endsAt'],
  });

export type EventInput = z.infer<typeof eventInputSchema>;

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

  const [translations, schedule] = await Promise.all([
    db.select().from(eventTranslations).where(eq(eventTranslations.eventId, id)),
    db
      .select()
      .from(eventScheduleItems)
      .where(eq(eventScheduleItems.eventId, id))
      .orderBy(asc(eventScheduleItems.startsAt)),
  ]);

  const scheduleTranslations = schedule.length
    ? await db.select().from(eventScheduleItemTranslations)
    : [];

  return {
    ...event,
    translations,
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

  await replaceTranslations({
    table: eventTranslations,
    parentColumn: eventTranslations.eventId,
    parentId: row!.id,
    rows: translations,
  });

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

  const status =
    input.status === 'published' && !hasPermission(auth.user.role, 'event:publish')
      ? existing.status
      : input.status;

  await db
    .update(events)
    .set({
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

  await replaceTranslations({
    table: eventTranslations,
    parentColumn: eventTranslations.eventId,
    parentId: id,
    rows: translations,
  });

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
    .select({ startsAt: events.startsAt, endsAt: events.endsAt })
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
