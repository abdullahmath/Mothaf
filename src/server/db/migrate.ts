/**
 * Applies pending migrations.
 *
 * Run as a release step *before* new application instances receive traffic:
 *   npm run db:migrate
 *
 * Migrations must be backward-compatible with the outgoing version so that a
 * rollback never needs a down-migration. Prefer additive changes; drop columns
 * only in a later release, once nothing reads them.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../drizzle',
);

export async function runMigrations(): Promise<void> {
  const config = env();

  if (config.DATABASE_DRIVER === 'pglite') {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const client = new PGlite(config.PGLITE_DATA_DIR);
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    await client.close();
    return;
  }

  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');

  const url = config.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to migrate');

  // A dedicated single connection — migrations must not share the app pool.
  const sql = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Executed directly (`npm run db:migrate`) rather than imported.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  runMigrations()
    .then(() => {
      console.log('Migrations applied.');
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
