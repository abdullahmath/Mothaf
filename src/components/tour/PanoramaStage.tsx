'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PanoramaEngine, isWebGLAvailable, type PanoramaCamera } from '@/lib/panorama/engine';
import { loadTexture, pickTextureSource } from '@/lib/panorama/texture';
import type { HotspotDTO, SceneDTO } from '@/lib/tour/types';
import { HOTSPOT_ACTIONS } from '@/lib/tour/actions';
import type { Translator } from '@/lib/i18n';

/**
 * The panorama surface: a WebGL canvas with an accessible DOM overlay on top.
 *
 * Hotspots are real `<button>` elements positioned each frame from the
 * engine's projection matrix. Drawing them into the canvas would be simpler
 * and would also make them invisible to the keyboard, to assistive technology,
 * and to CSS. Positions are written straight to the nodes rather than held in
 * React state — sixty state updates a second would re-render the tree for
 * nothing.
 */

type Props = {
  scene: SceneDTO;
  showLabels: boolean;
  autoRotate: boolean;
  t: Translator;
  onHotspotActivate: (hotspot: HotspotDTO) => void;
  onCameraChange?: (camera: PanoramaCamera) => void;
  onReady?: () => void;
};

export function PanoramaStage({
  scene,
  showLabels,
  autoRotate,
  t,
  onHotspotActivate,
  onCameraChange,
  onReady,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<PanoramaEngine | null>(null);
  const hotspotRefs = useRef(new Map<string, HTMLButtonElement>());
  /**
   * Held in a ref so the engine — constructed once — always calls the current
   * closure, without the engine having to be rebuilt when the scene changes.
   */
  const repositionRef = useRef<() => void>(() => {});

  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  /**
   * Bumped when the GPU context is rebuilt. Textures do not survive a context
   * loss, so this re-runs the load effect without pretending the scene changed.
   */
  const [textureEpoch, setTextureEpoch] = useState(0);

  // The engine is built once and keeps its callbacks for life, so the parent's
  // handler is reached through a ref rather than baked into the closure.
  const onCameraChangeRef = useRef(onCameraChange);
  onCameraChangeRef.current = onCameraChange;

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- engine lifecycle ------------------------------------------------ */

  useEffect(() => {
    if (!isWebGLAvailable()) {
      setSupported(false);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: PanoramaEngine;
    try {
      engine = new PanoramaEngine({
        canvas,
        reducedMotion,
        // Camera and viewport are the only two inputs to the projection, so
        // between them these cover every moment a marker could need moving.
        onCameraChange: (nextCamera) => {
          onCameraChangeRef.current?.(nextCamera);
          repositionRef.current();
        },
        onResize: () => repositionRef.current(),
        onContextRestored: () => setTextureEpoch((epoch) => epoch + 1),
      });
    } catch {
      setSupported(false);
      return;
    }
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // The engine is created once and driven imperatively afterwards; recreating
    // it when a callback identity changes would drop the GPU context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- scene texture --------------------------------------------------- */

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !scene.background) return;

    let cancelled = false;
    setStatus('loading');
    engine.clearTextures();

    const view = scene.view as Partial<PanoramaCamera>;
    // Announced, not silent. The scene's stored camera is the real heading the
    // visitor starts at, and the compass rail is driven by the parent's copy —
    // suppressing this leaves the rail reporting a direction the visitor is
    // not facing until they happen to drag.
    engine.setCamera({
      yaw: typeof view.yaw === 'number' ? view.yaw : 0,
      pitch: typeof view.pitch === 'number' ? view.pitch : 0,
      fov: typeof view.fov === 'number' ? view.fov : 75,
    });

    // The inline preview paints first — it is already in the manifest, so it
    // costs no request — then the full texture crossfades over it.
    const preview = scene.background.previewDataUri;
    if (preview) {
      loadTexture(preview)
        .then((source) => {
          if (!cancelled) engine.setPreview(source);
        })
        .catch(() => undefined);
    }

    loadTexture(pickTextureSource(scene.background))
      .then((source) => {
        if (cancelled) return;
        engine.setTexture(source);
        setStatus('ready');
        onReady?.();
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [scene.id, scene.background, scene.view, onReady, textureEpoch]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    // `autoRotate` is read from the options object on every tick, so mutating
    // it is enough and avoids rebuilding the engine.
    (engine as unknown as { options: { autoRotate: boolean } }).options.autoRotate = autoRotate;
  }, [autoRotate]);

  /* ---- hotspot projection loop ----------------------------------------- */

  /**
   * Projects every hotspot and writes its position straight to the DOM node.
   *
   * Driven by camera and resize events rather than by an animation frame loop.
   * A static scene is the common case — the visitor is reading, not dragging —
   * and re-projecting unchanged coordinates sixty times a second is pure
   * battery cost on the phones this has to work well on. Writing to nodes
   * directly, rather than through state, keeps a drag from re-rendering the
   * React tree on every pointer move.
   */
  const positionHotspots = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    for (const hotspot of scene.hotspots) {
      const node = hotspotRefs.current.get(hotspot.id);
      if (!node) continue;
      const point = engine.project(hotspot.yawDeg ?? 0, hotspot.pitchDeg ?? 0);

      if (!point.visible) {
        // `visibility` rather than `display`, so the node keeps its place in
        // the tab order and focus is not lost when a marker swings behind the
        // viewer mid-interaction.
        node.style.visibility = 'hidden';
        node.setAttribute('aria-hidden', 'true');
        node.tabIndex = -1;
        continue;
      }

      node.style.visibility = 'visible';
      node.removeAttribute('aria-hidden');
      node.tabIndex = 0;
      // `left`, not `inset-inline-start`. The projection returns a physical
      // offset from the canvas's left edge, and a logical property would
      // measure it from the right in Arabic — mirroring every hotspot away
      // from the thing it points at. Logical properties are right for text
      // flow; a projected coordinate is not text flow.
      node.style.left = `${point.x}px`;
      node.style.top = `${point.y}px`;
      // Markers near the edge of vision recede, which keeps the centre of the
      // frame legible without hiding anything abruptly.
      node.style.opacity = String(1 - point.eccentricity * 0.55);
    }
  }, [scene.hotspots]);

  // Keep the ref pointing at the current closure, and reposition immediately
  // whenever the hotspot set changes.
  useEffect(() => {
    repositionRef.current = positionHotspots;
    positionHotspots();
  }, [positionHotspots]);

  /* ---- render ---------------------------------------------------------- */

  if (!supported) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="max-w-md">
          <p className="text-lime">{t('tour.webglRequired')}</p>
          {scene.background && (
            // Falling back to the flat equirectangular image is still a usable
            // record of the place, which is better than an error and nothing.
            <img
              src={scene.background.src}
              alt={scene.background.alt ?? scene.title}
              className="mt-6 w-full rounded-md"
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label={`${t('a11y.panoramaView')} — ${scene.title}`}
        aria-describedby={`scene-help-${scene.id}`}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
      />
      <p id={`scene-help-${scene.id}`} className="visually-hidden">
        {t('tour.keyboardHelp')}
      </p>

      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="readout animate-pulse">{t('tour.loadingScene')}…</span>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center bg-[color-mix(in_oklab,var(--color-ink)_70%,transparent)]">
          <p className="text-lime">{t('tour.sceneLoadFailed')}</p>
        </div>
      )}

      {/* Hotspot overlay. The container ignores pointer events so dragging the
          panorama still works between markers. */}
      <div className="pointer-events-none absolute inset-0">
        {scene.hotspots.map((hotspot) => {
          const definition = HOTSPOT_ACTIONS[hotspot.actionType];
          const label = hotspot.label || t(definition.labelKey);
          return (
            <button
              key={hotspot.id}
              ref={(node) => {
                if (node) hotspotRefs.current.set(hotspot.id, node);
                else hotspotRefs.current.delete(hotspot.id);
              }}
              type="button"
              className="hotspot pointer-events-auto"
              data-style={hotspot.style || definition.defaultStyle}
              data-labels={showLabels ? 'always' : 'hover'}
              style={{ visibility: 'hidden' }}
              onClick={() => onHotspotActivate(hotspot)}
            >
              <span className="hotspot-dot" aria-hidden="true" />
              <span className="hotspot-label">{label}</span>
              <span className="visually-hidden">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
