import { Readable } from 'node:stream';
import { eq, or, sql } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { mediaAssets } from '@/server/db/schema';
import { getStorage } from '@/server/media/storage';

/**
 * Serves stored media.
 *
 * Files live outside the web root and are never mapped to a static route, so
 * every read passes through here. Three things make that worthwhile:
 *
 * 1. **The content type comes from our database, not from the file.** A
 *    request can never coax the server into labelling an upload as HTML or
 *    JavaScript, which is how an image-upload feature turns into stored XSS.
 * 2. **The key must exist as a row.** Guessing a path is not enough; the
 *    object has to be a registered asset or one of its known variants.
 * 3. **`X-Content-Type-Options: nosniff` plus a restrictive
 *    `Content-Disposition`** stop a browser from second-guessing either.
 */

export const dynamic = 'force-dynamic';

/** Types we are willing to render inline. Everything else downloads. */
const INLINE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
]);

function parseRange(header: string | null, totalLength: number | null) {
  if (!header || totalLength === null) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return undefined;

  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return undefined;

  // A suffix range ("last N bytes") is written `bytes=-500`.
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return undefined;
    return { start: Math.max(0, totalLength - suffix), end: totalLength - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd === '' ? totalLength - 1 : Number(rawEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= totalLength) {
    return undefined;
  }
  return { start, end: Math.min(end, totalLength - 1) };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key: segments } = await context.params;
  const key = segments.join('/');

  // Reject anything that is not a plain relative key before it reaches the
  // storage driver. The driver checks again; this is the cheaper first gate.
  if (!/^[A-Za-z0-9._/-]+$/.test(key) || key.includes('..')) {
    return new Response('Not found', { status: 404 });
  }

  const db = await getDb();

  // The key is either the asset's own object or one of its derivatives, which
  // live in the `variants` JSON.
  const [asset] = await db
    .select({ mimeType: mediaAssets.mimeType, variants: mediaAssets.variants })
    .from(mediaAssets)
    .where(
      or(
        eq(mediaAssets.storageKey, key),
        sql`${mediaAssets.variants} @> ${JSON.stringify([{ storageKey: key }])}::jsonb`,
      ),
    )
    .limit(1);

  if (!asset) return new Response('Not found', { status: 404 });

  // A derivative may be a different format from the original (AVIF rendered
  // from a JPEG), so prefer the variant's recorded type.
  const variant = asset.variants.find((v) => v.storageKey === key);
  const contentType = variant?.mimeType ?? asset.mimeType;

  const storage = getStorage();

  const probe = await storage.get(key);
  if (!probe) return new Response('Not found', { status: 404 });

  const etag = probe.etag ? `"${probe.etag}"` : undefined;

  // Conditional request: nothing changed, send no body.
  if (etag && request.headers.get('if-none-match') === etag) {
    probe.stream.destroy();
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  }

  const range = parseRange(request.headers.get('range'), probe.totalLength);

  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': INLINE_TYPES.has(contentType) ? 'inline' : 'attachment',
    'Accept-Ranges': 'bytes',
  });
  if (etag) headers.set('ETag', etag);

  if (!range) {
    if (probe.contentLength !== null) headers.set('Content-Length', String(probe.contentLength));
    return new Response(Readable.toWeb(probe.stream) as ReadableStream, { status: 200, headers });
  }

  probe.stream.destroy();
  const ranged = await storage.get(key, range);
  if (!ranged) {
    return new Response('Range not satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${probe.totalLength ?? 0}` },
    });
  }

  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${ranged.totalLength ?? 0}`);
  if (ranged.contentLength !== null) headers.set('Content-Length', String(ranged.contentLength));

  return new Response(Readable.toWeb(ranged.stream) as ReadableStream, { status: 206, headers });
}
