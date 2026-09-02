import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertSafeKey,
  type ByteRange,
  type ObjectMeta,
  type StorageDriver,
  type StoredObject,
} from './types';

/**
 * Filesystem storage.
 *
 * The root is outside the web root and is never mapped to a static route, so
 * nothing under it can be requested directly or executed by the server. Reads
 * go through the media route handler, which sets the content type from our own
 * database record rather than from the file's name.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /**
   * Resolves a key to an absolute path and verifies the result is still inside
   * the root. Belt and braces alongside `assertSafeKey`: symlinks and odd
   * Unicode normalisation are exactly the cases a character check misses.
   */
  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (!full.startsWith(rootWithSep)) {
      throw new Error(`Storage key escapes root: ${key}`);
    }
    return full;
  }

  async put(key: string, body: Buffer, _meta: ObjectMeta): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    // Mode 0o644: readable by the process, never executable.
    await writeFile(full, body, { mode: 0o644 });
  }

  async get(key: string, range?: ByteRange): Promise<StoredObject | null> {
    const full = this.resolve(key);
    let info;
    try {
      info = await stat(full);
    } catch {
      return null;
    }
    if (!info.isFile()) return null;

    // Stable validator derived from size and mtime; enough for conditional
    // requests on derivatives, which are immutable once written.
    const etag = createHash('sha1')
      .update(`${info.size}:${info.mtimeMs}:${key}`)
      .digest('hex');

    if (range) {
      const start = Math.max(0, range.start);
      const end = Math.min(info.size - 1, range.end);
      if (start > end) return null;
      return {
        stream: createReadStream(full, { start, end }),
        contentType: 'application/octet-stream',
        contentLength: end - start + 1,
        totalLength: info.size,
        etag,
      };
    }

    return {
      stream: createReadStream(full),
      // The caller supplies the authoritative content type from the database.
      contentType: 'application/octet-stream',
      contentLength: info.size,
      totalLength: info.size,
      etag,
    };
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      const info = await stat(this.resolve(key));
      return info.isFile();
    } catch {
      return false;
    }
  }

  /** Always proxied — the files are deliberately not web-reachable. */
  publicUrl(): string | null {
    return null;
  }
}
