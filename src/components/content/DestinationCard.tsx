import Link from 'next/link';
import type { DestinationCardDTO } from '@/lib/content/types';
import type { AppLocale } from '@/lib/i18n';
import { formatCount } from '@/lib/i18n';
import { buildSrcSet } from '@/lib/media/srcset';

/**
 * A destination, as a card.
 *
 * The counts are a promise about depth — "eleven scenes, six points of
 * interest" tells a visitor whether this is worth their next ten minutes far
 * better than a paragraph of prose does. They are set in the data face,
 * because they are data.
 */
export function DestinationCard({
  destination,
  locale,
}: {
  destination: DestinationCardDTO;
  locale: AppLocale;
}) {
  return (
    <Link
      href={`/${locale}/destinations/${destination.slug}`}
      className="group block focus-visible:outline-offset-4"
    >
      <div className="relative aspect-4/3 overflow-hidden rounded-md border border-[var(--hairline)] bg-stone">
        {destination.cover ? (
          <img
            src={destination.cover.src}
            srcSet={buildSrcSet(destination.cover.sources)}
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
            alt={destination.cover.alt ?? ''}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-[1.04]"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-stone-2 to-ink" />
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[color-mix(in_oklab,var(--color-ink)_75%,transparent)] to-transparent opacity-70 transition-opacity group-hover:opacity-90" />
      </div>

      <div className="pt-4">
        <h3 className="display text-xl text-lime transition-colors group-hover:text-verdigris-bright">
          {destination.name}
        </h3>
        {destination.tagline && (
          <p className="mt-1 text-sm text-lime-dim">{destination.tagline}</p>
        )}

        <p className="readout mt-3 flex items-center gap-3">
          <span>{formatCount(locale, 'tours', destination.tourCount)}</span>
          <span aria-hidden="true" className="text-lime-faint">
            ·
          </span>
          <span>{formatCount(locale, 'pois', destination.poiCount)}</span>
        </p>
      </div>
    </Link>
  );
}
