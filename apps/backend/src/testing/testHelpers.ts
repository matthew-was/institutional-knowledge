/**
 * Shared unit test helpers.
 *
 * makeConfig() and makeLog() are used across all service unit test files.
 * Centralising them here means a new config field only needs updating in
 * one place rather than every test file.
 */

import { vi } from 'vitest';
import type { AppConfig } from '../config/index.js';

export function makeLog(): {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
} {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
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
    graph: { provider: 'postgresql' },
    embedding: { dimension: 384 },
    ingestion: { partialAuditReport: false, reportOutputDirectory: '/reports' },
    logger: { level: 'info' as const },
  };
}
