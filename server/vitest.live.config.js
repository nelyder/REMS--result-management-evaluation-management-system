import { defineConfig } from 'vitest/config';

// Live tests talk to the real Supabase project in server/.env (no fakes). They need the
// demo data from `npm run seed:demo` and restore everything they change. Dev projects only.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/live/**/*.live.test.js'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
