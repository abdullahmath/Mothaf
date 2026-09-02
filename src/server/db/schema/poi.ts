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
import { destinations, scenes } from './content';

/* -------------------------------------------------------------------------- */
/*  Categories — editor-defined taxonomy, not a hardcoded enum.               */
/* -------------------------------------------------------------------------- */

export const poiCategories = pgTable(
  'poi_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 120 }).notNull(),
    /** Hex colour used for markers and filter chips. */
    color: varchar('color', { length: 9 }).notNull().default('#B4884B'),
    icon: varchar('icon', { length: 48 }).notNull().default('marker'),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    uniqueIndex('poi_categories_destination_slug_key').on(t.destinationId, t.slug),
    check('poi_categories_color_hex', sql`${t.color} ~ '^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$'`),
  ],
);

export const poiCategoryTranslations = pgTable(
  'poi_category_translations',
  {
    categoryId: uuid('category_id')
      .notNull()
      .references(() => poiCategories.id, { onDelete: 'cascade' }),
    locale: localeColumn(),
    name: text('name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.locale] })],
);

/* -------------------------------------------------------------------------- */
/*  Point of interest                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A POI belongs to the *destination*, not to a scene — the stage of a theatre
 * is a fact about the place, and several scenes may show it from different
 * angles. Scenes attach POIs through `scenePois`, many-to-many.
 */
export const pointsOfInterest = pgTable(
  'points_of_interest',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => poiCategories.id, {
      onDelete: 'set null',
    }),
    slug: varchar('slug', { length: 120 }).notNull(),
    status: publicationStatusEnum('status').notNull().default('draft'),

    coverMediaId: uuid('cover_media_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),

    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),

    /** Locale-independent keys; display labels come from translations. */
    tags: text('tags').array().notNull().default(sql`ARRAY[]::text[]`),

    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('pois_destination_slug_key').on(t.destinationId, t.slug),
    index('pois_destination_id_idx').on(t.destinationId),
    index('pois_category_id_idx').on(t.categoryId),
    index('pois_status_idx').on(t.status),
  ],
);

export const poiTranslations = pgTable(
  'poi_translations',
  {
    poiId: uuid('poi_id')
      .notNull()
      .references(() => pointsOfInterest.id, { onDelete: 'cascade' }),
    locale: localeColumn(),
    title: text('title').notNull(),
    /** One or two sentences, shown in the hotspot preview card. */
    shortDescription: text('short_description'),
    /** Full body, rendered as rich text in the detail panel. */
    description: text('description'),
    /** Dates, excavation notes, provenance — kept apart so it can be styled. */
    historicalInfo: text('historical_info'),
  },
  (t) => [primaryKey({ columns: [t.poiId, t.locale] })],
);

export const poiMedia = pgTable(
  'poi_media',
  {
    poiId: uuid('poi_id')
      .notNull()
      .references(() => pointsOfInterest.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    role: mediaRoleEnum('role').notNull().default('gallery'),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.poiId, t.mediaId, t.role] }),
    index('poi_media_poi_id_idx').on(t.poiId),
  ],
);

/** Which POIs are visible from which scene. */
export const scenePois = pgTable(
  'scene_pois',
  {
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    poiId: uuid('poi_id')
      .notNull()
      .references(() => pointsOfInterest.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.sceneId, t.poiId] }),
    index('scene_pois_scene_id_idx').on(t.sceneId),
    index('scene_pois_poi_id_idx').on(t.poiId),
  ],
);

export type PointOfInterest = typeof pointsOfInterest.$inferSelect;
export type PoiCategory = typeof poiCategories.$inferSelect;
