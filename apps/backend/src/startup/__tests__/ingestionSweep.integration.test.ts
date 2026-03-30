/**
 * Integration tests for ingestionStartupSweep (ADR-018).
 *
 * Calls the sweep function directly against a real PostgreSQL test database
 * and a real LocalStorageService backed by a temp directory.
 *
 * Schema is managed by globalSetup.ts. Data is cleaned between tests by
 * cleanAllTables (afterEach).
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pino } from 'pino';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DbInstance } from '../../db/index.js';
import { createTestDb } from '../../db/index.js';
import type { DocumentInsert, IngestionRunInsert } from '../../db/tables.js';
import type { Logger } from '../../middleware/logger.js';
import { createStorageService } from '../../storage/index.js';
import type { StorageService } from '../../storage/StorageService.js';
import { cleanAllTables } from '../../testing/dbCleanup.js';
import { TEST_DB_CONFIG } from '../../testing/testDb.js';
import { ingestionStartupSweep } from '../ingestionSweep.js';

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

let db: DbInstance;
let storage: StorageService;
let tmpDir: string;
let basePath: string;
let stagingPath: string;
let log: Logger;

beforeAll(async () => {
  db = createTestDb(TEST_DB_CONFIG);

  tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ik-ingestion-sweep-integration-'),
  );
  basePath = path.join(tmpDir, 'permanent');
  stagingPath = path.join(tmpDir, 'staging');
  await fs.mkdir(basePath, { recursive: true });
  await fs.mkdir(stagingPath, { recursive: true });

  log = pino({ level: 'silent' }) as unknown as Logger;
  storage = createStorageService(
    { provider: 'local', local: { basePath, stagingPath } },
    log,
  );
});

afterAll(async () => {
  await db.destroy();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

afterEach(async () => {
  await cleanAllTables(db._knex);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function insertIngestionRun(
  overrides: Partial<IngestionRunInsert> = {},
): Promise<string> {
  const id = uuidv7();
  const row: IngestionRunInsert = {
    id,
    status: 'in_progress',
    sourceDirectory: '/tmp/source',
    grouped: false,
    completedAt: null,
    ...overrides,
  };
  await db.ingestionRuns.insert(row);
  return id;
}

async function insertRunDocument(
  runId: string,
  overrides: Partial<DocumentInsert> = {},
): Promise<string> {
  const id = uuidv7();
  const filename = overrides.filename ?? `doc-${id}.jpg`;
  const row: DocumentInsert = {
    id,
    status: 'uploaded',
    filename,
    contentType: 'image/jpeg',
    fileSizeBytes: '1024',
    fileHash: `hash-${id}`,
    storagePath: null,
    date: '2000-01-01',
    description: 'Test document',
    documentType: null,
    people: null,
    organisations: null,
    landReferences: null,
    flagReason: null,
    flaggedAt: null,
    submitterIdentity: 'CLI Ingestion',
    ingestionRunId: runId,
    groupName: null,
    ...overrides,
  };
  await db.documents.insert(row);
  return id;
}

/** Write a staging file so deleteStagingFile has something real to remove. */
async function writeStagingFile(
  runId: string,
  filename: string,
): Promise<string> {
  const dir = path.join(stagingPath, runId);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, Buffer.from('fake staging content'));
  return filePath;
}

/** Write a permanent file so deletePermanentFile has something real to remove. */
async function writePermanentFile(storagePath: string): Promise<void> {
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  await fs.writeFile(storagePath, Buffer.from('fake permanent content'));
}

async function fileExists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(
    () => true,
    () => false,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ingestionStartupSweep', () => {
  it('is a no-op when there are no incomplete runs', async () => {
    await expect(
      ingestionStartupSweep(db, storage, log),
    ).resolves.toBeUndefined();
  });

  it('sweeps an incomplete run and deletes its staging files', async () => {
    const runId = await insertIngestionRun({ status: 'in_progress' });
    const filename = '2000-01-01 - test.jpg';
    const docId = await insertRunDocument(runId, {
      filename,
      status: 'uploaded',
    });
    const stagingFilePath = await writeStagingFile(runId, filename);

    await ingestionStartupSweep(db, storage, log);

    // Run record deleted
    expect(await db.ingestionRuns.getById(runId)).toBeUndefined();
    // Document record deleted (non-finalized)
    expect(await db.documents.getById(docId)).toBeUndefined();
    // Staging file deleted
    expect(await fileExists(stagingFilePath)).toBe(false);
  });

  it('deletes the permanent file for a "stored" document within a swept run', async () => {
    const runId = await insertIngestionRun({ status: 'moving' });
    const filename = 'stored-doc.jpg';
    const permanentPath = path.join(basePath, runId, filename);
    await writePermanentFile(permanentPath);

    const docId = await insertRunDocument(runId, {
      filename,
      status: 'stored',
      storagePath: permanentPath,
    });

    await ingestionStartupSweep(db, storage, log);

    expect(await db.ingestionRuns.getById(runId)).toBeUndefined();
    expect(await db.documents.getById(docId)).toBeUndefined();
    expect(await fileExists(permanentPath)).toBe(false);
  });

  it('does not touch a completed run', async () => {
    const runId = await insertIngestionRun({ status: 'completed' });

    await ingestionStartupSweep(db, storage, log);

    const run = await db.ingestionRuns.getById(runId);
    expect(run).toBeDefined();
    expect(run?.status).toBe('completed');
  });

  it('preserves finalized document records when sweeping the run', async () => {
    const runId = await insertIngestionRun({ status: 'moving' });

    // Finalized document: DB record must be preserved
    const finalizedId = await insertRunDocument(runId, {
      filename: 'finalized.jpg',
      status: 'finalized',
      storagePath: path.join(basePath, runId, 'finalized.jpg'),
    });

    // Non-finalized document: DB record must be deleted
    const uploadedId = await insertRunDocument(runId, {
      filename: 'uploaded.jpg',
      status: 'uploaded',
    });

    await ingestionStartupSweep(db, storage, log);

    // Run record deleted
    expect(await db.ingestionRuns.getById(runId)).toBeUndefined();
    // Finalized document preserved
    expect(await db.documents.getById(finalizedId)).toBeDefined();
    // Non-finalized document deleted
    expect(await db.documents.getById(uploadedId)).toBeUndefined();
  });

  it('sweeps multiple incomplete runs independently', async () => {
    const runId1 = await insertIngestionRun({ status: 'in_progress' });
    const runId2 = await insertIngestionRun({ status: 'moving' });

    const docId1 = await insertRunDocument(runId1, { filename: 'r1.jpg' });
    const docId2 = await insertRunDocument(runId2, { filename: 'r2.jpg' });

    await ingestionStartupSweep(db, storage, log);

    expect(await db.ingestionRuns.getById(runId1)).toBeUndefined();
    expect(await db.ingestionRuns.getById(runId2)).toBeUndefined();
    expect(await db.documents.getById(docId1)).toBeUndefined();
    expect(await db.documents.getById(docId2)).toBeUndefined();
  });

  it('continues to next document when one document file delete throws', async () => {
    // Note: no test for sweeping a run whose staging directory was never created —
    // deleteStagingDirectory uses { force: true } which makes it idempotent against missing directories.

    const runId = await insertIngestionRun({ status: 'in_progress' });

    // Document 1: 'stored' — storage wrapper will throw on deleteStagingFile for this doc,
    // simulating a transient I/O failure. DB row must survive (file-first ordering: the
    // catch fires before db.documents.delete is reached).
    const failFilename = 'fail.jpg';
    const failPermanentPath = path.join(basePath, runId, failFilename);
    await writePermanentFile(failPermanentPath);
    const failDocId = await insertRunDocument(runId, {
      filename: failFilename,
      status: 'stored',
      storagePath: failPermanentPath,
    });
    // Do NOT write a staging file for failDocId — storage wrapper will throw instead.

    // Document 2: 'uploaded' with a real staging file — must be cleaned up despite
    // document 1 failing.
    const successFilename = 'success.jpg';
    const successDocId = await insertRunDocument(runId, {
      filename: successFilename,
      status: 'uploaded',
    });
    const successStagingFile = await writeStagingFile(runId, successFilename);

    // Wrap the real storage: throw on deleteStagingFile for failFilename, delegate all else.
    // Class methods live on the prototype so spread doesn't copy them — delegate explicitly.
    const throwingStorage: StorageService = {
      writeStagingFile: (u, b, f) => storage.writeStagingFile(u, b, f),
      moveStagingToPermanent: (u, f) => storage.moveStagingToPermanent(u, f),
      deletePermanentFile: (p) => storage.deletePermanentFile(p),
      createStagingDirectory: (r) => storage.createStagingDirectory(r),
      deleteStagingDirectory: (r) => storage.deleteStagingDirectory(r),
      fileExists: (p) => storage.fileExists(p),
      deleteStagingFile: async (uploadId: string, filename: string) => {
        if (filename === failFilename) {
          throw new Error('simulated I/O failure');
        }
        return storage.deleteStagingFile(uploadId, filename);
      },
    };

    // The sweep must not throw despite the failure on document 1.
    await expect(
      ingestionStartupSweep(db, throwingStorage, log),
    ).resolves.toBeUndefined();

    // Document 1: file delete threw before DB delete — DB row remains.
    expect(await db.documents.getById(failDocId)).toBeDefined();

    // Document 2: file delete and DB delete both succeeded.
    expect(await db.documents.getById(successDocId)).toBeUndefined();
    expect(await fileExists(successStagingFile)).toBe(false);

    // Run record: deleted after the document loop completed.
    expect(await db.ingestionRuns.getById(runId)).toBeUndefined();
  });
});
