import type { Translator } from '@/lib/i18n';

/**
 * An embedded Sketchfab 3D scan.
 *
 * Deliberately not a download-and-host: the underlying models are usually
 * "all rights reserved" work by a documentation team (photogrammetry of a
 * heritage site is expensive, specialised fieldwork), and Sketchfab's own
 * embed is the licensed way to show one. The `src` is built from a validated
 * bare id — see `destinations.sketchfabModelId` — so this component can never
 * be made to frame anything other than a Sketchfab model.
 *
 * `allow`/`allowFullScreen` match Sketchfab's own published embed code
 * exactly, including `xr-spatial-tracking` for headset viewing.
 */
export function Model3DEmbed({
  modelId,
  title,
  t,
}: {
  modelId: string;
  title: string;
  t: Translator;
}) {
  return (
    <section>
      <h2 className="eyebrow mb-4">{t('destination.model3dTitle')}</h2>
      <div className="overflow-hidden rounded-md border border-[var(--hairline)] bg-stone">
        <div className="aspect-video">
          <iframe
            title={title}
            src={`https://sketchfab.com/models/${modelId}/embed`}
            className="h-full w-full"
            frameBorder="0"
            allow="autoplay; fullscreen; xr-spatial-tracking"
            allowFullScreen
          />
        </div>
      </div>
      <p className="mt-3 text-xs text-lime-faint">
        {t('destination.model3dCredit')}{' '}
        <a
          href={`https://sketchfab.com/3d-models/${modelId}`}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="underline decoration-dotted underline-offset-2 transition-colors hover:text-lime"
        >
          Sketchfab ↗
        </a>
      </p>
    </section>
  );
}
