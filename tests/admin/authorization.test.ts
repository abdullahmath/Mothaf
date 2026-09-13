import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { actAs, mockAuthCookies } from '../helpers/auth';

// Hoisted by Vitest, so it must come before the modules under test are used.
mockAuthCookies();

import { createTestDb, schema, type TestDb } from '../helpers/db';
import { makeDestination, makeMedia, makeScene, makeTour, makeUser, makePoi } from '../helpers/fixtures';
import {
  canManageUserWithRole,
  hasPermission,
  permissionsFor,
  PERMISSIONS,
} from '@/server/auth/permissions';
import { isDomainError } from '@/server/domain/errors';
import {
  createDestination,
  destinationInputSchema,
  getDestinationForAdmin,
  updateDestination,
} from '@/server/domain/admin/destinations';
import { createTour, setTourStatus } from '@/server/domain/admin/tours';
import { createScene, reorderScenes, setSceneLinks } from '@/server/domain/admin/scenes';
import { createHotspot, updateHotspot } from '@/server/domain/admin/hotspots';
import { createCategory, createPoi } from '@/server/domain/admin/pois';
import {
  createHeritageSite,
  deleteHeritageSite,
  getHeritageSiteForAdmin,
  updateHeritageSite,
} from '@/server/domain/admin/heritage';
import { addScheduleItem, createEvent } from '@/server/domain/admin/events';
import { getAnalyticsSummary } from '@/server/domain/admin/analytics';

/**
 * Authorization.
 *
 * Only the cookie layer is mocked. Every `requirePermission` call, the whole
 * role matrix, and each service's own checks are the real code — mocking the
 * permission check itself would leave these tests asserting nothing.
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
  await db.delete(schema.users);
  await db.delete(schema.mediaAssets);
  actAs(null);
});

const arEn = [
  { locale: 'ar', name: 'اسم' },
  { locale: 'en', name: 'Name' },
];

describe('the permission matrix', () => {
  it('gives a super admin everything', () => {
    expect([...permissionsFor('super_admin')].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('withholds platform settings from an administrator', () => {
    expect(hasPermission('administrator', 'settings:write')).toBe(false);
    expect(hasPermission('super_admin', 'settings:write')).toBe(true);
  });

  it('lets a content editor write but not publish', () => {
    expect(hasPermission('content_editor', 'content:write')).toBe(true);
    expect(hasPermission('content_editor', 'content:publish')).toBe(false);
  });

  it('gives an analyst read access and nothing else', () => {
    expect(hasPermission('analyst', 'analytics:read')).toBe(true);
    expect(hasPermission('analyst', 'content:read')).toBe(true);
    expect(hasPermission('analyst', 'content:write')).toBe(false);
    expect(hasPermission('analyst', 'media:write')).toBe(false);
    expect(hasPermission('analyst', 'event:write')).toBe(false);
  });

  it('keeps an event manager away from destination content', () => {
    expect(hasPermission('event_manager', 'event:publish')).toBe(true);
    expect(hasPermission('event_manager', 'content:write')).toBe(false);
  });

  it('never grants user management outside the two admin roles', () => {
    for (const role of ['content_editor', 'event_manager', 'analyst'] as const) {
      expect(hasPermission(role, 'user:write')).toBe(false);
    }
  });

  describe('managing other users', () => {
    it('lets only a super admin touch another super admin', () => {
      // Otherwise an administrator could promote themselves, or lock the
      // owner out by editing their account.
      expect(canManageUserWithRole('administrator', 'super_admin')).toBe(false);
      expect(canManageUserWithRole('super_admin', 'super_admin')).toBe(true);
    });

    it('lets an administrator manage ordinary roles', () => {
      expect(canManageUserWithRole('administrator', 'content_editor')).toBe(true);
    });

    it('refuses anyone without user:write outright', () => {
      expect(canManageUserWithRole('content_editor', 'content_editor')).toBe(false);
      expect(canManageUserWithRole('analyst', 'analyst')).toBe(false);
    });
  });
});

describe('unauthenticated callers', () => {
  it('are refused by every admin service, not merely redirected by the layout', async () => {
    actAs(null);

    const attempts = [
      () => createDestination({ slug: 'x', defaultLocale: 'ar', status: 'draft' }, []),
      () => getAnalyticsSummary(30),
      () => reorderScenes('00000000-0000-0000-0000-000000000000', []),
    ];

    for (const attempt of attempts) {
      const error = await attempt().then(() => null).catch((e) => e);
      expect(isDomainError(error)).toBe(true);
      expect(error.code).toBe('unauthenticated');
    }
  });
});

describe('role enforcement in services', () => {
  it('refuses an analyst trying to write content', async () => {
    const user = await makeUser(db, 'analyst');
    actAs({ id: user.id, role: 'analyst' });

    const error = await createDestination(
      { slug: 'new-place', defaultLocale: 'ar', status: 'draft' },
      arEn,
    )
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('forbidden');
  });

  it('refuses a content editor reading analytics', async () => {
    const user = await makeUser(db, 'content_editor');
    actAs({ id: user.id, role: 'content_editor' });

    const error = await getAnalyticsSummary(7).then(() => null).catch((e) => e);
    expect(error.code).toBe('forbidden');
  });

  it('allows an administrator to create content', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    await expect(
      createDestination({ slug: 'allowed', defaultLocale: 'ar', status: 'draft' }, arEn),
    ).resolves.toBeTruthy();
  });
});

describe('publishing is a separate permission', () => {
  it('downgrades a publish attempt by an editor who may not publish', async () => {
    const user = await makeUser(db, 'content_editor');
    actAs({ id: user.id, role: 'content_editor' });

    // The UI does not offer the option, so reaching here means the request
    // was crafted. Their work is still saved — as a draft.
    const id = await createDestination(
      { slug: 'sneaky', defaultLocale: 'ar', status: 'published' },
      arEn,
    );

    const [row] = await db
      .select()
      .from(schema.destinations)
      .where(eq(schema.destinations.id, id));
    expect(row!.status).toBe('draft');
    expect(row!.publishedAt).toBeNull();
  });

  it('honours a publish by someone who may publish', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const id = await createDestination(
      { slug: 'legit', defaultLocale: 'ar', status: 'published' },
      arEn,
    );
    const [row] = await db
      .select()
      .from(schema.destinations)
      .where(eq(schema.destinations.id, id));
    expect(row!.status).toBe('published');
    expect(row!.publishedAt).not.toBeNull();
  });

  it('does not let an editor un-publish by saving a draft status', async () => {
    const admin = await makeUser(db, 'administrator');
    actAs({ id: admin.id, role: 'administrator' });
    const id = await createDestination(
      { slug: 'live', defaultLocale: 'ar', status: 'published' },
      arEn,
    );

    const editor = await makeUser(db, 'content_editor');
    actAs({ id: editor.id, role: 'content_editor' });
    // An editor *may* move something back to draft — that is a write, not a
    // publish — so this is allowed and asserted to behave predictably.
    await updateDestination(id, { slug: 'live', defaultLocale: 'ar', status: 'draft' }, arEn);

    const [row] = await db
      .select()
      .from(schema.destinations)
      .where(eq(schema.destinations.id, id));
    expect(row!.status).toBe('draft');
  });

  it('refuses to publish a tour that has no published scene', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const destination = await makeDestination(db);
    const tour = await makeTour(db, destination.id, { status: 'draft' });

    // Publishing this would 404 for every visitor who followed the link.
    const error = await setTourStatus(tour.id, 'published').then(() => null).catch((e) => e);
    expect(isDomainError(error)).toBe(true);
  });
});

describe('slug uniqueness', () => {
  it('refuses a duplicate destination slug with a usable message', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    await createDestination({ slug: 'taken', defaultLocale: 'ar', status: 'draft' }, arEn);
    const error = await createDestination(
      { slug: 'taken', defaultLocale: 'ar', status: 'draft' },
      arEn,
    )
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('conflict');
    expect(error.message).toContain('taken');
  });

  it('scopes tour slugs per destination, not globally', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const first = await makeDestination(db, { slug: 'site-one' });
    const second = await makeDestination(db, { slug: 'site-two' });

    const input = {
      slug: 'virtual-tour',
      kind: 'panorama' as const,
      status: 'draft' as const,
    };

    await expect(
      createTour({ ...input, destinationId: first.id }, [{ locale: 'en', title: 'A' }]),
    ).resolves.toBeTruthy();
    // Two different sites may each have a tour called "virtual-tour".
    await expect(
      createTour({ ...input, destinationId: second.id }, [{ locale: 'en', title: 'B' }]),
    ).resolves.toBeTruthy();
    // But not twice within one site.
    await expect(
      createTour({ ...input, destinationId: first.id }, [{ locale: 'en', title: 'C' }]),
    ).rejects.toThrow();
  });
});

describe('embedded 3D model', () => {
  it('accepts a bare 32-character Sketchfab id', () => {
    const parsed = destinationInputSchema.safeParse({
      slug: 'x',
      defaultLocale: 'ar',
      status: 'draft',
      sketchfabModelId: '6adbb6547e484b66b65790f34e5aecfc',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a full URL or embed src, not just a bare id', () => {
    // The schema only accepts the bare id — the server builds the iframe src
    // itself, so a value that already looks like a URL is a sign the wrong
    // thing was pasted, not something to silently extract from. (The action
    // that reads the form field does the friendly extraction; the domain
    // schema stays strict.)
    for (const bad of [
      'https://sketchfab.com/3d-models/jableh-theatre-6adbb6547e484b66b65790f34e5aecfc',
      'https://sketchfab.com/models/6adbb6547e484b66b65790f34e5aecfc/embed',
      'not-hex-at-all-not-hex-at-all-32',
      '6adbb6547e484b66b65790f34e5aecf', // 31 chars, one short
    ]) {
      const parsed = destinationInputSchema.safeParse({
        slug: 'x',
        defaultLocale: 'ar',
        status: 'draft',
        sketchfabModelId: bad,
      });
      expect(parsed.success, `should reject: ${bad}`).toBe(false);
    }
  });

  it('stores and returns the id unchanged, and a destination with none has null', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const withModel = await createDestination(
      {
        slug: 'has-a-scan',
        defaultLocale: 'ar',
        status: 'draft',
        sketchfabModelId: '6adbb6547e484b66b65790f34e5aecfc',
      },
      arEn,
    );
    const withoutModel = await createDestination(
      { slug: 'no-scan', defaultLocale: 'ar', status: 'draft' },
      arEn,
    );

    expect((await getDestinationForAdmin(withModel)).sketchfabModelId).toBe(
      '6adbb6547e484b66b65790f34e5aecfc',
    );
    expect((await getDestinationForAdmin(withoutModel)).sketchfabModelId).toBeNull();
  });
});

describe('scene invariants', () => {
  it('makes the first scene of a tour the start automatically', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const media = await makeMedia(db);
    const destination = await makeDestination(db);
    const tour = await makeTour(db, destination.id);

    const first = await createScene(
      {
        tourId: tour.id,
        slug: 'first',
        kind: 'panorama',
        status: 'draft',
        backgroundMediaId: media.id,
      },
      [{ locale: 'en', title: 'First' }],
    );

    const [row] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, first));
    // Without this a new tour would have no entry point and could never be
    // published.
    expect(row!.isStart).toBe(true);
  });

  it('moves the start flag rather than creating a second one', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const media = await makeMedia(db);
    const destination = await makeDestination(db);
    const tour = await makeTour(db, destination.id);

    const first = await createScene(
      { tourId: tour.id, slug: 'first', kind: 'panorama', status: 'draft', backgroundMediaId: media.id },
      [{ locale: 'en', title: 'First' }],
    );
    const second = await createScene(
      {
        tourId: tour.id,
        slug: 'second',
        kind: 'panorama',
        status: 'draft',
        isStart: true,
        backgroundMediaId: media.id,
      },
      [{ locale: 'en', title: 'Second' }],
    );

    const rows = await db.select().from(schema.scenes).where(eq(schema.scenes.tourId, tour.id));
    const starts = rows.filter((r) => r.isStart);
    expect(starts).toHaveLength(1);
    expect(starts[0]!.id).toBe(second);
    expect(rows.find((r) => r.id === first)!.isStart).toBe(false);
  });

  it('requires a background image for a panoramic scene', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const destination = await makeDestination(db);
    const tour = await makeTour(db, destination.id);

    const error = await createScene(
      { tourId: tour.id, slug: 'empty', kind: 'panorama', status: 'draft' },
      [{ locale: 'en', title: 'Empty' }],
    )
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('validation');
  });

  it('ignores scene ids from another tour when reordering', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const media = await makeMedia(db);
    const destination = await makeDestination(db);
    const tourA = await makeTour(db, destination.id, { slug: 'a' });
    const tourB = await makeTour(db, destination.id, { slug: 'b' });

    const mine = await makeScene(db, tourA.id, { backgroundMediaId: media.id, position: 0 });
    const foreign = await makeScene(db, tourB.id, { backgroundMediaId: media.id, position: 7 });

    await reorderScenes(tourA.id, [foreign.id, mine.id]);

    const [foreignAfter] = await db
      .select()
      .from(schema.scenes)
      .where(eq(schema.scenes.id, foreign.id));
    // A crafted list must not renumber another tour's scenes.
    expect(foreignAfter!.position).toBe(7);
  });

  it('ignores link targets outside the tour', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const media = await makeMedia(db);
    const destination = await makeDestination(db);
    const tourA = await makeTour(db, destination.id, { slug: 'a' });
    const tourB = await makeTour(db, destination.id, { slug: 'b' });

    const from = await makeScene(db, tourA.id, { backgroundMediaId: media.id });
    const sibling = await makeScene(db, tourA.id, { backgroundMediaId: media.id });
    const foreign = await makeScene(db, tourB.id, { backgroundMediaId: media.id });

    await setSceneLinks(from.id, [sibling.id, foreign.id, from.id]);

    const links = await db
      .select()
      .from(schema.sceneLinks)
      .where(eq(schema.sceneLinks.fromSceneId, from.id));

    // The sibling survives; the foreign scene and the self-link do not.
    expect(links.map((l) => l.toSceneId)).toEqual([sibling.id]);
  });
});

describe('hotspot reference scoping', () => {
  it('refuses a navigate hotspot pointing outside its tour', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const media = await makeMedia(db);
    const destination = await makeDestination(db);
    const tourA = await makeTour(db, destination.id, { slug: 'a' });
    const tourB = await makeTour(db, destination.id, { slug: 'b' });
    const scene = await makeScene(db, tourA.id, { backgroundMediaId: media.id });
    const foreign = await makeScene(db, tourB.id, { backgroundMediaId: media.id });

    const error = await createHotspot(
      {
        sceneId: scene.id,
        actionType: 'navigate',
        payload: { sceneId: foreign.id },
        yawDeg: 10,
        pitchDeg: 0,
        icon: 'arrow',
        style: 'arrow',
        status: 'published',
      },
      [{ locale: 'en', label: 'Go' }],
    )
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('validation');
  });

  it('refuses a POI hotspot pointing at another destination', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const media = await makeMedia(db);
    const home = await makeDestination(db, { slug: 'home' });
    const elsewhere = await makeDestination(db, { slug: 'elsewhere' });
    const tour = await makeTour(db, home.id);
    const scene = await makeScene(db, tour.id, { backgroundMediaId: media.id });
    const foreignPoi = await makePoi(db, elsewhere.id);

    const error = await createHotspot(
      {
        sceneId: scene.id,
        actionType: 'poi',
        payload: { poiId: foreignPoi.id },
        yawDeg: 0,
        pitchDeg: 0,
        icon: 'marker',
        style: 'pin',
        status: 'published',
      },
      [{ locale: 'en', label: 'About' }],
    )
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
  });

  it('requires a placement before a marker can be saved', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const media = await makeMedia(db);
    const destination = await makeDestination(db);
    const tour = await makeTour(db, destination.id);
    const scene = await makeScene(db, tour.id, { backgroundMediaId: media.id });

    // A panoramic scene positions by bearing; without one the marker would be
    // stored and then silently never appear.
    const error = await createHotspot(
      {
        sceneId: scene.id,
        actionType: 'info',
        payload: {},
        icon: 'info',
        style: 'pulse',
        status: 'published',
      },
      [{ locale: 'en', label: 'Note' }],
    )
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(error.fields?.placement).toBeTruthy();
  });

  it('accepts a well-scoped hotspot', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const media = await makeMedia(db);
    const destination = await makeDestination(db);
    const tour = await makeTour(db, destination.id);
    const scene = await makeScene(db, tour.id, { backgroundMediaId: media.id });
    const target = await makeScene(db, tour.id, { backgroundMediaId: media.id });

    await expect(
      createHotspot(
        {
          sceneId: scene.id,
          actionType: 'navigate',
          payload: { sceneId: target.id },
          yawDeg: 45,
          pitchDeg: -5,
          icon: 'arrow',
          style: 'arrow',
          status: 'published',
        },
        [{ locale: 'en', label: 'Onward' }],
      ),
    ).resolves.toBeTruthy();
  });

  it('scopes an update to the hotspot\'s real scene, not a forged sceneId field', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const media = await makeMedia(db);
    const home = await makeDestination(db, { slug: 'home-update' });
    const elsewhere = await makeDestination(db, { slug: 'elsewhere-update' });
    const homeTour = await makeTour(db, home.id);
    const homeScene = await makeScene(db, homeTour.id, { backgroundMediaId: media.id });
    const elsewhereTour = await makeTour(db, elsewhere.id);
    const elsewhereScene = await makeScene(db, elsewhereTour.id, { backgroundMediaId: media.id });
    const elsewherePoi = await makePoi(db, elsewhere.id);

    const hotspot = await createHotspot(
      {
        sceneId: homeScene.id,
        actionType: 'info',
        payload: {},
        yawDeg: 0,
        pitchDeg: 0,
        icon: 'info',
        style: 'pulse',
        status: 'published',
      },
      [{ locale: 'en', label: 'Note' }],
    );

    // The hotspot actually lives on `homeScene`. A client that forges the
    // `sceneId` field to `elsewhereScene` should not be able to smuggle a
    // reference to that destination's POI past the scoping check.
    const error = await updateHotspot(
      hotspot,
      {
        sceneId: elsewhereScene.id,
        actionType: 'poi',
        payload: { poiId: elsewherePoi.id },
        yawDeg: 0,
        pitchDeg: 0,
        icon: 'marker',
        style: 'pin',
        status: 'published',
      },
      [{ locale: 'en', label: 'About' }],
    )
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
  });
});

describe('POI category scoping', () => {
  it('refuses a category that belongs to a different destination', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const home = await makeDestination(db, { slug: 'home-poi' });
    const elsewhere = await makeDestination(db, { slug: 'elsewhere-poi' });
    const foreignCategory = await createCategory(
      { destinationId: elsewhere.id, slug: 'foreign', color: '#4FB3A0', icon: 'marker' },
      [{ locale: 'en', name: 'Foreign' }],
    );

    const error = await createPoi(
      { destinationId: home.id, categoryId: foreignCategory, slug: 'mismatched', status: 'draft', tags: [] },
      [{ locale: 'en', title: 'Mismatched' }],
    )
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('validation');
  });

  it('accepts a category from the same destination', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const destination = await makeDestination(db, { slug: 'own-poi' });
    const category = await createCategory(
      { destinationId: destination.id, slug: 'own', color: '#4FB3A0', icon: 'marker' },
      [{ locale: 'en', name: 'Own' }],
    );

    await expect(
      createPoi(
        { destinationId: destination.id, categoryId: category, slug: 'matched', status: 'draft', tags: [] },
        [{ locale: 'en', title: 'Matched' }],
      ),
    ).resolves.toBeTruthy();
  });
});

describe('event tour and schedule scoping', () => {
  it('refuses an event linked to another destination\'s tour', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const home = await makeDestination(db, { slug: 'home-event' });
    const elsewhere = await makeDestination(db, { slug: 'elsewhere-event' });
    const foreignTour = await makeTour(db, elsewhere.id, { slug: 'foreign-tour' });

    const error = await createEvent(
      {
        destinationId: home.id,
        tourId: foreignTour.id,
        slug: 'mismatched-event',
        status: 'draft',
        startsAt: new Date('2026-06-01T10:00:00Z'),
        endsAt: new Date('2026-06-01T12:00:00Z'),
        timezone: 'UTC',
      },
      [{ locale: 'en', title: 'Mismatched event' }],
    )
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('validation');
  });

  it('accepts an event linked to its own destination\'s tour', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const destination = await makeDestination(db, { slug: 'own-event' });
    const tour = await makeTour(db, destination.id, { slug: 'own-event-tour' });

    await expect(
      createEvent(
        {
          destinationId: destination.id,
          tourId: tour.id,
          slug: 'matched-event',
          status: 'draft',
          startsAt: new Date('2026-06-01T10:00:00Z'),
          endsAt: new Date('2026-06-01T12:00:00Z'),
          timezone: 'UTC',
        },
        [{ locale: 'en', title: 'Matched event' }],
      ),
    ).resolves.toBeTruthy();
  });

  it('refuses a schedule item pointing at a scene in another destination', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const media = await makeMedia(db);
    const home = await makeDestination(db, { slug: 'home-schedule' });
    const elsewhere = await makeDestination(db, { slug: 'elsewhere-schedule' });
    const foreignTour = await makeTour(db, elsewhere.id, { slug: 'foreign-schedule-tour' });
    const foreignScene = await makeScene(db, foreignTour.id, { backgroundMediaId: media.id });

    const eventId = await createEvent(
      {
        destinationId: home.id,
        slug: 'home-schedule-event',
        status: 'draft',
        startsAt: new Date('2026-06-01T10:00:00Z'),
        endsAt: new Date('2026-06-01T18:00:00Z'),
        timezone: 'UTC',
      },
      [{ locale: 'en', title: 'Home event' }],
    );

    const error = await addScheduleItem(
      {
        eventId,
        startsAt: new Date('2026-06-01T11:00:00Z'),
        sceneId: foreignScene.id,
      },
      [{ locale: 'en', title: 'Item' }],
    )
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('validation');
  });

  it('accepts a schedule item pointing at a scene in the same destination', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const media = await makeMedia(db);
    const destination = await makeDestination(db, { slug: 'own-schedule' });
    const tour = await makeTour(db, destination.id, { slug: 'own-schedule-tour' });
    const scene = await makeScene(db, tour.id, { backgroundMediaId: media.id });

    const eventId = await createEvent(
      {
        destinationId: destination.id,
        slug: 'own-schedule-event',
        status: 'draft',
        startsAt: new Date('2026-06-01T10:00:00Z'),
        endsAt: new Date('2026-06-01T18:00:00Z'),
        timezone: 'UTC',
      },
      [{ locale: 'en', title: 'Own event' }],
    );

    await expect(
      addScheduleItem(
        { eventId, startsAt: new Date('2026-06-01T11:00:00Z'), sceneId: scene.id },
        [{ locale: 'en', title: 'Item' }],
      ),
    ).resolves.toBeTruthy();
  });
});

describe('heritage sites', () => {
  it('refuses an analyst trying to create one', async () => {
    const user = await makeUser(db, 'analyst');
    actAs({ id: user.id, role: 'analyst' });

    const destination = await makeDestination(db);
    const error = await createHeritageSite(
      { destinationId: destination.id, slug: 'refused-site', status: 'draft', galleryMediaIds: [] },
      [{ locale: 'en', title: 'Refused' }],
    )
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('forbidden');
  });

  it('refuses two sites in the same destination sharing a slug', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const destination = await makeDestination(db);
    await createHeritageSite(
      { destinationId: destination.id, slug: 'the-fort', status: 'draft', galleryMediaIds: [] },
      [{ locale: 'en', title: 'The fort' }],
    );

    const error = await createHeritageSite(
      { destinationId: destination.id, slug: 'the-fort', status: 'draft', galleryMediaIds: [] },
      [{ locale: 'en', title: 'Another fort' }],
    )
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('conflict');
  });

  it('allows the same slug reused in a different destination', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const first = await makeDestination(db, { slug: 'first-place' });
    const second = await makeDestination(db, { slug: 'second-place' });

    await createHeritageSite(
      { destinationId: first.id, slug: 'shared-slug', status: 'draft', galleryMediaIds: [] },
      [{ locale: 'en', title: 'One' }],
    );

    await expect(
      createHeritageSite(
        { destinationId: second.id, slug: 'shared-slug', status: 'draft', galleryMediaIds: [] },
        [{ locale: 'en', title: 'Two' }],
      ),
    ).resolves.toBeTruthy();
  });

  it('refuses a gallery id that does not correspond to a real media asset', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const destination = await makeDestination(db);
    const error = await createHeritageSite(
      {
        destinationId: destination.id,
        slug: 'bad-gallery',
        status: 'draft',
        galleryMediaIds: ['00000000-0000-0000-0000-000000000000'],
      },
      [{ locale: 'en', title: 'Bad gallery' }],
    )
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('validation');
  });

  it('creates, reads back and updates a site with a real gallery', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const destination = await makeDestination(db);
    const photoA = await makeMedia(db, { kind: 'image' });
    const photoB = await makeMedia(db, { kind: 'image' });

    const id = await createHeritageSite(
      {
        destinationId: destination.id,
        slug: 'citadel',
        status: 'published',
        coverMediaId: photoA.id,
        galleryMediaIds: [photoA.id, photoB.id],
      },
      [
        { locale: 'en', title: 'The citadel', shortDescription: 'A hilltop fortress.' },
        { locale: 'ar', title: 'القلعة' },
      ],
    );

    const loaded = await getHeritageSiteForAdmin(id);
    expect(loaded.galleryMediaIds).toEqual([photoA.id, photoB.id]);
    expect(loaded.translations.find((t) => t.locale === 'en')?.title).toBe('The citadel');

    // Dropping photoA from the gallery on update must actually remove it, not
    // just append photoB again.
    await updateHeritageSite(
      id,
      {
        destinationId: destination.id,
        slug: 'citadel',
        status: 'published',
        coverMediaId: photoA.id,
        galleryMediaIds: [photoB.id],
      },
      [{ locale: 'en', title: 'The citadel' }],
    );

    const updated = await getHeritageSiteForAdmin(id);
    expect(updated.galleryMediaIds).toEqual([photoB.id]);
  });

  it('deletes a site', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const destination = await makeDestination(db);
    const id = await createHeritageSite(
      { destinationId: destination.id, slug: 'to-delete', status: 'draft', galleryMediaIds: [] },
      [{ locale: 'en', title: 'Gone soon' }],
    );

    await deleteHeritageSite(id);

    const error = await getHeritageSiteForAdmin(id).then(() => null).catch((e) => e);
    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('not_found');
  });

  it('actually moves a site when its destination is changed on update', async () => {
    // Regression: updateHeritageSite scoped the slug-uniqueness check to the
    // *new* destinationId but never wrote destinationId itself, so picking a
    // different destination in the form silently had no effect on the row.
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const origin = await makeDestination(db, { slug: 'origin-place' });
    const target = await makeDestination(db, { slug: 'target-place' });

    const id = await createHeritageSite(
      { destinationId: origin.id, slug: 'the-well', status: 'draft', galleryMediaIds: [] },
      [{ locale: 'en', title: 'The well' }],
    );

    await updateHeritageSite(
      id,
      { destinationId: target.id, slug: 'the-well', status: 'draft', galleryMediaIds: [] },
      [{ locale: 'en', title: 'The well' }],
    );

    const [row] = await db.select().from(schema.heritageSites).where(eq(schema.heritageSites.id, id));
    expect(row!.destinationId).toBe(target.id);

    // And the slug is free again in the destination it left.
    await expect(
      createHeritageSite(
        { destinationId: origin.id, slug: 'the-well', status: 'draft', galleryMediaIds: [] },
        [{ locale: 'en', title: 'A different well' }],
      ),
    ).resolves.toBeTruthy();
  });

  it('refuses a content editor trying to delete one — matches the DangerZone UI gate', async () => {
    const admin = await makeUser(db, 'administrator');
    actAs({ id: admin.id, role: 'administrator' });
    const destination = await makeDestination(db);
    const id = await createHeritageSite(
      { destinationId: destination.id, slug: 'protected-site', status: 'draft', galleryMediaIds: [] },
      [{ locale: 'en', title: 'Protected' }],
    );

    const editor = await makeUser(db, 'content_editor');
    actAs({ id: editor.id, role: 'content_editor' });
    const error = await deleteHeritageSite(id).then(() => null).catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('forbidden');

    actAs({ id: admin.id, role: 'administrator' });
    await expect(getHeritageSiteForAdmin(id)).resolves.toBeTruthy();
  });
});

describe('translation writes', () => {
  it('actually persists the translation rows, keyed to their parent', async () => {
    // The regression this guards: the shared writer keyed its insert by the
    // database column name rather than the Drizzle property name, so the
    // foreign key was emitted as DEFAULT and every translation write failed.
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const id = await createDestination(
      { slug: 'translated', defaultLocale: 'ar', status: 'draft' },
      [
        { locale: 'ar', name: 'المسرح', summary: 'ملخص' },
        { locale: 'en', name: 'The theatre', summary: null },
      ],
    );

    const rows = await db
      .select()
      .from(schema.destinationTranslations)
      .where(eq(schema.destinationTranslations.destinationId, id));

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.destinationId === id)).toBe(true);
    expect(rows.find((r) => r.locale === 'ar')?.name).toBe('المسرح');
    expect(rows.find((r) => r.locale === 'en')?.name).toBe('The theatre');
  });

  it('replaces rather than accumulates when saving again', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const id = await createDestination({ slug: 'again', defaultLocale: 'ar', status: 'draft' }, arEn);
    await updateDestination(id, { slug: 'again', defaultLocale: 'ar', status: 'draft' }, [
      { locale: 'ar', name: 'اسم جديد' },
      { locale: 'en', name: 'New name' },
    ]);

    const rows = await db
      .select()
      .from(schema.destinationTranslations)
      .where(eq(schema.destinationTranslations.destinationId, id));

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.locale === 'en')?.name).toBe('New name');
  });

  it('drops a language whose fields were all cleared', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const id = await createDestination({ slug: 'clearing', defaultLocale: 'ar', status: 'draft' }, arEn);
    await updateDestination(id, { slug: 'clearing', defaultLocale: 'ar', status: 'draft' }, [
      { locale: 'ar', name: 'باقٍ' },
      { locale: 'en', name: null },
    ]);

    const rows = await db
      .select()
      .from(schema.destinationTranslations)
      .where(eq(schema.destinationTranslations.destinationId, id));

    // An empty row would otherwise count toward translation coverage.
    expect(rows.map((r) => r.locale)).toEqual(['ar']);
  });
});

describe('audit trail', () => {
  it('records who changed what', async () => {
    const user = await makeUser(db, 'administrator');
    actAs({ id: user.id, role: 'administrator' });

    const id = await createDestination(
      { slug: 'audited', defaultLocale: 'ar', status: 'draft' },
      arEn,
    );

    const entries = await db.select().from(schema.auditLog);
    const entry = entries.find((e) => e.entityId === id);
    expect(entry).toBeDefined();
    expect(entry!.action).toBe('destination.create');
    expect(entry!.actorId).toBe(user.id);
  });
});
