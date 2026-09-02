import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/server/db/schema';

export type TestDb = PgliteDatabase<typeof schema>;

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

/**
 * A throwaway Postgres for one test file.
 *
 * PGlite is genuine Postgres compiled to WebAssembly, so constraints, check
 * expressions, partial indexes and cascade behaviour are all exercised for
 * real — a test that passes here would pass against the production server.
 * Passing no path keeps the database entirely in memory.
 */
export async function createTestDb(): Promise<{ db: TestDb; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  await seedLocales(db);
  return { db, close: () => client.close() };
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
