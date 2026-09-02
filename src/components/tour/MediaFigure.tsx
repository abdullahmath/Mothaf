'use client';

import { useState } from 'react';
import type { MediaDTO } from '@/lib/tour/types';
import type { Translator } from '@/lib/i18n';
import { buildSrcSet } from '@/lib/media/srcset';

/**
 * Renders one media asset with the accessibility affordances its type needs.
 *
 * `alt === null` means nobody has written alt text yet, which is a content
 * gap; `alt === ''` is a deliberate "this image is decorative". Both render an
 * empty `alt` attribute, but only the first is worth flagging in the admin.
 *
 * Audio and video always offer their transcript, and it is real text in the
 * page rather than a download — a transcript nobody can read in place is not
 * much of a transcript.
 */
export function MediaFigure({ media, t }: { media: MediaDTO; t: Translator }) {
  const [showTranscript, setShowTranscript] = useState(false);

  const transcript = media.transcript && (
    <div className="mt-3">
      <button
        type="button"
        className="btn btn-quiet px-3 text-xs"
        onClick={() => setShowTranscript((value) => !value)}
        aria-expanded={showTranscript}
      >
        {showTranscript ? t('media.hideTranscript') : t('media.showTranscript')}
      </button>
      {showTranscript && <p className="prose-body mt-3 text-sm">{media.transcript}</p>}
    </div>
  );

  if (media.kind === 'audio') {
    return (
      <figure>
        <audio controls preload="none" className="w-full" src={media.src}>
          {t('media.audio')}
        </audio>
        {media.caption && (
          <figcaption className="mt-2 text-sm text-lime-dim">{media.caption}</figcaption>
        )}
        {transcript}
      </figure>
    );
  }

  if (media.kind === 'video') {
    return (
      <figure>
        <video
          controls
          preload="metadata"
          playsInline
          poster={media.previewDataUri ?? undefined}
          className="w-full rounded-md"
          src={media.src}
        >
          {t('media.video')}
        </video>
        {media.caption && (
          <figcaption className="mt-2 text-sm text-lime-dim">{media.caption}</figcaption>
        )}
        {transcript}
      </figure>
    );
  }

  const srcSet = buildSrcSet(media.sources);

  return (
    <figure>
      <img
        src={media.src}
        srcSet={srcSet}
        sizes="(min-width: 768px) 40vw, 92vw"
        alt={media.alt ?? ''}
        width={media.width ?? undefined}
        height={media.height ?? undefined}
        loading="lazy"
        decoding="async"
        className="w-full rounded-md bg-stone"
        style={
          // The blurred placeholder occupies the space while the real image
          // arrives, so the panel does not reflow around it.
          media.previewDataUri
            ? {
                backgroundImage: `url(${media.previewDataUri})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      />
      {media.caption && (
        <figcaption className="mt-2 text-sm text-lime-dim">{media.caption}</figcaption>
      )}
    </figure>
  );
}
