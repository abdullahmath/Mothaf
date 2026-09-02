import type { Config } from 'drizzle-kit';

/**
 * Migrations are always generated against the Postgres dialect. Development
 * and tests run the very same SQL through PGlite (Postgres compiled to WASM),
 * so there is exactly one dialect in the project and no schema drift.
 */
export default {
  schema: './src/server/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://mothaf:mothaf@localhost:5432/mothaf',
  },
  strict: true,
  verbose: true,
} satisfies Config;
