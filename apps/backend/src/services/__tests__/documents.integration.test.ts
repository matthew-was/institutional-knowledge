/**
 * Integration tests for DocumentService.
 *
 * Uses a real PostgreSQL database (docker-compose.test.yml, port 5433) and
 * LocalStorageService with temp directories. Service methods are called directly
 * with plain inputs — no Express req/res/next mocks needed.
 *
 * Confirms the full upload lifecycle:
 *   initiateUpload → uploadFile → finalizeUpload
 *
 * The document record must reach 'finalized' status, storagePath must be set,
 * the staging file must be absent (moved), and the permanent file must exist.
 *
 * Schema is managed by globalSetup.ts. Data is cleaned between tests by
 * cleanAllTables (afterEach).
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pino } from 'pino';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../config/index.js';
import { createTestDb } from '../../db/index.js';
import type { Logger } from '../../middleware/logger.js';
import { LocalStorageService } from '../../storage/LocalStorageService.js';
import { cleanAllTables } from '../../testing/dbCleanup.js';
import {
  createDocumentService,
  type DocumentServiceDeps,
} from '../documents.js';

// ---------------------------------------------------------------------------
// Test database connection (docker-compose.test.yml)
// ---------------------------------------------------------------------------

const TEST_DB_CONFIG: AppConfig['db'] = {
  host: 'localhost',
  port: 5433,
  database: 'ik_test',
  user: 'ik_test',
  password: 'ik_test',
};

// ---------------------------------------------------------------------------
// Test config
// ---------------------------------------------------------------------------

function makeConfig(basePath: string, stagingPath: string): AppConfig {
  return {
    server: { port: 4000 },
    db: TEST_DB_CONFIG,
    auth: { frontendKey: 'fk', pythonKey: 'pk', pythonServiceKey: 'psk' },
    storage: { provider: 'local', local: { basePath, stagingPath } },
    upload: {
      maxFileSizeMb: 10,
      acceptedExtensions: ['.jpg', '.pdf', '.png', '.txt'],
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

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

let db: ReturnType<typeof createTestDb>;
let tmpDir: string;
let basePath: string;
let testStagingPath: string;
let storage: LocalStorageService;
// pino({ level: 'silent' }) suppresses output at runtime; cast to Logger satisfies
// DocumentServiceDeps type without re-exporting pino's generic type parameter.
let log: Logger;
let deps: DocumentServiceDeps;

beforeAll(async () => {
  db = createTestDb(TEST_DB_CONFIG);

  // Isolated temp directories for this test suite
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ik-docs-integration-'));
  basePath = path.join(tmpDir, 'permanent');
  testStagingPath = path.join(tmpDir, 'staging');
  await fs.mkdir(basePath, { recursive: true });
  await fs.mkdir(testStagingPath, { recursive: true });

  log = pino({ level: 'silent' }) as unknown as Logger;
  storage = new LocalStorageService(basePath, testStagingPath, log);
  deps = {
    db,
    storage,
    config: makeConfig(basePath, testStagingPath),
    log,
  };
});

afterAll(async () => {
  await db.destroy();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

afterEach(async () => {
  await cleanAllTables(db._knex);
});

// ---------------------------------------------------------------------------
// Full lifecycle: initiate → upload → finalize
// ---------------------------------------------------------------------------

describe('full upload lifecycle', () => {
  it('completes initiate → upload → finalize; document reaches finalized with storagePath', async () => {
    const service = createDocumentService(deps);

    // --- Step 1: initiateUpload ---
    const initiateResult = await service.initiateUpload({
      filename: 'wedding.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: 1024,
      date: '1987-06-15',
      description: 'Wedding photo',
    });

    expect(initiateResult.outcome).toBe('success');
    if (initiateResult.outcome !== 'success') return;

    const { uploadId } = initiateResult.data;
    expect(typeof uploadId).toBe('string');

    // Verify DB row at initiated status
    const initiated = await db.documents.getById(uploadId);
    expect(initiated?.status).toBe('initiated');

    // --- Step 2: uploadFile ---
    const fileContent = Buffer.from('fake-image-data-for-test');
    const uploadResult = await service.uploadFile({
      uploadId,
      fileBuffer: fileContent,
      fileSize: fileContent.length,
    });

    expect(uploadResult.outcome).toBe('success');
    if (uploadResult.outcome !== 'success') return;

    const { fileHash } = uploadResult.data;
    expect(typeof fileHash).toBe('string');
    expect(fileHash).toHaveLength(32);

    // Verify staging file exists
    const stagingFile = path.join(testStagingPath, uploadId, 'wedding.jpg');
    await expect(fs.access(stagingFile)).resolves.toBeUndefined();

    // Verify DB row at uploaded status
    const uploaded = await db.documents.getById(uploadId);
    expect(uploaded?.status).toBe('uploaded');
    expect(uploaded?.fileHash).toBe(fileHash);

    // --- Step 3: finalizeUpload ---
    const finalizeResult = await service.finalizeUpload(uploadId);

    expect(finalizeResult.outcome).toBe('success');
    if (finalizeResult.outcome !== 'success') return;

    expect(finalizeResult.data.documentId).toBe(uploadId);
    expect(finalizeResult.data.status).toBe('finalized');
    expect(finalizeResult.data.archiveReference).toBe(
      '1987-06-15 — Wedding photo',
    );

    // Verify DB row at finalized status with storagePath set
    const finalized = await db.documents.getById(uploadId);
    expect(finalized?.status).toBe('finalized');
    expect(finalized?.storagePath).not.toBeNull();
    expect(typeof finalized?.storagePath).toBe('string');

    // Verify staging file is absent (moved to permanent)
    await expect(fs.access(stagingFile)).rejects.toThrow();

    // Verify permanent file exists at storagePath
    const permanentPath = finalized?.storagePath as string;
    await expect(fs.access(permanentPath)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// cleanupUpload: initiated status
// ---------------------------------------------------------------------------

describe('cleanupUpload', () => {
  it('deletes an initiated document record', async () => {
    const service = createDocumentService(deps);

    const initiateResult = await service.initiateUpload({
      filename: 'doc.pdf',
      contentType: 'application/pdf',
      fileSizeBytes: 512,
      date: '',
      description: 'A test document',
    });

    expect(initiateResult.outcome).toBe('success');
    if (initiateResult.outcome !== 'success') return;

    const { uploadId } = initiateResult.data;

    const cleanupResult = await service.cleanupUpload(uploadId);

    expect(cleanupResult.outcome).toBe('success');
    if (cleanupResult.outcome === 'success') {
      expect(cleanupResult.data.deleted).toBe(true);
    }

    // Verify DB row is gone
    const row = await db.documents.getById(uploadId);
    expect(row).toBeUndefined();
  });
});
