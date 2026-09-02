/**
 * Loads an image into something WebGL can upload as a texture.
 *
 * Two paths, for a reason that is easy to get wrong:
 *
 * - **`data:` URIs** are decoded through an `<img>` element. They cannot be
 *   fetched, because the Content Security Policy sets `connect-src 'self'` and
 *   a data URI is not "self" — `fetch()` on one is blocked outright, while
 *   `img-src 'self' data:` permits exactly this. Relaxing `connect-src` to
 *   allow `data:` would widen the policy across the whole application to
 *   accommodate a 300-byte placeholder, which is the wrong trade.
 *
 * - **Same-origin URLs** go through `fetch` + `createImageBitmap`, which
 *   decodes off the main thread. For a 4096×2048 panorama that is the
 *   difference between a smooth scene change and a visible stall.
 */
export async function loadTexture(url: string): Promise<TexImageSource> {
  if (url.startsWith('data:')) {
    return decodeViaImageElement(url);
  }

  if (typeof createImageBitmap === 'function') {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error(`Failed to load texture ${url}: ${response.status}`);
    }
    return createImageBitmap(await response.blob());
  }

  return decodeViaImageElement(url);
}

function decodeViaImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // `decode()` resolves once the image is ready to paint without blocking.
    image.onerror = () => reject(new Error(`Failed to decode image: ${url.slice(0, 64)}`));
    image.onload = () => {
      if (typeof image.decode === 'function') {
        image.decode().then(
          () => resolve(image),
          // A decode failure after a successful load is recoverable: the
          // element still holds usable pixels for texImage2D.
          () => resolve(image),
        );
      } else {
        resolve(image);
      }
    };
    image.src = url;
  });
}

/**
 * Picks the largest rendition every GPU is guaranteed to accept.
 *
 * `MAX_TEXTURE_SIZE` is only assured to be 4096 across mobile hardware, so
 * anything wider risks a silent upload failure on a phone — which presents as
 * a black scene rather than an error.
 */
export function pickTextureSource(media: {
  src: string;
  sources: readonly { url: string; width: number | null }[];
}): string {
  const candidates = media.sources
    .filter((source) => source.width !== null && source.width <= 4096)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return candidates[0]?.url ?? media.src;
}
