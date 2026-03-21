/**
 * Integration tests for uploadStartupSweep (ADR-017).
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
import type { DocumentInsert } from '../../db/tables.js';
import type { Logger } from '../../middleware/logger.js';
import { LocalStorageService } from '../../storage/LocalStorageService.js';
import type { StorageService } from '../../storage/StorageService.js';
import { cleanAllTables } from '../../testing/dbCleanup.js';
import { TEST_DB_CONFIG } from '../../testing/testDb.js';
import { uploadStartupSweep } from '../uploadSweep.js';

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

let db: DbInstance;
let storage: LocalStorageService;
let tmpDir: string;
let basePath: string;
let stagingPath: string;
let log: Logger;

beforeAll(async () => {
  db = createTestDb(TEST_DB_CONFIG);

  tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ik-upload-sweep-integration-'),
  );
  basePath = path.join(tmpDir, 'permanent');
  stagingPath = path.join(tmpDir, 'staging');
  await fs.mkdir(basePath, { recursive: true });
  await fs.mkdir(stagingPath, { recursive: true });

  log = pino({ level: 'silent' }) as unknown as Logger;
  storage = new LocalStorageService(basePath, stagingPath, log);
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

async function insertDocument(
  overrides: Partial<DocumentInsert> = {},
): Promise<string> {
  const id = uuidv7();
  const row: DocumentInsert = {
    id,
    status: 'uploaded',
    filename: `doc-${id}.jpg`,
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
    submitterIdentity: 'Primary Archivist',
    ingestionRunId: null,
    ...overrides,
  };
  await db.documents.insert(row);
  return id;
}

/** Write a real staging file so deleteStagingFile has something to remove. */
async function writeStagingFile(
  uploadId: string,
  filename: string,
): Promise<string> {
  const dir = path.join(stagingPath, uploadId);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, Buffer.from('fake content'));
  return filePath;
}

/** Write a real permanent file so deletePermanentFile has something to remove. */
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

describe('uploadStartupSweep', () => {
  it('is a no-op when there are no non-finalized uploads', async () => {
    // Empty tables — should complete without error
    await expect(uploadStartupSweep(db, storage, log)).resolves.toBeUndefined();
  });

  it('deletes a document with status "initiated" and its staging file', async () => {
    const filename = 'doc-initiated.jpg';
    const id = await insertDocument({ status: 'initiated', filename });
    const stagingFilePath = await writeStagingFile(id, filename);

    await uploadStartupSweep(db, storage, log);

    const doc = await db.documents.getById(id);
    expect(doc).toBeUndefined();
    expect(await fileExists(stagingFilePath)).toBe(false);
  });

  it('deletes a document with status "uploaded" and its staging file', async () => {
    const filename = 'doc-uploaded.jpg';
    const id = await insertDocument({ status: 'uploaded', filename });
    const stagingFilePath = await writeStagingFile(id, filename);

    await uploadStartupSweep(db, storage, log);

    const doc = await db.documents.getById(id);
    expect(doc).toBeUndefined();
    expect(await fileExists(stagingFilePath)).toBe(false);
  });

  it('deletes a document with status "stored" and its permanent file', async () => {
    const filename = 'doc-stored.jpg';
    const permanentPath = path.join(basePath, 'stored-upload-id', filename);
    await writePermanentFile(permanentPath);

    const id = await insertDocument({
      status: 'stored',
      filename,
      storagePath: permanentPath,
    });

    await uploadStartupSweep(db, storage, log);

    const doc = await db.documents.getById(id);
    expect(doc).toBeUndefined();
    expect(await fileExists(permanentPath)).toBe(false);
  });

  it('deletes all three non-finalized statuses in a single sweep', async () => {
    const initiatedId = await insertDocument({
      status: 'initiated',
      filename: 'a.jpg',
    });
    await writeStagingFile(initiatedId, 'a.jpg');

    const uploadedId = await insertDocument({
      status: 'uploaded',
      filename: 'b.jpg',
    });
    await writeStagingFile(uploadedId, 'b.jpg');

    const storedFilename = 'c.jpg';
    const permanentPath = path.join(basePath, 'stored-id', storedFilename);
    await writePermanentFile(permanentPath);
    const storedId = await insertDocument({
      status: 'stored',
      filename: storedFilename,
      storagePath: permanentPath,
    });

    await uploadStartupSweep(db, storage, log);

    expect(await db.documents.getById(initiatedId)).toBeUndefined();
    expect(await db.documents.getById(uploadedId)).toBeUndefined();
    expect(await db.documents.getById(storedId)).toBeUndefined();
  });

  it('does not touch a document with status "finalized"', async () => {
    const permanentPath = path.join(basePath, 'final-id', 'final.jpg');
    await writePermanentFile(permanentPath);

    const id = await insertDocument({
      status: 'finalized',
      filename: 'final.jpg',
      storagePath: permanentPath,
    });

    await uploadStartupSweep(db, storage, log);

    const doc = await db.documents.getById(id);
    expect(doc).toBeDefined();
    expect(doc?.status).toBe('finalized');
    expect(await fileExists(permanentPath)).toBe(true);
  });

  it('does not sweep a non-finalized document linked to an ingestion run', async () => {
    // Insert a bare ingestion run row so the FK constraint is satisfied
    const runId = uuidv7();
    await db.ingestionRuns.insert({
      id: runId,
      status: 'in_progress',
      sourceDirectory: '/tmp/src',
      grouped: false,
      completedAt: null,
    });

    const id = await insertDocument({
      status: 'uploaded',
      filename: 'run-doc.jpg',
      ingestionRunId: runId,
    });

    await uploadStartupSweep(db, storage, log);

    // Document linked to a run must not be touched
    const doc = await db.documents.getById(id);
    expect(doc).toBeDefined();
    expect(doc?.status).toBe('uploaded');
  });

  it('handles a "stored" document with null storagePath without error', async () => {
    const id = await insertDocument({ status: 'stored', storagePath: null });

    // Should delete DB record but attempt no file deletion (guard condition)
    await expect(uploadStartupSweep(db, storage, log)).resolves.toBeUndefined();

    const doc = await db.documents.getById(id);
    expect(doc).toBeUndefined();
  });

  it('continues past a failing document and cleans up subsequent healthy documents', async () => {
    // Document 1: 'stored' — the storage wrapper will throw on deletePermanentFile,
    // simulating a transient I/O failure. The DB row must survive because the try/catch
    // fires before db.documents.delete is reached (file-first ordering).
    const failFilename = 'fail.jpg';
    const failStoragePath = path.join(basePath, 'fail-id', failFilename);
    await writePermanentFile(failStoragePath);
    const failId = await insertDocument({
      status: 'stored',
      filename: failFilename,
      storagePath: failStoragePath,
    });

    // Document 2: 'initiated' with a real staging file — must be cleaned up even
    // though document 1 failed.
    const successFilename = 'success.jpg';
    const successId = await insertDocument({
      status: 'initiated',
      filename: successFilename,
    });
    const successStagingFile = await writeStagingFile(
      successId,
      successFilename,
    );

    // Wrap the real storage: throw for failStoragePath, delegate everything else.
    // Class methods live on the prototype so spread doesn't copy them — delegate explicitly.
    const throwingStorage: StorageService = {
      writeStagingFile: (u, b, f) => storage.writeStagingFile(u, b, f),
      moveStagingToPermanent: (u, f) => storage.moveStagingToPermanent(u, f),
      deleteStagingFile: (u, f) => storage.deleteStagingFile(u, f),
      createStagingDirectory: (r) => storage.createStagingDirectory(r),
      deleteStagingDirectory: (r) => storage.deleteStagingDirectory(r),
      fileExists: (p) => storage.fileExists(p),
      deletePermanentFile: async (p: string) => {
        if (p === failStoragePath) {
          throw new Error('simulated I/O failure');
        }
        return storage.deletePermanentFile(p);
      },
    };

    // The sweep must not throw despite the failure on document 1.
    await expect(
      uploadStartupSweep(db, throwingStorage, log),
    ).resolves.toBeUndefined();

    // Document 1: file delete threw before the DB delete — DB row remains.
    expect(await db.documents.getById(failId)).toBeDefined();

    // Document 2: file delete and DB delete both succeeded.
    expect(await db.documents.getById(successId)).toBeUndefined();
    expect(await fileExists(successStagingFile)).toBe(false);
  });
});
