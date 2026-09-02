import type { AppLocale, Direction } from '../i18n/config';

/**
 * Data transfer objects for the visitor experience.
 *
 * These are the *only* shapes that cross from the server to the browser. They
 * are deliberately not the database row types: internal columns (status,
 * timestamps, storage keys, uploader ids) never leave the server, and every
 * string here is already resolved to the visitor's locale.
 */

export type TourKind = 'panorama' | 'image' | 'map' | 'story';
export type SceneKind = TourKind;

export type HotspotActionType =
  | 'navigate'
  | 'poi'
  | 'info'
  | 'image'
  | 'gallery'
  | 'video'
  | 'audio'
  | 'event'
  | 'link';

export type MediaKind = 'image' | 'panorama' | 'video' | 'audio';

/** One responsive source for a media asset. */
export type MediaSource = {
  url: string;
  width: number | null;
  height: number | null;
  mimeType: string;
};

export type MediaDTO = {
  id: string;
  kind: MediaKind;
  /** Best default source; `sources` carries the responsive set. */
  src: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  /**
   * Inline blurred placeholder (a data URI of a few hundred bytes) so a scene
   * paints before the full asset arrives.
   */
  previewDataUri: string | null;
  sources: MediaSource[];
  /** Locale-resolved. `alt: null` marks the image as decorative. */
  alt: string | null;
  caption: string | null;
  transcript: string | null;
};

export type HotspotDTO = {
  id: string;
  actionType: HotspotActionType;
  /** Validated against the action registry's schema before it is sent. */
  payload: Record<string, unknown>;
  /** Spherical placement, for panorama scenes. */
  yawDeg: number | null;
  pitchDeg: number | null;
  /** Normalized 0..1 placement, for flat scenes. */
  x: number | null;
  y: number | null;
  icon: string;
  style: string;
  label: string;
  description: string | null;
};

/** Initial camera for a panorama scene. */
export type PanoramaView = {
  yaw: number;
  pitch: number;
  fov: number;
  minFov: number;
  maxFov: number;
};

/** Initial viewport for a flat image scene. */
export type ImageView = {
  zoom: number;
  cx: number;
  cy: number;
};

export type SceneDTO = {
  id: string;
  slug: string;
  kind: SceneKind;
  title: string;
  summary: string | null;
  description: string | null;
  background: MediaDTO | null;
  thumbnail: MediaDTO | null;
  audio: MediaDTO | null;
  /** Renderer-specific; parsed by the renderer's own schema. */
  view: Record<string, unknown>;
  northOffsetDeg: number;
  hotspots: HotspotDTO[];
  /** Scene ids reachable in one hop — drives prefetching and the scene list. */
  linkedSceneIds: string[];
  poiIds: string[];
  position: number;
};

export type PoiDTO = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  description: string | null;
  historicalInfo: string | null;
  category: { id: string; slug: string; name: string; color: string; icon: string } | null;
  cover: MediaDTO | null;
  media: MediaDTO[];
  tags: string[];
  latitude: number | null;
  longitude: number | null;
};

export type EventSummaryDTO = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  cover: MediaDTO | null;
};

export type TourSettings = {
  autoRotate: boolean;
  autoRotateSpeed: number;
  showCompass: boolean;
  showSceneList: boolean;
  showHotspotLabels: boolean;
};

export const DEFAULT_TOUR_SETTINGS: TourSettings = {
  autoRotate: false,
  autoRotateSpeed: 0.35,
  showCompass: true,
  showSceneList: true,
  showHotspotLabels: true,
};

/**
 * Everything the client needs to run a tour, fetched once.
 *
 * Scene-to-scene navigation is then a texture load rather than a round trip,
 * which is what makes movement inside a tour feel immediate.
 */
export type TourManifest = {
  locale: AppLocale;
  direction: Direction;
  tour: {
    id: string;
    slug: string;
    kind: TourKind;
    title: string;
    summary: string | null;
    description: string | null;
    welcomeMessage: string | null;
    estimatedMinutes: number | null;
    settings: TourSettings;
  };
  destination: {
    id: string;
    slug: string;
    name: string;
    tagline: string | null;
  };
  startSceneId: string;
  scenes: SceneDTO[];
  /** Every POI referenced by a hotspot, resolved once and shared. */
  pois: PoiDTO[];
  /** Events referenced by hotspots. */
  events: EventSummaryDTO[];
};
