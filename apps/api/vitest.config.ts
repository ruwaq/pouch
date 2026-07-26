import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Load the monorepo-root .env into process.env BEFORE any test module is
    // imported. Tests that exercise createApp()/createRuntimeAppServices() need
    // PRIVATE_KEY, DEMO_MODE, DATABASE_URL, etc. to be present. See
    // vitest.setup.ts and apps/api/src/server.ts for the runtime equivalent.
    setupFiles: ['./vitest.setup.ts'],
  },
});
