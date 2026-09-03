import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  hotspotActionEnum,
  mediaRoleEnum,
  publicationStatusEnum,
  sceneKindEnum,
  tourKindEnum,
} from './enums';
import { locales, localeColumn } from './locales';
import { mediaAssets } from './media';

/* -------------------------------------------------------------------------- */
/*  Destination — the top-level place. A site, museum, landmark, or city.      */
/* -------------------------------------------------------------------------- */

export const destinations = pgTable(
  'destinations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** URL segment. Lower-case, hyphenated, immutable once published. */
    slug: varchar('slug', { length: 120 }).notNull(),
    /**
     * Locale used to fill any field a visitor's locale has not translated.
     * Guarantees a visitor never sees an empty title.
     */
    defaultLocale: varchar('default_locale', { length: 10 })
      .notNull()
      .references(() => locales.code, { onUpdate: 'cascade' }),
    status: publicationStatusEnum('status').notNull().default('draft'),

    coverMediaId: uuid('cover_media_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),

    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    /** ISO 3166-1 alpha-2, for grouping and map defaults. */
    countryCode: varchar('country_code', { length: 2 }),

    /**
     * Optional embedded 3D scan, shown on the destination page beside the
     * tour.
     *
     * Stored as a bare Sketchfab model id (32 hex characters), never as a
     * full URL: the embed src is built by the application
     * (`https://sketchfab.com/models/{id}/embed`), so a destination can never
     * be made to iframe an arbitrary origin. The CSP's `frame-src` is scoped
     * to `sketchfab.com` specifically for this.
     *
     * This is a general capability, not a Jableh special-case — any
     * destination may carry one, or none.
     */
    sketchfabModelId: varchar('sketchfab_model_id', { length: 32 }),

    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('destinations_slug_key').on(t.slug),
    index('destinations_status_idx').on(t.status),
    check(
      'destinations_latitude_range',
      sql`${t.latitude} IS NULL OR (${t.latitude} BETWEEN -90 AND 90)`,
    ),
    check(
      'destinations_longitude_range',
      sql`${t.longitude} IS NULL OR (${t.longitude} BETWEEN -180 AND 180)`,
    ),
    // Defence in depth alongside the Zod check on write: even a row inserted
    // outside the application (a migration, a console) cannot carry a value
    // that isn't a bare Sketchfab id.
    check(
      'destinations_sketchfab_model_id_format',
      sql`${t.sketchfabModelId} IS NULL OR (${t.sketchfabModelId} ~ '^[0-9a-fA-F]{32}$')`,
    ),
  ],
);

export const destinationTranslations = pgTable(
  'destination_translations',
  {
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id, { onDelete: 'cascade' }),
    locale: localeColumn(),
    name: text('name').notNull(),
    tagline: text('tagline'),
    summary: text('summary'),
    description: text('description'),
    /** Free-form historical background, rendered as rich text. */
    historicalContext: text('historical_context'),
  },
  (t) => [primaryKey({ columns: [t.destinationId, t.locale] })],
);

/* -------------------------------------------------------------------------- */
/*  Tour — one navigable experience within a destination.                     */
/* -------------------------------------------------------------------------- */

export const tours = pgTable(
  'tours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 120 }).notNull(),
    /** Selects the renderer. See src/lib/tour/renderers.ts */
    kind: tourKindEnum('kind').notNull().default('panorama'),
    status: publicationStatusEnum('status').notNull().default('draft'),

    coverMediaId: uuid('cover_media_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),

    /**
     * Renderer-agnostic presentation options (auto-rotate, compass, show scene
     * list…). Validated by a Zod schema on read; never trusted as-is.
     */
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

    estimatedMinutes: integer('estimated_minutes'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('tours_destination_slug_key').on(t.destinationId, t.slug),
    index('tours_status_idx').on(t.status),
    index('tours_destination_id_idx').on(t.destinationId),
  ],
);

export const tourTranslations = pgTable(
  'tour_translations',
  {
    tourId: uuid('tour_id')
      .notNull()
      .references(() => tours.id, { onDelete: 'cascade' }),
    locale: localeColumn(),
    title: text('title').notNull(),
    summary: text('summary'),
    description: text('description'),
    /** Shown once, on entry, to orient the visitor. */
    welcomeMessage: text('welcome_message'),
  },
  (t) => [primaryKey({ columns: [t.tourId, t.locale] })],
);

/* -------------------------------------------------------------------------- */
/*  Scene — one viewpoint. The unit a visitor occupies at any moment.          */
/* -------------------------------------------------------------------------- */

export const scenes = pgTable(
  'scenes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tourId: uuid('tour_id')
      .notNull()
      .references(() => tours.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 120 }).notNull(),
    kind: sceneKindEnum('kind').notNull().default('panorama'),
    status: publicationStatusEnum('status').notNull().default('draft'),

    /**
     * Exactly one scene per tour may be the entry point. Enforced by a partial
     * unique index below rather than by application discipline.
     */
    isStart: boolean('is_start').notNull().default(false),

    /** Equirectangular source for panorama scenes; flat image otherwise. */
    backgroundMediaId: uuid('background_media_id').references(() => mediaAssets.id, {
      onDelete: 'restrict',
    }),
    thumbnailMediaId: uuid('thumbnail_media_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),
    /** Optional ambient narration that starts with the scene. */
    audioMediaId: uuid('audio_media_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),

    /**
     * Renderer-specific initial camera state. `{yaw,pitch,fov}` for panorama,
     * `{zoom,cx,cy}` for image, `{bounds}` for map. Shape is validated by the
     * renderer's Zod schema at the boundary — it is never read as `any`.
     */
    view: jsonb('view').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    /** Compass offset in degrees, so the panorama's north matches reality. */
    northOffsetDeg: doublePrecision('north_offset_deg').notNull().default(0),

    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('scenes_tour_slug_key').on(t.tourId, t.slug),
    // At most one start scene per tour — a database guarantee, not a hope.
    uniqueIndex('scenes_one_start_per_tour')
      .on(t.tourId)
      .where(sql`${t.isStart}`),
    index('scenes_tour_id_idx').on(t.tourId),
    index('scenes_status_idx').on(t.status),
  ],
);

export const sceneTranslations = pgTable(
  'scene_translations',
  {
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    locale: localeColumn(),
    title: text('title').notNull(),
    summary: text('summary'),
    description: text('description'),
  },
  (t) => [primaryKey({ columns: [t.sceneId, t.locale] })],
);

/**
 * Directed edge of the navigation graph.
 *
 * Kept separate from hotspots because a link is a *structural* fact ("these two
 * places adjoin") while a hotspot is a *presentational* one ("there is a marker
 * here"). Prefetching, the scene list, and connectivity validation all read
 * this table; none of them should have to reverse-engineer hotspot payloads.
 */
export const sceneLinks = pgTable(
  'scene_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromSceneId: uuid('from_scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    toSceneId: uuid('to_scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    uniqueIndex('scene_links_from_to_key').on(t.fromSceneId, t.toSceneId),
    index('scene_links_from_idx').on(t.fromSceneId),
    index('scene_links_to_idx').on(t.toSceneId),
    check('scene_links_no_self_loop', sql`${t.fromSceneId} <> ${t.toSceneId}`),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Hotspot — an interactive marker placed within a scene.                    */
/* -------------------------------------------------------------------------- */

export const hotspots = pgTable(
  'hotspots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),

    /** Dispatched through the action registry, never a switch statement. */
    actionType: hotspotActionEnum('action_type').notNull(),
    /**
     * Action arguments. Shape is owned by the registry entry for `actionType`
     * and validated by its Zod schema on both write and read.
     */
    actionPayload: jsonb('action_payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    // --- Placement --------------------------------------------------------
    // Panorama scenes use spherical coordinates; flat scenes use normalized
    // 2D. Which pair is required is validated per scene kind in the domain
    // layer, and the check constraints below reject impossible values.
    yawDeg: doublePrecision('yaw_deg'),
    pitchDeg: doublePrecision('pitch_deg'),
    x: doublePrecision('x'),
    y: doublePrecision('y'),

    /** Named icon from the shared icon set. */
    icon: varchar('icon', { length: 48 }).notNull().default('dot'),
    /** Visual treatment: `pin` | `pulse` | `label` | `arrow`. */
    style: varchar('style', { length: 24 }).notNull().default('pulse'),
    status: publicationStatusEnum('status').notNull().default('published'),
    position: integer('position').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('hotspots_scene_id_idx').on(t.sceneId),
    check('hotspots_pitch_range', sql`${t.pitchDeg} IS NULL OR (${t.pitchDeg} BETWEEN -90 AND 90)`),
    check('hotspots_yaw_range', sql`${t.yawDeg} IS NULL OR (${t.yawDeg} BETWEEN -360 AND 360)`),
    check('hotspots_x_range', sql`${t.x} IS NULL OR (${t.x} BETWEEN 0 AND 1)`),
    check('hotspots_y_range', sql`${t.y} IS NULL OR (${t.y} BETWEEN 0 AND 1)`),
  ],
);

export const hotspotTranslations = pgTable(
  'hotspot_translations',
  {
    hotspotId: uuid('hotspot_id')
      .notNull()
      .references(() => hotspots.id, { onDelete: 'cascade' }),
    locale: localeColumn(),
    label: text('label').notNull(),
    description: text('description'),
  },
  (t) => [primaryKey({ columns: [t.hotspotId, t.locale] })],
);

/* -------------------------------------------------------------------------- */
/*  Scene ↔ media                                                             */
/* -------------------------------------------------------------------------- */

export const sceneMedia = pgTable(
  'scene_media',
  {
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    role: mediaRoleEnum('role').notNull().default('gallery'),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.sceneId, t.mediaId, t.role] }),
    index('scene_media_scene_id_idx').on(t.sceneId),
  ],
);

export type Destination = typeof destinations.$inferSelect;
export type Tour = typeof tours.$inferSelect;
export type Scene = typeof scenes.$inferSelect;
export type Hotspot = typeof hotspots.$inferSelect;
