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
        // RSC pages that use Next.js-specific APIs (redirect, async params,
        // self-call fetch) or are trivial static wrappers — not testable in
        // Vitest's jsdom environment. Covered by Playwright E2E (Tier 3).
        // 'use client' pages (curation/documents/page.tsx,
        // curation/vocabulary/page.tsx) are intentionally kept in coverage.
        // ** is used to skip the (private) route-group segment (parens are
        // extglob syntax in micromatch and cannot be matched literally).
        // * is used for the [id] dynamic segment (brackets are character classes).
        'src/app/page.tsx',
        'src/app/**/upload/page.tsx',
        'src/app/**/upload/success/page.tsx',
        'src/app/**/curation/page.tsx',
        'src/app/**/documents/*/page.tsx',
        'src/app/**/vocabulary/new/page.tsx',
        // Layouts are pure structural wrappers — nav components tested separately.
        'src/app/**/layout.tsx',
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
