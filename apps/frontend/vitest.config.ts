import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    fileParallelism: false,
    exclude: ['node_modules/**', 'dist/**', '.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.browser.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/testing/**',
        'server/**/__tests__/**',
      ],
    },
    projects: [
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'browser',
          include: ['**/*.browser.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./src/testing/setup.browser.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          include: ['**/*.test.{ts,tsx}'],
          exclude: [
            '**/*.browser.test.{ts,tsx}',
            'node_modules/**',
            'dist/**',
            '.next/**',
          ],
          environment: 'node',
        },
      },
    ],
  },
});
