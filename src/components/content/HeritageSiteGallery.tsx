'use client';

import { useEffect, useRef, useState } from 'react';
import type { MediaDTO } from '@/lib/tour/types';
import { buildSrcSet } from '@/lib/media/srcset';

/**
 * A responsive photo grid with a full-screen lightbox.
 *
 * Built on the native `<dialog>` element, the same choice `TourPanel` makes:
 * focus containment, an Escape handler and a real backdrop come for free, so
 * there is no hand-rolled focus trap to get subtly wrong.
 */
export function HeritageSiteGallery({
  items,
  closeLabel,
  previousLabel,
  nextLabel,
}: {
  items: MediaDTO[];
  closeLabel: string;
  previousLabel: string;
  nextLabel: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (index !== null && !dialog.open) dialog.showModal();
    else if (index === null && dialog.open) dialog.close();
  }, [index]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => setIndex(null);
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, []);

  if (items.length === 0) return null;

  const current = index !== null ? items[index] : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((media, i) => (
          <button
            key={media.id}
            type="button"
            onClick={() => setIndex(i)}
            className="group relative aspect-4/3 overflow-hidden rounded-md border border-[var(--hairline)] bg-stone"
          >
            <img
              src={media.src}
              srcSet={buildSrcSet(media.sources)}
              sizes="(min-width: 640px) 30vw, 45vw"
              alt={media.alt ?? ''}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        aria-label={current?.alt ?? undefined}
        className="panel heritage-lightbox"
        onClick={(event) => {
          if (event.target === dialogRef.current) setIndex(null);
        }}
      >
        {current && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-4 p-3">
              <span className="readout">
                {index !== null ? index + 1 : 0} / {items.length}
              </span>
              <button
                type="button"
                onClick={() => setIndex(null)}
                className="btn btn-quiet px-3"
                aria-label={closeLabel}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M3 3l10 10M13 3L3 13"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div className="relative min-h-0 flex-1 px-3 pb-3">
              <img
                src={current.src}
                srcSet={buildSrcSet(current.sources)}
                sizes="92vw"
                alt={current.alt ?? ''}
                className="mx-auto h-full max-h-full w-auto max-w-full rounded-sm object-contain"
              />

              {items.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label={previousLabel}
                    onClick={() => setIndex((i) => (i === null ? i : (i - 1 + items.length) % items.length))}
                    className="btn btn-quiet absolute inset-y-0 start-3 my-auto h-11 w-11 rounded-full px-0"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label={nextLabel}
                    onClick={() => setIndex((i) => (i === null ? i : (i + 1) % items.length))}
                    className="btn btn-quiet absolute inset-y-0 end-3 my-auto h-11 w-11 rounded-full px-0"
                  >
                    ›
                  </button>
                </>
              )}
            </div>

            {current.caption && (
              <p className="px-3 pb-3 text-center text-sm text-lime-dim">{current.caption}</p>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
