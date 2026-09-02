import 'server-only';

import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '../config/env';

/**
 * The database handle.
 *
 * Two drivers, one dialect. `postgres` talks to a real server in production;
 * `pglite` runs Postgres compiled to WebAssembly inside this process for local
 * development and tests. Because both speak Postgres, the migrations and the
 * queries are identical — there is no second dialect to keep in sync.
 *
 * A single concrete type rather than a union of the two driver types: a union
 * makes every builder call ambiguous to the compiler (`.insert().returning()`
 * resolves to an overload set with no common signature). Both drivers extend
 * the same `PgDatabase` and expose an identical query builder, so the PGlite
 * instance is widened to this type at construction. The one genuine
 * difference — `execute()` returning `{ rows }` rather than an array — is
 * normalised by `toRows()` in ./raw.ts.
 */
export type Database = PostgresJsDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __mothafDb: Database | undefined;
  // eslint-disable-next-line no-var
  var __mothafSql: postgres.Sql | undefined;
}

async function createDatabase(): Promise<Database> {
  const config = env();

  if (config.DATABASE_DRIVER === 'pglite') {
    // Imported lazily so the WASM bundle never reaches a production build.
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
    const client = new PGlite(config.PGLITE_DATA_DIR);
    return drizzlePglite(client, { schema }) as unknown as Database;
  }

  // Guaranteed present by the schema refinement in config/env.ts.
  const url = config.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing despite DATABASE_DRIVER=postgres');

  const sql = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // Fail loudly rather than silently coercing unknown types.
    transform: { undefined: null },
  });
  globalThis.__mothafSql = sql;
  return drizzlePostgres(sql, { schema });
}

let initializing: Promise<Database> | undefined;

/**
 * Returns the shared database handle, creating it once per process.
 *
 * The instance is cached on `globalThis` because Next.js dev-mode hot reload
 * re-evaluates modules on every edit; without this a long session would open a
 * new connection pool (or a new PGlite instance) per save.
 */
export async function getDb(): Promise<Database> {
  if (globalThis.__mothafDb) return globalThis.__mothafDb;
  initializing ??= createDatabase().then((db) => {
    globalThis.__mothafDb = db;
    return db;
  });
  return initializing;
}

/** Closes the pool. Used by scripts and test teardown, not by the app. */
export async function closeDb(): Promise<void> {
  await globalThis.__mothafSql?.end({ timeout: 5 });
  globalThis.__mothafSql = undefined;
  globalThis.__mothafDb = undefined;
  initializing = undefined;
}

export { schema };
