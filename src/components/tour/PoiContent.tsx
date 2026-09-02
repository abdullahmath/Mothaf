'use client';

import type { PoiDTO } from '@/lib/tour/types';
import type { AppLocale, Translator } from '@/lib/i18n';
import { MediaFigure } from './MediaFigure';

/**
 * A point of interest, as shown inside the tour panel.
 *
 * The historical note is kept visually distinct from the description because
 * it answers a different question — "what am I looking at" versus "what
 * happened here" — and a visitor skimming for one should not have to read the
 * other.
 */
export function PoiContent({
  poi,
  t,
}: {
  poi: PoiDTO;
  t: Translator;
  locale: AppLocale;
}) {
  return (
    <div className="grid gap-6">
      {poi.cover && <MediaFigure media={poi.cover} t={t} />}

      {poi.shortDescription && (
        <p className="text-lg leading-relaxed text-lime">{poi.shortDescription}</p>
      )}

      {poi.description && (
        <section>
          <h3 className="eyebrow mb-2">{t('poi.aboutTitle')}</h3>
          <div className="prose-body">
            {poi.description.split('\n\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </section>
      )}

      {poi.historicalInfo && (
        <section className="border-s-2 border-verdigris-deep ps-4">
          <h3 className="eyebrow mb-2">{t('poi.historyTitle')}</h3>
          <div className="prose-body">
            {poi.historicalInfo.split('\n\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </section>
      )}

      {poi.media.length > 0 && (
        <section>
          <h3 className="eyebrow mb-3">{t('poi.galleryTitle')}</h3>
          <div className="grid gap-4">
            {poi.media.map((media) => (
              <MediaFigure key={media.id} media={media} t={t} />
            ))}
          </div>
        </section>
      )}

      {poi.tags.length > 0 && (
        <ul className="flex flex-wrap gap-2 pt-2">
          {poi.tags.map((tag) => (
            <li key={tag} className="chip">
              {tag}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
