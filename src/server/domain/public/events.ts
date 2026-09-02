import 'server-only';

import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { getDb } from '../../db';
import {
  destinations,
  destinationTranslations,
  eventMedia,
  events,
  eventScheduleItems,
  eventScheduleItemTranslations,
  eventTranslations,
  mediaAssets,
  mediaTranslations,
  tours,
  tourTranslations,
  type MediaAsset,
} from '../../db/schema';
import { toMediaDTO } from '../../media/urls';
import type { MediaDTO } from '@/lib/tour/types';
import {
  eventPhase,
  type EventCardDTO,
  type EventDetailDTO,
  type ScheduleItemDTO,
} from '@/lib/content/types';
import type { AppLocale } from '@/lib/i18n/config';
import { groupByParent, mergeTranslations } from '../i18n/resolve';
import { notFound } from '../errors';

/**
 * Visitor-side reads for events and festivals.
 *
 * The same content model serves a permanent archaeological site and a
 * two-week festival; only the date range and the `phase` derived from it
 * differ.
 */

async function loadMediaMap(
  ids: (string | null)[],
  locale: AppLocale,
  defaultLocale: string,
): Promise<Map<string, MediaDTO>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();

  const db = await getDb();
  const [assets, translations] = await Promise.all([
    db.select().from(mediaAssets).where(inArray(mediaAssets.id, unique)),
    db.select().from(mediaTranslations).where(inArray(mediaTranslations.mediaId, unique)),
  ]);
  const byParent = groupByParent(translations, 'mediaId');
  return new Map(
    (assets as MediaAsset[]).map((asset) => [
      asset.id,
      toMediaDTO(asset, mergeTranslations(byParent.get(asset.id) ?? [], locale, defaultLocale)),
    ]),
  );
}

type EventRow = typeof events.$inferSelect;

async function toCards(
  rows: EventRow[],
  locale: AppLocale,
  defaultLocale: string,
  destinationNames: Map<string, { slug: string; name: string }>,
  now: Date,
): Promise<EventCardDTO[]> {
  if (rows.length === 0) return [];
  const db = await getDb();

  const translations = await db
    .select()
    .from(eventTranslations)
    .where(
      inArray(
        eventTranslations.eventId,
        rows.map((e) => e.id),
      ),
    );
  const media = await loadMediaMap(
    rows.map((e) => e.coverMediaId),
    locale,
    defaultLocale,
  );
  const trBy = groupByParent(translations, 'eventId');

  return rows.map((event) => {
    const tr = mergeTranslations(trBy.get(event.id) ?? [], locale, defaultLocale);
    const destination = destinationNames.get(event.destinationId);
    return {
      id: event.id,
      slug: event.slug,
      destinationSlug: destination?.slug ?? '',
      destinationName: destination?.name ?? '',
      title: tr.title ?? event.slug,
      summary: tr.summary ?? null,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      timezone: event.timezone,
      cover: event.coverMediaId ? (media.get(event.coverMediaId) ?? null) : null,
      phase: eventPhase(event.startsAt, event.endsAt, now),
    };
  });
}

/** Destination slug and localised name for the given ids. */
async function destinationLabels(
  ids: string[],
  locale: AppLocale,
): Promise<Map<string, { slug: string; name: string }>> {
  if (ids.length === 0) return new Map();
  const db = await getDb();
  const [rows, translations] = await Promise.all([
    db.select().from(destinations).where(inArray(destinations.id, ids)),
    db
      .select()
      .from(destinationTranslations)
      .where(inArray(destinationTranslations.destinationId, ids)),
  ]);
  const trBy = groupByParent(translations, 'destinationId');
  return new Map(
    rows.map((destination) => {
      const tr = mergeTranslations(
        trBy.get(destination.id) ?? [],
        locale,
        destination.defaultLocale,
      );
      return [destination.id, { slug: destination.slug, name: tr.name ?? destination.slug }];
    }),
  );
}

export async function listEventsForDestination(
  destinationId: string,
  locale: AppLocale,
  defaultLocale: string,
  now = new Date(),
): Promise<EventCardDTO[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.destinationId, destinationId), eq(events.status, 'published')))
    .orderBy(asc(events.startsAt));

  const labels = await destinationLabels([destinationId], locale);
  return toCards(rows, locale, defaultLocale, labels, now);
}

/**
 * Events across every published destination.
 *
 * Anything still running or yet to start, soonest first. Past events are
 * excluded from the default listing — a visitor looking for what is on does
 * not want last year's festival at the top.
 */
export async function listUpcomingEvents(
  locale: AppLocale,
  limit = 12,
  now = new Date(),
): Promise<EventCardDTO[]> {
  const db = await getDb();

  const rows = await db
    .select({ event: events, destinationDefaultLocale: destinations.defaultLocale })
    .from(events)
    .innerJoin(destinations, eq(destinations.id, events.destinationId))
    .where(
      and(
        eq(events.status, 'published'),
        eq(destinations.status, 'published'),
        // Still running counts as upcoming for listing purposes.
        gte(events.endsAt, now),
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(limit);

  const eventRows = rows.map((r) => r.event);
  const labels = await destinationLabels(
    [...new Set(eventRows.map((e) => e.destinationId))],
    locale,
  );
  return toCards(eventRows, locale, rows[0]?.destinationDefaultLocale ?? locale, labels, now);
}

export async function listPastEvents(
  locale: AppLocale,
  limit = 12,
  now = new Date(),
): Promise<EventCardDTO[]> {
  const db = await getDb();
  const rows = await db
    .select({ event: events, destinationDefaultLocale: destinations.defaultLocale })
    .from(events)
    .innerJoin(destinations, eq(destinations.id, events.destinationId))
    .where(and(eq(events.status, 'published'), eq(destinations.status, 'published')))
    .orderBy(desc(events.endsAt))
    .limit(limit * 3);

  const past = rows.map((r) => r.event).filter((e) => e.endsAt < now).slice(0, limit);
  const labels = await destinationLabels([...new Set(past.map((e) => e.destinationId))], locale);
  return toCards(past, locale, rows[0]?.destinationDefaultLocale ?? locale, labels, now);
}

export async function getEventDetail(
  destinationSlug: string,
  eventSlug: string,
  locale: AppLocale,
  now = new Date(),
): Promise<EventDetailDTO> {
  const db = await getDb();

  const [found] = await db
    .select({ event: events, destination: destinations })
    .from(events)
    .innerJoin(destinations, eq(destinations.id, events.destinationId))
    .where(
      and(
        eq(destinations.slug, destinationSlug),
        eq(events.slug, eventSlug),
        eq(events.status, 'published'),
        eq(destinations.status, 'published'),
      ),
    )
    .limit(1);

  if (!found) throw notFound('Event not found');
  const { event, destination } = found;
  const defaultLocale = destination.defaultLocale;

  const [eventTr, scheduleRows, galleryRows, destTr] = await Promise.all([
    db.select().from(eventTranslations).where(eq(eventTranslations.eventId, event.id)),
    db
      .select()
      .from(eventScheduleItems)
      .where(eq(eventScheduleItems.eventId, event.id))
      .orderBy(asc(eventScheduleItems.startsAt), asc(eventScheduleItems.position)),
    db
      .select()
      .from(eventMedia)
      .where(eq(eventMedia.eventId, event.id))
      .orderBy(asc(eventMedia.position)),
    db
      .select()
      .from(destinationTranslations)
      .where(eq(destinationTranslations.destinationId, destination.id)),
  ]);

  const scheduleIds = scheduleRows.map((s) => s.id);
  const [scheduleTr, media, tourRow] = await Promise.all([
    scheduleIds.length
      ? db
          .select()
          .from(eventScheduleItemTranslations)
          .where(inArray(eventScheduleItemTranslations.itemId, scheduleIds))
      : [],
    loadMediaMap(
      [event.coverMediaId, ...galleryRows.map((g) => g.mediaId)],
      locale,
      defaultLocale,
    ),
    event.tourId
      ? db
          .select({ tour: tours, translation: tourTranslations })
          .from(tours)
          .leftJoin(tourTranslations, eq(tourTranslations.tourId, tours.id))
          .where(and(eq(tours.id, event.tourId), eq(tours.status, 'published')))
      : [],
  ]);

  const tr = mergeTranslations(eventTr, locale, defaultLocale);
  const dtr = mergeTranslations(destTr, locale, defaultLocale);
  const scheduleTrBy = groupByParent(scheduleTr, 'itemId');

  const schedule: ScheduleItemDTO[] = scheduleRows.map((item) => {
    const itemTr = mergeTranslations(scheduleTrBy.get(item.id) ?? [], locale, defaultLocale);
    return {
      id: item.id,
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt?.toISOString() ?? null,
      title: itemTr.title ?? '',
      description: itemTr.description ?? null,
      performer: itemTr.performer ?? null,
      location: itemTr.location ?? null,
    };
  });

  // The tour join fans out across translations; collapse and pick the locale.
  const tourTranslationRows = tourRow
    .map((r) => r.translation)
    .filter((t): t is NonNullable<typeof t> => t !== null);
  const firstTour = tourRow[0]?.tour ?? null;
  const tourTr = mergeTranslations(tourTranslationRows, locale, defaultLocale);

  return {
    id: event.id,
    slug: event.slug,
    destinationSlug: destination.slug,
    destinationName: dtr.name ?? destination.slug,
    title: tr.title ?? event.slug,
    summary: tr.summary ?? null,
    description: tr.description ?? null,
    organizer: tr.organizer ?? null,
    venue: tr.venue ?? null,
    admissionInfo: tr.admissionInfo ?? null,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    timezone: event.timezone,
    cover: event.coverMediaId ? (media.get(event.coverMediaId) ?? null) : null,
    schedule,
    gallery: galleryRows
      .map((g) => media.get(g.mediaId))
      .filter((m): m is MediaDTO => m !== undefined),
    tour: firstTour ? { slug: firstTour.slug, title: tourTr.title ?? firstTour.slug } : null,
    latitude: event.latitude,
    longitude: event.longitude,
    phase: eventPhase(event.startsAt, event.endsAt, now),
  };
}
