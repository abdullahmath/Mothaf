import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { analyticsEventEnum, deviceClassEnum } from './enums';
import { destinations, hotspots, scenes, tours } from './content';
import { pointsOfInterest } from './poi';

/**
 * Append-only analytics stream.
 *
 * What is deliberately absent is as important as what is present: no IP
 * address, no user-agent string, no cookie identifier, no referrer, no
 * geolocation. `visitorHash` is a salted hash whose salt rotates every 24 h and
 * is then discarded, so two days of data cannot be joined into a profile even
 * by someone holding the database.
 */
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    type: analyticsEventEnum('type').notNull(),

    // Nullable because not every event type has every dimension. All are
    // `set null` on delete: analytics must survive content being removed, but
    // must never resurrect a dangling reference.
    destinationId: uuid('destination_id').references(() => destinations.id, {
      onDelete: 'set null',
    }),
    tourId: uuid('tour_id').references(() => tours.id, { onDelete: 'set null' }),
    sceneId: uuid('scene_id').references(() => scenes.id, { onDelete: 'set null' }),
    poiId: uuid('poi_id').references(() => pointsOfInterest.id, { onDelete: 'set null' }),
    hotspotId: uuid('hotspot_id').references(() => hotspots.id, { onDelete: 'set null' }),

    locale: varchar('locale', { length: 10 }),
    deviceClass: deviceClassEnum('device_class').notNull().default('unknown'),

    /** Daily-rotating salted hash. Not reversible, not stable across days. */
    visitorHash: varchar('visitor_hash', { length: 64 }),
    /**
     * Client-generated random id, alive only for one browsing session. Lets us
     * reconstruct a navigation path without identifying anyone.
     */
    sessionId: varchar('session_id', { length: 64 }),

    /** Time spent on the previous scene, for dwell-time reporting. */
    durationMs: integer('duration_ms'),

    /** Small, schema-validated extras. Never free-form client data. */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    index('analytics_events_occurred_at_idx').on(t.occurredAt),
    index('analytics_events_tour_occurred_idx').on(t.tourId, t.occurredAt),
    index('analytics_events_type_idx').on(t.type),
    index('analytics_events_session_idx').on(t.sessionId),
  ],
);

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;
