import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { mediaRoleEnum, publicationStatusEnum } from './enums';
import { localeColumn } from './locales';
import { mediaAssets } from './media';
import { destinations, scenes, tours } from './content';

/**
 * A time-bounded happening: festival, exhibition, guided programme, temporary
 * installation.
 *
 * An event may link to a tour, so the same platform promotes both a permanent
 * archaeological site and a two-week festival without a second content model.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id, { onDelete: 'cascade' }),
    /** Optional companion experience for the event. */
    tourId: uuid('tour_id').references(() => tours.id, { onDelete: 'set null' }),

    slug: varchar('slug', { length: 120 }).notNull(),
    status: publicationStatusEnum('status').notNull().default('draft'),

    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /**
     * IANA zone of the physical event. Stored alongside the absolute instants
     * so "opens at 19:00" can be shown in local time regardless of the
     * visitor's own timezone.
     */
    timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),

    coverMediaId: uuid('cover_media_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),

    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),

    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('events_destination_slug_key').on(t.destinationId, t.slug),
    index('events_destination_id_idx').on(t.destinationId),
    index('events_starts_at_idx').on(t.startsAt),
    index('events_status_idx').on(t.status),
    check('events_ends_after_starts', sql`${t.endsAt} >= ${t.startsAt}`),
  ],
);

export const eventTranslations = pgTable(
  'event_translations',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    locale: localeColumn(),
    title: text('title').notNull(),
    summary: text('summary'),
    description: text('description'),
    organizer: text('organizer'),
    venue: text('venue'),
    /** Ticketing / admission wording, which varies by language and audience. */
    admissionInfo: text('admission_info'),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.locale] })],
);

/** One line of a programme: a performance, a talk, a guided walk. */
export const eventScheduleItems = pgTable(
  'event_schedule_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    /** Where in the tour this item happens, if anywhere. */
    sceneId: uuid('scene_id').references(() => scenes.id, { onDelete: 'set null' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    index('event_schedule_items_event_id_idx').on(t.eventId),
    check(
      'event_schedule_items_ends_after_starts',
      sql`${t.endsAt} IS NULL OR ${t.endsAt} >= ${t.startsAt}`,
    ),
  ],
);

export const eventScheduleItemTranslations = pgTable(
  'event_schedule_item_translations',
  {
    itemId: uuid('item_id')
      .notNull()
      .references(() => eventScheduleItems.id, { onDelete: 'cascade' }),
    locale: localeColumn(),
    title: text('title').notNull(),
    description: text('description'),
    performer: text('performer'),
    location: text('location'),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.locale] })],
);

export const eventMedia = pgTable(
  'event_media',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    role: mediaRoleEnum('role').notNull().default('gallery'),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.mediaId, t.role] }),
    index('event_media_event_id_idx').on(t.eventId),
  ],
);

export type Event = typeof events.$inferSelect;
