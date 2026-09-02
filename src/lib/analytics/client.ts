'use client';

import type { AppLocale } from '../i18n/config';

/**
 * Client-side analytics.
 *
 * Fire-and-forget, batched, and delivered with `sendBeacon` so instrumentation
 * can never delay a scene change or fail a navigation. If the endpoint is
 * down, events are dropped — measurement must never degrade the experience.
 *
 * There is no cookie and no persistent identifier. `sessionId` is a random
 * value held in `sessionStorage`, so it dies with the tab and cannot link a
 * visitor across visits. Do Not Track and Global Privacy Control are honoured
 * before anything is collected at all.
 */

export type AnalyticsEventType =
  | 'tour_open'
  | 'scene_view'
  | 'hotspot_click'
  | 'poi_view'
  | 'media_play'
  | 'locale_change'
  | 'tour_complete';

export type AnalyticsPayload = {
  type: AnalyticsEventType;
  destinationId?: string;
  tourId?: string;
  sceneId?: string;
  poiId?: string;
  hotspotId?: string;
  locale?: AppLocale;
  durationMs?: number;
};

const ENDPOINT = '/api/analytics';
const SESSION_KEY = 'mothaf_s';
const FLUSH_DELAY_MS = 2000;
const MAX_BATCH = 20;

let queue: (AnalyticsPayload & { at: string })[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;

/** Respects the browser's own opt-out signals. */
function optedOut(): boolean {
  if (typeof navigator === 'undefined') return true;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string };
  if (nav.globalPrivacyControl === true) return true;
  if (nav.doNotTrack === '1') return true;
  if (typeof window !== 'undefined' && (window as { doNotTrack?: string }).doNotTrack === '1') {
    return true;
  }
  return false;
}

function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    // Private mode, or storage disabled. An ephemeral value still lets a
    // single page view hang together, and nothing is persisted.
    return 'ephemeral';
  }
}

function flush(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;

  const body = JSON.stringify({ sessionId: sessionId(), events: queue });
  queue = [];

  try {
    // `sendBeacon` survives the page being unloaded, which is exactly when the
    // most interesting event (how long they stayed) is recorded.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Measurement is never worth an exception in the visitor's console.
  }
}

function attachListeners(): void {
  if (listenersAttached || typeof document === 'undefined') return;
  listenersAttached = true;
  // `visibilitychange` fires reliably on mobile where `unload` does not.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}

export function track(event: AnalyticsPayload): void {
  if (optedOut()) return;
  attachListeners();

  queue.push({ ...event, at: new Date().toISOString() });

  if (queue.length >= MAX_BATCH) {
    flush();
    return;
  }
  timer ??= setTimeout(flush, FLUSH_DELAY_MS);
}

/** Test seam and manual flush before a deliberate navigation. */
export const flushAnalytics = flush;
