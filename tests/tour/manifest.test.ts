import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, schema, type TestDb } from '../helpers/db';
import {
  makeDestination,
  makeEvent,
  makeHotspot,
  makeMedia,
  makePoi,
  makeScene,
  makeTour,
} from '../helpers/fixtures';
import { buildTourManifest } from '@/server/domain/tours/manifest';
import { isDomainError } from '@/server/domain/errors';

/**
 * The tour manifest — the one payload a visitor's browser receives.
 *
 * Two invariants are worth more than everything else here: nothing
 * unpublished may appear in it, and no reference inside it may dangle. The
 * first is a disclosure boundary; the second is what stops a crafted hotspot
 * payload from pulling in content it has no business reaching.
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
  await db.delete(schema.destinations);
  await db.delete(schema.mediaAssets);
});

/** A published destination with one tour and one start scene. */
async function scaffold() {
  const media = await makeMedia(db);
  const destination = await makeDestination(db, { slug: 'jableh', defaultLocale: 'ar' });
  const tour = await makeTour(db, destination.id, { slug: 'virtual-tour' });
  const start = await makeScene(db, tour.id, {
    slug: 'entrance',
    isStart: true,
    backgroundMediaId: media.id,
  });
  return { media, destination, tour, start };
}

const request = { destinationSlug: 'jableh', tourSlug: 'virtual-tour', locale: 'en' as const };

describe('lookup', () => {
  it('builds a manifest for a published tour', async () => {
    const { tour, start } = await scaffold();
    const manifest = await buildTourManifest(request);

    expect(manifest.tour.id).toBe(tour.id);
    expect(manifest.startSceneId).toBe(start.id);
    expect(manifest.scenes).toHaveLength(1);
    expect(manifest.locale).toBe('en');
    expect(manifest.direction).toBe('ltr');
  });

  it('refuses an unpublished tour', async () => {
    const { tour } = await scaffold();
    await db.update(schema.tours).set({ status: 'draft' }).where(eq(schema.tours.id, tour.id));

    const error = await buildTourManifest(request).catch((e) => e);
    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('not_found');
  });

  it('refuses a published tour inside an unpublished destination', async () => {
    const { destination } = await scaffold();
    await db
      .update(schema.destinations)
      .set({ status: 'draft' })
      .where(eq(schema.destinations.id, destination.id));

    await expect(buildTourManifest(request)).rejects.toThrow();
  });

  it('refuses a tour with no published scenes', async () => {
    const { start } = await scaffold();
    await db.update(schema.scenes).set({ status: 'draft' }).where(eq(schema.scenes.id, start.id));
    await expect(buildTourManifest(request)).rejects.toThrow();
  });

  it('reports not-found rather than forbidden, so a draft slug is not confirmed', async () => {
    const error = await buildTourManifest({ ...request, tourSlug: 'no-such-tour' }).catch((e) => e);
    expect(error.code).toBe('not_found');
  });
});

describe('publication filtering', () => {
  it('omits draft scenes', async () => {
    const { tour, media } = await scaffold();
    await makeScene(db, tour.id, { slug: 'draft-scene', status: 'draft', backgroundMediaId: media.id });

    const manifest = await buildTourManifest(request);
    expect(manifest.scenes.map((s) => s.slug)).toEqual(['entrance']);
  });

  it('omits draft hotspots', async () => {
    const { start } = await scaffold();
    await makeHotspot(db, start.id, { status: 'published' }, 'Visible');
    await makeHotspot(db, start.id, { status: 'draft' }, 'Hidden');

    const manifest = await buildTourManifest(request);
    expect(manifest.scenes[0]!.hotspots.map((h) => h.label)).toEqual(['Visible']);
  });

  it('omits draft points of interest', async () => {
    const { destination, start } = await scaffold();
    const draft = await makePoi(db, destination.id, { status: 'draft' });
    await db.insert(schema.scenePois).values({ sceneId: start.id, poiId: draft.id });

    const manifest = await buildTourManifest(request);
    expect(manifest.pois).toHaveLength(0);
    expect(manifest.scenes[0]!.poiIds).toHaveLength(0);
  });

  it('omits links pointing at an unpublished scene', async () => {
    const { tour, start, media } = await scaffold();
    const hidden = await makeScene(db, tour.id, { status: 'draft', backgroundMediaId: media.id });
    await db.insert(schema.sceneLinks).values({ fromSceneId: start.id, toSceneId: hidden.id });

    const manifest = await buildTourManifest(request);
    expect(manifest.scenes[0]!.linkedSceneIds).toEqual([]);
  });

  it('never leaks an internal field to the client', async () => {
    const { start } = await scaffold();
    await makeHotspot(db, start.id);
    const manifest = await buildTourManifest(request);
    const serialized = JSON.stringify(manifest);

    // Storage keys, checksums, uploader ids and status columns all stay on
    // the server; the client gets URLs and resolved text.
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('checksum');
    expect(serialized).not.toContain('createdBy');
    expect(serialized).not.toContain('"status"');
  });
});

describe('dangling and out-of-scope references', () => {
  it('drops a navigate hotspot pointing at an unpublished scene', async () => {
    const { tour, start, media } = await scaffold();
    const draft = await makeScene(db, tour.id, { status: 'draft', backgroundMediaId: media.id });
    await makeHotspot(db, start.id, {
      actionType: 'navigate',
      actionPayload: { sceneId: draft.id },
    });

    const manifest = await buildTourManifest(request);
    // Reaching the browser would produce a marker that silently does nothing.
    expect(manifest.scenes[0]!.hotspots).toHaveLength(0);
  });

  it('drops a navigate hotspot pointing at a scene in a different tour', async () => {
    const { destination, start, media } = await scaffold();
    const otherTour = await makeTour(db, destination.id, { slug: 'other-tour' });
    const foreign = await makeScene(db, otherTour.id, { backgroundMediaId: media.id });

    await makeHotspot(db, start.id, {
      actionType: 'navigate',
      actionPayload: { sceneId: foreign.id },
    });

    const manifest = await buildTourManifest(request);
    expect(manifest.scenes[0]!.hotspots).toHaveLength(0);
  });

  it('drops a POI hotspot pointing at another destination', async () => {
    const { start } = await scaffold();
    const otherDestination = await makeDestination(db, { slug: 'elsewhere' });
    const foreignPoi = await makePoi(db, otherDestination.id);

    await makeHotspot(db, start.id, { actionType: 'poi', actionPayload: { poiId: foreignPoi.id } });

    const manifest = await buildTourManifest(request);
    expect(manifest.scenes[0]!.hotspots).toHaveLength(0);
    expect(manifest.pois).toHaveLength(0);
  });

  it('drops a hotspot whose payload no longer matches its action schema', async () => {
    const { start } = await scaffold();
    // Simulates a payload written before a schema change, or edited by hand.
    await makeHotspot(db, start.id, {
      actionType: 'navigate',
      actionPayload: { url: 'https://example.org' },
    });

    const manifest = await buildTourManifest(request);
    expect(manifest.scenes[0]!.hotspots).toHaveLength(0);
  });

  it('keeps a hotspot whose reference is valid and in scope', async () => {
    const { tour, start, media } = await scaffold();
    const second = await makeScene(db, tour.id, { slug: 'orchestra', backgroundMediaId: media.id });
    await makeHotspot(db, start.id, {
      actionType: 'navigate',
      actionPayload: { sceneId: second.id },
    });

    const manifest = await buildTourManifest(request);
    expect(manifest.scenes[0]!.hotspots).toHaveLength(1);
    expect(manifest.scenes[0]!.hotspots[0]!.payload).toEqual({ sceneId: second.id });
  });

  it('drops an event hotspot pointing at another destination', async () => {
    const { start } = await scaffold();
    const otherDestination = await makeDestination(db, { slug: 'other-place' });
    const foreignEvent = await makeEvent(db, otherDestination.id);

    await makeHotspot(db, start.id, {
      actionType: 'event',
      actionPayload: { eventId: foreignEvent.id },
    });

    const manifest = await buildTourManifest(request);
    expect(manifest.scenes[0]!.hotspots).toHaveLength(0);
    expect(manifest.events).toHaveLength(0);
  });

  it('includes an event that does belong to this destination', async () => {
    const { destination, start } = await scaffold();
    const event = await makeEvent(db, destination.id);
    await makeHotspot(db, start.id, {
      actionType: 'event',
      actionPayload: { eventId: event.id },
    });

    const manifest = await buildTourManifest(request);
    expect(manifest.scenes[0]!.hotspots).toHaveLength(1);
    expect(manifest.events.map((e) => e.id)).toEqual([event.id]);
  });
});

describe('translation resolution', () => {
  it('renders the requested locale', async () => {
    await scaffold();
    const manifest = await buildTourManifest(request);
    expect(manifest.tour.title).toBe('Tour');
    expect(manifest.destination.name).toBe('Destination');
  });

  it('falls back to the destination default when the locale is missing', async () => {
    const { tour } = await scaffold();
    await db
      .delete(schema.tourTranslations)
      .where(eq(schema.tourTranslations.tourId, tour.id));
    await db
      .insert(schema.tourTranslations)
      .values({ tourId: tour.id, locale: 'ar', title: 'الجولة العربية' });

    const manifest = await buildTourManifest(request);
    expect(manifest.tour.title).toBe('الجولة العربية');
  });

  it('falls back to the slug rather than rendering an empty title', async () => {
    const { tour } = await scaffold();
    await db.delete(schema.tourTranslations).where(eq(schema.tourTranslations.tourId, tour.id));

    const manifest = await buildTourManifest(request);
    expect(manifest.tour.title).toBe('virtual-tour');
  });

  it('sets direction from the requested locale', async () => {
    await scaffold();
    const arabic = await buildTourManifest({ ...request, locale: 'ar' });
    expect(arabic.direction).toBe('rtl');
  });
});

describe('scene payload', () => {
  it('carries the inline preview so the first paint needs no extra request', async () => {
    await scaffold();
    const manifest = await buildTourManifest(request);
    expect(manifest.scenes[0]!.background?.previewDataUri).toMatch(/^data:image\/webp/);
  });

  it('offers a texture no wider than a mobile GPU can hold', async () => {
    await scaffold();
    const manifest = await buildTourManifest(request);
    const background = manifest.scenes[0]!.background!;
    // The default `src` for a panorama is the half-resolution rendition.
    expect(background.src).toContain('half');
  });

  it('applies tour settings, falling back to sane defaults', async () => {
    const { tour } = await scaffold();
    await db
      .update(schema.tours)
      .set({ settings: { autoRotate: true, showCompass: false } })
      .where(eq(schema.tours.id, tour.id));

    const manifest = await buildTourManifest(request);
    expect(manifest.tour.settings.autoRotate).toBe(true);
    expect(manifest.tour.settings.showCompass).toBe(false);
    // Not supplied, so the default stands.
    expect(manifest.tour.settings.showSceneList).toBe(true);
  });

  it('falls back to the first scene when no scene is marked as the start', async () => {
    const { start } = await scaffold();
    await db.update(schema.scenes).set({ isStart: false }).where(eq(schema.scenes.id, start.id));

    const manifest = await buildTourManifest(request);
    expect(manifest.startSceneId).toBe(start.id);
  });
});
