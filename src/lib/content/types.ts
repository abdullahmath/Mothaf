import type { MediaDTO } from '../tour/types';

/**
 * DTOs for the browsing surfaces — home, destination and event pages.
 *
 * Kept apart from the tour manifest types: the manifest is a bulk payload the
 * viewer runs on, while these are small, page-scoped shapes. Sharing one type
 * would drag scene and hotspot data into a listing page that has no use for it.
 */

export type DestinationCardDTO = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  summary: string | null;
  cover: MediaDTO | null;
  tourCount: number;
  poiCount: number;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type TourCardDTO = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  kind: 'panorama' | 'image' | 'map' | 'story';
  cover: MediaDTO | null;
  sceneCount: number;
  estimatedMinutes: number | null;
};

export type EventCardDTO = {
  id: string;
  slug: string;
  destinationSlug: string;
  destinationName: string;
  title: string;
  summary: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  cover: MediaDTO | null;
  /** Derived at read time from the current instant. */
  phase: 'upcoming' | 'current' | 'past';
};

export type ScheduleItemDTO = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  title: string;
  description: string | null;
  performer: string | null;
  location: string | null;
};

export type EventDetailDTO = EventCardDTO & {
  description: string | null;
  organizer: string | null;
  venue: string | null;
  admissionInfo: string | null;
  schedule: ScheduleItemDTO[];
  gallery: MediaDTO[];
  tour: { slug: string; title: string } | null;
  latitude: number | null;
  longitude: number | null;
};

export type PoiCardDTO = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  cover: MediaDTO | null;
  category: { slug: string; name: string; color: string; icon: string } | null;
};

export type DestinationPageDTO = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  summary: string | null;
  description: string | null;
  historicalContext: string | null;
  cover: MediaDTO | null;
  latitude: number | null;
  longitude: number | null;
  countryCode: string | null;
  tours: TourCardDTO[];
  pois: PoiCardDTO[];
  events: EventCardDTO[];
};

/** Classifies an event against the current instant. */
export function eventPhase(startsAt: Date, endsAt: Date, now = new Date()): EventCardDTO['phase'] {
  if (now < startsAt) return 'upcoming';
  if (now > endsAt) return 'past';
  return 'current';
}
