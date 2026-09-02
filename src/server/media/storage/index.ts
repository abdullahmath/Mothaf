import { env } from '../../config/env';
import { LocalStorageDriver } from './local';
import type { StorageDriver } from './types';

export * from './types';

/**
 * Storage driver registry.
 *
 * `local` ships. `s3` is a stub that fails loudly rather than silently doing
 * nothing — an unimplemented driver that quietly succeeds would look like a
 * working deployment while dropping every upload on the floor.
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
      throw new Error(
        'The s3 storage driver is not implemented yet. Implement StorageDriver in ' +
          'src/server/media/storage/s3.ts and register it here, or set STORAGE_DRIVER=local.',
      );
  }
}

/** Test hook: forget the memoised driver after changing configuration. */
export function resetStorage(): void {
  cached = undefined;
}
