import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Every enum in the system lives here so the set of legal values is visible in
 * one place and enforced by the database rather than by convention.
 */

/** Publication lifecycle shared by every visitor-facing entity. */
export const publicationStatusEnum = pgEnum('publication_status', [
  'draft',
  'published',
  'archived',
]);

/** Administrative roles, ordered from most to least privileged. */
export const userRoleEnum = pgEnum('user_role', [
  'super_admin',
  'administrator',
  'content_editor',
  'event_manager',
  'analyst',
]);

export const userStatusEnum = pgEnum('user_status', ['active', 'suspended']);

/** Selects which renderer drives a tour. See src/lib/tour/renderers.ts */
export const tourKindEnum = pgEnum('tour_kind', [
  'panorama',
  'image',
  'map',
  'story',
]);

/**
 * A scene's own presentation. Usually matches its tour's kind, but a
 * predominantly panoramic tour may legitimately contain a flat image scene
 * (a floor plan, an artefact close-up), so the two are modelled separately.
 */
export const sceneKindEnum = pgEnum('scene_kind', [
  'panorama',
  'image',
  'map',
  'story',
]);

export const mediaKindEnum = pgEnum('media_kind', [
  'image',
  'panorama',
  'video',
  'audio',
]);

/** How a media asset is used by the entity that attaches it. */
export const mediaRoleEnum = pgEnum('media_role', [
  'gallery',
  'narration',
  'video',
  'document',
]);

/**
 * Hotspot behaviours. Each value must have a matching entry in the action
 * registry (src/lib/tour/actions.ts); a test asserts the two stay in sync.
 */
export const hotspotActionEnum = pgEnum('hotspot_action', [
  'navigate',
  'poi',
  'info',
  'image',
  'gallery',
  'video',
  'audio',
  'event',
  'link',
]);

export const analyticsEventEnum = pgEnum('analytics_event', [
  'tour_open',
  'scene_view',
  'hotspot_click',
  'poi_view',
  'media_play',
  'locale_change',
  'tour_complete',
]);

/** Coarse device bucket. Deliberately not a user-agent string. */
export const deviceClassEnum = pgEnum('device_class', [
  'mobile',
  'tablet',
  'desktop',
  'unknown',
]);

export const textDirectionEnum = pgEnum('text_direction', ['ltr', 'rtl']);
