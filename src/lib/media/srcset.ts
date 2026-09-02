import type { MediaSource } from '../tour/types';

/**
 * Builds a `srcset` from the responsive renditions the media pipeline
 * produced.
 *
 * Shared between server and client components, so it lives in `lib` rather
 * than beside the server-only URL helpers.
 */
export function buildSrcSet(sources: readonly MediaSource[]): string | undefined {
  const withWidths = sources.filter((source) => source.width !== null);
  if (withWidths.length === 0) return undefined;
  return withWidths
    .slice()
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
    .map((source) => `${source.url} ${source.width}w`)
    .join(', ');
}
