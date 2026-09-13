/**
 * Seeds a working database.
 *
 * Idempotent by slug: running it twice leaves one destination, not two, so it
 * is safe to re-run after a schema change during development.
 *
 *   npm run db:migrate && npm run db:seed
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../index';
import {
  destinations,
  destinationTranslations,
  eventMedia,
  events,
  eventScheduleItems,
  eventScheduleItemTranslations,
  eventTranslations,
  heritageSiteMedia,
  heritageSiteTranslations,
  heritageSites,
  hotspots,
  hotspotTranslations,
  locales,
  mediaTranslations,
  poiCategories,
  poiCategoryTranslations,
  poiMedia,
  poiTranslations,
  pointsOfInterest,
  sceneLinks,
  scenePois,
  scenes,
  sceneTranslations,
  tours,
  tourTranslations,
  users,
} from '../schema';
import { hashPassword } from '../../auth/password';
import { ingestMedia } from '../../media/ingest';
import { env } from '../../config/env';
import { renderFlatImage, renderPanorama, SCENE_RECIPES } from './panoramas';
import {
  DESTINATION,
  EVENT,
  HERITAGE_SITES,
  HOTSPOTS,
  POIS,
  POI_CATEGORIES,
  SCENES,
  SCENE_LINKS,
  TOUR,
} from './jableh';

async function seedLocales() {
  const db = await getDb();
  await db
    .insert(locales)
    .values([
      { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl', position: 0 },
      { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', position: 1 },
    ])
    .onConflictDoNothing();
  console.log('· locales ready');
}

/**
 * Creates the first administrator.
 *
 * If no password is supplied one is generated and printed exactly once. That
 * is better than a default: a well-known seed password on a public deployment
 * is an open door, and a printed random one cannot be guessed or copied from
 * documentation.
 */
async function seedAdmin(): Promise<string> {
  const db = await getDb();
  const config = env();
  const email = (config.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    console.log(`· admin already exists: ${email}`);
    return existing.id;
  }

  const generated = config.SEED_ADMIN_PASSWORD?.trim();
  const password = generated && generated.length >= 12 ? generated : randomBytes(18).toString('base64url');

  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash: await hashPassword(password),
      displayName: 'Super Admin',
      role: 'super_admin',
      preferredLocale: 'ar',
    })
    .returning();

  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────────');
  console.log('  │ Administrator created');
  console.log(`  │   email:    ${email}`);
  console.log(`  │   password: ${password}`);
  console.log('  │ This is shown once. Store it now and change it after');
  console.log('  │ first sign-in.');
  console.log('  └─────────────────────────────────────────────────────────');
  console.log('');

  return user!.id;
}

async function main() {
  console.log('Seeding…');
  await seedLocales();
  const adminId = await seedAdmin();

  const db = await getDb();

  // Idempotence: remove the previous seed of this destination. Cascades clear
  // its tours, scenes, hotspots, POIs and events with it.
  const [previous] = await db
    .select({ id: destinations.id })
    .from(destinations)
    .where(eq(destinations.slug, DESTINATION.slug))
    .limit(1);
  if (previous) {
    await db.delete(destinations).where(eq(destinations.id, previous.id));
    console.log('· removed previous seed of this destination');
  }

  /* ---- media ----------------------------------------------------------- */

  console.log('· rendering placeholder panoramas (this takes a moment)');

  const panoramaBySlug = new Map<string, string>();
  for (const scene of SCENES) {
    const recipe = SCENE_RECIPES[scene.recipe];
    if (!recipe) throw new Error(`No panorama recipe named ${scene.recipe}`);

    const asset = await ingestMedia(await renderPanorama(recipe), {
      kind: 'panorama',
      filename: `${scene.slug}-panorama.jpg`,
      uploadedBy: adminId,
    });
    panoramaBySlug.set(scene.slug, asset.id);

    await db.insert(mediaTranslations).values(
      scene.translations.map((translation) => ({
        mediaId: asset.id,
        locale: translation.locale,
        altText:
          translation.locale === 'ar'
            ? `منظر بانورامي: ${translation.title}`
            : `Panoramic view: ${translation.title}`,
      })),
    );
    console.log(`  · ${scene.slug} panorama ${asset.width}×${asset.height}`);
  }

  const coverRecipe = SCENE_RECIPES.orchestra!;
  const coverAsset = await ingestMedia(await renderFlatImage(coverRecipe), {
    kind: 'image',
    filename: 'jableh-cover.jpg',
    uploadedBy: adminId,
  });
  await db.insert(mediaTranslations).values([
    { mediaId: coverAsset.id, locale: 'ar', altText: 'المسرح الروماني في جبلة' },
    { mediaId: coverAsset.id, locale: 'en', altText: 'The Roman Theatre of Jableh' },
  ]);

  /* ---- destination ------------------------------------------------------ */

  const [destination] = await db
    .insert(destinations)
    .values({
      slug: DESTINATION.slug,
      defaultLocale: DESTINATION.defaultLocale,
      status: 'published',
      publishedAt: new Date(),
      coverMediaId: coverAsset.id,
      countryCode: DESTINATION.countryCode,
      latitude: DESTINATION.latitude,
      longitude: DESTINATION.longitude,
      sketchfabModelId: DESTINATION.sketchfabModelId,
      position: 0,
    })
    .returning();
  const destinationId = destination!.id;

  await db.insert(destinationTranslations).values(
    DESTINATION.translations.map((translation) => ({
      destinationId,
      locale: translation.locale,
      name: translation.name,
      tagline: translation.tagline,
      summary: translation.summary,
      description: translation.description,
      historicalContext: translation.historicalContext,
    })),
  );

  /* ---- POI categories and POIs ------------------------------------------ */

  const categoryBySlug = new Map<string, string>();
  for (const [index, category] of POI_CATEGORIES.entries()) {
    const [row] = await db
      .insert(poiCategories)
      .values({
        destinationId,
        slug: category.slug,
        color: category.color,
        icon: category.icon,
        position: index,
      })
      .returning();
    categoryBySlug.set(category.slug, row!.id);
    await db.insert(poiCategoryTranslations).values(
      category.translations.map((translation) => ({
        categoryId: row!.id,
        locale: translation.locale,
        name: translation.name,
      })),
    );
  }

  const poiBySlug = new Map<string, string>();
  for (const [index, poi] of POIS.entries()) {
    const [row] = await db
      .insert(pointsOfInterest)
      .values({
        destinationId,
        categoryId: categoryBySlug.get(poi.category) ?? null,
        slug: poi.slug,
        status: 'published',
        tags: poi.tags,
        position: index,
        coverMediaId: coverAsset.id,
      })
      .returning();
    poiBySlug.set(poi.slug, row!.id);

    await db.insert(poiTranslations).values(
      poi.translations.map((translation) => ({
        poiId: row!.id,
        locale: translation.locale,
        title: translation.title,
        shortDescription: translation.shortDescription,
        description: translation.description,
        historicalInfo: translation.historicalInfo,
      })),
    );

    await db.insert(poiMedia).values({ poiId: row!.id, mediaId: coverAsset.id, role: 'gallery' });
  }

  /* ---- heritage sites ----------------------------------------------------- */

  for (const [index, site] of HERITAGE_SITES.entries()) {
    const [row] = await db
      .insert(heritageSites)
      .values({
        destinationId,
        slug: site.slug,
        status: 'published',
        publishedAt: new Date(),
        coverMediaId: coverAsset.id,
        latitude: site.latitude,
        longitude: site.longitude,
        position: index,
      })
      .returning();

    await db.insert(heritageSiteTranslations).values(
      site.translations.map((translation) => ({
        heritageSiteId: row!.id,
        locale: translation.locale,
        title: translation.title,
        shortDescription: translation.shortDescription,
        description: translation.description,
      })),
    );

    // Reuses the scene panoramas already rendered above as gallery photos —
    // a real, varied set of images rather than the single cover repeated.
    const galleryMediaIds = [...panoramaBySlug.values()];
    await db.insert(heritageSiteMedia).values(
      galleryMediaIds.map((mediaId, position) => ({
        heritageSiteId: row!.id,
        mediaId,
        role: 'gallery' as const,
        position,
      })),
    );
  }

  /* ---- tour and scenes --------------------------------------------------- */

  const [tour] = await db
    .insert(tours)
    .values({
      destinationId,
      slug: TOUR.slug,
      kind: TOUR.kind,
      status: 'published',
      publishedAt: new Date(),
      coverMediaId: coverAsset.id,
      settings: TOUR.settings,
      estimatedMinutes: TOUR.estimatedMinutes,
      position: 0,
    })
    .returning();
  const tourId = tour!.id;

  await db.insert(tourTranslations).values(
    TOUR.translations.map((translation) => ({
      tourId,
      locale: translation.locale,
      title: translation.title,
      summary: translation.summary,
      description: translation.description,
      welcomeMessage: translation.welcomeMessage,
    })),
  );

  const sceneBySlug = new Map<string, string>();
  for (const [index, scene] of SCENES.entries()) {
    const [row] = await db
      .insert(scenes)
      .values({
        tourId,
        slug: scene.slug,
        kind: 'panorama',
        status: 'published',
        isStart: scene.isStart,
        backgroundMediaId: panoramaBySlug.get(scene.slug)!,
        thumbnailMediaId: panoramaBySlug.get(scene.slug)!,
        view: scene.view,
        northOffsetDeg: scene.northOffsetDeg,
        position: index,
      })
      .returning();
    sceneBySlug.set(scene.slug, row!.id);

    await db.insert(sceneTranslations).values(
      scene.translations.map((translation) => ({
        sceneId: row!.id,
        locale: translation.locale,
        title: translation.title,
        summary: translation.summary,
        description: translation.description,
      })),
    );

    for (const [poiIndex, poiSlug] of scene.pois.entries()) {
      const poiId = poiBySlug.get(poiSlug);
      if (poiId) {
        await db.insert(scenePois).values({ sceneId: row!.id, poiId, position: poiIndex });
      }
    }
  }

  for (const [index, [from, to]] of SCENE_LINKS.entries()) {
    await db.insert(sceneLinks).values({
      fromSceneId: sceneBySlug.get(from)!,
      toSceneId: sceneBySlug.get(to)!,
      position: index,
    });
  }

  /* ---- hotspots ---------------------------------------------------------- */

  for (const [index, hotspot] of HOTSPOTS.entries()) {
    const payload =
      hotspot.actionType === 'navigate'
        ? { sceneId: sceneBySlug.get(hotspot.target!)! }
        : hotspot.actionType === 'poi'
          ? { poiId: poiBySlug.get(hotspot.target!)! }
          : {};

    const [row] = await db
      .insert(hotspots)
      .values({
        sceneId: sceneBySlug.get(hotspot.scene)!,
        actionType: hotspot.actionType,
        actionPayload: payload,
        yawDeg: hotspot.yaw,
        pitchDeg: hotspot.pitch,
        icon: hotspot.icon,
        style: hotspot.style,
        status: 'published',
        position: index,
      })
      .returning();

    await db.insert(hotspotTranslations).values(
      hotspot.translations.map((translation) => ({
        hotspotId: row!.id,
        locale: translation.locale,
        label: translation.label,
        description: translation.description ?? null,
      })),
    );
  }

  /* ---- event ------------------------------------------------------------- */

  const day = 86_400_000;
  const now = Date.now();
  const startsAt = new Date(now + EVENT.startsInDays * day);
  const endsAt = new Date(now + EVENT.endsInDays * day);

  const [event] = await db
    .insert(events)
    .values({
      destinationId,
      tourId,
      slug: EVENT.slug,
      status: 'published',
      publishedAt: new Date(),
      startsAt,
      endsAt,
      timezone: EVENT.timezone,
      coverMediaId: coverAsset.id,
      latitude: DESTINATION.latitude,
      longitude: DESTINATION.longitude,
    })
    .returning();

  await db.insert(eventTranslations).values(
    EVENT.translations.map((translation) => ({
      eventId: event!.id,
      locale: translation.locale,
      title: translation.title,
      summary: translation.summary,
      description: translation.description,
      organizer: translation.organizer,
      venue: translation.venue,
      admissionInfo: translation.admissionInfo,
    })),
  );

  await db.insert(eventMedia).values({
    eventId: event!.id,
    mediaId: coverAsset.id,
    role: 'gallery',
  });

  for (const [index, item] of EVENT.schedule.entries()) {
    const itemStart = new Date(startsAt);
    itemStart.setDate(itemStart.getDate() + item.dayOffset);
    itemStart.setHours(item.hour, 0, 0, 0);

    const [scheduleRow] = await db
      .insert(eventScheduleItems)
      .values({
        eventId: event!.id,
        startsAt: itemStart,
        endsAt: new Date(itemStart.getTime() + 2 * 3600_000),
        sceneId: sceneBySlug.get(item.scene) ?? null,
        position: index,
      })
      .returning();

    await db.insert(eventScheduleItemTranslations).values(
      item.translations.map((translation) => ({
        itemId: scheduleRow!.id,
        locale: translation.locale,
        title: translation.title,
        description: translation.description ?? null,
        performer: 'performer' in translation ? (translation.performer ?? null) : null,
        location: translation.location ?? null,
      })),
    );
  }

  console.log('');
  console.log(`✓ Seeded "${DESTINATION.slug}"`);
  console.log(
    `  ${SCENES.length} scenes · ${HOTSPOTS.length} hotspots · ${POIS.length} POIs · ${HERITAGE_SITES.length} heritage site · 1 event`,
  );
  console.log('');
  console.log('  Visit  /ar/destinations/roman-theatre-jableh');
  console.log('  and    /en/destinations/roman-theatre-jableh');
  console.log('');
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('Seed failed:', error);
    await closeDb();
    process.exit(1);
  });
