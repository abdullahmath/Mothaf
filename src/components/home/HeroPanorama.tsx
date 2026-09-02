'use client';

import { useEffect, useRef, useState } from 'react';
import { PanoramaEngine, isWebGLAvailable, type PanoramaCamera } from '@/lib/panorama/engine';
import { loadTexture, pickTextureSource } from '@/lib/panorama/texture';
import type { MediaDTO } from '@/lib/tour/types';
import { BearingRail } from '../tour/BearingRail';

/**
 * The hero is a live panorama, slowly drifting, with the bearing rail
 * tracking it.
 *
 * A still photograph of a ruin would say "this is a site about heritage". A
 * scene you can take hold of and turn says "this is a place you can be in",
 * which is the actual proposition. The product demonstrates itself above the
 * fold instead of describing itself.
 *
 * It is deliberately cheap: the engine is only constructed once the element is
 * near the viewport, and the panorama is loaded at its smallest usable
 * rendition. Auto-drift stops under `prefers-reduced-motion`, where the scene
 * is still there to be dragged.
 */
export function HeroPanorama({ media, label }: { media: MediaDTO; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [camera, setCamera] = useState<PanoramaCamera>({ yaw: 0, pitch: 0, fov: 82 });
  const [active, setActive] = useState(false);
  const [textureEpoch, setTextureEpoch] = useState(0);

  // Only start once the hero is actually about to be seen.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isWebGLAvailable()) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let engine: PanoramaEngine;
    try {
      engine = new PanoramaEngine({
        canvas,
        camera: { yaw: 0, pitch: 2, fov: 82 },
        autoRotate: !reducedMotion,
        autoRotateSpeed: 0.18,
        reducedMotion,
        onCameraChange: setCamera,
        onContextRestored: () => setTextureEpoch((epoch) => epoch + 1),
      });
    } catch {
      return;
    }

    let cancelled = false;

    if (media.previewDataUri) {
      void loadTexture(media.previewDataUri)
        .then((source) => {
          if (!cancelled) engine.setPreview(source);
        })
        .catch(() => undefined);
    }

    void loadTexture(pickTextureSource(media))
      .then((source) => {
        if (!cancelled) engine.setTexture(source);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      engine.dispose();
    };
  }, [active, media, textureEpoch]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* The blurred preview is the poster while the engine boots, so the hero
          is never an empty rectangle. */}
      {media.previewDataUri && (
        <div
          aria-hidden="true"
          className="absolute inset-0 scale-110 blur-xl"
          style={{
            backgroundImage: `url(${media.previewDataUri})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}

      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label={label}
        className="relative h-full w-full cursor-grab touch-none active:cursor-grabbing"
      />

      <BearingRail
        yaw={camera.yaw}
        className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto max-w-xl px-6"
      />
    </div>
  );
}

