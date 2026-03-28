import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/globalSetup.ts',
  globalTeardown: './e2e/globalTeardown.ts',
  // Single worker — the mock Express server holds shared in-memory state.
  // Running spec files in parallel across workers causes race conditions:
  // a curation test's beforeEach /test-reset can fire while an upload test
  // is mid-flight and reset uploadShouldReturnDuplicate = false.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Start the Hono custom server (which mounts Next.js in dev mode).
    // config.json5 points express.baseUrl at http://localhost:4000, where the
    // mock Express server started by globalSetup is listening.
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
