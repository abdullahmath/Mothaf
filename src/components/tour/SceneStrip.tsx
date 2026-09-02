'use client';

import type { SceneDTO } from '@/lib/tour/types';
import type { Translator } from '@/lib/i18n';

/**
 * The scene list, as a collapsible filmstrip.
 *
 * Collapsed by default so the panorama keeps the screen. The brief is explicit
 * that scenes should not be cluttered with controls, and a permanent strip of
 * thumbnails is the most common way that happens.
 */
export function SceneStrip({
  scenes,
  currentSceneId,
  open,
  onToggle,
  onSelect,
  t,
}: {
  scenes: SceneDTO[];
  currentSceneId: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (sceneId: string) => void;
  t: Translator;
}) {
  const currentIndex = scenes.findIndex((scene) => scene.id === currentSceneId);

  return (
    <div className="px-4 pb-4 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="scene-strip"
          className="btn btn-quiet mx-auto flex bg-[color-mix(in_oklab,var(--color-ink)_60%,transparent)] backdrop-blur"
        >
          {open ? t('tour.closeSceneList') : t('tour.openSceneList')}
          <span className="readout ms-1">
            {currentIndex + 1}/{scenes.length}
          </span>
        </button>

        <div
          id="scene-strip"
          hidden={!open}
          className="mt-3 flex gap-3 overflow-x-auto pb-2"
          role="list"
        >
          {scenes.map((scene, index) => {
            const isCurrent = scene.id === currentSceneId;
            return (
              <div role="listitem" key={scene.id}>
                <button
                  type="button"
                  onClick={() => onSelect(scene.id)}
                  aria-current={isCurrent ? 'true' : undefined}
                  className={[
                    'group relative w-40 shrink-0 overflow-hidden rounded-md border text-start transition-colors',
                    isCurrent
                      ? 'border-verdigris'
                      : 'border-[var(--hairline)] hover:border-verdigris-deep',
                  ].join(' ')}
                >
                  <div className="relative aspect-16/10 bg-stone">
                    {scene.thumbnail ? (
                      <img
                        src={scene.thumbnail.src}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      scene.background?.previewDataUri && (
                        <img
                          src={scene.background.previewDataUri}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )
                    )}
                  </div>
                  <div className="p-2">
                    <p className="readout">{String(index + 1).padStart(2, '0')}</p>
                    <p className="truncate text-sm text-lime">{scene.title}</p>
                    {isCurrent && (
                      <p className="text-2xs text-verdigris">{t('tour.currentScene')}</p>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
