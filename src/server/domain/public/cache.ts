import 'server-only';

import { unstable_cache } from 'next/cache';

/**
 * Caching for visitor-facing reads.
 *
 * The obvious alternative — `export const revalidate` on each page — makes
 * Next prerender those pages during `next build`, which means **the build
 * needs the production database**. That is a genuine problem, not just CI
 * friction: it hands the build system credentials to production data purely so
 * it can render a homepage.
 *
 * Caching at the data layer instead gives the same result without the
 * coupling. Pages render on request, the underlying query is cached across
 * requests and across instances, and the build is hermetic.
 *
 * It is also more precise. Time-based page revalidation means an editor
 * publishes and then waits; tags mean the publish itself clears exactly what
 * changed, and nothing else.
 */

/** Cache tags. Publishing anything clears the tags it could affect. */
export const CACHE_TAGS = {
  destinations: 'destinations',
  tours: 'tours',
  events: 'events',
  media: 'media',
  /** Everything a visitor can see. The blunt instrument, for deletes. */
  content: 'content',
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

/**
 * A ceiling, not the primary mechanism.
 *
 * Invalidation is by tag; this only bounds how long a stale entry could
 * survive if a tag were ever missed.
 */
const MAX_AGE_SECONDS = 300;

/**
 * Wraps a read function in the data cache.
 *
 * `keyParts` must capture every argument that changes the result — the locale
 * above all. Forgetting it would serve an Arabic visitor the English page,
 * which is the kind of bug that only shows up in production and only for some
 * people.
 */
export function cachedRead<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[],
  tags: CacheTag[],
): (...args: Args) => Promise<Result> {
  return unstable_cache(fn, keyParts, {
    tags: [...tags, CACHE_TAGS.content],
    revalidate: MAX_AGE_SECONDS,
  });
}
