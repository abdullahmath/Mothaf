import Link from 'next/link';
import type { EventCardDTO } from '@/lib/content/types';
import { formatDateRange, type AppLocale, type Translator } from '@/lib/i18n';
import { buildSrcSet } from '@/lib/media/srcset';

/**
 * An event or festival.
 *
 * Saffron appears here and nowhere else in the product. It marks content that
 * is time-bound, so "on now" is legible before any text is read — a colour
 * doing a semantic job rather than a decorative one.
 */
export function EventCard({
  event,
  locale,
  t,
}: {
  event: EventCardDTO;
  locale: AppLocale;
  t: Translator;
}) {
  const phaseLabel =
    event.phase === 'current'
      ? t('events.onNow')
      : event.phase === 'upcoming'
        ? t('events.upcoming')
        : t('events.past');

  return (
    <Link
      href={`/${locale}/destinations/${event.destinationSlug}/events/${event.slug}`}
      className="group flex gap-4 rounded-md border border-[var(--hairline)] p-3 transition-colors hover:border-[color-mix(in_oklab,var(--color-saffron)_45%,transparent)]"
    >
      <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-sm bg-stone">
        {event.cover ? (
          <img
            src={event.cover.src}
            srcSet={buildSrcSet(event.cover.sources)}
            sizes="96px"
            alt={event.cover.alt ?? ''}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-stone-2 to-ink" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className="text-2xs font-medium uppercase tracking-widest"
          style={{
            color: event.phase === 'past' ? 'var(--color-lime-faint)' : 'var(--color-saffron)',
          }}
        >
          {phaseLabel}
        </p>
        <h3 className="mt-1 truncate text-base text-lime transition-colors group-hover:text-saffron">
          {event.title}
        </h3>
        <p className="readout mt-1">
          {formatDateRange(locale, event.startsAt, event.endsAt, event.timezone)}
        </p>
        <p className="mt-1 truncate text-sm text-lime-faint">{event.destinationName}</p>
      </div>
    </Link>
  );
}
