/**
 * `db.execute()` returns a bare array under postgres-js and a `{ rows }`
 * envelope under PGlite. Every raw query in the codebase goes through this so
 * the difference stays in one place instead of leaking into call sites.
 */
export function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

export function firstRow<T>(result: unknown): T | undefined {
  return toRows<T>(result)[0];
}
