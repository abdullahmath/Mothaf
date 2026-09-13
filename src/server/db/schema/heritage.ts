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
import { destinations } from './content';

/* -------------------------------------------------------------------------- */
/*  Heritage site — a landmark or protected area within a destination.        */
/* -------------------------------------------------------------------------- */

/**
 * A heritage site belongs to exactly one destination, the same tenant
 * boundary every other destination-scoped entity uses (POIs, categories,
 * events). Unlike a POI — which exists to be attached to a scene as a
 * hotspot target — a heritage site is a first-class, independently browsable
 * page: the destination's "what to see here" list.
 */
export const heritageSites = pgTable(
  'heritage_sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 120 }).notNull(),
    status: publicationStatusEnum('status').notNull().default('draft'),

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
    uniqueIndex('heritage_sites_destination_slug_key').on(t.destinationId, t.slug),
    index('heritage_sites_destination_id_idx').on(t.destinationId),
    index('heritage_sites_status_idx').on(t.status),
    check(
      'heritage_sites_latitude_range',
      sql`${t.latitude} IS NULL OR (${t.latitude} BETWEEN -90 AND 90)`,
    ),
    check(
      'heritage_sites_longitude_range',
      sql`${t.longitude} IS NULL OR (${t.longitude} BETWEEN -180 AND 180)`,
    ),
  ],
);

export const heritageSiteTranslations = pgTable(
  'heritage_site_translations',
  {
    heritageSiteId: uuid('heritage_site_id')
      .notNull()
      .references(() => heritageSites.id, { onDelete: 'cascade' }),
    locale: localeColumn(),
    title: text('title').notNull(),
    /** One or two sentences, shown on cards and in listings. */
    shortDescription: text('short_description'),
    /** Full body — history, significance, visiting notes. */
    description: text('description'),
  },
  (t) => [primaryKey({ columns: [t.heritageSiteId, t.locale] })],
);

export const heritageSiteMedia = pgTable(
  'heritage_site_media',
  {
    heritageSiteId: uuid('heritage_site_id')
      .notNull()
      .references(() => heritageSites.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    role: mediaRoleEnum('role').notNull().default('gallery'),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.heritageSiteId, t.mediaId, t.role] }),
    index('heritage_site_media_heritage_site_id_idx').on(t.heritageSiteId),
  ],
);

export type HeritageSite = typeof heritageSites.$inferSelect;
