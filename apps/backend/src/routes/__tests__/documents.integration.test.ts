/**
 * Integration tests for document upload routes (DOC-001, DOC-002, DOC-003, DOC-005).
 *
 * Uses a real PostgreSQL database (docker-compose.test.yml, port 5433) and a
 * real Express app built via createApp(). Requests are sent via supertest so
 * the full stack is exercised: validate middleware → service → repository → DB.
 *
 * Schema is managed by globalSetup.ts. Data is cleaned between tests by
 * cleanAllTables (afterEach).
 *
 * Auth header uses the test frontend key 'fk' (from makeConfig()).
 *
 * archiveReference edge cases are covered by utils/__tests__/archiveReference.test.ts.
 * Integration tests assert one happy-path archiveReference output only.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pino } from 'pino';
import supertest from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DbInstance } from '../../db/index.js';
import { createTestDb } from '../../db/index.js';
import type { DocumentInsert } from '../../db/tables.js';
import type { Logger } from '../../middleware/logger.js';
import { createDocumentService } from '../../services/documents.js';
import { createStorageService } from '../../storage/index.js';
import { cleanAllTables } from '../../testing/dbCleanup.js';
import { TEST_DB_CONFIG } from '../../testing/testDb.js';
import { createTestApp, makeConfig } from '../../testing/testHelpers.js';

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

let db: DbInstance;
let app: ReturnType<typeof createTestApp>;
let request: ReturnType<typeof supertest>;
let tmpDir: string;
let basePath: string;
let stagingPath: string;

const AUTH = { 'x-internal-key': 'fk' };

beforeAll(async () => {
  db = createTestDb(TEST_DB_CONFIG);

  tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ik-documents-integration-'),
  );
  basePath = path.join(tmpDir, 'permanent');
  stagingPath = path.join(tmpDir, 'staging');
  await fs.mkdir(basePath, { recursive: true });
  await fs.mkdir(stagingPath, { recursive: true });

  const log = pino({ level: 'silent' }) as unknown as Logger;
  const config = makeConfig();
  const storage = createStorageService(
    { provider: 'local', local: { basePath, stagingPath } },
    log,
  );
  const documentService = createDocumentService({ db, storage, config, log });

  app = createTestApp(db, storage, config, log, { documentService });

  request = supertest(app);
});

afterAll(async () => {
  await db.destroy();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

afterEach(async () => {
  await cleanAllTables(db._knex);
});

// ---------------------------------------------------------------------------
// Helper: seed a document row via the repository for tests that need a
// pre-existing doc without driving through the full upload lifecycle.
// Uses db.documents.insert() so camelCase field names are enforced by the
// DocumentInsert type. db._knex is reserved for cross-table operations
// (transactions, TRUNCATE) and pipeline_steps seeding (no repository insert).
// ---------------------------------------------------------------------------

async function insertDocument(
  overrides: Partial<DocumentInsert> = {},
): Promise<string> {
  const id = uuidv7();
  const row: DocumentInsert = {
    id,
    status: 'finalized',
    filename: 'photo.jpg',
    contentType: 'image/jpeg',
    fileSizeBytes: '204800',
    fileHash: `hash-${id}`,
    storagePath: `/storage/${id}/photo.jpg`,
    date: '1987-06-15',
    description: 'Wedding photograph',
    documentType: null,
    people: null,
    organisations: null,
    landReferences: null,
    flagReason: null,
    flaggedAt: null,
    submitterIdentity: 'Primary Archivist',
    ingestionRunId: null,
    groupName: null,
    ...overrides,
  };
  await db.documents.insert(row);
  return id;
}

// ---------------------------------------------------------------------------
// DOC-001: POST /api/documents/initiate
// ---------------------------------------------------------------------------

describe('POST /api/documents/initiate', () => {
  it('returns 422 for unsupported file extension', async () => {
    const res = await request.post('/api/documents/initiate').set(AUTH).send({
      filename: 'malware.exe',
      contentType: 'application/octet-stream',
      fileSizeBytes: 1024,
      date: '',
      description: 'Some document',
    });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('unsupported_extension');
  });

  it('returns 422 for file size exceeding config limit', async () => {
    const res = await request
      .post('/api/documents/initiate')
      .set(AUTH)
      .send({
        filename: 'large.jpg',
        contentType: 'image/jpeg',
        fileSizeBytes: 11 * 1024 * 1024, // 11 MB — makeConfig() sets 10 MB limit
        date: '',
        description: 'A large file',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('file_too_large');
  });

  it('returns 400 for invalid date format', async () => {
    const res = await request.post('/api/documents/initiate').set(AUTH).send({
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: 1024,
      date: 'not-a-date',
      description: 'A document',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for whitespace-only description', async () => {
    const res = await request.post('/api/documents/initiate').set(AUTH).send({
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: 1024,
      date: '',
      description: '   ',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when a required field is missing', async () => {
    const res = await request.post('/api/documents/initiate').set(AUTH).send({
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: 1024,
      date: '',
      // description intentionally omitted
    });

    expect(res.status).toBe(400);
  });

  it('returns 201 with uploadId on valid input; DB row is at initiated status', async () => {
    const res = await request.post('/api/documents/initiate').set(AUTH).send({
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: 1024,
      date: '1987-06-15',
      description: 'Wedding photograph',
    });

    expect(res.status).toBe(201);
    expect(typeof res.body.uploadId).toBe('string');
    expect(res.body.uploadId.length).toBeGreaterThan(0);
    expect(res.body.status).toBe('initiated');

    const row = await db
      ._knex('documents')
      .where({ id: res.body.uploadId })
      .first();
    expect(row).toBeDefined();
    expect(row.status).toBe('initiated');
  });
});

// ---------------------------------------------------------------------------
// DOC-002: POST /api/documents/:uploadId/upload
// ---------------------------------------------------------------------------

describe('POST /api/documents/:uploadId/upload', () => {
  it('returns 400 for a non-UUID uploadId param', async () => {
    const res = await request
      .post('/api/documents/not-a-uuid/upload')
      .set(AUTH)
      .attach('file', Buffer.from('data'), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown uploadId', async () => {
    const res = await request
      .post(`/api/documents/${uuidv7()}/upload`)
      .set(AUTH)
      .attach('file', Buffer.from('data'), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('returns 409 duplicate_detected with existingRecord when file hash matches a finalized document', async () => {
    const fileContent = Buffer.from('duplicate-file-content');

    // Complete the full upload lifecycle for the first document
    const initRes1 = await request
      .post('/api/documents/initiate')
      .set(AUTH)
      .send({
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSizeBytes: fileContent.length,
        date: '1987-06-15',
        description: 'Original document',
      });
    expect(initRes1.status).toBe(201);
    const uploadId1 = initRes1.body.uploadId as string;

    await request
      .post(`/api/documents/${uploadId1}/upload`)
      .set(AUTH)
      .attach('file', fileContent, {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });

    await request.post(`/api/documents/${uploadId1}/finalize`).set(AUTH);

    // Initiate a second upload and send the same file bytes
    const initRes2 = await request
      .post('/api/documents/initiate')
      .set(AUTH)
      .send({
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSizeBytes: fileContent.length,
        date: '',
        description: 'Duplicate attempt',
      });
    expect(initRes2.status).toBe(201);
    const uploadId2 = initRes2.body.uploadId as string;

    const res = await request
      .post(`/api/documents/${uploadId2}/upload`)
      .set(AUTH)
      .attach('file', fileContent, {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('duplicate_detected');
    expect(res.body.data.existingRecord.documentId).toBe(uploadId1);
    expect(typeof res.body.data.existingRecord.archiveReference).toBe('string');
  });

  it('returns 200 with fileHash; staging file exists; DB row at uploaded status', async () => {
    const fileContent = Buffer.from('test-file-content');

    const initRes = await request
      .post('/api/documents/initiate')
      .set(AUTH)
      .send({
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSizeBytes: fileContent.length,
        date: '1987-06-15',
        description: 'Wedding photograph',
      });
    expect(initRes.status).toBe(201);
    const uploadId = initRes.body.uploadId as string;

    const res = await request
      .post(`/api/documents/${uploadId}/upload`)
      .set(AUTH)
      .attach('file', fileContent, {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(200);
    expect(res.body.uploadId).toBe(uploadId);
    expect(res.body.status).toBe('uploaded');
    expect(typeof res.body.fileHash).toBe('string');
    expect(res.body.fileHash).toHaveLength(32); // MD5 hex

    // Staging file exists on disk
    const stagingFile = path.join(stagingPath, uploadId, 'photo.jpg');
    await expect(fs.access(stagingFile)).resolves.toBeUndefined();

    // DB row at uploaded status
    const row = await db._knex('documents').where({ id: uploadId }).first();
    expect(row.status).toBe('uploaded');
    expect(row.fileHash).toBe(res.body.fileHash);
  });
});

// ---------------------------------------------------------------------------
// DOC-003: POST /api/documents/:uploadId/finalize
// ---------------------------------------------------------------------------

describe('POST /api/documents/:uploadId/finalize', () => {
  it('returns 400 for a non-UUID uploadId param', async () => {
    const res = await request
      .post('/api/documents/not-a-uuid/finalize')
      .set(AUTH);

    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown uploadId', async () => {
    const res = await request
      .post(`/api/documents/${uuidv7()}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('returns 404 when document is at initiated status (not uploaded)', async () => {
    const initRes = await request
      .post('/api/documents/initiate')
      .set(AUTH)
      .send({
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSizeBytes: 1024,
        date: '',
        description: 'A document',
      });
    expect(initRes.status).toBe(201);

    const res = await request
      .post(`/api/documents/${initRes.body.uploadId}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('returns 200 with finalized status; DB row at finalized; staging gone; permanent file exists', async () => {
    const fileContent = Buffer.from('finalize-test-content');

    const initRes = await request
      .post('/api/documents/initiate')
      .set(AUTH)
      .send({
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSizeBytes: fileContent.length,
        date: '1987-06-15',
        description: 'Wedding photograph',
      });
    expect(initRes.status).toBe(201);
    const uploadId = initRes.body.uploadId as string;

    await request
      .post(`/api/documents/${uploadId}/upload`)
      .set(AUTH)
      .attach('file', fileContent, {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });

    const res = await request
      .post(`/api/documents/${uploadId}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.documentId).toBe(uploadId);
    expect(res.body.status).toBe('finalized');
    expect(res.body.archiveReference).toBe('1987-06-15 — Wedding photograph');

    // DB row at finalized with storagePath set
    const row = await db._knex('documents').where({ id: uploadId }).first();
    expect(row.status).toBe('finalized');
    expect(typeof row.storagePath).toBe('string');

    // Staging file is gone
    const stagingFile = path.join(stagingPath, uploadId, 'photo.jpg');
    await expect(fs.access(stagingFile)).rejects.toThrow();

    // Permanent file exists at storagePath
    await expect(fs.access(row.storagePath as string)).resolves.toBeUndefined();
  });

  it('returns null date and [undated] archiveReference when document has no date', async () => {
    const fileContent = Buffer.from('undated-test-content');

    const initRes = await request
      .post('/api/documents/initiate')
      .set(AUTH)
      .send({
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSizeBytes: fileContent.length,
        date: '',
        description: 'Undated photograph',
      });
    expect(initRes.status).toBe(201);
    const uploadId = initRes.body.uploadId as string;

    await request
      .post(`/api/documents/${uploadId}/upload`)
      .set(AUTH)
      .attach('file', fileContent, {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });

    const res = await request
      .post(`/api/documents/${uploadId}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.date).toBeNull();
    expect(res.body.archiveReference).toBe('[undated] — Undated photograph');
  });
});

// ---------------------------------------------------------------------------
// DOC-005: DELETE /api/documents/:uploadId
// ---------------------------------------------------------------------------

describe('DELETE /api/documents/:uploadId', () => {
  it('returns 400 for a non-UUID uploadId param', async () => {
    const res = await request.delete('/api/documents/not-a-uuid').set(AUTH);

    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown uploadId', async () => {
    const res = await request.delete(`/api/documents/${uuidv7()}`).set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('returns 409 for a finalized document', async () => {
    const id = await insertDocument();

    const res = await request.delete(`/api/documents/${id}`).set(AUTH);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('finalized_document');
  });

  it('returns 200 and deletes an initiated document; DB row is gone', async () => {
    const initRes = await request
      .post('/api/documents/initiate')
      .set(AUTH)
      .send({
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSizeBytes: 1024,
        date: '',
        description: 'A document',
      });
    expect(initRes.status).toBe(201);
    const uploadId = initRes.body.uploadId as string;

    const res = await request.delete(`/api/documents/${uploadId}`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const row = await db._knex('documents').where({ id: uploadId }).first();
    expect(row).toBeUndefined();
  });

  it('returns 200 and deletes an uploaded document; staging file is removed', async () => {
    const fileContent = Buffer.from('cleanup-test-content');

    const initRes = await request
      .post('/api/documents/initiate')
      .set(AUTH)
      .send({
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSizeBytes: fileContent.length,
        date: '',
        description: 'A document',
      });
    expect(initRes.status).toBe(201);
    const uploadId = initRes.body.uploadId as string;

    await request
      .post(`/api/documents/${uploadId}/upload`)
      .set(AUTH)
      .attach('file', fileContent, {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });

    const res = await request.delete(`/api/documents/${uploadId}`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    // DB row is gone
    const row = await db._knex('documents').where({ id: uploadId }).first();
    expect(row).toBeUndefined();

    // Staging file is removed
    const stagingFile = path.join(stagingPath, uploadId, 'photo.jpg');
    await expect(fs.access(stagingFile)).rejects.toThrow();
  });

  it('returns 200 and deletes a stored document; permanent file is removed', async () => {
    // 'stored' is a transitional status where the file has been moved to
    // permanent storage but the document is not yet finalised. cleanupUpload
    // must call deletePermanentFile for this status.
    const id = uuidv7();
    const permanentFile = path.join(basePath, id, 'photo.jpg');
    await fs.mkdir(path.join(basePath, id), { recursive: true });
    await fs.writeFile(permanentFile, 'stored-file-content');

    await insertDocument({
      id,
      status: 'stored',
      storagePath: permanentFile,
    });

    const res = await request.delete(`/api/documents/${id}`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    // DB row is gone
    const row = await db._knex('documents').where({ id }).first();
    expect(row).toBeUndefined();

    // Permanent file is removed
    await expect(fs.access(permanentFile)).rejects.toThrow();
  });
});
