import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` throws when bundled for the client. Under Vitest we are
      // always on the server, so it is stubbed out.
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // PGlite instances are heavy; each file gets its own database, so running
    // files in parallel processes is correct but memory-hungry.
    pool: 'forks',
    poolOptions: { forks: { singleFork: false, maxForks: 4 } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
