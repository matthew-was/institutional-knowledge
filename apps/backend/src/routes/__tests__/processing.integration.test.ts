/**
 * Integration tests for processing routes (PROC-001, PROC-002).
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
 * Task 11 (PROC-001) tests mock the global fetch to avoid requiring a live
 * Python service. This mocks the external HTTP boundary only — all DB writes
 * go to the real test database.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pino } from 'pino';
import supertest from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { DbInstance } from '../../db/index.js';
import { createTestDb } from '../../db/index.js';
import type {
  DocumentInsert,
  PipelineStepInsert,
  ProcessingRunInsert,
} from '../../db/tables.js';
import { createGraphStore } from '../../graphstore/index.js';
import { createApp } from '../../index.js';
import type { Logger } from '../../middleware/logger.js';
import { createCurationService } from '../../services/curation.js';
import { createDocumentService } from '../../services/documents.js';
import { createProcessingService } from '../../services/processing.js';
import { createSearchService } from '../../services/search.js';
import { createVocabularyService } from '../../services/vocabulary.js';
import { LocalStorageService } from '../../storage/LocalStorageService.js';
import { cleanAllTables } from '../../testing/dbCleanup.js';
import { TEST_DB_CONFIG } from '../../testing/testDb.js';
import { makeConfig } from '../../testing/testHelpers.js';
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
    path.join(os.tmpdir(), 'ik-processing-integration-'),
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
  const processingService = createProcessingService({
    db,
    config,
    log,
    vectorStore,
  });
  const searchService = createSearchService({
    db,
    vectorStore,
    graphStore,
    config,
    log,
  });

  app = createApp({
    config,
    db,
    storage,
    vectorStore,
    graphStore,
    documentService,
    curationService,
    vocabularyService,
    processingService,
    searchService,
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

async function insertDocument(
  overrides: Partial<DocumentInsert> = {},
): Promise<string> {
  const id = uuidv7();
  await db._knex('documents').insert({
    id,
    status: 'finalized',
    filename: 'test.pdf',
    contentType: 'application/pdf',
    fileSizeBytes: '1024',
    fileHash: uuidv7(),
    storagePath: '/storage/test.pdf',
    date: '2024-01-01',
    description: 'Test document',
    documentType: null,
    people: [],
    organisations: [],
    landReferences: [],
    flagReason: null,
    flaggedAt: null,
    submitterIdentity: 'test',
    ingestionRunId: null,
    ...overrides,
  });
  return id;
}

async function insertPipelineStep(
  step: Omit<PipelineStepInsert, 'id'>,
): Promise<string> {
  const id = uuidv7();
  await db._knex('pipeline_steps').insert({ id, ...step });
  return id;
}

async function insertProcessingRun(
  run: Omit<ProcessingRunInsert, 'id'>,
): Promise<string> {
  const id = uuidv7();
  await db._knex('processing_runs').insert({ id, ...run });
  return id;
}

async function insertVocabTerm(
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const id = uuidv7();
  await db._knex('vocabulary_terms').insert({
    id,
    term: 'Test Term',
    normalisedTerm: 'test term',
    category: 'person',
    description: null,
    aliases: [],
    source: 'llm_extracted',
    confidence: 0.9,
    ...overrides,
  });
  return id;
}

async function insertRejectedTerm(normalisedTerm: string): Promise<void> {
  await db._knex('rejected_terms').insert({
    id: uuidv7(),
    normalisedTerm: normalisedTerm,
    originalTerm: normalisedTerm,
    rejectedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// PROC-002: POST /api/processing/results
// ---------------------------------------------------------------------------

describe('POST /api/processing/results (PROC-002)', () => {
  it('returns 404 for unknown documentId', async () => {
    const res = await request.post('/api/processing/results').set(AUTH).send({
      documentId: uuidv7(),
      stepResults: {},
      flags: [],
      metadata: null,
      chunks: null,
      entities: null,
      relationships: null,
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('updates pipeline step status and increments attemptCount', async () => {
    const documentId = await insertDocument();
    await insertPipelineStep({
      documentId,
      stepName: 'ocr',
      status: 'running',
      attemptCount: 0,
      errorMessage: null,
      startedAt: new Date(),
      completedAt: null,
    });

    const res = await request
      .post('/api/processing/results')
      .set(AUTH)
      .send({
        documentId,
        stepResults: {
          ocr: { status: 'completed', errorMessage: null },
        },
        flags: [],
        metadata: null,
        chunks: null,
        entities: null,
        relationships: null,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ documentId, accepted: true });

    const step = await db
      ._knex('pipeline_steps')
      .where({ documentId, stepName: 'ocr' })
      .first();
    expect(step.status).toBe('completed');
    expect(step.attemptCount).toBe(1);
  });

  it('overwrites description when metadata.description is non-null and non-empty (UR-053)', async () => {
    const documentId = await insertDocument({ description: 'original' });

    const res = await request
      .post('/api/processing/results')
      .set(AUTH)
      .send({
        documentId,
        stepResults: {},
        flags: [],
        metadata: {
          documentType: 'letter',
          dates: [],
          people: ['Alice'],
          organisations: [],
          landReferences: [],
          description: 'pipeline description',
        },
        chunks: null,
        entities: null,
        relationships: null,
      });

    expect(res.status).toBe(200);
    const doc = await db._knex('documents').where({ id: documentId }).first();
    expect(doc.description).toBe('pipeline description');
    expect(doc.documentType).toBe('letter');
    expect(doc.people).toEqual(['Alice']);
  });

  it('preserves existing description when metadata.description is null', async () => {
    const documentId = await insertDocument({ description: 'original' });

    const res = await request
      .post('/api/processing/results')
      .set(AUTH)
      .send({
        documentId,
        stepResults: {},
        flags: [],
        metadata: {
          documentType: null,
          dates: [],
          people: [],
          organisations: [],
          landReferences: [],
          description: null,
        },
        chunks: null,
        entities: null,
        relationships: null,
      });

    expect(res.status).toBe(200);
    const doc = await db._knex('documents').where({ id: documentId }).first();
    expect(doc.description).toBe('original');
  });

  it('preserves existing description when metadata.description is empty string', async () => {
    const documentId = await insertDocument({ description: 'original' });

    const res = await request
      .post('/api/processing/results')
      .set(AUTH)
      .send({
        documentId,
        stepResults: {},
        flags: [],
        metadata: {
          documentType: null,
          dates: [],
          people: [],
          organisations: [],
          landReferences: [],
          description: '',
        },
        chunks: null,
        entities: null,
        relationships: null,
      });

    expect(res.status).toBe(200);
    const doc = await db._knex('documents').where({ id: documentId }).first();
    expect(doc.description).toBe('original');
  });

  it('inserts a new vocabulary_terms row for a new entity', async () => {
    const documentId = await insertDocument();

    const res = await request
      .post('/api/processing/results')
      .set(AUTH)
      .send({
        documentId,
        stepResults: {},
        flags: [],
        metadata: null,
        chunks: null,
        entities: [
          {
            name: 'Alice Smith',
            type: 'person',
            confidence: 0.95,
            normalisedName: 'alice smith',
          },
        ],
        relationships: null,
      });

    expect(res.status).toBe(200);

    const term = await db
      ._knex('vocabulary_terms')
      .where({ normalisedTerm: 'alice smith' })
      .first();
    expect(term).toBeDefined();
    expect(term.source).toBe('llm_extracted');
    expect(term.category).toBe('person');

    const occ = await db
      ._knex('entity_document_occurrences')
      .where({ termId: term.id, documentId: documentId })
      .first();
    expect(occ).toBeDefined();
  });

  it('appends alias and inserts occurrence when entity matches existing term', async () => {
    const documentId = await insertDocument();
    const termId = await insertVocabTerm({
      normalisedTerm: 'alice smith',
      term: 'Alice Smith',
      aliases: [],
    });

    const res = await request
      .post('/api/processing/results')
      .set(AUTH)
      .send({
        documentId,
        stepResults: {},
        flags: [],
        metadata: null,
        chunks: null,
        entities: [
          {
            name: 'A. Smith',
            type: 'person',
            confidence: 0.8,
            normalisedName: 'alice smith',
          },
        ],
        relationships: null,
      });

    expect(res.status).toBe(200);

    // No new vocabulary_terms row
    const terms = await db
      ._knex('vocabulary_terms')
      .where({ normalisedTerm: 'alice smith' });
    expect(terms).toHaveLength(1);

    // Alias appended
    const term = await db
      ._knex('vocabulary_terms')
      .where({ id: termId })
      .first();
    expect(term.aliases).toContain('A. Smith');

    // Occurrence inserted
    const occ = await db
      ._knex('entity_document_occurrences')
      .where({ termId: termId, documentId: documentId })
      .first();
    expect(occ).toBeDefined();
  });

  it('appendAlias is idempotent — posting the same entity twice does not duplicate the alias (S-1)', async () => {
    const documentId = await insertDocument();
    await insertPipelineStep({
      documentId,
      stepName: 'ocr',
      status: 'running',
      attemptCount: 0,
      errorMessage: null,
      startedAt: new Date(),
      completedAt: null,
    });

    const payload = {
      documentId,
      stepResults: {},
      flags: [],
      metadata: null,
      chunks: null,
      entities: [
        {
          name: 'Alice Smith',
          normalisedName: 'alice smith',
          type: 'person',
          confidence: 0.9,
        },
      ],
      relationships: null,
    };

    // First POST — creates the vocabulary_terms row
    await request.post('/api/processing/results').set(AUTH).send(payload);

    // Second POST — same entity; appendAlias guard must prevent duplicate alias
    const res = await request
      .post('/api/processing/results')
      .set(AUTH)
      .send(payload);

    expect(res.status).toBe(200);

    // Exactly one vocabulary_terms row for 'alice smith'
    const terms = await db
      ._knex('vocabulary_terms')
      .where({ normalisedTerm: 'alice smith' });
    expect(terms).toHaveLength(1);

    // 'Alice Smith' appears in aliases exactly once
    const aliases: string[] = terms[0].aliases;
    const count = aliases.filter((a) => a === 'Alice Smith').length;
    expect(count).toBe(1);
  });

  it('suppresses entity whose normalisedName matches a rejected term', async () => {
    const documentId = await insertDocument();
    await insertRejectedTerm('alice smith');

    const res = await request
      .post('/api/processing/results')
      .set(AUTH)
      .send({
        documentId,
        stepResults: {},
        flags: [],
        metadata: null,
        chunks: null,
        entities: [
          {
            name: 'Alice Smith',
            type: 'person',
            confidence: 0.9,
            normalisedName: 'alice smith',
          },
        ],
        relationships: null,
      });

    expect(res.status).toBe(200);

    const terms = await db
      ._knex('vocabulary_terms')
      .where({ normalisedTerm: 'alice smith' });
    expect(terms).toHaveLength(0);
    const occs = await db
      ._knex('entity_document_occurrences')
      .where({ documentId: documentId });
    expect(occs).toHaveLength(0);
  });

  it('silently ignores duplicate relationship inserts', async () => {
    const documentId = await insertDocument();

    const sourceId = await insertVocabTerm({
      normalisedTerm: 'alice',
      term: 'Alice',
    });
    const targetId = await insertVocabTerm({
      normalisedTerm: 'bob',
      term: 'Bob',
    });

    const payload = {
      documentId,
      stepResults: {},
      flags: [],
      metadata: null,
      chunks: null,
      entities: null,
      relationships: [
        {
          sourceEntityName: 'alice',
          targetEntityName: 'bob',
          relationshipType: 'knows',
          confidence: 0.8,
        },
      ],
    };

    await request.post('/api/processing/results').set(AUTH).send(payload);
    const res = await request
      .post('/api/processing/results')
      .set(AUTH)
      .send(payload);

    expect(res.status).toBe(200);

    const rels = await db._knex('vocabulary_relationships').where({
      sourceTermId: sourceId,
      targetTermId: targetId,
    });
    expect(rels).toHaveLength(1);
  });

  it('sets flagReason and flaggedAt when flags are present', async () => {
    const documentId = await insertDocument();

    const res = await request
      .post('/api/processing/results')
      .set(AUTH)
      .send({
        documentId,
        stepResults: {},
        flags: [{ type: 'low_confidence', reason: 'OCR quality poor' }],
        metadata: null,
        chunks: null,
        entities: null,
        relationships: null,
      });

    expect(res.status).toBe(200);

    const doc = await db._knex('documents').where({ id: documentId }).first();
    expect(doc.flagReason).toBe('low_confidence');
    expect(doc.flaggedAt).toBeDefined();
  });

  it('writes rows across all seven tables on a full payload (B-2)', async () => {
    const documentId = await insertDocument();
    await insertPipelineStep({
      documentId,
      stepName: 'ocr',
      status: 'running',
      attemptCount: 0,
      errorMessage: null,
      startedAt: new Date(),
      completedAt: null,
    });

    // 384-dimension zero vector (matches makeConfig embedding.dimension)
    const embedding = Array<number>(384).fill(0);

    const res = await request
      .post('/api/processing/results')
      .set(AUTH)
      .send({
        documentId,
        stepResults: {
          ocr: { status: 'completed', errorMessage: null },
        },
        metadata: {
          documentType: 'letter',
          dates: [],
          people: ['Alice'],
          organisations: [],
          landReferences: [],
          description: 'pipeline description',
        },
        chunks: [
          { chunkIndex: 0, text: 'Hello world', tokenCount: 2, embedding },
        ],
        entities: [
          {
            name: 'Alice Smith',
            type: 'person',
            confidence: 0.9,
            normalisedName: 'alice smith',
          },
          {
            name: 'Bob Jones',
            type: 'person',
            confidence: 0.8,
            normalisedName: 'bob jones',
          },
        ],
        relationships: [
          {
            sourceEntityName: 'alice smith',
            targetEntityName: 'bob jones',
            relationshipType: 'associated_with',
            confidence: 0.85,
          },
        ],
        flags: [],
      });

    expect(res.status).toBe(200);

    // documents — metadata applied
    const doc = await db._knex('documents').where({ id: documentId }).first();
    expect(doc.documentType).toBe('letter');

    // pipeline_steps — status updated
    const step = await db
      ._knex('pipeline_steps')
      .where({ documentId, stepName: 'ocr' })
      .first();
    expect(step.status).toBe('completed');
    expect(step.attemptCount).toBe(1);

    // chunks — row inserted
    const chunks = await db._knex('chunks').where({ documentId });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('Hello world');

    // embeddings — row inserted
    const embeddings = await db
      ._knex('embeddings')
      .where({ documentId, chunkId: chunks[0].id });
    expect(embeddings).toHaveLength(1);

    // vocabulary_terms — new entity inserted
    const terms = await db
      ._knex('vocabulary_terms')
      .where({ normalisedTerm: 'alice smith' });
    expect(terms).toHaveLength(1);
    expect(terms[0].source).toBe('llm_extracted');

    // entity_document_occurrences — occurrence inserted
    const occs = await db
      ._knex('entity_document_occurrences')
      .where({ documentId, termId: terms[0].id });
    expect(occs).toHaveLength(1);

    // vocabulary_relationships — one relationship inserted
    const rels = await db._knex('vocabulary_relationships');
    expect(rels).toHaveLength(1);
  });

  it('rolls back the entire transaction when a write fails mid-way (B-3)', async () => {
    const documentId = await insertDocument();
    await insertPipelineStep({
      documentId,
      stepName: 'ocr',
      status: 'running',
      attemptCount: 0,
      errorMessage: null,
      startedAt: new Date(),
      completedAt: null,
    });

    // Send a chunk with a deliberately wrong embedding dimension (1 instead of
    // 384). The pgvector ?::vector cast will reject it with a DB error, causing
    // the transaction to roll back. The step result write (which comes before
    // the chunk insert in the transaction) must also be rolled back.
    const res = await request
      .post('/api/processing/results')
      .set(AUTH)
      .send({
        documentId,
        stepResults: {
          ocr: { status: 'completed', errorMessage: null },
        },
        metadata: null,
        chunks: [
          { chunkIndex: 0, text: 'Hello', tokenCount: 1, embedding: [0] },
        ],
        entities: [],
        relationships: [],
        flags: [],
      });

    // The DB error propagates as a 500 (unexpected error → global error handler)
    expect(res.status).toBe(500);

    // pipeline_steps must be unchanged — the step result write rolled back
    const step = await db
      ._knex('pipeline_steps')
      .where({ documentId, stepName: 'ocr' })
      .first();
    expect(step.status).toBe('running');
    expect(step.attemptCount).toBe(0);

    // No chunks or embeddings written
    const chunks = await db._knex('chunks');
    expect(chunks).toHaveLength(0);
    const embeddings = await db._knex('embeddings');
    expect(embeddings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// PROC-001: POST /api/processing/trigger
// ---------------------------------------------------------------------------

describe('POST /api/processing/trigger (PROC-001)', () => {
  it('returns 409 when a processing run is already in_progress', async () => {
    await insertProcessingRun({
      status: 'in_progress',
      documentsQueued: 1,
      completedAt: null,
    });

    const res = await request
      .post('/api/processing/trigger')
      .set(AUTH)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('conflict');
  });

  it('resets stale running steps to failed before querying documents', async () => {
    const documentId = await insertDocument();
    // Insert a step that has been running for 2 hours (well beyond 30min timeout)
    const staleStartedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const stepId = await insertPipelineStep({
      documentId,
      stepName: 'ocr',
      status: 'running',
      attemptCount: 0,
      errorMessage: null,
      startedAt: staleStartedAt,
      completedAt: null,
    });

    // Mock fetch so the async loop doesn't fail trying to reach Python
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          documentId,
          stepResults: { ocr: { status: 'completed', errorMessage: null } },
          flags: [],
          metadata: null,
          chunks: null,
          entities: null,
          relationships: null,
        }),
      }),
    );

    const res = await request
      .post('/api/processing/trigger')
      .set(AUTH)
      .send({});

    vi.unstubAllGlobals();

    expect(res.status).toBe(200);

    // The stale step must now be 'failed'
    const step = await db._knex('pipeline_steps').where({ id: stepId }).first();
    expect(step.status).toBe('failed');
  });

  it('returns { runId, documentsQueued } synchronously', async () => {
    const documentId = await insertDocument();
    await insertPipelineStep({
      documentId,
      stepName: 'ocr',
      status: 'pending',
      attemptCount: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          documentId,
          stepResults: { ocr: { status: 'completed', errorMessage: null } },
          flags: [],
          metadata: null,
          chunks: null,
          entities: null,
          relationships: null,
        }),
      }),
    );

    const res = await request
      .post('/api/processing/trigger')
      .set(AUTH)
      .send({});

    vi.unstubAllGlobals();

    expect(res.status).toBe(200);
    expect(res.body.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(res.body.documentsQueued).toBe(1);
  });

  it('completes the async loop and marks the processing run as completed', async () => {
    const documentId = await insertDocument();
    await insertPipelineStep({
      documentId,
      stepName: 'ocr',
      status: 'pending',
      attemptCount: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          documentId,
          stepResults: { ocr: { status: 'completed', errorMessage: null } },
          flags: [],
          metadata: null,
          chunks: null,
          entities: null,
          relationships: null,
        }),
      }),
    );

    const res = await request
      .post('/api/processing/trigger')
      .set(AUTH)
      .send({});

    expect(res.status).toBe(200);
    const { runId } = res.body as { runId: string };

    // Poll until the processing run reaches a terminal status
    await vi.waitFor(
      async () => {
        const run = await db
          ._knex('processing_runs')
          .where({ id: runId })
          .first();
        expect(run.status).toBe('completed');
      },
      { timeout: 5000, interval: 100 },
    );

    vi.unstubAllGlobals();
  });
});
