/**
 * Integration tests for curation routes (DOC-006, DOC-007, DOC-008, DOC-009).
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
import { v4 as uuidv4 } from 'uuid';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DbInstance } from '../../db/index.js';
import { createTestDb } from '../../db/index.js';
import type { DocumentInsert } from '../../db/tables.js';
import type { Logger } from '../../middleware/logger.js';
import { createCurationService } from '../../services/curation.js';
import { LocalStorageService } from '../../storage/LocalStorageService.js';
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

const AUTH = { 'x-internal-key': 'fk' };

beforeAll(async () => {
  db = createTestDb(TEST_DB_CONFIG);

  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ik-curation-integration-'));
  const basePath = path.join(tmpDir, 'permanent');
  const stagingPath = path.join(tmpDir, 'staging');
  await fs.mkdir(basePath, { recursive: true });
  await fs.mkdir(stagingPath, { recursive: true });

  const log = pino({ level: 'silent' }) as unknown as Logger;
  const config = makeConfig();
  const storage = new LocalStorageService(basePath, stagingPath, log);
  const curationService = createCurationService({ db, log });

  app = createTestApp(db, storage, config, log, { curationService });

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
// Helper: insert a finalized document with an active flag
// ---------------------------------------------------------------------------

async function insertFlaggedDocument(
  overrides: Partial<DocumentInsert> = {},
): Promise<string> {
  const id = uuidv4();
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
    people: ['Alice Smith'],
    organisations: ['Estate of John Smith'],
    landReferences: ['North Field'],
    flagReason: 'OCR quality below threshold',
    flaggedAt: new Date('2026-03-13T10:00:00Z'),
    submitterIdentity: 'Primary Archivist',
    ingestionRunId: null,
    ...overrides,
  };
  await db.documents.insert(row);
  return id;
}

async function insertDocument(
  overrides: Partial<DocumentInsert> = {},
): Promise<string> {
  return insertFlaggedDocument({
    flagReason: null,
    flaggedAt: null,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// DOC-006: GET /api/curation/documents
// ---------------------------------------------------------------------------

describe('GET /api/curation/documents', () => {
  it('returns 200 with empty queue when no flagged documents exist', async () => {
    const res = await request.get('/api/curation/documents').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(0);
    expect(res.body.total).toBe(0);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(50);
  });

  it('returns paginated flagged documents with archiveReference', async () => {
    await insertFlaggedDocument();

    const res = await request.get('/api/curation/documents').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].archiveReference).toBe(
      '1987-06-15 — Wedding photograph',
    );
    expect(res.body.documents[0].flagReason).toBe(
      'OCR quality below threshold',
    );
  });

  it('respects page and pageSize query params', async () => {
    await insertFlaggedDocument({
      fileHash: 'hash-a',
      flagReason: 'reason-1',
    });
    await insertFlaggedDocument({
      fileHash: 'hash-b',
      flagReason: 'reason-2',
    });

    const res = await request
      .get('/api/curation/documents?page=1&pageSize=1')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.pageSize).toBe(1);
  });

  it('returns 400 for non-numeric page param', async () => {
    const res = await request.get('/api/curation/documents?page=abc').set(AUTH);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DOC-007: GET /api/documents/:id
// ---------------------------------------------------------------------------

describe('GET /api/documents/:id', () => {
  it('returns 404 for unknown document ID', async () => {
    const res = await request.get(`/api/documents/${uuidv4()}`).set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('returns 400 for non-UUID id param', async () => {
    const res = await request.get('/api/documents/not-a-uuid').set(AUTH);
    expect(res.status).toBe(400);
  });

  it('returns 200 with all metadata fields including organisations', async () => {
    const id = await insertDocument();

    const res = await request.get(`/api/documents/${id}`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.documentId).toBe(id);
    expect(res.body.description).toBe('Wedding photograph');
    expect(res.body.organisations).toEqual(['Estate of John Smith']);
    expect(res.body.people).toEqual(['Alice Smith']);
    expect(res.body.landReferences).toEqual(['North Field']);
    expect(res.body.archiveReference).toBe('1987-06-15 — Wedding photograph');
  });
});

// ---------------------------------------------------------------------------
// DOC-008: POST /api/documents/:id/clear-flag
// ---------------------------------------------------------------------------

describe('POST /api/documents/:id/clear-flag', () => {
  it('returns 404 for unknown document ID', async () => {
    const res = await request
      .post(`/api/documents/${uuidv4()}/clear-flag`)
      .set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('returns 409 when document has no active flag', async () => {
    const id = await insertDocument();

    const res = await request.post(`/api/documents/${id}/clear-flag`).set(AUTH);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('no_flag_to_clear');
  });

  it('returns 200 and clears the flag', async () => {
    const id = await insertFlaggedDocument();

    const res = await request.post(`/api/documents/${id}/clear-flag`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.flagCleared).toBe(true);
    expect(res.body.documentId).toBe(id);

    // Verify flag is cleared in DB (postProcessResponse converts to camelCase)
    const row = await db._knex('documents').where({ id }).first();
    expect(row.flagReason).toBeNull();
    expect(row.flaggedAt).toBeNull();
  });

  it('does not modify pipeline_steps', async () => {
    const id = await insertFlaggedDocument();

    // Insert a pipeline_steps row so the assertion is meaningful
    await db._knex('pipeline_steps').insert({
      id: uuidv4(),
      document_id: id,
      step_name: 'ocr',
      status: 'failed',
      attempt_count: 1,
      error_message: 'OCR failed',
      started_at: new Date(),
      completed_at: new Date(),
    });

    await request.post(`/api/documents/${id}/clear-flag`).set(AUTH);

    const steps = await db._knex('pipeline_steps').where({ document_id: id });
    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// DOC-009: PATCH /api/documents/:id/metadata
// ---------------------------------------------------------------------------

describe('PATCH /api/documents/:id/metadata', () => {
  it('returns 404 for unknown document ID', async () => {
    const res = await request
      .patch(`/api/documents/${uuidv4()}/metadata`)
      .set(AUTH)
      .send({ description: 'Valid description' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('returns 400 for whitespace-only description (Zod trim + min(1))', async () => {
    const id = await insertDocument();

    const res = await request
      .patch(`/api/documents/${id}/metadata`)
      .set(AUTH)
      .send({ description: '   ' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid date format', async () => {
    const id = await insertDocument();

    const res = await request
      .patch(`/api/documents/${id}/metadata`)
      .set(AUTH)
      .send({ date: 'not-a-date' });

    expect(res.status).toBe(400);
  });

  it('applies partial update and returns updated archiveReference', async () => {
    const id = await insertDocument();

    const res = await request
      .patch(`/api/documents/${id}/metadata`)
      .set(AUTH)
      .send({ description: 'Updated description' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Updated description');
    expect(res.body.archiveReference).toBe('1987-06-15 — Updated description');
  });

  it('forwards only provided fields — unprovided fields unchanged in DB', async () => {
    const id = await insertDocument();

    await request
      .patch(`/api/documents/${id}/metadata`)
      .set(AUTH)
      .send({ description: 'New description' });

    const row = await db._knex('documents').where({ id }).first();
    expect(row.people).toEqual(['Alice Smith']);
    expect(row.organisations).toEqual(['Estate of John Smith']);
  });
});
