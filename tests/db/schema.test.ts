import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, schema, type TestDb } from '../helpers/db';

/**
 * These tests assert that the *database* enforces the content model's
 * invariants. They must fail if a constraint is dropped, because application
 * code is not the last line of defence — the schema is.
 */

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(async () => {
  await close();
});

/** Minimal destination → tour chain, since almost every test needs one. */
async function createTour(slug: string) {
  const [destination] = await db
    .insert(schema.destinations)
    .values({ slug: `dest-${slug}`, defaultLocale: 'en', status: 'published' })
    .returning();
  const [tour] = await db
    .insert(schema.tours)
    .values({ destinationId: destination!.id, slug, kind: 'panorama', status: 'published' })
    .returning();
  return { destination: destination!, tour: tour! };
}

describe('migrations', () => {
  it('creates every table declared in the schema', async () => {
    const rows = await db.execute<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const names = new Set(
      (rows as unknown as { rows?: { table_name: string }[] }).rows?.map((r) => r.table_name) ??
        (rows as unknown as { table_name: string }[]).map((r) => r.table_name),
    );

    for (const expected of [
      'locales',
      'users',
      'sessions',
      'media_assets',
      'destinations',
      'tours',
      'scenes',
      'scene_links',
      'hotspots',
      'points_of_interest',
      'events',
      'analytics_events',
      'audit_log',
    ]) {
      expect(names.has(expected), `missing table: ${expected}`).toBe(true);
    }
  });
});

describe('scene invariants', () => {
  it('allows only one start scene per tour', async () => {
    const { tour } = await createTour('one-start');

    await db
      .insert(schema.scenes)
      .values({ tourId: tour.id, slug: 'entrance', isStart: true, kind: 'panorama' });

    await expect(
      db
        .insert(schema.scenes)
        .values({ tourId: tour.id, slug: 'stage', isStart: true, kind: 'panorama' }),
    ).rejects.toThrow();

    // A second non-start scene in the same tour is fine.
    await expect(
      db
        .insert(schema.scenes)
        .values({ tourId: tour.id, slug: 'stage', isStart: false, kind: 'panorama' }),
    ).resolves.toBeDefined();
  });

  it('lets two different tours each have their own start scene', async () => {
    const a = await createTour('start-a');
    const b = await createTour('start-b');

    await db.insert(schema.scenes).values({ tourId: a.tour.id, slug: 's', isStart: true });
    await expect(
      db.insert(schema.scenes).values({ tourId: b.tour.id, slug: 's', isStart: true }),
    ).resolves.toBeDefined();
  });

  it('rejects duplicate slugs within one tour but allows them across tours', async () => {
    const a = await createTour('slug-a');
    const b = await createTour('slug-b');

    await db.insert(schema.scenes).values({ tourId: a.tour.id, slug: 'duplicate' });
    await expect(
      db.insert(schema.scenes).values({ tourId: a.tour.id, slug: 'duplicate' }),
    ).rejects.toThrow();
    await expect(
      db.insert(schema.scenes).values({ tourId: b.tour.id, slug: 'duplicate' }),
    ).resolves.toBeDefined();
  });
});

describe('scene graph', () => {
  it('refuses a link from a scene to itself', async () => {
    const { tour } = await createTour('self-loop');
    const [scene] = await db
      .insert(schema.scenes)
      .values({ tourId: tour.id, slug: 'only' })
      .returning();

    await expect(
      db
        .insert(schema.sceneLinks)
        .values({ fromSceneId: scene!.id, toSceneId: scene!.id }),
    ).rejects.toThrow();
  });

  it('refuses a duplicate edge between the same pair', async () => {
    const { tour } = await createTour('dup-edge');
    const [a] = await db.insert(schema.scenes).values({ tourId: tour.id, slug: 'a' }).returning();
    const [b] = await db.insert(schema.scenes).values({ tourId: tour.id, slug: 'b' }).returning();

    await db.insert(schema.sceneLinks).values({ fromSceneId: a!.id, toSceneId: b!.id });
    await expect(
      db.insert(schema.sceneLinks).values({ fromSceneId: a!.id, toSceneId: b!.id }),
    ).rejects.toThrow();

    // The reverse direction is a distinct edge and must be allowed.
    await expect(
      db.insert(schema.sceneLinks).values({ fromSceneId: b!.id, toSceneId: a!.id }),
    ).resolves.toBeDefined();
  });

  it('removes links when a scene is deleted', async () => {
    const { tour } = await createTour('cascade-links');
    const [a] = await db.insert(schema.scenes).values({ tourId: tour.id, slug: 'a' }).returning();
    const [b] = await db.insert(schema.scenes).values({ tourId: tour.id, slug: 'b' }).returning();
    await db.insert(schema.sceneLinks).values({ fromSceneId: a!.id, toSceneId: b!.id });

    await db.delete(schema.scenes).where(eq(schema.scenes.id, a!.id));

    const remaining = await db.select().from(schema.sceneLinks);
    expect(remaining.filter((l) => l.fromSceneId === a!.id)).toHaveLength(0);
  });
});

describe('hotspot placement constraints', () => {
  it('rejects a pitch outside ±90°', async () => {
    const { tour } = await createTour('pitch');
    const [scene] = await db
      .insert(schema.scenes)
      .values({ tourId: tour.id, slug: 's' })
      .returning();

    await expect(
      db.insert(schema.hotspots).values({
        sceneId: scene!.id,
        actionType: 'info',
        pitchDeg: 120,
        yawDeg: 0,
      }),
    ).rejects.toThrow();
  });

  it('rejects normalized coordinates outside 0..1', async () => {
    const { tour } = await createTour('xy');
    const [scene] = await db
      .insert(schema.scenes)
      .values({ tourId: tour.id, slug: 's', kind: 'image' })
      .returning();

    await expect(
      db.insert(schema.hotspots).values({ sceneId: scene!.id, actionType: 'info', x: 1.4, y: 0.5 }),
    ).rejects.toThrow();
  });
});

describe('translations', () => {
  it('rejects an unknown locale code', async () => {
    const { tour } = await createTour('bad-locale');
    await expect(
      db
        .insert(schema.tourTranslations)
        .values({ tourId: tour.id, locale: 'zz', title: 'Nope' }),
    ).rejects.toThrow();
  });

  it('rejects two translations for the same tour and locale', async () => {
    const { tour } = await createTour('dup-locale');
    await db.insert(schema.tourTranslations).values({ tourId: tour.id, locale: 'en', title: 'A' });
    await expect(
      db.insert(schema.tourTranslations).values({ tourId: tour.id, locale: 'en', title: 'B' }),
    ).rejects.toThrow();
  });

  it('cascades translation deletion with its parent', async () => {
    const { tour } = await createTour('cascade-tr');
    await db.insert(schema.tourTranslations).values({ tourId: tour.id, locale: 'en', title: 'A' });
    await db.delete(schema.tours).where(eq(schema.tours.id, tour.id));

    const rows = await db
      .select()
      .from(schema.tourTranslations)
      .where(eq(schema.tourTranslations.tourId, tour.id));
    expect(rows).toHaveLength(0);
  });
});

describe('events', () => {
  it('refuses an end date before the start date', async () => {
    const { destination } = await createTour('event-dates');
    await expect(
      db.insert(schema.events).values({
        destinationId: destination.id,
        slug: 'backwards',
        startsAt: new Date('2026-06-10T18:00:00Z'),
        endsAt: new Date('2026-06-01T18:00:00Z'),
      }),
    ).rejects.toThrow();
  });
});

describe('poi categories', () => {
  it('refuses a colour that is not a hex value', async () => {
    const { destination } = await createTour('poi-color');
    await expect(
      db
        .insert(schema.poiCategories)
        .values({ destinationId: destination.id, slug: 'bad', color: 'goldenrod' }),
    ).rejects.toThrow();
  });
});
