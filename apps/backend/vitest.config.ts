import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude compiled output from test discovery.
    exclude: ['dist/**', 'node_modules/**'],
    // Run migrate.latest() once before all suites and rollback once after.
    // Individual test files use afterEach(cleanAllTables) for data isolation.
    globalSetup: ['src/testing/globalSetup.ts'],
    // Tests within a file run sequentially (default). Across files, parallelism
    // is disabled because multiple integration test suites write to the same
    // PostgreSQL test database — concurrent writes would cause race conditions.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**', 'src/testing/**'],
    },
  },
});
