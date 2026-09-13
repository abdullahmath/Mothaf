import { relations } from 'drizzle-orm';
import { users, sessions } from './auth';
import { mediaAssets, mediaTranslations } from './media';
import {
  destinations,
  destinationTranslations,
  hotspots,
  hotspotTranslations,
  sceneLinks,
  sceneMedia,
  scenes,
  sceneTranslations,
  tours,
  tourTranslations,
} from './content';
import {
  poiCategories,
  poiCategoryTranslations,
  poiMedia,
  poiTranslations,
  pointsOfInterest,
  scenePois,
} from './poi';
import { heritageSiteMedia, heritageSiteTranslations, heritageSites } from './heritage';
import {
  eventMedia,
  events,
  eventScheduleItems,
  eventScheduleItemTranslations,
  eventTranslations,
} from './events';

/**
 * Relation metadata for Drizzle's relational query API.
 *
 * This is what lets a repository load a whole tour — scenes, their
 * translations, hotspots, and media — in one round trip instead of the N+1
 * cascade a naive per-entity fetch would produce.
 */

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  uploadedMedia: many(mediaAssets),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const mediaAssetsRelations = relations(mediaAssets, ({ one, many }) => ({
  uploader: one(users, { fields: [mediaAssets.createdBy], references: [users.id] }),
  translations: many(mediaTranslations),
}));

export const mediaTranslationsRelations = relations(mediaTranslations, ({ one }) => ({
  media: one(mediaAssets, { fields: [mediaTranslations.mediaId], references: [mediaAssets.id] }),
}));

export const destinationsRelations = relations(destinations, ({ one, many }) => ({
  translations: many(destinationTranslations),
  tours: many(tours),
  pois: many(pointsOfInterest),
  poiCategories: many(poiCategories),
  heritageSites: many(heritageSites),
  events: many(events),
  coverMedia: one(mediaAssets, {
    fields: [destinations.coverMediaId],
    references: [mediaAssets.id],
  }),
}));

export const destinationTranslationsRelations = relations(destinationTranslations, ({ one }) => ({
  destination: one(destinations, {
    fields: [destinationTranslations.destinationId],
    references: [destinations.id],
  }),
}));

export const toursRelations = relations(tours, ({ one, many }) => ({
  destination: one(destinations, {
    fields: [tours.destinationId],
    references: [destinations.id],
  }),
  translations: many(tourTranslations),
  scenes: many(scenes),
  events: many(events),
  coverMedia: one(mediaAssets, { fields: [tours.coverMediaId], references: [mediaAssets.id] }),
}));

export const tourTranslationsRelations = relations(tourTranslations, ({ one }) => ({
  tour: one(tours, { fields: [tourTranslations.tourId], references: [tours.id] }),
}));

export const scenesRelations = relations(scenes, ({ one, many }) => ({
  tour: one(tours, { fields: [scenes.tourId], references: [tours.id] }),
  translations: many(sceneTranslations),
  hotspots: many(hotspots),
  media: many(sceneMedia),
  pois: many(scenePois),
  outgoingLinks: many(sceneLinks, { relationName: 'sceneLinkFrom' }),
  incomingLinks: many(sceneLinks, { relationName: 'sceneLinkTo' }),
  backgroundMedia: one(mediaAssets, {
    fields: [scenes.backgroundMediaId],
    references: [mediaAssets.id],
    relationName: 'sceneBackgroundMedia',
  }),
  thumbnailMedia: one(mediaAssets, {
    fields: [scenes.thumbnailMediaId],
    references: [mediaAssets.id],
    relationName: 'sceneThumbnailMedia',
  }),
  audioMedia: one(mediaAssets, {
    fields: [scenes.audioMediaId],
    references: [mediaAssets.id],
    relationName: 'sceneAudioMedia',
  }),
}));

export const sceneTranslationsRelations = relations(sceneTranslations, ({ one }) => ({
  scene: one(scenes, { fields: [sceneTranslations.sceneId], references: [scenes.id] }),
}));

export const sceneLinksRelations = relations(sceneLinks, ({ one }) => ({
  from: one(scenes, {
    fields: [sceneLinks.fromSceneId],
    references: [scenes.id],
    relationName: 'sceneLinkFrom',
  }),
  to: one(scenes, {
    fields: [sceneLinks.toSceneId],
    references: [scenes.id],
    relationName: 'sceneLinkTo',
  }),
}));

export const hotspotsRelations = relations(hotspots, ({ one, many }) => ({
  scene: one(scenes, { fields: [hotspots.sceneId], references: [scenes.id] }),
  translations: many(hotspotTranslations),
}));

export const hotspotTranslationsRelations = relations(hotspotTranslations, ({ one }) => ({
  hotspot: one(hotspots, { fields: [hotspotTranslations.hotspotId], references: [hotspots.id] }),
}));

export const sceneMediaRelations = relations(sceneMedia, ({ one }) => ({
  scene: one(scenes, { fields: [sceneMedia.sceneId], references: [scenes.id] }),
  media: one(mediaAssets, { fields: [sceneMedia.mediaId], references: [mediaAssets.id] }),
}));

export const poiCategoriesRelations = relations(poiCategories, ({ one, many }) => ({
  destination: one(destinations, {
    fields: [poiCategories.destinationId],
    references: [destinations.id],
  }),
  translations: many(poiCategoryTranslations),
  pois: many(pointsOfInterest),
}));

export const poiCategoryTranslationsRelations = relations(poiCategoryTranslations, ({ one }) => ({
  category: one(poiCategories, {
    fields: [poiCategoryTranslations.categoryId],
    references: [poiCategories.id],
  }),
}));

export const pointsOfInterestRelations = relations(pointsOfInterest, ({ one, many }) => ({
  destination: one(destinations, {
    fields: [pointsOfInterest.destinationId],
    references: [destinations.id],
  }),
  category: one(poiCategories, {
    fields: [pointsOfInterest.categoryId],
    references: [poiCategories.id],
  }),
  coverMedia: one(mediaAssets, {
    fields: [pointsOfInterest.coverMediaId],
    references: [mediaAssets.id],
  }),
  translations: many(poiTranslations),
  media: many(poiMedia),
  scenes: many(scenePois),
}));

export const poiTranslationsRelations = relations(poiTranslations, ({ one }) => ({
  poi: one(pointsOfInterest, {
    fields: [poiTranslations.poiId],
    references: [pointsOfInterest.id],
  }),
}));

export const poiMediaRelations = relations(poiMedia, ({ one }) => ({
  poi: one(pointsOfInterest, { fields: [poiMedia.poiId], references: [pointsOfInterest.id] }),
  media: one(mediaAssets, { fields: [poiMedia.mediaId], references: [mediaAssets.id] }),
}));

export const scenePoisRelations = relations(scenePois, ({ one }) => ({
  scene: one(scenes, { fields: [scenePois.sceneId], references: [scenes.id] }),
  poi: one(pointsOfInterest, { fields: [scenePois.poiId], references: [pointsOfInterest.id] }),
}));

export const heritageSitesRelations = relations(heritageSites, ({ one, many }) => ({
  destination: one(destinations, {
    fields: [heritageSites.destinationId],
    references: [destinations.id],
  }),
  coverMedia: one(mediaAssets, {
    fields: [heritageSites.coverMediaId],
    references: [mediaAssets.id],
  }),
  translations: many(heritageSiteTranslations),
  media: many(heritageSiteMedia),
}));

export const heritageSiteTranslationsRelations = relations(heritageSiteTranslations, ({ one }) => ({
  heritageSite: one(heritageSites, {
    fields: [heritageSiteTranslations.heritageSiteId],
    references: [heritageSites.id],
  }),
}));

export const heritageSiteMediaRelations = relations(heritageSiteMedia, ({ one }) => ({
  heritageSite: one(heritageSites, {
    fields: [heritageSiteMedia.heritageSiteId],
    references: [heritageSites.id],
  }),
  media: one(mediaAssets, { fields: [heritageSiteMedia.mediaId], references: [mediaAssets.id] }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  destination: one(destinations, {
    fields: [events.destinationId],
    references: [destinations.id],
  }),
  tour: one(tours, { fields: [events.tourId], references: [tours.id] }),
  coverMedia: one(mediaAssets, { fields: [events.coverMediaId], references: [mediaAssets.id] }),
  translations: many(eventTranslations),
  scheduleItems: many(eventScheduleItems),
  media: many(eventMedia),
}));

export const eventTranslationsRelations = relations(eventTranslations, ({ one }) => ({
  event: one(events, { fields: [eventTranslations.eventId], references: [events.id] }),
}));

export const eventScheduleItemsRelations = relations(eventScheduleItems, ({ one, many }) => ({
  event: one(events, { fields: [eventScheduleItems.eventId], references: [events.id] }),
  scene: one(scenes, { fields: [eventScheduleItems.sceneId], references: [scenes.id] }),
  translations: many(eventScheduleItemTranslations),
}));

export const eventScheduleItemTranslationsRelations = relations(
  eventScheduleItemTranslations,
  ({ one }) => ({
    item: one(eventScheduleItems, {
      fields: [eventScheduleItemTranslations.itemId],
      references: [eventScheduleItems.id],
    }),
  }),
);

export const eventMediaRelations = relations(eventMedia, ({ one }) => ({
  event: one(events, { fields: [eventMedia.eventId], references: [events.id] }),
  media: one(mediaAssets, { fields: [eventMedia.mediaId], references: [mediaAssets.id] }),
}));
