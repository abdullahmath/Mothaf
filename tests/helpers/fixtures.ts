import { randomUUID } from 'node:crypto';
import type { TestDb } from './db';
import * as schema from '@/server/db/schema';

/**
 * Builds content directly through the schema.
 *
 * Deliberately bypasses the admin services: a test for the *read* path should
 * not depend on the write path being correct, or a bug in one would hide a bug
 * in the other.
 */

export async function makeMedia(
  db: TestDb,
  overrides: Partial<typeof schema.mediaAssets.$inferInsert> = {},
) {
  const id = overrides.id ?? randomUUID();
  const [row] = await db
    .insert(schema.mediaAssets)
    .values({
      id,
      kind: 'panorama',
      storageKey: `media/${id}/original.jpg`,
      mimeType: 'image/jpeg',
      byteSize: 1024,
      width: 4096,
      height: 2048,
      checksum: 'a'.repeat(64),
      previewDataUri: 'data:image/webp;base64,AAAA',
      variants: [
        {
          name: 'half',
          storageKey: `media/${id}/half.jpg`,
          mimeType: 'image/jpeg',
          width: 4096,
          height: 2048,
          byteSize: 512,
        },
      ],
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makeDestination(
  db: TestDb,
  overrides: Partial<typeof schema.destinations.$inferInsert> = {},
  translations: { locale: string; name: string; summary?: string }[] = [
    { locale: 'ar', name: 'وجهة' },
    { locale: 'en', name: 'Destination' },
  ],
) {
  const [row] = await db
    .insert(schema.destinations)
    .values({
      slug: `dest-${randomUUID().slice(0, 8)}`,
      defaultLocale: 'ar',
      status: 'published',
      ...overrides,
    })
    .returning();

  if (translations.length) {
    await db.insert(schema.destinationTranslations).values(
      translations.map((t) => ({
        destinationId: row!.id,
        locale: t.locale,
        name: t.name,
        summary: t.summary ?? null,
      })),
    );
  }
  return row!;
}

export async function makeTour(
  db: TestDb,
  destinationId: string,
  overrides: Partial<typeof schema.tours.$inferInsert> = {},
  translations: { locale: string; title: string }[] = [
    { locale: 'ar', title: 'جولة' },
    { locale: 'en', title: 'Tour' },
  ],
) {
  const [row] = await db
    .insert(schema.tours)
    .values({
      destinationId,
      slug: `tour-${randomUUID().slice(0, 8)}`,
      kind: 'panorama',
      status: 'published',
      ...overrides,
    })
    .returning();

  if (translations.length) {
    await db
      .insert(schema.tourTranslations)
      .values(translations.map((t) => ({ tourId: row!.id, locale: t.locale, title: t.title })));
  }
  return row!;
}

export async function makeScene(
  db: TestDb,
  tourId: string,
  overrides: Partial<typeof schema.scenes.$inferInsert> = {},
  translations: { locale: string; title: string }[] = [
    { locale: 'ar', title: 'مشهد' },
    { locale: 'en', title: 'Scene' },
  ],
) {
  const [row] = await db
    .insert(schema.scenes)
    .values({
      tourId,
      slug: `scene-${randomUUID().slice(0, 8)}`,
      kind: 'panorama',
      status: 'published',
      view: { yaw: 0, pitch: 0, fov: 78 },
      ...overrides,
    })
    .returning();

  if (translations.length) {
    await db
      .insert(schema.sceneTranslations)
      .values(translations.map((t) => ({ sceneId: row!.id, locale: t.locale, title: t.title })));
  }
  return row!;
}

export async function makeHotspot(
  db: TestDb,
  sceneId: string,
  overrides: Partial<typeof schema.hotspots.$inferInsert> = {},
  label = 'Marker',
) {
  const [row] = await db
    .insert(schema.hotspots)
    .values({
      sceneId,
      actionType: 'info',
      actionPayload: {},
      yawDeg: 0,
      pitchDeg: 0,
      status: 'published',
      ...overrides,
    })
    .returning();

  await db.insert(schema.hotspotTranslations).values([
    { hotspotId: row!.id, locale: 'ar', label },
    { hotspotId: row!.id, locale: 'en', label },
  ]);
  return row!;
}

export async function makePoi(
  db: TestDb,
  destinationId: string,
  overrides: Partial<typeof schema.pointsOfInterest.$inferInsert> = {},
  translations: { locale: string; title: string }[] = [
    { locale: 'ar', title: 'معلم' },
    { locale: 'en', title: 'Point of interest' },
  ],
) {
  const [row] = await db
    .insert(schema.pointsOfInterest)
    .values({
      destinationId,
      slug: `poi-${randomUUID().slice(0, 8)}`,
      status: 'published',
      ...overrides,
    })
    .returning();

  if (translations.length) {
    await db
      .insert(schema.poiTranslations)
      .values(translations.map((t) => ({ poiId: row!.id, locale: t.locale, title: t.title })));
  }
  return row!;
}

export async function makeEvent(
  db: TestDb,
  destinationId: string,
  overrides: Partial<typeof schema.events.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.events)
    .values({
      destinationId,
      slug: `event-${randomUUID().slice(0, 8)}`,
      status: 'published',
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      timezone: 'Asia/Damascus',
      ...overrides,
    })
    .returning();

  await db.insert(schema.eventTranslations).values([
    { eventId: row!.id, locale: 'ar', title: 'فعالية' },
    { eventId: row!.id, locale: 'en', title: 'Event' },
  ]);
  return row!;
}

export async function makeUser(
  db: TestDb,
  role: (typeof schema.userRoleEnum.enumValues)[number],
  passwordHash = '$argon2id$placeholder',
) {
  const [row] = await db
    .insert(schema.users)
    .values({
      email: `${role}-${randomUUID().slice(0, 8)}@test.local`,
      passwordHash,
      displayName: role,
      role,
    })
    .returning();
  return row!;
}
