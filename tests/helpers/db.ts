import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/server/db/schema';
import type { Database } from '@/server/db';

export type TestDb = Database;

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

/**
 * A throwaway Postgres for one test file.
 *
 * PGlite is genuine Postgres compiled to WebAssembly, so constraints, check
 * expressions, partial indexes and cascade behaviour are all exercised for
 * real — a test that passes here would pass against the production server.
 * Passing no path keeps the database entirely in memory.
 *
 * The instance is also installed on `globalThis.__mothafDb`, which is where
 * `getDb()` looks. That lets domain services under test run against this
 * database without any dependency injection ceremony, and without a single
 * `vi.mock` of the data layer — the code under test is the real code.
 */
export async function createTestDb(): Promise<{ db: TestDb; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;
  await migrate(db as never, { migrationsFolder });
  await seedLocales(db);

  globalThis.__mothafDb = db;

  return {
    db,
    close: async () => {
      globalThis.__mothafDb = undefined;
      await client.close();
    },
  };
}

/**
 * Locales are reference data that every translation row depends on, so the
 * two shipping languages are always present.
 */
export async function seedLocales(db: TestDb): Promise<void> {
  await db
    .insert(schema.locales)
    .values([
      { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl', position: 0 },
      { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', position: 1 },
    ])
    .onConflictDoNothing();
}

export { schema };
