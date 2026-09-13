'use client';

import { getTranslator, type AppLocale } from '@/lib/i18n';
import type { MediaDTO } from '@/lib/tour/types';
import { MediaFigure } from './MediaFigure';

/**
 * An event's media gallery.
 *
 * The translator is built here, client-side, from the serializable `locale`
 * string — not passed in as a function prop. React server components cannot
 * hand a function to a client component, so the event page (a server
 * component) crashed for any event with gallery media before this existed.
 */
export function EventGallery({ locale, items }: { locale: AppLocale; items: MediaDTO[] }) {
  const t = getTranslator(locale);
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {items.map((media) => (
        <MediaFigure key={media.id} media={media} t={t} />
      ))}
    </div>
  );
}
