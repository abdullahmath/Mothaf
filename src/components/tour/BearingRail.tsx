'use client';

import { useMemo } from 'react';
import { normalizeYaw, shortestAngle } from '@/lib/panorama/engine';

/**
 * A theodolite scale showing which way the visitor is facing and where the
 * interactive points lie relative to them.
 *
 * The problem it solves is specific to 360° media: on a flat page everything
 * is either on screen or below it, but in a panorama a third of the content
 * can be directly behind you with nothing to suggest it exists. The rail makes
 * "there is something 40° to your right" legible at a glance, and gives the
 * scene a sense of orientation that a bare drag-to-look interface lacks.
 *
 * The scale always runs west-to-east, in both languages. A compass bearing is
 * not a reading order, and mirroring it in Arabic would simply make the
 * compass wrong.
 */

export type BearingMarker = {
  id: string;
  /** Degrees, same frame as the camera yaw. */
  yaw: number;
  label: string;
  kind: 'poi' | 'navigate' | 'event' | 'info';
};

type Props = {
  /** Current camera heading in degrees. */
  yaw: number;
  /** Compass offset so the panorama's north matches the real world. */
  northOffsetDeg?: number;
  markers?: BearingMarker[];
  /** How many degrees the visible window covers. */
  span?: number;
  onSelectMarker?: (id: string) => void;
  className?: string;
};

const MINOR_STEP = 5;
const MAJOR_STEP = 30;

export function BearingRail({
  yaw,
  northOffsetDeg = 0,
  markers = [],
  span = 140,
  onSelectMarker,
  className,
}: Props) {
  /** Fractional position across the rail, or null when out of the window. */
  const positionOf = useMemo(() => {
    const half = span / 2;
    return (target: number): number | null => {
      const delta = shortestAngle(yaw, target);
      if (Math.abs(delta) > half) return null;
      return 0.5 + delta / span;
    };
  }, [yaw, span]);

  // Ticks are generated around the current heading rather than for the whole
  // circle, so the DOM holds ~30 nodes instead of 72 regardless of heading.
  const ticks = useMemo(() => {
    const half = span / 2;
    const first = Math.ceil((yaw - half) / MINOR_STEP) * MINOR_STEP;
    const out: { bearing: number; major: boolean; offset: number }[] = [];
    for (let bearing = first; bearing <= yaw + half; bearing += MINOR_STEP) {
      const delta = bearing - yaw;
      out.push({
        bearing: normalizeYaw(bearing - northOffsetDeg),
        major: ((bearing % MAJOR_STEP) + MAJOR_STEP) % MAJOR_STEP === 0,
        offset: 0.5 + delta / span,
      });
    }
    return out;
  }, [yaw, span, northOffsetDeg]);

  const heading = Math.round(((normalizeYaw(yaw - northOffsetDeg) % 360) + 360) % 360);

  return (
    <div className={className}>
      <div
        className="rail"
        role="img"
        aria-label={`Heading ${heading} degrees`}
      >
        <div className="rail-track">
          {ticks.map((tick) => (
            <span
              key={`${tick.bearing}-${tick.offset.toFixed(4)}`}
              className="rail-tick"
              data-major={tick.major}
              style={{ insetInlineStart: `${tick.offset * 100}%` }}
            />
          ))}

          {ticks
            .filter((tick) => tick.major)
            .map((tick) => (
              <span
                key={`label-${tick.bearing}`}
                className="rail-label"
                style={{ insetInlineStart: `${tick.offset * 100}%` }}
              >
                {((tick.bearing % 360) + 360) % 360}°
              </span>
            ))}

          {markers.map((marker) => {
            const offset = positionOf(marker.yaw);
            if (offset === null) return null;
            return onSelectMarker ? (
              <button
                key={marker.id}
                type="button"
                className="rail-marker"
                data-kind={marker.kind}
                style={{ insetInlineStart: `${offset * 100}%` }}
                onClick={() => onSelectMarker(marker.id)}
                title={marker.label}
              >
                <span className="visually-hidden">{marker.label}</span>
              </button>
            ) : (
              <span
                key={marker.id}
                className="rail-marker"
                data-kind={marker.kind}
                style={{ insetInlineStart: `${offset * 100}%` }}
              />
            );
          })}

          <span className="rail-index" aria-hidden="true" />
        </div>
      </div>

      {/* The numeric heading is the value the scale is reporting; a screen
          reader gets it from the rail's own label, so this copy is hidden. */}
      <p className="readout mt-1 text-center" aria-hidden="true">
        {String(heading).padStart(3, '0')}°
      </p>
    </div>
  );
}
