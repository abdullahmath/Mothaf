'use client';

import { useState } from 'react';
import type { AppLocale } from '@/lib/i18n/config';
import { toTranslationValues } from '@/lib/content/translations';
import { HotspotForm, type HotspotFormValues } from './HotspotForm';

export type HotspotRow = {
  id: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  yawDeg: number | null;
  pitchDeg: number | null;
  style: string;
  translations: { locale: string; label: string; description: string | null }[];
};

function toFormValues(sceneId: string, row: HotspotRow): HotspotFormValues {
  const target: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.actionPayload)) {
    if (Array.isArray(value)) continue; // gallery mediaIds handled separately if ever built
    target[key] = String(value);
  }
  return {
    id: row.id,
    sceneId,
    actionType: row.actionType,
    target,
    yawDeg: row.yawDeg,
    pitchDeg: row.pitchDeg,
    icon: 'dot',
    style: row.style,
    status: 'published',
    translations: toTranslationValues(row.translations),
  };
}

export function HotspotManager({
  sceneId,
  locale,
  hotspots,
  options,
}: {
  sceneId: string;
  locale: AppLocale;
  hotspots: HotspotRow[];
  options: Parameters<typeof HotspotForm>[0]['options'];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="grid gap-3">
      {hotspots.map((hotspot) => {
        const label = hotspot.translations.find((t) => t.locale === locale)?.label ?? hotspot.id;
        const isOpen = openId === hotspot.id;
        return (
          <div key={hotspot.id} className="rounded-md border border-[var(--hairline)] p-3">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : hotspot.id)}
              className="flex w-full items-center justify-between text-start"
            >
              <span className="text-sm text-lime">{label}</span>
              <span className="readout">
                {hotspot.actionType} · yaw {hotspot.yawDeg ?? '—'}°
              </span>
            </button>
            {isOpen && (
              <div className="mt-4 border-t border-[var(--hairline)] pt-4">
                <HotspotForm
                  locale={locale}
                  values={toFormValues(sceneId, hotspot)}
                  options={options}
                  onDone={() => setOpenId(null)}
                />
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => setCreating((v) => !v)}
        className="btn btn-quiet"
      >
        {creating ? 'Cancel' : '+ Add hotspot'}
      </button>

      {creating && (
        <div className="rounded-md border border-[var(--hairline)] p-3">
          <HotspotForm
            locale={locale}
            values={{
              sceneId,
              actionType: 'info',
              target: {},
              yawDeg: 0,
              pitchDeg: 0,
              icon: 'dot',
              style: 'pulse',
              status: 'published',
              translations: {},
            }}
            options={options}
            onDone={() => setCreating(false)}
          />
        </div>
      )}
    </div>
  );
}
