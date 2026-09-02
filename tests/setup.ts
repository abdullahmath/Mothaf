// `process.env.NODE_ENV` is typed read-only, so the whole block is assigned at
// once. These values must be in place before any module reads them.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_DRIVER: 'pglite',
  SESSION_SECRET: process.env.SESSION_SECRET ?? 'test-session-secret-value-for-vitest-only',
  ANALYTICS_SALT: process.env.ANALYTICS_SALT ?? 'test-analytics-salt-value-for-vitest-only',
  APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:3000',
  STORAGE_DRIVER: process.env.STORAGE_DRIVER ?? 'local',
});
