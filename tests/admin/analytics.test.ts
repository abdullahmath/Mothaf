import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { actAs, mockAuthCookies } from '../helpers/auth';

mockAuthCookies();

import { createTestDb, schema, type TestDb } from '../helpers/db';
import { makeDestination, makePoi, makeScene, makeTour, makeUser, makeMedia } from '../helpers/fixtures';
import { getAnalyticsSummary } from '@/server/domain/admin/analytics';

/**
 * The reporting layer, against real rows — not just the permission check
 * already covered in authorization.test.ts. Every field here is an
 * aggregate; nothing asserts or reads back anything that would identify a
 * visitor, matching the collection design itself.
 */

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(async () => {
  await close();
});

beforeEach(async () => {
  await db.delete(schema.analyticsEvents);
  await db.delete(schema.destinations);
  await db.delete(schema.users);
  actAs(null);
});

describe('getAnalyticsSummary', () => {
  it('aggregates counts, completion rate, top POIs and the daily series', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const destination = await makeDestination(db);
    const media = await makeMedia(db);
    const tour = await makeTour(db, destination.id);
    const scene = await makeScene(db, tour.id, { backgroundMediaId: media.id });
    const poi = await makePoi(db, destination.id, undefined, [
      { locale: 'en', title: 'The well' },
    ]);

    const now = new Date();
    await db.insert(schema.analyticsEvents).values([
      { type: 'tour_open', destinationId: destination.id, tourId: tour.id, occurredAt: now },
      { type: 'tour_open', destinationId: destination.id, tourId: tour.id, occurredAt: now },
      { type: 'tour_complete', destinationId: destination.id, tourId: tour.id, occurredAt: now },
      { type: 'scene_view', sceneId: scene.id, occurredAt: now },
      { type: 'poi_view', poiId: poi.id, occurredAt: now },
      { type: 'poi_view', poiId: poi.id, occurredAt: now },
      { type: 'media_play', occurredAt: now },
    ]);

    const summary = await getAnalyticsSummary(30);

    expect(summary.tourOpens).toBe(2);
    expect(summary.tourCompletes).toBe(1);
    // 1 completion / 2 opens.
    expect(summary.completionRatePercent).toBe(50);
    expect(summary.sceneViews).toBe(1);
    expect(summary.poiViews).toBe(2);
    expect(summary.mediaPlays).toBe(1);

    expect(summary.topPois).toEqual([{ poiId: poi.id, title: 'The well', value: 2 }]);

    const today = now.toISOString().slice(0, 10);
    expect(summary.daily).toEqual([{ day: today, value: 7 }]);
  });

  it('reports a null completion rate rather than dividing by zero when nothing has opened', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const summary = await getAnalyticsSummary(7);
    expect(summary.tourOpens).toBe(0);
    expect(summary.completionRatePercent).toBeNull();
  });
});
