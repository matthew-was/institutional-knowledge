/**
 * Integration tests for search routes (QUERY-001, QUERY-002).
 *
 * Uses a real PostgreSQL database (docker-compose.test.yml, port 5433) and a
 * real Express app built via createApp(). Requests are sent via supertest so
 * the full stack is exercised: validate middleware → service → repository → DB.
 *
 * Schema is managed by globalSetup.ts. Data is cleaned between tests by
 * cleanAllTables (afterEach).
 *
 * Auth header uses the Python key 'pk' (from makeConfig()). Both 'fk'
 * (frontend) and 'pk' (python) are valid keys in the auth middleware;
 * QUERY-001 and QUERY-002 are called by Python so we use 'pk'.
 *
 * Embedding dimension: 384 (matches migration 004 — vector(384) column).
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
import { createGraphStore } from '../../graphstore/index.js';
import { createApp } from '../../index.js';
import type { Logger } from '../../middleware/logger.js';
import { createCurationService } from '../../services/curation.js';
import { createDocumentService } from '../../services/documents.js';
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

const DIMENSION = 384;

let db: DbInstance;
let app: ReturnType<typeof createApp>;
let request: ReturnType<typeof supertest>;
let tmpDir: string;

// Python key — QUERY-001 and QUERY-002 are called by Python
const AUTH = { 'x-internal-key': 'pk' };

beforeAll(async () => {
  db = createTestDb(TEST_DB_CONFIG);

  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ik-search-integration-'));
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

/** Unit vector with 1.0 at position 0 and 0.0 elsewhere. */
function unitVector(): number[] {
  const v = Array<number>(DIMENSION).fill(0);
  v[0] = 1.0;
  return v;
}

async function insertDocument(
  overrides: {
    id?: string;
    description?: string;
    date?: string | null;
    documentType?: string | null;
  } = {},
): Promise<string> {
  const id = overrides.id ?? uuidv7();
  await db._knex('documents').insert({
    id,
    status: 'finalized',
    filename: 'test.pdf',
    content_type: 'application/pdf',
    description: overrides.description ?? 'Test document',
    date: overrides.date ?? null,
    document_type: overrides.documentType ?? null,
    submitter_identity: 'test',
  });
  return id;
}

async function insertChunk(
  documentId: string,
  overrides: { id?: string; chunkIndex?: number; text?: string } = {},
): Promise<string> {
  const id = overrides.id ?? uuidv7();
  const text = overrides.text ?? 'Sample chunk text.';
  await db._knex('chunks').insert({
    id,
    document_id: documentId,
    chunk_index: overrides.chunkIndex ?? 0,
    text,
    token_count: text.split(' ').length,
  });
  return id;
}

async function insertEmbedding(
  documentId: string,
  chunkId: string,
  embedding: number[],
): Promise<void> {
  const id = uuidv7();
  await db._knex('embeddings').insert({
    id,
    chunk_id: chunkId,
    document_id: documentId,
    // pgvector requires the vector literal cast
    embedding: db._knex.raw('?::vector', [JSON.stringify(embedding)]),
  });
}

async function insertVocabTerm(overrides: {
  term: string;
  category?: string;
  source?: string;
  confidence?: number | null;
}): Promise<string> {
  const id = uuidv7();
  const normalisedTerm = overrides.term
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  await db._knex('vocabulary_terms').insert({
    id,
    term: overrides.term,
    normalised_term: normalisedTerm,
    category: overrides.category ?? 'People',
    aliases: [],
    source: overrides.source ?? 'manual',
    confidence: overrides.confidence ?? null,
  });
  return id;
}

async function insertOccurrence(
  termId: string,
  documentId: string,
): Promise<void> {
  await db._knex('entity_document_occurrences').insert({
    id: uuidv7(),
    term_id: termId,
    document_id: documentId,
  });
}

async function insertRelationship(
  sourceTermId: string,
  targetTermId: string,
  relationshipType: string,
): Promise<void> {
  await db._knex('vocabulary_relationships').insert({
    id: uuidv7(),
    source_term_id: sourceTermId,
    target_term_id: targetTermId,
    relationship_type: relationshipType,
  });
}

// ---------------------------------------------------------------------------
// QUERY-001: vectorSearch
// ---------------------------------------------------------------------------

describe('POST /api/search/vector', () => {
  it('returns 400 when embedding.length does not match configured dimension', async () => {
    const wrongDimension = Array<number>(10).fill(0.1);

    const res = await request
      .post('/api/search/vector')
      .set(AUTH)
      .send({ embedding: wrongDimension, topK: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('dimension_mismatch');
  });

  it('returns 400 for Zod validation failure (topK missing)', async () => {
    const res = await request
      .post('/api/search/vector')
      .set(AUTH)
      .send({ embedding: unitVector() });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('returns empty results when no embeddings exist', async () => {
    const res = await request
      .post('/api/search/vector')
      .set(AUTH)
      .send({ embedding: unitVector(), topK: 5 });

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  it('(a) happy path: returns VectorSearchResponse with document metadata', async () => {
    const docId = await insertDocument({
      description: 'Wedding photograph',
      date: '1987-06-15',
      documentType: 'photograph',
    });
    const chunkId = await insertChunk(docId, {
      text: 'The wedding was held at the church.',
    });
    await insertEmbedding(docId, chunkId, unitVector());

    const res = await request
      .post('/api/search/vector')
      .set(AUTH)
      .send({ embedding: unitVector(), topK: 5 });

    expect(res.status).toBe(200);

    const body = res.body as {
      results: Array<{
        chunkId: string;
        documentId: string;
        text: string;
        chunkIndex: number;
        tokenCount: number;
        similarityScore: number;
        document: {
          description: string;
          date: string;
          documentType: string | null;
        };
      }>;
    };

    expect(body.results).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: length asserted above
    const result = body.results[0]!;
    expect(result.chunkId).toBe(chunkId);
    expect(result.documentId).toBe(docId);
    expect(result.text).toBe('The wedding was held at the church.');
    expect(result.chunkIndex).toBe(0);
    expect(result.tokenCount).toBeGreaterThan(0);
    expect(typeof result.similarityScore).toBe('number');
    // Document metadata joined from documents table
    expect(result.document.description).toBe('Wedding photograph');
    expect(result.document.date).toBe('1987-06-15');
    expect(result.document.documentType).toBe('photograph');
  });
});

// ---------------------------------------------------------------------------
// QUERY-002: graphSearch
// ---------------------------------------------------------------------------

describe('POST /api/search/graph', () => {
  it('returns 400 when maxDepth exceeds the configured limit (depth_exceeded)', async () => {
    // makeConfig() sets graph.maxTraversalDepth = 3; send 4 to exceed it
    const res = await request
      .post('/api/search/graph')
      .set(AUTH)
      .send({ entityNames: ['John Smith'], maxDepth: 4 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('depth_exceeded');
  });

  it('returns 400 when entityNames is empty (Zod min(1) — CR-001)', async () => {
    const res = await request
      .post('/api/search/graph')
      .set(AUTH)
      .send({ entityNames: [], maxDepth: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('returns empty results when entity name does not exist in vocabulary_terms', async () => {
    const res = await request
      .post('/api/search/graph')
      .set(AUTH)
      .send({ entityNames: ['Unknown Person'], maxDepth: 2 });

    expect(res.status).toBe(200);
    expect(res.body.entities).toEqual([]);
    expect(res.body.relationships).toEqual([]);
  });

  it('(b) happy path: resolves entity names, traverses graph, returns aggregated response', async () => {
    // Seed: two terms linked by a relationship, both evidenced by documents
    const docId = await insertDocument({
      description: 'Deed of sale',
      date: '1955-03-01',
    });
    const sourceTermId = await insertVocabTerm({
      term: 'John Smith',
      category: 'People',
    });
    const targetTermId = await insertVocabTerm({
      term: 'West Farm',
      category: 'Land Parcel / Field',
    });

    // Both terms must be document-evidenced for findTermByNormalisedTerm to return them
    await insertOccurrence(sourceTermId, docId);
    await insertOccurrence(targetTermId, docId);

    // Relationship: John Smith → owned_by → West Farm
    await insertRelationship(sourceTermId, targetTermId, 'owned_by');

    const res = await request
      .post('/api/search/graph')
      .set(AUTH)
      .send({ entityNames: ['John Smith'], maxDepth: 2 });

    expect(res.status).toBe(200);

    const body = res.body as {
      entities: Array<{
        entityId: string;
        term: string;
        category: string;
        relatedDocumentIds: string[];
      }>;
      relationships: Array<{
        sourceEntityId: string;
        targetEntityId: string;
        relationshipType: string;
      }>;
    };

    // Both entities should appear (source + traversed target)
    const entityIds = body.entities.map((e) => e.entityId);
    expect(entityIds).toContain(sourceTermId);
    expect(entityIds).toContain(targetTermId);

    // Document IDs are associated with source entity
    const sourceEntity = body.entities.find((e) => e.entityId === sourceTermId);
    expect(sourceEntity?.relatedDocumentIds).toContain(docId);

    // Relationship is present
    expect(body.relationships).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: length asserted above
    const rel = body.relationships[0]!;
    expect(rel.sourceEntityId).toBe(sourceTermId);
    expect(rel.targetEntityId).toBe(targetTermId);
    expect(rel.relationshipType).toBe('owned_by');
  });

  it('deduplicates entities and relationships when multiple entity names resolve to overlapping graphs', async () => {
    // Seed: two terms that share a relationship (both searched)
    const docId = await insertDocument({ description: 'Farm records' });
    const termAId = await insertVocabTerm({
      term: 'Alice Smith',
      category: 'People',
    });
    const termBId = await insertVocabTerm({
      term: 'Bob Jones',
      category: 'People',
    });

    await insertOccurrence(termAId, docId);
    await insertOccurrence(termBId, docId);

    // A → related_to → B
    await insertRelationship(termAId, termBId, 'related_to');

    // Search for both names; they share a relationship — dedup should produce one relationship
    const res = await request
      .post('/api/search/graph')
      .set(AUTH)
      .send({ entityNames: ['Alice Smith', 'Bob Jones'], maxDepth: 1 });

    expect(res.status).toBe(200);

    // Even though both entity names are searched, entity A should appear once
    const entityIds = (res.body.entities as Array<{ entityId: string }>).map(
      (e) => e.entityId,
    );
    const uniqueIds = new Set(entityIds);
    expect(uniqueIds.size).toBe(entityIds.length);

    // The relationship should appear exactly once
    expect(res.body.relationships).toHaveLength(1);
  });
});
