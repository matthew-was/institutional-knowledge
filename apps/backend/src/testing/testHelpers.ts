/**
 * Shared unit test helpers.
 *
 * makeConfig(), makeLog(), makeStubDeps(), and createTestApp() are used across
 * test files. Centralising them here means a new config field or AppDependencies
 * entry only needs updating in one place rather than every test file.
 */

import type express from 'express';
import { vi } from 'vitest';
import type { AppConfig } from '../config/index.js';
import type { DbInstance } from '../db/index.js';
import { type AppDependencies, createApp } from '../index.js';
import { createLogger, type Logger } from '../middleware/logger.js';
import type { StorageService } from '../storage/index.js';

export function makeLog(): {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
} {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

/**
 * Returns a minimal AppDependencies stub for use in middleware unit tests
 * that need to call createApp() but do not exercise any service methods.
 * All service fields are cast to `never` — they will throw if accidentally called.
 * Update this function when new fields are added to AppDependencies.
 */
export function makeStubDeps(): AppDependencies {
  return {
    config: makeConfig(),
    db: {} as never,
    storage: {} as never,
    vectorStore: {} as never,
    graphStore: {} as never,
    documentService: {} as never,
    curationService: {} as never,
    vocabularyService: {} as never,
    processingService: {} as never,
    searchService: {} as never,
    ingestionService: {} as never,
    adminService: {} as never,
    log: createLogger({ level: 'error' }),
  };
}

export function makeConfig(
  overrides?: Partial<AppConfig['upload']>,
): AppConfig {
  return {
    server: { port: 4000 },
    db: {
      host: 'localhost',
      port: 5432,
      database: 'ik',
      user: 'ik',
      password: 'ik',
    },
    auth: { frontendKey: 'fk', pythonKey: 'pk', pythonServiceKey: 'psk' },
    storage: {
      provider: 'local',
      local: { basePath: '/base', stagingPath: '/staging' },
    },
    upload: {
      maxFileSizeMb: 10,
      acceptedExtensions: ['.jpg', '.pdf', '.png'],
      ...overrides,
    },
    pipeline: { runningStepTimeoutMinutes: 30, maxRetries: 3 },
    python: { baseUrl: 'http://localhost:5000' },
    vectorStore: { provider: 'pgvector' },
    graph: { provider: 'postgresql', maxTraversalDepth: 3 },
    embedding: { dimension: 384 },
    ingestion: { partialAuditReport: false, reportOutputDirectory: '/reports' },
    logger: { level: 'info' as const },
  };
}

/**
 * Builds an Express app for route integration tests.
 *
 * All AppDependencies fields default to `{} as never` — they throw if
 * accidentally called. Pass only the service(s) under test via `overrides`.
 * This is the standard pattern for building the app in route integration
 * tests (see development-principles.md §8 Test Early).
 *
 * Example:
 *   const app = createTestApp(db, storage, config, log, { documentService });
 */
export function createTestApp(
  db: DbInstance,
  storage: StorageService,
  config: AppConfig,
  log: Logger,
  overrides?: Partial<AppDependencies>,
): express.Application {
  return createApp({
    config,
    db,
    storage,
    log,
    vectorStore: {} as never,
    graphStore: {} as never,
    documentService: {} as never,
    curationService: {} as never,
    vocabularyService: {} as never,
    processingService: {} as never,
    searchService: {} as never,
    ingestionService: {} as never,
    adminService: {} as never,
    ...overrides,
  });
}
