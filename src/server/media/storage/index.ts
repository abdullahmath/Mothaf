import { env } from '../../config/env';
import { LocalStorageDriver } from './local';
import { S3StorageDriver } from './s3';
import type { StorageDriver } from './types';

export * from './types';

/**
 * Storage driver registry.
 *
 * `local` for development; `s3` for any S3-compatible object store.
 */

let cached: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  if (cached) return cached;
  const config = env();

  switch (config.STORAGE_DRIVER) {
    case 'local':
      cached = new LocalStorageDriver(config.STORAGE_LOCAL_ROOT);
      return cached;
    case 's3':
      cached = new S3StorageDriver({
        endpoint: config.S3_ENDPOINT,
        region: config.S3_REGION!,
        bucket: config.S3_BUCKET!,
        accessKeyId: config.S3_ACCESS_KEY_ID!,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
        publicBaseUrl: config.S3_PUBLIC_BASE_URL,
      });
      return cached;
  }
}

/** Test hook: forget the memoised driver after changing configuration. */
export function resetStorage(): void {
  cached = undefined;
}
