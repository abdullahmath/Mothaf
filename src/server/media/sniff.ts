/**
 * Container detection by magic bytes.
 *
 * The browser's `Content-Type` and the filename extension are both supplied by
 * whoever is uploading, so neither is evidence of anything. A file claiming to
 * be `photo.jpg` with `image/jpeg` can be an HTML document, and if the server
 * believes the claim and later serves it back with that type, the upload form
 * has become a stored-XSS vector on our own origin.
 *
 * Only formats on this list are accepted. An unknown container is rejected
 * rather than passed through, because "we could not identify it" is not a
 * reason to trust it.
 */

export type SniffedType = {
  mimeType: string;
  extension: string;
  category: 'image' | 'video' | 'audio';
};

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/** ISO base media (MP4/M4A) brand, read from the `ftyp` box. */
function isoBrand(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer.toString('ascii', 4, 8) !== 'ftyp') return null;
  return buffer.toString('ascii', 8, 12);
}

export function sniffType(buffer: Buffer): SniffedType | null {
  // --- images ---
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { mimeType: 'image/jpeg', extension: 'jpg', category: 'image' };
  }
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mimeType: 'image/png', extension: 'png', category: 'image' };
  }
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    buffer.length >= 12 &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: 'webp', category: 'image' };
  }
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) {
    return { mimeType: 'image/gif', extension: 'gif', category: 'image' };
  }

  const brand = isoBrand(buffer);
  if (brand) {
    if (brand === 'avif' || brand === 'avis') {
      return { mimeType: 'image/avif', extension: 'avif', category: 'image' };
    }
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1') {
      return { mimeType: 'image/heic', extension: 'heic', category: 'image' };
    }
    if (brand.startsWith('M4A')) {
      return { mimeType: 'audio/mp4', extension: 'm4a', category: 'audio' };
    }
    // isom, mp42, avc1, iso2 … all read as MP4 video.
    return { mimeType: 'video/mp4', extension: 'mp4', category: 'video' };
  }

  // --- video ---
  // Matroska/WebM share the EBML header; WebM is the subset browsers play.
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { mimeType: 'video/webm', extension: 'webm', category: 'video' };
  }

  // --- audio ---
  if (startsWith(buffer, [0x49, 0x44, 0x33])) {
    return { mimeType: 'audio/mpeg', extension: 'mp3', category: 'audio' };
  }
  // A bare MPEG audio frame, without an ID3 tag.
  if (buffer.length > 1 && buffer[0] === 0xff && ((buffer[1] ?? 0) & 0xe0) === 0xe0) {
    return { mimeType: 'audio/mpeg', extension: 'mp3', category: 'audio' };
  }
  if (startsWith(buffer, [0x4f, 0x67, 0x67, 0x53])) {
    return { mimeType: 'audio/ogg', extension: 'ogg', category: 'audio' };
  }
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    buffer.length >= 12 &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
  ) {
    return { mimeType: 'audio/wav', extension: 'wav', category: 'audio' };
  }

  return null;
}

/**
 * Cross-checks the sniffed type against what the client claimed.
 *
 * A mismatch is not automatically an attack — browsers get this wrong on their
 * own — but it is worth surfacing to an editor, who may have uploaded the
 * wrong file entirely.
 */
export function clientTypeAgrees(sniffed: SniffedType, claimed: string | null): boolean {
  if (!claimed) return true;
  const normalised = claimed.split(';')[0]?.trim().toLowerCase() ?? '';
  if (normalised === sniffed.mimeType) return true;
  // Browsers routinely report jpeg as `image/jpg`.
  if (normalised === 'image/jpg' && sniffed.mimeType === 'image/jpeg') return true;
  return false;
}
