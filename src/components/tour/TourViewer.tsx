'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PanoramaCamera } from '@/lib/panorama/engine';
import { shortestAngle } from '@/lib/panorama/engine';
import type { HotspotActionType, HotspotDTO, TourManifest } from '@/lib/tour/types';
import { getTranslator } from '@/lib/i18n';
import { track } from '@/lib/analytics/client';
import { PanoramaStage } from './PanoramaStage';
import { BearingRail, type BearingMarker } from './BearingRail';
import { TourPanel } from './TourPanel';
import { SceneStrip } from './SceneStrip';
import { PoiContent } from './PoiContent';
import { MediaFigure } from './MediaFigure';

/**
 * Orchestrates one tour: which scene is showing, what panel is open, and what
 * a hotspot does when it is activated.
 *
 * The whole manifest arrives with the page, so moving between scenes is a
 * texture load rather than a navigation. That is what makes a tour feel like a
 * place rather than a set of pages.
 */

type PanelState =
  | { kind: 'none' }
  | { kind: 'poi'; poiId: string }
  | { kind: 'info'; hotspot: HotspotDTO }
  | { kind: 'gallery'; mediaIds: string[] }
  | { kind: 'media'; mediaId: string }
  | { kind: 'event'; eventId: string };

/** What a hotspot handler is allowed to do. */
type ActionContext = {
  goToScene: (sceneId: string) => void;
  setPanel: (panel: PanelState) => void;
  openExternal: (url: string) => void;
};

/**
 * Handler table.
 *
 * Typed as a total map over the action union, so adding a new action type is a
 * compile error until it is handled here. That is the property a `switch` with
 * a `default` branch quietly loses.
 */
const ACTION_HANDLERS: Record<
  HotspotActionType,
  (payload: Record<string, unknown>, context: ActionContext, hotspot: HotspotDTO) => void
> = {
  navigate: (payload, context) => {
    if (typeof payload.sceneId === 'string') context.goToScene(payload.sceneId);
  },
  poi: (payload, context) => {
    if (typeof payload.poiId === 'string') context.setPanel({ kind: 'poi', poiId: payload.poiId });
  },
  info: (_payload, context, hotspot) => context.setPanel({ kind: 'info', hotspot }),
  image: (payload, context) => {
    if (typeof payload.mediaId === 'string') {
      context.setPanel({ kind: 'media', mediaId: payload.mediaId });
    }
  },
  gallery: (payload, context) => {
    if (Array.isArray(payload.mediaIds)) {
      context.setPanel({
        kind: 'gallery',
        mediaIds: payload.mediaIds.filter((id): id is string => typeof id === 'string'),
      });
    }
  },
  video: (payload, context) => {
    if (typeof payload.mediaId === 'string') {
      context.setPanel({ kind: 'media', mediaId: payload.mediaId });
    }
  },
  audio: (payload, context) => {
    if (typeof payload.mediaId === 'string') {
      context.setPanel({ kind: 'media', mediaId: payload.mediaId });
    }
  },
  event: (payload, context) => {
    if (typeof payload.eventId === 'string') {
      context.setPanel({ kind: 'event', eventId: payload.eventId });
    }
  },
  link: (payload, context) => {
    if (typeof payload.url === 'string') context.openExternal(payload.url);
  },
};

export function TourViewer({ manifest }: { manifest: TourManifest }) {
  const router = useRouter();
  const t = getTranslator(manifest.locale);

  const [sceneId, setSceneId] = useState(manifest.startSceneId);
  const [panel, setPanel] = useState<PanelState>({ kind: 'none' });
  const [camera, setCamera] = useState<PanoramaCamera>({ yaw: 0, pitch: 0, fov: 75 });
  const [autoRotate, setAutoRotate] = useState(manifest.tour.settings.autoRotate);
  const [stripOpen, setStripOpen] = useState(false);

  const sceneEnteredAt = useRef(Date.now());
  const visitedScenes = useRef(new Set<string>([manifest.startSceneId]));

  const scene = useMemo(
    () => manifest.scenes.find((s) => s.id === sceneId) ?? manifest.scenes[0]!,
    [manifest.scenes, sceneId],
  );

  const poiById = useMemo(
    () => new Map(manifest.pois.map((poi) => [poi.id, poi])),
    [manifest.pois],
  );
  const mediaById = useMemo(() => {
    const map = new Map<string, (typeof manifest.pois)[number]['media'][number]>();
    for (const poi of manifest.pois) {
      if (poi.cover) map.set(poi.cover.id, poi.cover);
      for (const item of poi.media) map.set(item.id, item);
    }
    for (const s of manifest.scenes) {
      for (const item of [s.background, s.thumbnail, s.audio]) {
        if (item) map.set(item.id, item);
      }
    }
    for (const event of manifest.events) {
      if (event.cover) map.set(event.cover.id, event.cover);
    }
    return map;
  }, [manifest]);

  /* ---- analytics ------------------------------------------------------- */

  useEffect(() => {
    track({
      type: 'tour_open',
      tourId: manifest.tour.id,
      destinationId: manifest.destination.id,
      locale: manifest.locale,
    });
    // Only on mount: re-firing on every manifest identity change would inflate
    // the count every time React re-created the object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToScene = useCallback(
    (nextId: string) => {
      if (!manifest.scenes.some((s) => s.id === nextId)) return;

      track({
        type: 'scene_view',
        tourId: manifest.tour.id,
        destinationId: manifest.destination.id,
        sceneId: nextId,
        locale: manifest.locale,
        durationMs: Date.now() - sceneEnteredAt.current,
      });

      sceneEnteredAt.current = Date.now();
      visitedScenes.current.add(nextId);
      setSceneId(nextId);
      setPanel({ kind: 'none' });

      if (visitedScenes.current.size === manifest.scenes.length) {
        track({
          type: 'tour_complete',
          tourId: manifest.tour.id,
          destinationId: manifest.destination.id,
          locale: manifest.locale,
        });
      }
    },
    [manifest],
  );

  const openExternal = useCallback((url: string) => {
    // `noopener` severs `window.opener`, without which the opened page can
    // navigate this tab somewhere else.
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const onHotspotActivate = useCallback(
    (hotspot: HotspotDTO) => {
      track({
        type: 'hotspot_click',
        tourId: manifest.tour.id,
        destinationId: manifest.destination.id,
        sceneId: scene.id,
        hotspotId: hotspot.id,
        locale: manifest.locale,
      });
      ACTION_HANDLERS[hotspot.actionType](
        hotspot.payload,
        { goToScene, setPanel, openExternal },
        hotspot,
      );
    },
    [goToScene, openExternal, manifest, scene.id],
  );

  /* ---- bearing markers -------------------------------------------------- */

  const markers = useMemo<BearingMarker[]>(
    () =>
      scene.hotspots
        .filter((hotspot) => hotspot.yawDeg !== null)
        .map((hotspot) => ({
          id: hotspot.id,
          yaw: hotspot.yawDeg ?? 0,
          label: hotspot.label,
          kind:
            hotspot.actionType === 'navigate'
              ? 'navigate'
              : hotspot.actionType === 'event'
                ? 'event'
                : hotspot.actionType === 'poi'
                  ? 'poi'
                  : 'info',
        })),
    [scene.hotspots],
  );

  const focusHotspot = useCallback(
    (id: string) => {
      const hotspot = scene.hotspots.find((h) => h.id === id);
      if (hotspot) onHotspotActivate(hotspot);
    },
    [scene.hotspots, onHotspotActivate],
  );

  /* ---- panel content ---------------------------------------------------- */

  const closePanel = useCallback(() => setPanel({ kind: 'none' }), []);

  useEffect(() => {
    if (panel.kind === 'poi') {
      track({
        type: 'poi_view',
        tourId: manifest.tour.id,
        destinationId: manifest.destination.id,
        sceneId: scene.id,
        poiId: panel.poiId,
        locale: manifest.locale,
      });
    }
  }, [panel, manifest, scene.id]);

  const panelBody = (() => {
    switch (panel.kind) {
      case 'poi': {
        const poi = poiById.get(panel.poiId);
        return poi ? <PoiContent poi={poi} t={t} locale={manifest.locale} /> : null;
      }
      case 'info':
        return <p className="prose-body">{panel.hotspot.description}</p>;
      case 'media': {
        const media = mediaById.get(panel.mediaId);
        return media ? <MediaFigure media={media} t={t} /> : null;
      }
      case 'gallery':
        return (
          <div className="grid gap-6">
            {panel.mediaIds.map((id) => {
              const media = mediaById.get(id);
              return media ? <MediaFigure key={id} media={media} t={t} /> : null;
            })}
          </div>
        );
      case 'event': {
        const event = manifest.events.find((e) => e.id === panel.eventId);
        if (!event) return null;
        return (
          <div>
            {event.summary && <p className="prose-body">{event.summary}</p>}
            <a
              className="btn btn-primary mt-6"
              href={`/${manifest.locale}/destinations/${manifest.destination.slug}/events/${event.slug}`}
            >
              {t('hotspot.openEvent')}
            </a>
          </div>
        );
      }
      case 'none':
        return null;
    }
  })();

  const panelTitle = (() => {
    switch (panel.kind) {
      case 'poi':
        return poiById.get(panel.poiId)?.title ?? '';
      case 'info':
        return panel.hotspot.label;
      case 'media':
        return mediaById.get(panel.mediaId)?.caption ?? t('media.image');
      case 'gallery':
        return t('media.gallery');
      case 'event':
        return manifest.events.find((e) => e.id === panel.eventId)?.title ?? '';
      case 'none':
        return '';
    }
  })();

  /* ---- render ----------------------------------------------------------- */

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-ink">
      {/* Top chrome */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-start gap-3 bg-gradient-to-b from-[color-mix(in_oklab,var(--color-ink)_85%,transparent)] to-transparent p-4 sm:p-5">
        <button
          type="button"
          onClick={() => router.push(`/${manifest.locale}/destinations/${manifest.destination.slug}`)}
          className="btn btn-quiet bg-[color-mix(in_oklab,var(--color-ink)_60%,transparent)] backdrop-blur"
        >
          <span aria-hidden="true" className="rtl:rotate-180">
            ←
          </span>
          {t('tour.exit')}
        </button>

        <div className="min-w-0 flex-1 text-center">
          <p className="eyebrow truncate">{manifest.destination.name}</p>
          <h1 className="display mt-0.5 truncate text-lg text-lime sm:text-xl">{scene.title}</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRotate((value) => !value)}
            aria-pressed={autoRotate}
            className="btn btn-quiet bg-[color-mix(in_oklab,var(--color-ink)_60%,transparent)] px-3 backdrop-blur"
            title={autoRotate ? t('tour.autoRotateOff') : t('tour.autoRotateOn')}
          >
            <span className="visually-hidden">
              {autoRotate ? t('tour.autoRotateOff') : t('tour.autoRotateOn')}
            </span>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
              <path
                d="M2 8a6 6 0 1 1 1.8 4.3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path d="M2 12.5V9h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="relative min-h-0 flex-1">
        <PanoramaStage
          scene={scene}
          showLabels={manifest.tour.settings.showHotspotLabels}
          autoRotate={autoRotate}
          t={t}
          onHotspotActivate={onHotspotActivate}
          onCameraChange={setCamera}
        />
      </div>

      {/* Bottom chrome: bearing rail, then scene strip */}
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[color-mix(in_oklab,var(--color-ink)_90%,transparent)] to-transparent pt-10">
        {manifest.tour.settings.showCompass && (
          <BearingRail
            yaw={camera.yaw}
            northOffsetDeg={scene.northOffsetDeg}
            markers={markers}
            onSelectMarker={focusHotspot}
            className="mx-auto max-w-2xl px-6"
          />
        )}

        {manifest.tour.settings.showSceneList && manifest.scenes.length > 1 && (
          <SceneStrip
            scenes={manifest.scenes}
            currentSceneId={scene.id}
            open={stripOpen}
            onToggle={() => setStripOpen((value) => !value)}
            onSelect={goToScene}
            t={t}
          />
        )}
      </div>

      <TourPanel
        open={panel.kind !== 'none'}
        onClose={closePanel}
        title={panelTitle}
        eyebrow={panel.kind === 'poi' ? (poiById.get(panel.poiId)?.category?.name ?? undefined) : undefined}
        t={t}
      >
        {panelBody}
      </TourPanel>

      {/* Announces the scene change to assistive technology, which would
          otherwise get no signal that the view has moved. */}
      <p aria-live="polite" className="visually-hidden">
        {scene.title}
      </p>
    </div>
  );
}

export { shortestAngle };
