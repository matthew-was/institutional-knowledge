import { describe, expect, it } from 'vitest';
import { parseConfig } from '../index.js';

const validRaw = {
  server: { port: 4000 },
  db: {
    host: 'localhost',
    port: 5432,
    database: 'institutional_knowledge',
    user: 'ik_user',
    password: 'ik_local_dev',
  },
  auth: {
    frontendKey: 'dev-frontend-key',
    pythonKey: 'dev-python-key',
    pythonServiceKey: 'dev-python-service-key',
  },
  storage: {
    provider: 'local',
    local: { basePath: './data/storage', stagingPath: './data/staging' },
  },
  upload: { maxFileSizeMb: 50, acceptedExtensions: ['.pdf', '.jpg'] },
  pipeline: { runningStepTimeoutMinutes: 30, maxRetries: 3 },
  python: { baseUrl: 'http://localhost:8000' },
  vectorStore: { provider: 'pgvector' },
  graph: { provider: 'postgresql' },
  embedding: { dimension: 384 },
  ingestion: { partialAuditReport: false, reportOutputDirectory: './data/reports' },
  logger: { level: 'info' },
};

describe('parseConfig', () => {
  it('returns a correctly typed config object for valid input', () => {
    const cfg = parseConfig(validRaw);

    expect(cfg.server.port).toBe(4000);
    expect(cfg.db.host).toBe('localhost');
    expect(cfg.db.port).toBe(5432);
    expect(cfg.auth.frontendKey).toBe('dev-frontend-key');
    expect(cfg.auth.pythonKey).toBe('dev-python-key');
    expect(cfg.auth.pythonServiceKey).toBe('dev-python-service-key');
    expect(cfg.storage.provider).toBe('local');
    expect(cfg.upload.maxFileSizeMb).toBe(50);
    expect(cfg.upload.acceptedExtensions).toEqual(['.pdf', '.jpg']);
    expect(cfg.pipeline.runningStepTimeoutMinutes).toBe(30);
    expect(cfg.pipeline.maxRetries).toBe(3);
    expect(cfg.python.baseUrl).toBe('http://localhost:8000');
    expect(cfg.vectorStore.provider).toBe('pgvector');
    expect(cfg.graph.provider).toBe('postgresql');
    expect(cfg.embedding.dimension).toBe(384);
    expect(cfg.ingestion.partialAuditReport).toBe(false);
    expect(cfg.ingestion.reportOutputDirectory).toBe('./data/reports');
    expect(cfg.logger.level).toBe('info');
  });

  it('throws a descriptive error when a required key is missing', () => {
    const { frontendKey: _omitted, ...authWithoutFrontendKey } = validRaw.auth;
    const withMissingKey = { ...validRaw, auth: authWithoutFrontendKey };

    expect(() => parseConfig(withMissingKey)).toThrowError(
      /auth\.frontendKey/,
    );
  });
});
