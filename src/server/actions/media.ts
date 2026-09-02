'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { assertSameOrigin } from '../auth/cookies';
import { CACHE_TAGS } from '../domain/public/cache';
import { isDomainError } from '../domain/errors';
import { removeMedia, updateMediaText, uploadMedia } from '../domain/admin/media';
import {
  fail,
  field,
  parseTranslationFields,
  type ActionResult,
} from '../domain/admin/shared';
import { LOCALES } from '@/lib/i18n/config';

const MEDIA_TRANSLATION_FIELDS = ['altText', 'caption', 'transcript'] as const;

/**
 * Media actions.
 *
 * The upload path is the one place the application accepts arbitrary bytes
 * from a person, so the error handling here is deliberately specific: an
 * editor who uploads a portrait photo as a panorama needs to be told the
 * aspect ratio is wrong, not handed "something went wrong".
 */
export async function uploadMediaAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await assertSameOrigin();

  const file = formData.get('file');
  const kind = field(formData, 'kind') ?? 'image';
  const locale = field(formData, 'locale') ?? 'ar';

  if (!(file instanceof File)) {
    return fail('Choose a file to upload.', { file: 'No file was received' });
  }
  if (!['image', 'panorama', 'video', 'audio'].includes(kind)) {
    return fail('Choose what kind of file this is.');
  }

  try {
    const asset = await uploadMedia({
      file,
      kind: kind as 'image' | 'panorama' | 'video' | 'audio',
      translations: parseTranslationFields(formData, MEDIA_TRANSLATION_FIELDS, LOCALES),
    });

    revalidatePath(`/${locale}/admin/media`);
    return {
      ok: true,
      id: asset.id,
      message:
        asset.width && asset.height
          ? `Uploaded ${asset.width}×${asset.height}, ${Math.round(asset.byteSize / 1024)} KB.`
          : `Uploaded ${Math.round(asset.byteSize / 1024)} KB.`,
    };
  } catch (error) {
    if (isDomainError(error)) return fail(error.message, error.fields);
    console.error('[media] upload failed', error);
    return fail('The file could not be processed.');
  }
}

export async function updateMediaTextAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await assertSameOrigin();

  const id = field(formData, 'id');
  const locale = field(formData, 'locale') ?? 'ar';
  if (!id) return fail('Missing file.');

  try {
    await updateMediaText(id, parseTranslationFields(formData, MEDIA_TRANSLATION_FIELDS, LOCALES));
    revalidateTag(CACHE_TAGS.content);
    revalidatePath(`/${locale}/admin/media`);
    revalidatePath(`/${locale}`, 'layout');
    return { ok: true, message: 'Saved.' };
  } catch (error) {
    if (isDomainError(error)) return fail(error.message, error.fields);
    return fail('Could not save.');
  }
}

export async function deleteMediaAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await assertSameOrigin();

  const id = field(formData, 'id');
  const locale = field(formData, 'locale') ?? 'ar';
  if (!id) return fail('Missing file.');

  try {
    await removeMedia(id);
    revalidatePath(`/${locale}/admin/media`);
    return { ok: true, message: 'Deleted.' };
  } catch (error) {
    // "Still in use by three scenes" is exactly the message the editor needs;
    // the domain layer already phrased it, so pass it through.
    if (isDomainError(error)) return fail(error.message, error.fields);
    return fail('Could not delete this file.');
  }
}
