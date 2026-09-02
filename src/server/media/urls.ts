import type { MediaAsset, MediaVariant } from '../db/schema';
import type { MediaDTO, MediaSource } from '@/lib/tour/types';
import { getStorage } from './storage';

/**
 * Turns a stored media row into the shape the browser receives.
 *
 * This is the boundary where internal facts stop: storage keys, checksums,
 * uploader ids and byte sizes stay on the server, and the client gets URLs and
 * the metadata it needs to render responsibly.
 */

/**
 * Public URL for one object. Falls back to the proxying media route when the
 * driver has no directly fetchable URL (which is the case for local storage,
 * by design).
 */
export function mediaUrl(storageKey: string): string {
  return getStorage().publicUrl(storageKey) ?? `/media/${storageKey}`;
}

/** Variants that are alternative *sizes* rather than special-purpose renditions. */
const RESPONSIVE_PREFIX = 'w';

function toSource(variant: MediaVariant): MediaSource {
  return {
    url: mediaUrl(variant.storageKey),
    width: variant.width,
    height: variant.height,
    mimeType: variant.mimeType,
  };
}

export type MediaTranslationFields = {
  altText: string | null;
  caption: string | null;
  transcript: string | null;
};

/**
 * Chooses the default `src`.
 *
 * Panoramas take the largest variant that every mobile GPU can hold as a
 * texture; other images take the largest responsive rendition. The full-size
 * original is only used when nothing else exists, because shipping a 40 MP
 * source to a phone is never the right default.
 */
function pickDefaultSource(asset: MediaAsset): string {
  const responsive = asset.variants
    .filter((v) => v.name.startsWith(RESPONSIVE_PREFIX) && v.width !== null)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));

  if (asset.kind === 'panorama') {
    const half = asset.variants.find((v) => v.name === 'half');
    if (half) return mediaUrl(half.storageKey);
  }

  const largest = responsive[0];
  if (largest) return mediaUrl(largest.storageKey);
  return mediaUrl(asset.storageKey);
}

export function toMediaDTO(
  asset: MediaAsset,
  translation?: Partial<MediaTranslationFields> | null,
): MediaDTO {
  const sources = asset.variants
    .filter((v) => v.name.startsWith(RESPONSIVE_PREFIX))
    .map(toSource)
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0));

  return {
    id: asset.id,
    kind: asset.kind,
    src: pickDefaultSource(asset),
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    durationSeconds: asset.durationSeconds,
    previewDataUri: asset.previewDataUri,
    sources,
    // An empty string is a deliberate "decorative"; `null` means "not yet
    // written". Both render as an empty alt, but only the latter is a gap the
    // translation view should flag.
    alt: translation?.altText ?? null,
    caption: translation?.caption ?? null,
    transcript: translation?.transcript ?? null,
  };
}

/** Builds a `srcset` string from a DTO's responsive sources. */
export function toSrcSet(media: Pick<MediaDTO, 'sources'>): string | undefined {
  const withWidths = media.sources.filter((s) => s.width !== null);
  if (withWidths.length === 0) return undefined;
  return withWidths.map((s) => `${s.url} ${s.width}w`).join(', ');
}
