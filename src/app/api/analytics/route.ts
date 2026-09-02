import { z } from 'zod';
import { getDb } from '@/server/db';
import { analyticsEvents } from '@/server/db/schema';
import { analyticsVisitorHash } from '@/server/auth/crypto';
import { env } from '@/server/config/env';

/**
 * Analytics ingest.
 *
 * Deliberately unauthenticated — visitors are anonymous — and therefore
 * deliberately narrow: a strict schema, a hard cap on batch size, an
 * in-process rate limit, and no field that could carry free-form text into the
 * database.
 *
 * Nothing identifying is stored. The visitor hash is keyed with a salt that
 * includes the date, so it changes every day and two days of rows cannot be
 * joined into a profile even by someone holding the database.
 */

export const dynamic = 'force-dynamic';

const eventSchema = z.object({
  type: z.enum([
    'tour_open',
    'scene_view',
    'hotspot_click',
    'poi_view',
    'media_play',
    'locale_change',
    'tour_complete',
  ]),
  destinationId: z.string().uuid().optional(),
  tourId: z.string().uuid().optional(),
  sceneId: z.string().uuid().optional(),
  poiId: z.string().uuid().optional(),
  hotspotId: z.string().uuid().optional(),
  locale: z.string().max(10).optional(),
  // Capped at four hours: anything longer is a tab left open, not a visit, and
  // would skew every dwell-time average it landed in.
  durationMs: z.number().int().min(0).max(4 * 60 * 60 * 1000).optional(),
  at: z.string().datetime().optional(),
});

const bodySchema = z.object({
  sessionId: z.string().regex(/^[a-z0-9]{1,64}$/i),
  events: z.array(eventSchema).min(1).max(20),
});

/**
 * In-process token bucket.
 *
 * The durable, cross-instance limiter in `auth/rate-limit.ts` costs a database
 * write per call, which is the wrong trade for a beacon endpoint. Analytics
 * abuse pollutes a report; it does not breach anything, so a per-instance
 * limit is proportionate.
 */
const buckets = new Map<string, { tokens: number; updatedAt: number }>();
const CAPACITY = 60;
const REFILL_PER_SECOND = 1;

function allow(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket) {
    buckets.set(key, { tokens: CAPACITY - 1, updatedAt: now });
    return true;
  }

  const refilled = Math.min(
    CAPACITY,
    bucket.tokens + ((now - bucket.updatedAt) / 1000) * REFILL_PER_SECOND,
  );
  bucket.updatedAt = now;

  if (refilled < 1) {
    bucket.tokens = refilled;
    return false;
  }
  bucket.tokens = refilled - 1;
  return true;
}

// Keeps the map from growing without bound on a long-lived instance.
setInterval(
  () => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [key, bucket] of buckets) {
      if (bucket.updatedAt < cutoff) buckets.delete(key);
    }
  },
  5 * 60 * 1000,
).unref?.();

function deviceClass(userAgent: string): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod/.test(ua)) return 'mobile';
  return 'desktop';
}

export async function POST(request: Request): Promise<Response> {
  const config = env();
  // Always 204: telling a client that collection is switched off, or that its
  // payload was malformed, invites probing and gives nothing useful back.
  const ok = new Response(null, { status: 204 });

  if (!config.ANALYTICS_ENABLED) return ok;

  // Honour the browser's opt-out on the server too, not only in the client
  // helper, so a hand-rolled request cannot bypass it.
  if (request.headers.get('sec-gpc') === '1' || request.headers.get('dnt') === '1') return ok;

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
  const userAgent = request.headers.get('user-agent') ?? '';

  if (!allow(ip)) return ok;

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return ok;
  }
  if (!parsed.success) return ok;

  const visitorHash = analyticsVisitorHash(ip, userAgent);
  const device = deviceClass(userAgent);
  const now = new Date();

  try {
    const db = await getDb();
    await db.insert(analyticsEvents).values(
      parsed.data.events.map((event) => ({
        type: event.type,
        destinationId: event.destinationId ?? null,
        tourId: event.tourId ?? null,
        sceneId: event.sceneId ?? null,
        poiId: event.poiId ?? null,
        hotspotId: event.hotspotId ?? null,
        locale: event.locale ?? null,
        deviceClass: device,
        visitorHash,
        sessionId: parsed.data.sessionId,
        durationMs: event.durationMs ?? null,
        // Client clocks are not trusted for ordering; the client's own
        // timestamp is only used to reject implausibly stale beacons.
        occurredAt: event.at && Math.abs(Date.parse(event.at) - now.getTime()) < 3_600_000
          ? new Date(event.at)
          : now,
        payload: {},
      })),
    );
  } catch {
    // A failed insert must never surface to the visitor. Analytics is the
    // least important thing happening on the page.
  }

  return ok;
}
