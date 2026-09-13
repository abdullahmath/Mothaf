import 'server-only';

import { sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { toRows } from '../../db/raw';
import { requirePermission } from '../guard';

/**
 * Reporting over the analytics stream.
 *
 * Aggregate only. There is no function here that returns individual events,
 * and none that groups by `visitorHash` across days — the salt rotates daily
 * precisely so that cannot be done, and offering a query shaped like a user
 * profile would undermine the collection design.
 */

export type Period = 7 | 30 | 90;

export type AnalyticsSummary = {
  tourOpens: number;
  sceneViews: number;
  hotspotClicks: number;
  poiViews: number;
  /** Median rather than mean: one abandoned tab would skew an average badly. */
  medianSceneDwellSeconds: number | null;
  byLocale: { locale: string; value: number }[];
  byDevice: { device: string; value: number }[];
  topScenes: { sceneId: string; title: string; value: number }[];
  daily: { day: string; value: number }[];
};

export async function getAnalyticsSummary(days: Period = 30): Promise<AnalyticsSummary> {
  await requirePermission('analytics:read');
  const db = await getDb();

  const since = sql`now() - (${days} * interval '1 day')`;

  const [totals, locales, devices, scenes, daily, dwell] = await Promise.all([
    db.execute(sql`
      SELECT type, count(*)::int AS value
      FROM analytics_events
      WHERE occurred_at >= ${since}
      GROUP BY type
    `),
    db.execute(sql`
      SELECT coalesce(locale, 'unknown') AS locale, count(*)::int AS value
      FROM analytics_events
      WHERE occurred_at >= ${since}
      GROUP BY 1 ORDER BY value DESC
    `),
    db.execute(sql`
      SELECT device_class::text AS device, count(*)::int AS value
      FROM analytics_events
      WHERE occurred_at >= ${since}
      GROUP BY 1 ORDER BY value DESC
    `),
    db.execute(sql`
      SELECT a.scene_id AS "sceneId",
             coalesce(max(t.title), s.slug) AS title,
             count(*)::int AS value
      FROM analytics_events a
      JOIN scenes s ON s.id = a.scene_id
      LEFT JOIN scene_translations t ON t.scene_id = s.id
      WHERE a.occurred_at >= ${since} AND a.type = 'scene_view'
      GROUP BY a.scene_id, s.slug
      ORDER BY value DESC
      LIMIT 10
    `),
    db.execute(sql`
      SELECT to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') AS day,
             count(*)::int AS value
      FROM analytics_events
      WHERE occurred_at >= ${since}
      GROUP BY 1 ORDER BY 1
    `),
    db.execute(sql`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS median
      FROM analytics_events
      WHERE occurred_at >= ${since} AND duration_ms IS NOT NULL AND duration_ms > 0
    `),
  ]);

  const totalsBy = new Map(
    toRows<{ type: string; value: number }>(totals).map((r) => [r.type, Number(r.value)]),
  );
  const medianMs = toRows<{ median: number | string | null }>(dwell)[0]?.median;

  return {
    tourOpens: totalsBy.get('tour_open') ?? 0,
    sceneViews: totalsBy.get('scene_view') ?? 0,
    hotspotClicks: totalsBy.get('hotspot_click') ?? 0,
    poiViews: totalsBy.get('poi_view') ?? 0,
    medianSceneDwellSeconds:
      medianMs === null || medianMs === undefined ? null : Math.round(Number(medianMs) / 1000),
    byLocale: toRows<{ locale: string; value: number }>(locales).map((r) => ({
      locale: r.locale,
      value: Number(r.value),
    })),
    byDevice: toRows<{ device: string; value: number }>(devices).map((r) => ({
      device: r.device,
      value: Number(r.value),
    })),
    topScenes: toRows<{ sceneId: string; title: string; value: number }>(scenes).map((r) => ({
      sceneId: r.sceneId,
      title: r.title,
      value: Number(r.value),
    })),
    daily: toRows<{ day: string; value: number }>(daily).map((r) => ({
      day: r.day,
      value: Number(r.value),
    })),
  };
}

/** Counts for the dashboard tiles. */
export async function getContentCounts() {
  await requirePermission('content:read');
  const db = await getDb();

  const result = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM destinations)                              AS destinations,
      (SELECT count(*)::int FROM destinations WHERE status = 'published')   AS published_destinations,
      (SELECT count(*)::int FROM tours)                                     AS tours,
      (SELECT count(*)::int FROM tours WHERE status = 'published')          AS published_tours,
      (SELECT count(*)::int FROM scenes)                                    AS scenes,
      (SELECT count(*)::int FROM hotspots)                                  AS hotspots,
      (SELECT count(*)::int FROM points_of_interest)                        AS pois,
      (SELECT count(*)::int FROM heritage_sites)                            AS heritage_sites,
      (SELECT count(*)::int FROM events)                                    AS events,
      (SELECT count(*)::int FROM media_assets)                              AS media
  `);

  const row = toRows<Record<string, number | string>>(result)[0] ?? {};
  const num = (key: string) => Number(row[key] ?? 0);

  return {
    destinations: num('destinations'),
    publishedDestinations: num('published_destinations'),
    tours: num('tours'),
    publishedTours: num('published_tours'),
    scenes: num('scenes'),
    hotspots: num('hotspots'),
    pois: num('pois'),
    heritageSites: num('heritage_sites'),
    events: num('events'),
    media: num('media'),
  };
}

/**
 * Translation coverage across the content model.
 *
 * Answers the question an editor actually has — "what is still missing in
 * English?" — by counting rows that exist in the default locale but not in the
 * target one.
 */
export async function getTranslationCoverage(locale: string) {
  await requirePermission('content:read');
  const db = await getDb();

  const result = await db.execute(sql`
    WITH d AS (
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE t.locale IS NOT NULL)::int AS done
      FROM destinations x
      LEFT JOIN destination_translations t ON t.destination_id = x.id AND t.locale = ${locale}
    ), tr AS (
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE t.locale IS NOT NULL)::int AS done
      FROM tours x
      LEFT JOIN tour_translations t ON t.tour_id = x.id AND t.locale = ${locale}
    ), s AS (
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE t.locale IS NOT NULL)::int AS done
      FROM scenes x
      LEFT JOIN scene_translations t ON t.scene_id = x.id AND t.locale = ${locale}
    ), p AS (
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE t.locale IS NOT NULL)::int AS done
      FROM points_of_interest x
      LEFT JOIN poi_translations t ON t.poi_id = x.id AND t.locale = ${locale}
    ), e AS (
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE t.locale IS NOT NULL)::int AS done
      FROM events x
      LEFT JOIN event_translations t ON t.event_id = x.id AND t.locale = ${locale}
    ), h AS (
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE t.locale IS NOT NULL)::int AS done
      FROM heritage_sites x
      LEFT JOIN heritage_site_translations t ON t.heritage_site_id = x.id AND t.locale = ${locale}
    )
    SELECT 'destinations' AS entity, total, done FROM d
    UNION ALL SELECT 'tours', total, done FROM tr
    UNION ALL SELECT 'scenes', total, done FROM s
    UNION ALL SELECT 'pois', total, done FROM p
    UNION ALL SELECT 'heritage sites', total, done FROM h
    UNION ALL SELECT 'events', total, done FROM e
  `);

  return toRows<{ entity: string; total: number; done: number }>(result).map((row) => ({
    entity: row.entity,
    total: Number(row.total),
    done: Number(row.done),
  }));
}
