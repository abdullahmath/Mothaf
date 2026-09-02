import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { getDb } from '../db';
import { mediaAssets, type MediaAsset, type MediaVariant } from '../db/schema';
import { env } from '../config/env';
import { getStorage } from './storage';
import { clientTypeAgrees, sniffType } from './sniff';
import { DomainError, validation } from '../domain/errors';

/**
 * The media pipeline.
 *
 * Every uploaded byte passes through here, and every step below can reject.
 * The ordering matters: cheap checks first, so a hostile file is turned away
 * before it costs a decode.
 *
 *   1. Size, before anything is decoded.
 *   2. Magic-byte sniff — the container is what the bytes say, not what the
 *      filename or the Content-Type header claims.
 *   3. Pixel-count cap, checked from the *header* before decoding, which is
 *      what defeats a decompression bomb: a 40 KB PNG can declare 60000×60000
 *      and expand to gigabytes of RAM the moment it is rasterised.
 *   4. Re-encode. The output is pixels we rendered, so EXIF (including GPS
 *      coordinates of someone's home), embedded thumbnails, colour-profile
 *      exploits and any polyglot payload appended after the image data are all
 *      gone by construction rather than by stripping.
 *   5. Storage under a generated key. The original filename is kept as a label
 *      and never used to build a path.
 */

/** Widths produced for responsive delivery. Wider sources get more steps. */
const RESPONSIVE_WIDTHS = [320, 640, 1024, 1600, 2400];

/**
 * Ceiling for the panorama texture.
 *
 * `MAX_TEXTURE_SIZE` is only guaranteed to be 4096 across mobile GPUs, so a
 * half-resolution rendition is always produced and is what the viewer loads by
 * default. An 8192-wide original would simply fail to upload as a texture on a
 * large share of phones.
 */
const PANORAMA_TEXTURE_WIDTH = 4096;

/** The inline blurred placeholder. Tiny on purpose — it ships in the manifest. */
const PREVIEW_WIDTH = 32;

export type IngestOptions = {
  filename?: string | null;
  clientMimeType?: string | null;
  /** `panorama` adds equirectangular validation and the half-size texture. */
  kind?: 'image' | 'panorama' | 'video' | 'audio';
  uploadedBy?: string | null;
  alt?: { locale: string; altText?: string; caption?: string }[];
};

export async function ingestMedia(
  input: Buffer,
  options: IngestOptions = {},
): Promise<MediaAsset> {
  const config = env();

  if (input.length === 0) throw validation('The file is empty');
  if (input.length > config.MAX_UPLOAD_BYTES) {
    throw new DomainError(
      'payload_too_large',
      `File exceeds the ${Math.floor(config.MAX_UPLOAD_BYTES / 1_048_576)} MB limit`,
    );
  }

  const sniffed = sniffType(input);
  if (!sniffed) {
    throw new DomainError(
      'unsupported_media',
      'Unrecognised file type. Upload a JPEG, PNG, WebP, AVIF, MP4, WebM, MP3, OGG or WAV file.',
    );
  }

  if (!clientTypeAgrees(sniffed, options.clientMimeType ?? null)) {
    // Not fatal — the real type wins — but worth recording, since a mismatch
    // is either a confused browser or a deliberate attempt to mislabel.
    console.warn(
      `[media] declared type ${options.clientMimeType} but content is ${sniffed.mimeType}`,
    );
  }

  if (sniffed.category === 'image') {
    return ingestImage(input, sniffed.mimeType, options);
  }
  return ingestOpaque(input, sniffed.mimeType, sniffed.extension, sniffed.category, options);
}

async function ingestImage(
  input: Buffer,
  detectedMime: string,
  options: IngestOptions,
): Promise<MediaAsset> {
  const config = env();
  const storage = getStorage();

  // `failOn: 'error'` refuses truncated and malformed files instead of doing
  // its best with them; `limitInputPixels` is the decode-bomb guard.
  const pipeline = sharp(input, {
    failOn: 'error',
    limitInputPixels: config.MAX_IMAGE_PIXELS,
    // Guard against an animated GIF or WebP with thousands of frames.
    animated: false,
  });

  let metadata: sharp.Metadata;
  try {
    metadata = await pipeline.metadata();
  } catch (error) {
    throw new DomainError('unsupported_media', 'The image could not be read', { cause: error });
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= 0 || height <= 0) throw validation('The image has no usable dimensions');
  if (width * height > config.MAX_IMAGE_PIXELS) {
    throw new DomainError('payload_too_large', 'The image resolution is too large');
  }

  const isPanorama = options.kind === 'panorama';
  if (isPanorama) {
    // Equirectangular projection is 2:1 by definition. A tolerance of 2%
    // allows for a source that was cropped by a pixel or two; anything further
    // out would visibly distort when wrapped onto the sphere.
    const ratio = width / height;
    if (Math.abs(ratio - 2) > 0.04) {
      throw validation(
        `A 360° panorama must be equirectangular (2:1). This image is ${width}×${height}, a ratio of ${ratio.toFixed(2)}:1.`,
        { file: 'Expected a 2:1 equirectangular image' },
      );
    }
  }

  const id = randomUUID();
  const prefix = `media/${id}`;
  const variants: MediaVariant[] = [];

  /** Re-encodes at a width and stores it. */
  const emit = async (
    name: string,
    targetWidth: number,
    format: 'avif' | 'webp' | 'jpeg',
  ): Promise<void> => {
    const encoder = sharp(input, { failOn: 'error', limitInputPixels: config.MAX_IMAGE_PIXELS })
      .rotate() // apply EXIF orientation, then discard the metadata with it
      .resize({ width: targetWidth, withoutEnlargement: true });

    const encoded =
      format === 'avif'
        ? await encoder.avif({ quality: 60, effort: 4 }).toBuffer({ resolveWithObject: true })
        : format === 'webp'
          ? await encoder.webp({ quality: 78 }).toBuffer({ resolveWithObject: true })
          : await encoder
              .jpeg({ quality: 82, mozjpeg: true })
              .toBuffer({ resolveWithObject: true });

    const extension = format === 'jpeg' ? 'jpg' : format;
    const key = `${prefix}/${name}.${extension}`;
    const mimeType = `image/${format}`;

    await storage.put(key, encoded.data, { contentType: mimeType });
    variants.push({
      name,
      storageKey: key,
      mimeType,
      width: encoded.info.width,
      height: encoded.info.height,
      byteSize: encoded.data.length,
    });
  };

  // The canonical object. JPEG for panoramas because it is what every GPU
  // texture path and every browser decodes fastest at large sizes.
  const originalFormat: 'jpeg' | 'webp' = isPanorama ? 'jpeg' : 'webp';
  const canonical = await sharp(input, { failOn: 'error', limitInputPixels: config.MAX_IMAGE_PIXELS })
    .rotate()
    .toFormat(originalFormat, originalFormat === 'jpeg' ? { quality: 88, mozjpeg: true } : { quality: 85 })
    .toBuffer({ resolveWithObject: true });

  const storageKey = `${prefix}/original.${originalFormat === 'jpeg' ? 'jpg' : 'webp'}`;
  const canonicalMime = `image/${originalFormat}`;
  await storage.put(storageKey, canonical.data, { contentType: canonicalMime });

  // Blurred placeholder, inlined into the manifest as a data URI.
  const previewBuffer = await sharp(input, { failOn: 'error', limitInputPixels: config.MAX_IMAGE_PIXELS })
    .rotate()
    .resize({ width: PREVIEW_WIDTH })
    .blur(1.2)
    .webp({ quality: 40 })
    .toBuffer();
  const previewDataUri = `data:image/webp;base64,${previewBuffer.toString('base64')}`;

  if (isPanorama) {
    // The texture every device can actually hold.
    await emit('half', Math.min(PANORAMA_TEXTURE_WIDTH, width), 'jpeg');
    await emit('thumb', 480, 'webp');
  } else {
    for (const targetWidth of RESPONSIVE_WIDTHS) {
      if (targetWidth > width * 1.1) continue;
      await emit(`w${targetWidth}`, targetWidth, 'webp');
    }
    await emit('thumb', 320, 'webp');
  }

  const checksum = createHash('sha256').update(canonical.data).digest('hex');

  const db = await getDb();
  const [row] = await db
    .insert(mediaAssets)
    .values({
      id,
      kind: isPanorama ? 'panorama' : 'image',
      storageKey,
      mimeType: canonicalMime,
      byteSize: canonical.data.length,
      width: canonical.info.width,
      height: canonical.info.height,
      checksum,
      previewDataUri,
      // Kept for display only. Stripped of any path component so it can never
      // influence where the object lives.
      originalFilename: sanitizeFilename(options.filename),
      variants,
      createdBy: options.uploadedBy ?? null,
    })
    .returning();

  if (!row) throw new DomainError('internal', 'Failed to record media asset');
  return row;
}

/**
 * Audio and video are stored as uploaded.
 *
 * Transcoding them properly needs ffmpeg, which is a deployment dependency
 * this release does not take on. They are still sniffed, size-capped, stored
 * under a generated key and served with a type from our own record, so the
 * security properties hold; what is missing is derivative renditions.
 */
async function ingestOpaque(
  input: Buffer,
  mimeType: string,
  extension: string,
  category: 'video' | 'audio',
  options: IngestOptions,
): Promise<MediaAsset> {
  const storage = getStorage();
  const id = randomUUID();
  const storageKey = `media/${id}/original.${extension}`;

  await storage.put(storageKey, input, { contentType: mimeType });

  const db = await getDb();
  const [row] = await db
    .insert(mediaAssets)
    .values({
      id,
      kind: category,
      storageKey,
      mimeType,
      byteSize: input.length,
      checksum: createHash('sha256').update(input).digest('hex'),
      originalFilename: sanitizeFilename(options.filename),
      variants: [],
      createdBy: options.uploadedBy ?? null,
    })
    .returning();

  if (!row) throw new DomainError('internal', 'Failed to record media asset');
  return row;
}

/** Keeps a readable label without letting it act as a path. */
function sanitizeFilename(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const base = filename.replace(/\\/g, '/').split('/').pop() ?? '';
  const cleaned = base.replace(/[^\w.\- ]+/g, '_').trim();
  return cleaned.slice(0, 180) || null;
}

/**
 * Removes an asset and every derivative it owns.
 *
 * Storage deletions are best-effort: a missing object should not stop the row
 * from going, or a half-finished delete would leave a record pointing at
 * nothing. An orphaned object costs disk; an orphaned row breaks a page.
 */
export async function deleteMedia(assetId: string): Promise<void> {
  const db = await getDb();
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (!asset) return;

  const storage = getStorage();
  await Promise.all(
    [asset.storageKey, ...asset.variants.map((variant) => variant.storageKey)].map((key) =>
      storage.delete(key).catch(() => undefined),
    ),
  );
  await db.delete(mediaAssets).where(eq(mediaAssets.id, assetId));
}
