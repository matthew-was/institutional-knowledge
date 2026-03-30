/**
 * Integration tests for ingestion run routes (ING-001 to ING-004).
 *
 * Uses a real PostgreSQL database (docker-compose.test.yml, port 5433) and a
 * real Express app built via createApp(). Requests are sent via supertest so
 * the full stack is exercised: validate middleware → service → repository → DB.
 *
 * Schema is managed by globalSetup.ts. Data is cleaned between tests by
 * cleanAllTables (afterEach).
 *
 * Auth header uses the test frontend key 'fk' (from makeConfig()).
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
import type { IngestionRunInsert } from '../../db/tables.js';
import type { Logger } from '../../middleware/logger.js';
import { createIngestionService } from '../../services/ingestion.js';
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
let reportDir: string;

const AUTH = { 'x-internal-key': 'fk' };

beforeAll(async () => {
  db = createTestDb(TEST_DB_CONFIG);

  tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ik-ingestion-integration-'),
  );
  basePath = path.join(tmpDir, 'permanent');
  stagingPath = path.join(tmpDir, 'staging');
  reportDir = path.join(tmpDir, 'reports');
  await fs.mkdir(basePath, { recursive: true });
  await fs.mkdir(stagingPath, { recursive: true });

  const log = pino({ level: 'silent' }) as unknown as Logger;
  const config = makeConfig();
  // Override ingestion.reportOutputDirectory to a writable temp path
  const testConfig = {
    ...config,
    ingestion: {
      ...config.ingestion,
      reportOutputDirectory: reportDir,
    },
  };

  const storage = createStorageService(
    { provider: 'local', local: { basePath, stagingPath } },
    log,
  );
  const ingestionService = createIngestionService({
    db,
    storage,
    config: testConfig,
    log,
  });

  app = createTestApp(db, storage, testConfig, log, { ingestionService });

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
// Helper: seed an ingestion run row directly via the repository.
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

// ---------------------------------------------------------------------------
// Helper: seed a document row linked to an ingestion run.
// ---------------------------------------------------------------------------

async function insertRunDocument(
  runId: string,
  overrides: Partial<{
    id: string;
    status: string;
    filename: string;
    fileHash: string;
    storagePath: string | null;
  }> = {},
): Promise<string> {
  const id = overrides.id ?? uuidv7();
  await db.documents.insert({
    id,
    status: overrides.status ?? 'uploaded',
    filename: overrides.filename ?? `doc-${id}.jpg`,
    contentType: 'image/jpeg',
    fileSizeBytes: '1024',
    fileHash: overrides.fileHash ?? `hash-${id}`,
    storagePath: overrides.storagePath ?? null,
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
  });
  return id;
}

// ---------------------------------------------------------------------------
// ING-001: POST /api/ingestion/runs — createIngestionRun
// (a) Performs run-start sweep before creating new run
// ---------------------------------------------------------------------------

describe('POST /api/ingestion/runs', () => {
  it('(a) sweeps incomplete runs before creating a new run', async () => {
    // Seed an existing incomplete run
    const oldRunId = await insertIngestionRun({ status: 'in_progress' });
    // Seed a staging directory so deleteStagingDirectory has something to work with
    const oldRunStagingDir = path.join(stagingPath, oldRunId);
    await fs.mkdir(oldRunStagingDir, { recursive: true });

    const res = await request
      .post('/api/ingestion/runs')
      .set(AUTH)
      .send({ sourceDirectory: '/new/source', grouped: false });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('in_progress');
    expect(typeof res.body.runId).toBe('string');

    // Old run should be deleted
    const oldRun = await db.ingestionRuns.getById(oldRunId);
    expect(oldRun).toBeUndefined();

    // New run should exist
    const newRun = await db.ingestionRuns.getById(res.body.runId);
    expect(newRun).toBeDefined();
    expect(newRun?.status).toBe('in_progress');
  });

  it('returns 400 when sourceDirectory is missing', async () => {
    const res = await request
      .post('/api/ingestion/runs')
      .set(AUTH)
      .send({ grouped: false });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// ING-002: POST /api/ingestion/runs/:runId/complete — completeRun
// (b) 409 when not in_progress; moves files; writes report
// ---------------------------------------------------------------------------

describe('POST /api/ingestion/runs/:runId/complete', () => {
  it('(b) returns 409 when run is not in_progress', async () => {
    const runId = await insertIngestionRun({ status: 'moving' });

    const res = await request
      .post(`/api/ingestion/runs/${runId}/complete`)
      .set(AUTH);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('conflict');
  });

  it('returns 404 when run does not exist', async () => {
    const res = await request
      .post(`/api/ingestion/runs/${uuidv7()}/complete`)
      .set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('(b) moves files and updates doc statuses to finalized', async () => {
    // Create a real run via ING-001 so the staging directory exists
    const createRes = await request
      .post('/api/ingestion/runs')
      .set(AUTH)
      .send({ sourceDirectory: '/source', grouped: false });
    const runId: string = createRes.body.runId;

    // Seed a doc record with status 'uploaded' and write a real staging file
    const docId = await insertRunDocument(runId, {
      filename: '2000-01-01 - test file.jpg',
      status: 'uploaded',
    });
    await fs.writeFile(
      path.join(stagingPath, runId, '2000-01-01 - test file.jpg'),
      Buffer.from('fake image data'),
    );

    const res = await request
      .post(`/api/ingestion/runs/${runId}/complete`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.runId).toBe(runId);
    expect(res.body.totalSubmitted).toBe(1);
    expect(res.body.totalAccepted).toBe(1);
    expect(res.body.totalRejected).toBe(0);

    // Document should be finalized in the DB
    const doc = await db.documents.getById(docId);
    expect(doc?.status).toBe('finalized');

    // Run should be completed
    const run = await db.ingestionRuns.getById(runId);
    expect(run?.status).toBe('completed');
  });

  it('(b) writes summary report file to reportOutputDirectory', async () => {
    const createRes = await request
      .post('/api/ingestion/runs')
      .set(AUTH)
      .send({ sourceDirectory: '/source', grouped: false });
    const runId: string = createRes.body.runId;

    // Seed doc and staging file
    await insertRunDocument(runId, {
      filename: '2001-06-15 - another doc.jpg',
      status: 'uploaded',
    });
    await fs.writeFile(
      path.join(stagingPath, runId, '2001-06-15 - another doc.jpg'),
      Buffer.from('content'),
    );

    await request.post(`/api/ingestion/runs/${runId}/complete`).set(AUTH);

    // Report file should exist in reportDir
    const files = await fs.readdir(reportDir);
    const reportFile = files.find((f) => f.includes(runId));
    expect(reportFile).toBeDefined();

    const content = await fs.readFile(
      path.join(reportDir, reportFile as string),
      'utf-8',
    );
    const parsed = JSON.parse(content) as {
      runId: string;
      totalSubmitted: number;
    };
    expect(parsed.runId).toBe(runId);
    expect(parsed.totalSubmitted).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ING-003: POST /api/ingestion/runs/:runId/files — addFileToRun
// (c) 404 on missing run; filename validation; 409 on duplicate; creates doc row
// ---------------------------------------------------------------------------

describe('POST /api/ingestion/runs/:runId/files', () => {
  it('(c) returns 404 when run does not exist', async () => {
    const res = await request
      .post(`/api/ingestion/runs/${uuidv7()}/files`)
      .set(AUTH)
      .attach('file', Buffer.from('data'), {
        filename: '2000-01-01 - photo.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('(c) validates standalone filename naming convention', async () => {
    const createRes = await request
      .post('/api/ingestion/runs')
      .set(AUTH)
      .send({ sourceDirectory: '/source', grouped: false });
    const runId: string = createRes.body.runId;

    const res = await request
      .post(`/api/ingestion/runs/${runId}/files`)
      .set(AUTH)
      .attach('file', Buffer.from('data'), {
        filename: 'bad_name.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_filename');
  });

  it('(c) validates grouped filename naming convention', async () => {
    const createRes = await request
      .post('/api/ingestion/runs')
      .set(AUTH)
      .send({ sourceDirectory: '/source', grouped: true });
    const runId: string = createRes.body.runId;

    // 'bad-name' does not match the grouped pattern /^\d{3}( - .+)?$/
    const res = await request
      .post(`/api/ingestion/runs/${runId}/files`)
      .set(AUTH)
      .attach('file', Buffer.from('data'), {
        filename: 'bad-name.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_filename');
  });

  it('(c) returns 409 when file hash duplicates a finalized document', async () => {
    const createRes = await request
      .post('/api/ingestion/runs')
      .set(AUTH)
      .send({ sourceDirectory: '/source', grouped: false });
    const runId: string = createRes.body.runId;

    // Seed a finalized document with a known hash
    const fileContent = Buffer.from('duplicate content');
    const crypto = await import('node:crypto');
    const hash = crypto.createHash('md5').update(fileContent).digest('hex');

    await db.documents.insert({
      id: uuidv7(),
      status: 'finalized',
      filename: 'existing.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: String(fileContent.length),
      fileHash: hash,
      storagePath: '/base/existing.jpg',
      date: '2000-01-01',
      description: 'Existing finalized document',
      documentType: null,
      people: null,
      organisations: null,
      landReferences: null,
      flagReason: null,
      flaggedAt: null,
      submitterIdentity: 'Primary Archivist',
      ingestionRunId: null,
      groupName: null,
    });

    const res = await request
      .post(`/api/ingestion/runs/${runId}/files`)
      .set(AUTH)
      .attach('file', fileContent, {
        filename: '2000-01-01 - photo.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('duplicate_detected');
  });

  it('(c) creates a documents row with ingestion_run_id on valid input', async () => {
    const createRes = await request
      .post('/api/ingestion/runs')
      .set(AUTH)
      .send({ sourceDirectory: '/source', grouped: false });
    const runId: string = createRes.body.runId;

    const res = await request
      .post(`/api/ingestion/runs/${runId}/files`)
      .set(AUTH)
      .attach('file', Buffer.from('valid file content'), {
        filename: '2000-01-01 - a valid document.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('uploaded');
    expect(typeof res.body.documentId).toBe('string');

    const doc = await db.documents.getById(res.body.documentId);
    expect(doc).toBeDefined();
    expect(doc?.status).toBe('uploaded');
    expect(doc?.ingestionRunId).toBe(runId);
  });

  it('(c) returns 422 for a file with a rejected extension', async () => {
    const createRes = await request
      .post('/api/ingestion/runs')
      .set(AUTH)
      .send({ sourceDirectory: '/source', grouped: false });
    const runId: string = createRes.body.runId;

    const res = await request
      .post(`/api/ingestion/runs/${runId}/files`)
      .set(AUTH)
      .attach('file', Buffer.from('data'), {
        filename: '2000-01-01 - document.exe',
        contentType: 'application/octet-stream',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('file_validation_failed');
  });

  it('(c) returns 422 for a file that exceeds the size limit', async () => {
    const createRes = await request
      .post('/api/ingestion/runs')
      .set(AUTH)
      .send({ sourceDirectory: '/source', grouped: false });
    const runId: string = createRes.body.runId;

    // makeConfig() sets maxFileSizeMb: 10; send 11 MB to exceed it
    const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024);

    const res = await request
      .post(`/api/ingestion/runs/${runId}/files`)
      .set(AUTH)
      .attach('file', oversizedBuffer, {
        filename: '2000-01-01 - large file.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('file_validation_failed');
  });

  it('(c) returns 422 when a file belongs to a group that already has a failed file', async () => {
    const createRes = await request
      .post('/api/ingestion/runs')
      .set(AUTH)
      .send({ sourceDirectory: '/source', grouped: true });
    const runId: string = createRes.body.runId;

    // Seed a failed document in the same group using the groupName column
    await db.documents.insert({
      id: uuidv7(),
      status: 'failed',
      filename: '001 - first file.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: '1024',
      fileHash: `hash-${uuidv7()}`,
      storagePath: null,
      date: null,
      description: 'First file in group',
      documentType: null,
      people: null,
      organisations: null,
      landReferences: null,
      flagReason: null,
      flaggedAt: null,
      submitterIdentity: 'CLI Ingestion',
      ingestionRunId: runId,
      groupName: 'Group A',
    });

    const res2 = await request
      .post(`/api/ingestion/runs/${runId}/files`)
      .set(AUTH)
      .field('groupName', 'Group A')
      .attach('file', Buffer.from('data'), {
        filename: '002.jpg',
        contentType: 'image/jpeg',
      });

    expect(res2.status).toBe(422);
    expect(res2.body.error).toBe('group_validation_failed');
  });

  it('(c) persists groupName on the document row for grouped runs', async () => {
    const createRes = await request
      .post('/api/ingestion/runs')
      .set(AUTH)
      .send({ sourceDirectory: '/source', grouped: true });
    const runId: string = createRes.body.runId;

    const res = await request
      .post(`/api/ingestion/runs/${runId}/files`)
      .set(AUTH)
      .field('groupName', 'Family Album')
      .attach('file', Buffer.from('grouped file content'), {
        filename: '001 - portrait.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(201);

    const doc = await db.documents.getById(res.body.documentId);
    expect(doc?.groupName).toBe('Family Album');
  });
});

// ---------------------------------------------------------------------------
// ING-004: DELETE /api/ingestion/runs/:runId — cleanupRun
// (d) Deletes run, docs, and staging files
// ---------------------------------------------------------------------------

describe('DELETE /api/ingestion/runs/:runId', () => {
  it('returns 404 when run does not exist', async () => {
    const res = await request
      .delete(`/api/ingestion/runs/${uuidv7()}`)
      .set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('(d) deletes the run record and non-finalized document records', async () => {
    const createRes = await request
      .post('/api/ingestion/runs')
      .set(AUTH)
      .send({ sourceDirectory: '/source', grouped: false });
    const runId: string = createRes.body.runId;

    // Seed a document linked to this run
    const docId = await insertRunDocument(runId, { status: 'uploaded' });

    // Write a staging file so deleteStagingFile has something real to touch
    await fs.writeFile(
      path.join(stagingPath, runId, `doc-${docId}.jpg`),
      Buffer.from('content'),
    );

    const res = await request.delete(`/api/ingestion/runs/${runId}`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    // Run should be gone
    const run = await db.ingestionRuns.getById(runId);
    expect(run).toBeUndefined();

    // Document should be gone
    const doc = await db.documents.getById(docId);
    expect(doc).toBeUndefined();
  });
});
