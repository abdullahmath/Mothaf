'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertSameOrigin } from '../auth/cookies';
import { CACHE_TAGS } from '../domain/public/cache';
import { isDomainError } from '../domain/errors';
import {
  createDestination,
  deleteDestination,
  destinationInputSchema,
  DESTINATION_TRANSLATION_FIELDS,
  setDestinationStatus,
  updateDestination,
} from '../domain/admin/destinations';
import {
  createTour,
  deleteTour,
  setTourStatus,
  tourInputSchema,
  TOUR_TRANSLATION_FIELDS,
  updateTour,
} from '../domain/admin/tours';
import {
  createScene,
  deleteScene,
  reorderScenes,
  sceneInputSchema,
  SCENE_TRANSLATION_FIELDS,
  setSceneLinks,
  updateScene,
} from '../domain/admin/scenes';
import {
  createHotspot,
  deleteHotspot,
  hotspotInputSchema,
  HOTSPOT_TRANSLATION_FIELDS,
  moveHotspot,
  updateHotspot,
} from '../domain/admin/hotspots';
import {
  checkbox,
  fail,
  field,
  nullableField,
  parseTranslationFields,
  zodFields,
  type ActionResult,
} from '../domain/admin/shared';
import { LOCALES } from '@/lib/i18n/config';

/**
 * Server Actions for content.
 *
 * Each one does the same four things in the same order: verify the origin,
 * parse the form, call the domain service (which authorizes), then revalidate
 * the affected paths. Errors come back as `ActionResult` so the form can show
 * them inline instead of replacing the page with an error screen and losing
 * everything the editor typed.
 */

/**
 * Pulls a bare Sketchfab model id out of whatever an editor pasted.
 *
 * Accepts a model page URL, an embed src, or the id itself — all three end in
 * the same 32-character hex id, so this is a courtesy rather than a security
 * boundary. `sketchfabModelId` in the schema still rejects anything that
 * doesn't come out looking like exactly that.
 */
function extractSketchfabId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/[0-9a-f]{32}/i);
  return match ? match[0] : raw;
}

/** Turns a thrown domain error into a result the form can render. */
function toResult(error: unknown): ActionResult {
  if (isDomainError(error)) {
    return fail(error.message, error.fields);
  }
  console.error('[action] unexpected failure', error);
  return fail('Something went wrong. Please try again.');
}

/**
 * Clears the caches a content change affects.
 *
 * Deliberately broad. Getting this wrong means an editor publishes something
 * and cannot see it, then publishes again — over-invalidating costs a render,
 * under-invalidating costs their trust in the tool.
 *
 * Tags do the real work: visitor reads are cached at the data layer, so
 * clearing `content` drops exactly the query results a publish could have
 * changed. `revalidatePath` additionally clears the rendered output.
 */
function revalidateContent(locale: string, paths: string[] = []): void {
  revalidateTag(CACHE_TAGS.content);
  revalidatePath(`/${locale}`, 'layout');
  for (const path of paths) revalidatePath(path);
}

/* -------------------------------------------------------------------------- */
/*  Destinations                                                              */
/* -------------------------------------------------------------------------- */

export async function saveDestinationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await assertSameOrigin();

  const id = field(formData, 'id');
  const locale = field(formData, 'locale') ?? 'ar';

  const parsed = destinationInputSchema.safeParse({
    slug: field(formData, 'slug'),
    defaultLocale: field(formData, 'defaultLocale'),
    status: field(formData, 'status'),
    coverMediaId: nullableField(formData, 'coverMediaId'),
    countryCode: nullableField(formData, 'countryCode'),
    latitude: nullableField(formData, 'latitude'),
    longitude: nullableField(formData, 'longitude'),
    sketchfabModelId: extractSketchfabId(field(formData, 'sketchfabModelId')) ?? null,
  });
  if (!parsed.success) return fail('Please check the highlighted fields.', zodFields(parsed.error));

  const translations = parseTranslationFields(
    formData,
    DESTINATION_TRANSLATION_FIELDS,
    LOCALES,
  );

  try {
    if (id) {
      await updateDestination(id, parsed.data, translations);
      revalidateContent(locale, [`/${locale}/destinations/${parsed.data.slug}`]);
      return { ok: true, id, message: 'Saved.' };
    }
    const created = await createDestination(parsed.data, translations);
    revalidateContent(locale);
    redirect(`/${locale}/admin/destinations/${created}`);
  } catch (error) {
    // `redirect` signals by throwing; it must not be swallowed as a failure.
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    if (typeof error === 'object' && error !== null && 'digest' in error) throw error;
    return toResult(error);
  }
}

export async function setDestinationStatusAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const id = field(formData, 'id');
  const status = field(formData, 'status');
  const locale = field(formData, 'locale') ?? 'ar';
  if (!id || !status) return;

  await setDestinationStatus(id, status as 'draft' | 'published' | 'archived');
  revalidateContent(locale);
}

export async function deleteDestinationAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const id = field(formData, 'id');
  const locale = field(formData, 'locale') ?? 'ar';
  if (!id) return;

  await deleteDestination(id);
  revalidateContent(locale);
  redirect(`/${locale}/admin/destinations`);
}

/* -------------------------------------------------------------------------- */
/*  Tours                                                                     */
/* -------------------------------------------------------------------------- */

export async function saveTourAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await assertSameOrigin();

  const id = field(formData, 'id');
  const locale = field(formData, 'locale') ?? 'ar';

  const parsed = tourInputSchema.safeParse({
    destinationId: field(formData, 'destinationId'),
    slug: field(formData, 'slug'),
    kind: field(formData, 'kind'),
    status: field(formData, 'status'),
    coverMediaId: nullableField(formData, 'coverMediaId'),
    estimatedMinutes: nullableField(formData, 'estimatedMinutes'),
    autoRotate: checkbox(formData, 'autoRotate'),
    showCompass: checkbox(formData, 'showCompass'),
    showSceneList: checkbox(formData, 'showSceneList'),
    showHotspotLabels: checkbox(formData, 'showHotspotLabels'),
  });
  if (!parsed.success) return fail('Please check the highlighted fields.', zodFields(parsed.error));

  const translations = parseTranslationFields(formData, TOUR_TRANSLATION_FIELDS, LOCALES);

  try {
    if (id) {
      await updateTour(id, parsed.data, translations);
      revalidateContent(locale);
      return { ok: true, id, message: 'Saved.' };
    }
    const created = await createTour(parsed.data, translations);
    revalidateContent(locale);
    redirect(`/${locale}/admin/tours/${created}`);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'digest' in error) throw error;
    return toResult(error);
  }
}

export async function setTourStatusAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await assertSameOrigin();
  const id = field(formData, 'id');
  const status = field(formData, 'status');
  const locale = field(formData, 'locale') ?? 'ar';
  if (!id || !status) return fail('Missing tour.');

  try {
    await setTourStatus(id, status as 'draft' | 'published' | 'archived');
    revalidateContent(locale);
    return { ok: true, message: 'Updated.' };
  } catch (error) {
    return toResult(error);
  }
}

export async function deleteTourAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const id = field(formData, 'id');
  const locale = field(formData, 'locale') ?? 'ar';
  if (!id) return;

  await deleteTour(id);
  revalidateContent(locale);
  redirect(`/${locale}/admin/tours`);
}

/* -------------------------------------------------------------------------- */
/*  Scenes                                                                    */
/* -------------------------------------------------------------------------- */

export async function saveSceneAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await assertSameOrigin();

  const id = field(formData, 'id');
  const locale = field(formData, 'locale') ?? 'ar';

  const parsed = sceneInputSchema.safeParse({
    tourId: field(formData, 'tourId'),
    slug: field(formData, 'slug'),
    kind: field(formData, 'kind'),
    status: field(formData, 'status'),
    isStart: checkbox(formData, 'isStart'),
    backgroundMediaId: nullableField(formData, 'backgroundMediaId'),
    thumbnailMediaId: nullableField(formData, 'thumbnailMediaId'),
    audioMediaId: nullableField(formData, 'audioMediaId'),
    yaw: field(formData, 'yaw'),
    pitch: field(formData, 'pitch'),
    fov: field(formData, 'fov'),
    northOffsetDeg: field(formData, 'northOffsetDeg'),
  });
  if (!parsed.success) return fail('Please check the highlighted fields.', zodFields(parsed.error));

  const translations = parseTranslationFields(formData, SCENE_TRANSLATION_FIELDS, LOCALES);

  try {
    if (id) {
      await updateScene(id, parsed.data, translations);
      revalidateContent(locale);
      return { ok: true, id, message: 'Saved.' };
    }
    const created = await createScene(parsed.data, translations);
    revalidateContent(locale);
    redirect(`/${locale}/admin/scenes/${created}`);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'digest' in error) throw error;
    return toResult(error);
  }
}

export async function deleteSceneAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const id = field(formData, 'id');
  const tourId = field(formData, 'tourId');
  const locale = field(formData, 'locale') ?? 'ar';
  if (!id) return;

  await deleteScene(id);
  revalidateContent(locale);
  if (tourId) redirect(`/${locale}/admin/tours/${tourId}`);
}

export async function reorderScenesAction(
  tourId: string,
  orderedIds: string[],
  locale: string,
): Promise<ActionResult> {
  await assertSameOrigin();
  try {
    await reorderScenes(tourId, orderedIds);
    revalidateContent(locale);
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function setSceneLinksAction(
  sceneId: string,
  targetIds: string[],
  locale: string,
): Promise<ActionResult> {
  await assertSameOrigin();
  try {
    await setSceneLinks(sceneId, targetIds);
    revalidateContent(locale);
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

/* -------------------------------------------------------------------------- */
/*  Hotspots                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Builds the action payload from the form.
 *
 * The form posts one field per action type — `target.sceneId`, `target.poiId`,
 * `target.url` and so on — and only the one matching the selected type is
 * read. The domain layer then validates it against the registry schema, so an
 * extra field posted by hand is dropped here and would be rejected there.
 */
function payloadFromForm(actionType: string, formData: FormData): Record<string, unknown> {
  switch (actionType) {
    case 'navigate':
      return { sceneId: field(formData, 'target.sceneId') ?? '' };
    case 'poi':
      return { poiId: field(formData, 'target.poiId') ?? '' };
    case 'event':
      return { eventId: field(formData, 'target.eventId') ?? '' };
    case 'image':
    case 'audio':
      return { mediaId: field(formData, 'target.mediaId') ?? '' };
    case 'video':
      return {
        mediaId: field(formData, 'target.mediaId') ?? '',
        autoplay: checkbox(formData, 'target.autoplay'),
      };
    case 'gallery':
      return {
        mediaIds: formData
          .getAll('target.mediaIds')
          .filter((value): value is string => typeof value === 'string' && value.length > 0),
      };
    case 'link':
      return { url: field(formData, 'target.url') ?? '' };
    default:
      return {};
  }
}

export async function saveHotspotAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await assertSameOrigin();

  const id = field(formData, 'id');
  const locale = field(formData, 'locale') ?? 'ar';
  const actionType = field(formData, 'actionType') ?? 'info';

  const parsed = hotspotInputSchema.safeParse({
    sceneId: field(formData, 'sceneId'),
    actionType,
    payload: payloadFromForm(actionType, formData),
    yawDeg: nullableField(formData, 'yawDeg'),
    pitchDeg: nullableField(formData, 'pitchDeg'),
    x: nullableField(formData, 'x'),
    y: nullableField(formData, 'y'),
    icon: field(formData, 'icon') ?? 'dot',
    style: field(formData, 'style') ?? 'pulse',
    status: field(formData, 'status') ?? 'published',
  });
  if (!parsed.success) return fail('Please check the highlighted fields.', zodFields(parsed.error));

  const translations = parseTranslationFields(formData, HOTSPOT_TRANSLATION_FIELDS, LOCALES);

  try {
    if (id) {
      await updateHotspot(id, parsed.data, translations);
    } else {
      await createHotspot(parsed.data, translations);
    }
    revalidateContent(locale);
    return { ok: true, message: 'Saved.' };
  } catch (error) {
    return toResult(error);
  }
}

export async function moveHotspotAction(
  id: string,
  position: { yawDeg?: number; pitchDeg?: number; x?: number; y?: number },
  locale: string,
): Promise<ActionResult> {
  await assertSameOrigin();
  try {
    await moveHotspot(id, position);
    revalidateContent(locale);
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function deleteHotspotAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const id = field(formData, 'id');
  const locale = field(formData, 'locale') ?? 'ar';
  if (!id) return;
  await deleteHotspot(id);
  revalidateContent(locale);
}
