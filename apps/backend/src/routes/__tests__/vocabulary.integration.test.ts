/**
 * Integration tests for vocabulary routes (VOC-001, VOC-002, VOC-003, VOC-004).
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
import type { DocumentInsert } from '../../db/tables.js';
import { createGraphStore } from '../../graphstore/index.js';
import { createApp } from '../../index.js';
import type { Logger } from '../../middleware/logger.js';
import { createCurationService } from '../../services/curation.js';
import { createDocumentService } from '../../services/documents.js';
import { createVocabularyService } from '../../services/vocabulary.js';
import { LocalStorageService } from '../../storage/LocalStorageService.js';
import { cleanAllTables } from '../../testing/dbCleanup.js';
import { TEST_DB_CONFIG } from '../../testing/testDb.js';
import { makeConfig } from '../../testing/testHelpers.js';
import { normaliseTermText } from '../../utils/normalise.js';
import { createVectorStore } from '../../vectorstore/index.js';

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

let db: DbInstance;
let app: ReturnType<typeof createApp>;
let request: ReturnType<typeof supertest>;
let tmpDir: string;

const AUTH = { 'x-internal-key': 'fk' };

beforeAll(async () => {
  db = createTestDb(TEST_DB_CONFIG);

  tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ik-vocabulary-integration-'),
  );
  const basePath = path.join(tmpDir, 'permanent');
  const stagingPath = path.join(tmpDir, 'staging');
  await fs.mkdir(basePath, { recursive: true });
  await fs.mkdir(stagingPath, { recursive: true });

  const log = pino({ level: 'silent' }) as unknown as Logger;
  const config = makeConfig();
  const storage = new LocalStorageService(basePath, stagingPath, log);
  const vectorStore = createVectorStore(
    config.vectorStore,
    config.embedding,
    db,
    log,
  );
  const graphStore = createGraphStore(config.graph, db, log);
  const documentService = createDocumentService({ db, storage, config, log });
  const curationService = createCurationService({ db, log });
  const vocabularyService = createVocabularyService({ db, log });

  app = createApp({
    config,
    db,
    storage,
    vectorStore,
    graphStore,
    documentService,
    curationService,
    vocabularyService,
    log,
  });

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
// Seed helpers
// ---------------------------------------------------------------------------

async function insertVocabTerm(
  overrides: {
    term?: string;
    normalisedTerm?: string;
    category?: string;
    description?: string | null;
    aliases?: string[];
    source?: string;
    confidence?: number | null;
  } = {},
): Promise<string> {
  const id = uuidv7();
  const term = overrides.term ?? 'John Smith';
  await db._knex('vocabulary_terms').insert({
    id,
    term,
    normalised_term: overrides.normalisedTerm ?? normaliseTermText(term),
    category: overrides.category ?? 'People',
    description: overrides.description ?? null,
    aliases: overrides.aliases ?? [],
    source: overrides.source ?? 'llm_extracted',
    confidence: overrides.confidence ?? 0.85,
  });
  return id;
}

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
    people: [],
    organisations: [],
    landReferences: [],
    flagReason: null,
    flaggedAt: null,
    submitterIdentity: 'Primary Archivist',
    ingestionRunId: null,
    ...overrides,
  };
  await db.documents.insert(row);
  return id;
}

async function insertOccurrence(
  termId: string,
  documentId: string,
): Promise<void> {
  await db.graph.insertOccurrence({ id: uuidv7(), termId, documentId });
}

// ---------------------------------------------------------------------------
// VOC-001: GET /api/curation/vocabulary
// ---------------------------------------------------------------------------

describe('GET /api/curation/vocabulary', () => {
  it('returns 200 with empty candidates when no llm_extracted terms exist', async () => {
    const res = await request.get('/api/curation/vocabulary').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(0);
    expect(res.body.total).toBe(0);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(50);
  });

  it('returns paginated llm_extracted terms with correct fields', async () => {
    const termId = await insertVocabTerm({
      term: 'Alice Brown',
      normalisedTerm: 'alice brown',
    });
    const docId = await insertDocument();
    await insertOccurrence(termId, docId);

    const res = await request.get('/api/curation/vocabulary').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.candidates[0].termId).toBe(termId);
    expect(res.body.candidates[0].term).toBe('Alice Brown');
    expect(res.body.candidates[0].category).toBe('People');
    expect(res.body.candidates[0].confidence).toBeCloseTo(0.85);
    expect(res.body.candidates[0].sourceDocumentDescription).toBe(
      'Wedding photograph',
    );
    expect(res.body.candidates[0].sourceDocumentDate).toBe('1987-06-15');
  });

  it('does not include non-llm_extracted terms', async () => {
    await insertVocabTerm({
      source: 'candidate_accepted',
      normalisedTerm: 'bob jones',
    });

    const res = await request.get('/api/curation/vocabulary').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.candidates).toHaveLength(0);
  });

  it('respects page and pageSize query params', async () => {
    await insertVocabTerm({ term: 'Term One', normalisedTerm: 'term one' });
    await insertVocabTerm({ term: 'Term Two', normalisedTerm: 'term two' });

    const res = await request
      .get('/api/curation/vocabulary?page=1&pageSize=1')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.pageSize).toBe(1);
  });

  it('returns 400 for non-numeric page param', async () => {
    const res = await request
      .get('/api/curation/vocabulary?page=abc')
      .set(AUTH);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// VOC-002: POST /api/curation/vocabulary/:termId/accept
// ---------------------------------------------------------------------------

describe('POST /api/curation/vocabulary/:termId/accept', () => {
  it('returns 404 for unknown termId', async () => {
    const res = await request
      .post(`/api/curation/vocabulary/${uuidv7()}/accept`)
      .set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('returns 400 for non-UUID termId', async () => {
    const res = await request
      .post('/api/curation/vocabulary/not-a-uuid/accept')
      .set(AUTH);
    expect(res.status).toBe(400);
  });

  it('returns 409 when term source is not llm_extracted', async () => {
    const termId = await insertVocabTerm({
      source: 'candidate_accepted',
      normalisedTerm: 'carol white',
      term: 'Carol White',
    });

    const res = await request
      .post(`/api/curation/vocabulary/${termId}/accept`)
      .set(AUTH);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('wrong_source');
  });

  it('returns 200 and updates source to candidate_accepted', async () => {
    const termId = await insertVocabTerm({
      term: 'David Green',
      normalisedTerm: 'david green',
    });

    const res = await request
      .post(`/api/curation/vocabulary/${termId}/accept`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.termId).toBe(termId);
    expect(res.body.term).toBe('David Green');
    expect(res.body.source).toBe('candidate_accepted');

    // Verify DB state
    const row = await db
      ._knex('vocabulary_terms')
      .where({ id: termId })
      .first();
    expect(row.source).toBe('candidate_accepted');
  });
});

// ---------------------------------------------------------------------------
// VOC-003: POST /api/curation/vocabulary/:termId/reject
// ---------------------------------------------------------------------------

describe('POST /api/curation/vocabulary/:termId/reject', () => {
  it('returns 404 for unknown termId', async () => {
    const res = await request
      .post(`/api/curation/vocabulary/${uuidv7()}/reject`)
      .set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('returns 409 when term source is not llm_extracted', async () => {
    const termId = await insertVocabTerm({
      source: 'manual',
      normalisedTerm: 'eve black',
      term: 'Eve Black',
    });

    const res = await request
      .post(`/api/curation/vocabulary/${termId}/reject`)
      .set(AUTH);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('wrong_source');
  });

  it('returns 200, removes from vocabulary_terms, and inserts into rejected_terms', async () => {
    const termId = await insertVocabTerm({
      term: 'Frank Hill',
      normalisedTerm: 'frank hill',
    });

    const res = await request
      .post(`/api/curation/vocabulary/${termId}/reject`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.termId).toBe(termId);
    expect(res.body.rejected).toBe(true);

    // Term removed from vocabulary_terms
    const vocabRow = await db
      ._knex('vocabulary_terms')
      .where({ id: termId })
      .first();
    expect(vocabRow).toBeUndefined();

    // Term inserted into rejected_terms
    const rejectedRow = await db
      ._knex('rejected_terms')
      .where({ normalised_term: 'frank hill' })
      .first();
    expect(rejectedRow).toBeDefined();
    expect(rejectedRow.originalTerm).toBe('Frank Hill');
    expect(rejectedRow.rejectedAt).toBeDefined();
  });

  it('cascades deletion to entity_document_occurrences', async () => {
    const termId = await insertVocabTerm({
      term: 'Grace Lee',
      normalisedTerm: 'grace lee',
    });
    const docId = await insertDocument();
    await insertOccurrence(termId, docId);

    await request.post(`/api/curation/vocabulary/${termId}/reject`).set(AUTH);

    const occurrences = await db._knex('entity_document_occurrences').where({
      term_id: termId,
    });
    expect(occurrences).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// VOC-004: POST /api/curation/vocabulary/terms
// ---------------------------------------------------------------------------

describe('POST /api/curation/vocabulary/terms', () => {
  it('returns 400 when term is missing', async () => {
    const res = await request
      .post('/api/curation/vocabulary/terms')
      .set(AUTH)
      .send({ category: 'People' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when category is missing', async () => {
    const res = await request
      .post('/api/curation/vocabulary/terms')
      .set(AUTH)
      .send({ term: 'New Term' });

    expect(res.status).toBe(400);
  });

  it('returns 409 when normalised term already exists in vocabulary', async () => {
    // 'John Smith' normalises to 'john smith'
    await insertVocabTerm({ term: 'John Smith', normalisedTerm: 'john smith' });

    const res = await request
      .post('/api/curation/vocabulary/terms')
      .set(AUTH)
      .send({ term: 'John Smith', category: 'People' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('duplicate_term');
  });

  it('returns 409 when normalised term matches a rejected term', async () => {
    await db._knex('rejected_terms').insert({
      id: uuidv7(),
      normalised_term: 'henry ford',
      original_term: 'Henry Ford',
      rejected_at: new Date(),
    });

    const res = await request
      .post('/api/curation/vocabulary/terms')
      .set(AUTH)
      .send({ term: 'Henry Ford', category: 'People' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('duplicate_term');
  });

  it('returns 404 when a targetTermId does not exist', async () => {
    const res = await request
      .post('/api/curation/vocabulary/terms')
      .set(AUTH)
      .send({
        term: 'New Person',
        category: 'People',
        relationships: [
          { targetTermId: uuidv7(), relationshipType: 'employed_by' },
        ],
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('target_not_found');
  });

  it('returns 201 with the new term on success (no relationships)', async () => {
    const res = await request
      .post('/api/curation/vocabulary/terms')
      .set(AUTH)
      .send({
        term: 'Isabel Cruz',
        category: 'People',
        description: 'A landowner',
        aliases: ['Izzy Cruz'],
      });

    expect(res.status).toBe(201);
    expect(res.body.term).toBe('Isabel Cruz');
    expect(res.body.category).toBe('People');
    expect(res.body.source).toBe('manual');
    expect(res.body.normalisedTerm).toBe('isabel cruz');
    expect(res.body.termId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // Verify DB state
    const row = await db
      ._knex('vocabulary_terms')
      .where({ id: res.body.termId })
      .first();
    expect(row).toBeDefined();
    expect(row.source).toBe('manual');
    expect(row.normalisedTerm).toBe('isabel cruz');
  });

  it('inserts term and relationships in a transaction', async () => {
    const targetId = await insertVocabTerm({
      term: 'North Farm',
      normalisedTerm: 'north farm',
      category: 'Land',
      source: 'manual',
    });

    const res = await request
      .post('/api/curation/vocabulary/terms')
      .set(AUTH)
      .send({
        term: 'James Ward',
        category: 'People',
        relationships: [
          { targetTermId: targetId, relationshipType: 'owned_by' },
        ],
      });

    expect(res.status).toBe(201);
    const newTermId = res.body.termId as string;

    const relRows = await db._knex('vocabulary_relationships').where({
      source_term_id: newTermId,
      target_term_id: targetId,
    });
    expect(relRows).toHaveLength(1);
    expect(relRows[0].relationshipType).toBe('owned_by');
  });
});
