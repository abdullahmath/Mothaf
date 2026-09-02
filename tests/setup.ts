process.env.NODE_ENV = 'test';
process.env.DATABASE_DRIVER = 'pglite';
process.env.SESSION_SECRET ??= 'test-session-secret-value-for-vitest-only';
process.env.ANALYTICS_SALT ??= 'test-analytics-salt-value-for-vitest-only';
process.env.APP_ORIGIN ??= 'http://localhost:3000';
process.env.STORAGE_DRIVER ??= 'local';
