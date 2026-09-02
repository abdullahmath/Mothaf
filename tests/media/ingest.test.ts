import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { createTestDb, schema, type TestDb } from '../helpers/db';
import { ingestMedia } from '@/server/media/ingest';
import { assertSafeKey } from '@/server/media/storage';
import { isDomainError } from '@/server/domain/errors';
import { env } from '@/server/config/env';

/**
 * The upload pipeline.
 *
 * These are the tests that matter most in the whole suite. Everything else
 * protects data; this protects the origin itself, because a file that gets
 * stored and later served back is executable content if any step is careless.
 */

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(async () => {
  await close();
});

/** A solid-colour JPEG of a given size. */
async function image(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#4a6b8a' } })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function storedBytes(key: string): Promise<Buffer> {
  return readFile(path.resolve(env().STORAGE_LOCAL_ROOT, key));
}

describe('accepting and rejecting', () => {
  it('accepts a normal image and records honest metadata', async () => {
    const asset = await ingestMedia(await image(800, 600), {
      filename: 'courtyard.jpg',
      clientMimeType: 'image/jpeg',
      kind: 'image',
    });

    expect(asset.kind).toBe('image');
    expect(asset.width).toBe(800);
    expect(asset.height).toBe(600);
    expect(asset.byteSize).toBeGreaterThan(0);
    expect(asset.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(asset.variants.length).toBeGreaterThan(0);
    expect(asset.previewDataUri).toMatch(/^data:image\/webp;base64,/);
  });

  it('refuses a file whose bytes are not a media format', async () => {
    const html = Buffer.from('<!doctype html><script>alert(document.cookie)</script>');
    const error = await ingestMedia(html, { filename: 'photo.jpg', clientMimeType: 'image/jpeg' })
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('unsupported_media');
  });

  it('refuses an empty file', async () => {
    const error = await ingestMedia(Buffer.alloc(0), { filename: 'nothing.jpg' })
      .then(() => null)
      .catch((e) => e);
    expect(isDomainError(error)).toBe(true);
  });

  it('refuses a file above the configured size limit', async () => {
    // Padding a real JPEG past the cap: the size gate must fire before the
    // format is even considered.
    const oversized = Buffer.concat([
      await image(64, 64),
      Buffer.alloc(env().MAX_UPLOAD_BYTES + 1024),
    ]);
    const error = await ingestMedia(oversized, { filename: 'huge.jpg' })
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('payload_too_large');
  });
});

describe('panorama validation', () => {
  it('accepts a 2:1 equirectangular image', async () => {
    const asset = await ingestMedia(await image(2048, 1024), {
      filename: 'scene.jpg',
      kind: 'panorama',
    });
    expect(asset.kind).toBe('panorama');
    // The half-resolution texture every mobile GPU can hold.
    expect(asset.variants.some((v) => v.name === 'half')).toBe(true);
  });

  it('refuses an image that is not 2:1, with a message naming the problem', async () => {
    const error = await ingestMedia(await image(1600, 1200), {
      filename: 'holiday-photo.jpg',
      kind: 'panorama',
    })
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('validation');
    // An editor needs to know *why*, not just that it failed.
    expect(error.message).toMatch(/1600×1200/);
    expect(error.message).toMatch(/2:1|equirectangular/i);
  });

  it('caps the panorama texture at 4096 wide, whatever was uploaded', async () => {
    const asset = await ingestMedia(await image(8192, 4096), {
      filename: 'huge-pano.jpg',
      kind: 'panorama',
    });
    const half = asset.variants.find((v) => v.name === 'half');
    // Above 4096 the upload silently fails on a large share of phones.
    expect(half?.width).toBeLessThanOrEqual(4096);
  });

  it('tolerates a couple of pixels of rounding either way', async () => {
    await expect(
      ingestMedia(await image(2000, 1001), { filename: 'nearly.jpg', kind: 'panorama' }),
    ).resolves.toBeTruthy();
  });
});

describe('decode bombs', () => {
  it('refuses an image that declares more pixels than the limit allows', async () => {
    // A small file that expands enormously once rasterised. The guard reads
    // the header and refuses before allocating anything.
    const bomb = await sharp({
      create: { width: 12_000, height: 9_000, channels: 3, background: '#000' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    const previousLimit = env().MAX_IMAGE_PIXELS;
    expect(12_000 * 9_000).toBeGreaterThan(previousLimit / 2);

    // Confirm the guard is wired: the same bytes are refused when the cap is
    // below their pixel count.
    process.env.MAX_IMAGE_PIXELS = '1000000';
    const { resetEnvCache } = await import('@/server/config/env');
    resetEnvCache();

    const error = await ingestMedia(bomb, { filename: 'bomb.png', kind: 'image' })
      .then(() => null)
      .catch((e) => e);

    expect(isDomainError(error)).toBe(true);
    expect(['payload_too_large', 'unsupported_media']).toContain(error.code);

    process.env.MAX_IMAGE_PIXELS = String(previousLimit);
    resetEnvCache();
  });
});

describe('what reaches storage', () => {
  it('never uses the uploaded filename as part of the path', async () => {
    const asset = await ingestMedia(await image(200, 200), {
      filename: '../../../etc/passwd.jpg',
      kind: 'image',
    });

    expect(asset.storageKey).not.toContain('..');
    expect(asset.storageKey).not.toContain('passwd');
    expect(asset.storageKey).toMatch(/^media\/[0-9a-f-]{36}\/original\.(webp|jpg)$/);
    // Kept only as a label, and stripped of anything path-like.
    expect(asset.originalFilename).not.toContain('/');
    expect(asset.originalFilename).not.toContain('..');
  });

  it('strips a polyglot payload appended after the image data', async () => {
    const payload = '<script>alert(document.domain)</script>';
    const polyglot = Buffer.concat([await image(300, 300), Buffer.from(payload)]);

    const asset = await ingestMedia(polyglot, { filename: 'polyglot.jpg', kind: 'image' });
    const stored = await storedBytes(asset.storageKey);

    // The stored object is pixels we re-encoded, so the appended bytes cannot
    // have survived.
    expect(stored.includes(Buffer.from(payload))).toBe(false);
    expect(stored.toString('latin1')).not.toContain('<script');
  });

  it('discards EXIF, including GPS coordinates', async () => {
    // A photograph straight off a phone carries the location it was taken.
    // Publishing that with a heritage photo is a privacy leak the platform
    // must not make possible.
    const withExif = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#777' },
    })
      .withExif({
        IFD0: { Copyright: 'SECRET-MARKER-COPYRIGHT', Software: 'SECRET-MARKER-SOFTWARE' },
        IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
      })
      .jpeg()
      .toBuffer();

    // Confirm the fixture really does carry the metadata.
    const before = await sharp(withExif).metadata();
    expect(before.exif).toBeDefined();

    const asset = await ingestMedia(withExif, { filename: 'phone.jpg', kind: 'image' });
    const stored = await storedBytes(asset.storageKey);

    expect(stored.toString('latin1')).not.toContain('SECRET-MARKER-COPYRIGHT');
    expect(stored.toString('latin1')).not.toContain('SECRET-MARKER-SOFTWARE');

    const after = await sharp(stored).metadata();
    expect(after.exif).toBeUndefined();
  });

  it('records a content type derived from the bytes, not from the client', async () => {
    const asset = await ingestMedia(await image(200, 200), {
      filename: 'thing.jpg',
      clientMimeType: 'text/html',
      kind: 'image',
    });
    expect(asset.mimeType).toMatch(/^image\//);
    expect(asset.mimeType).not.toBe('text/html');
  });

  it('writes every declared variant to storage', async () => {
    const asset = await ingestMedia(await image(1600, 1200), { filename: 'wide.jpg', kind: 'image' });
    for (const variant of asset.variants) {
      await expect(storedBytes(variant.storageKey)).resolves.toBeInstanceOf(Buffer);
    }
    await expect(storedBytes(asset.storageKey)).resolves.toBeInstanceOf(Buffer);
  });

  it('persists a row that matches what was stored', async () => {
    const asset = await ingestMedia(await image(320, 240), { filename: 'row.jpg', kind: 'image' });
    const [row] = await db
      .select()
      .from(schema.mediaAssets)
      .where(schema.mediaAssets.id ? undefined : undefined)
      .limit(200)
      .then((rows) => rows.filter((r) => r.id === asset.id));
    expect(row).toBeDefined();
    expect(row!.storageKey).toBe(asset.storageKey);
  });
});

describe('storage key safety', () => {
  it('rejects any key that could escape the storage root', () => {
    for (const key of [
      '../secrets.env',
      'media/../../etc/passwd',
      '/absolute/path',
      'media\\windows\\style',
      'media/\0null',
      '',
      'a'.repeat(513),
      'media/has spaces/file.jpg',
      'media/../..',
    ]) {
      expect(() => assertSafeKey(key), `should reject: ${JSON.stringify(key)}`).toThrow();
    }
  });

  it('accepts the keys the pipeline actually generates', () => {
    expect(() =>
      assertSafeKey('media/0f8fad5b-d9cb-469f-a165-70867728950e/original.jpg'),
    ).not.toThrow();
    expect(() => assertSafeKey('media/0f8fad5b-d9cb-469f-a165-70867728950e/w1024.webp')).not.toThrow();
  });
});
