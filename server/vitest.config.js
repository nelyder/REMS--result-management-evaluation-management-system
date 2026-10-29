import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    // Live database tests run separately: npm run test:live (see vitest.live.config.js).
    exclude: [...configDefaults.exclude, 'tests/live/**'],
  },
});
