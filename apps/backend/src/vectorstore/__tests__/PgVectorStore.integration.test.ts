import { pino } from 'pino';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type DbInstance } from '../../db/index.js';
import { cleanAllTables } from '../../testing/dbCleanup.js';
import { TEST_DB_CONFIG } from '../../testing/testDb.js';
import { PgVectorStore } from '../PgVectorStore.js';

/**
 * Integration tests: PgVectorStore against a real PostgreSQL instance.
 *
 * Acceptance condition coverage:
 *   (a) write + search round-trip
 *   (b) dimension mismatch throws a descriptive error
 *   (c) topK limiting — 5 embeddings, topK=3 returns exactly 3 results
 *   (d) empty database search returns an empty array
 *
 * Schema lifecycle (migrate.latest / rollback) is managed by
 * src/testing/globalSetup.ts. Data isolation between tests is handled by
 * afterEach(cleanAllTables).
 *
 * Requires the test database container to be running:
 *   docker compose -f apps/backend/docker-compose.test.yml up -d
 *   pnpm --filter backend test
 *   docker compose -f apps/backend/docker-compose.test.yml down -v
 *
 * Embedding dimension: 384 (matches migration 004 — vector(384) column).
 * Test vectors use Array(384).fill(0) with a single position set to 1.0 to
 * produce distinct, orthogonal-ish vectors without needing real embeddings.
 */

const DIMENSION = 384;

const silentLog = pino({ level: 'silent' });

/** Create a unit vector with 1.0 at position `pos` and 0.0 everywhere else. */
function unitVector(pos: number): number[] {
  const v = Array<number>(DIMENSION).fill(0);
  v[pos] = 1.0;
  return v;
}

// ---------------------------------------------------------------------------
// Shared database connection — schema managed by globalSetup.ts
// ---------------------------------------------------------------------------

const db: DbInstance = createTestDb(TEST_DB_CONFIG);

afterAll(async () => {
  await db.destroy();
});

afterEach(async () => {
  await cleanAllTables(db._knex);
});

// ---------------------------------------------------------------------------
// Test data helpers — insert the minimum rows required by foreign key constraints
// ---------------------------------------------------------------------------

async function insertDocument(
  id: string,
  overrides: {
    description?: string;
    date?: string | null;
    documentType?: string | null;
  } = {},
): Promise<void> {
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
}

async function insertChunk(
  id: string,
  documentId: string,
  chunkIndex: number,
  text: string,
): Promise<void> {
  await db._knex('chunks').insert({
    id,
    document_id: documentId,
    chunk_index: chunkIndex,
    text,
    token_count: text.split(' ').length,
  });
}

// ---------------------------------------------------------------------------
// (d) Empty database search returns an empty array
// ---------------------------------------------------------------------------

describe('PgVectorStore.search — empty database', () => {
  it('returns an empty array when no embeddings exist', async () => {
    const store = new PgVectorStore(db, DIMENSION, silentLog);
    const result = await store.search(unitVector(0), 10);
    expect(result.outcome).toBe('success');
    if (result.outcome === 'success') {
      expect(result.data).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// (a) write + search round-trip
// ---------------------------------------------------------------------------

describe('PgVectorStore — write and search round-trip', () => {
  const docId = '00000000-0000-0000-0000-000000000001';
  const chunkId = '00000000-0000-0000-0000-000000000101';
  const chunkText = 'The family moved to the farm in spring.';

  beforeEach(async () => {
    await insertDocument(docId, {
      description: 'Wedding photograph',
      date: '1987-06-15',
      documentType: 'photograph',
    });
    await insertChunk(chunkId, docId, 0, chunkText);
  });

  it('(a) returns the inserted chunk as the top result when searched with the same vector', async () => {
    const store = new PgVectorStore(db, DIMENSION, silentLog);
    const embedding = unitVector(1);

    const writeResult = await store.write(docId, chunkId, embedding);
    expect(writeResult.outcome).toBe('success');

    const searchResult = await store.search(embedding, 1);
    expect(searchResult.outcome).toBe('success');
    if (searchResult.outcome !== 'success') return;

    const results = searchResult.data;
    expect(results).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: length asserted above
    const result = results[0]!;
    expect(result.chunkId).toBe(chunkId);
    expect(result.documentId).toBe(docId);
    expect(result.text).toBe(chunkText);
    expect(result.chunkIndex).toBe(0);
    expect(result.tokenCount).toBeGreaterThan(0);
    // Cosine similarity of a vector with itself is 1.0
    expect(result.similarityScore).toBeCloseTo(1.0, 5);
    // Document metadata joined from documents table (QUERY-001 contract)
    expect(result.document.description).toBe('Wedding photograph');
    expect(result.document.date).toBe('1987-06-15');
    expect(result.document.documentType).toBe('photograph');
  });
});

// ---------------------------------------------------------------------------
// (b) Dimension mismatch returns dimension_mismatch ServiceResult error
// ---------------------------------------------------------------------------

describe('PgVectorStore — dimension mismatch', () => {
  it('(b) search() returns dimension_mismatch error when queryEmbedding.length does not match configured dimension', async () => {
    const store = new PgVectorStore(db, DIMENSION, silentLog);
    const wrongDimension = Array<number>(10).fill(0.1);

    const result = await store.search(wrongDimension, 5);
    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') {
      expect(result.errorType).toBe('dimension_mismatch');
      expect(result.errorMessage).toContain(
        `expected ${DIMENSION}, received 10`,
      );
    }
  });

  it('write() returns dimension_mismatch error when embedding.length does not match configured dimension', async () => {
    const store = new PgVectorStore(db, DIMENSION, silentLog);
    const wrongDimension = Array<number>(10).fill(0.1);

    const result = await store.write(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000101',
      wrongDimension,
    );
    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') {
      expect(result.errorType).toBe('dimension_mismatch');
      expect(result.errorMessage).toContain(
        `expected ${DIMENSION}, received 10`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// (c) topK limiting — insert 5, request 3
// ---------------------------------------------------------------------------

describe('PgVectorStore — topK limiting', () => {
  const docs = Array.from(
    { length: 5 },
    (_, i) => `00000000-0000-0000-0000-00000000001${i}`,
  );
  const chunks = Array.from(
    { length: 5 },
    (_, i) => `00000000-0000-0000-0000-00000000011${i}`,
  );

  beforeEach(async () => {
    const store = new PgVectorStore(db, DIMENSION, silentLog);
    for (let i = 0; i < 5; i++) {
      await insertDocument(docs[i] as string);
      await insertChunk(
        chunks[i] as string,
        docs[i] as string,
        0,
        `Chunk text ${i}`,
      );
      // Unit vectors at positions 10–14 — distinct from other test groups
      await store.write(
        docs[i] as string,
        chunks[i] as string,
        unitVector(10 + i),
      );
    }
  });

  it('(c) returns exactly topK results when more embeddings exist', async () => {
    const store = new PgVectorStore(db, DIMENSION, silentLog);
    const result = await store.search(unitVector(10), 3);
    expect(result.outcome).toBe('success');
    if (result.outcome === 'success') {
      expect(result.data).toHaveLength(3);
    }
  });

  it('results are ordered by similarity (highest first)', async () => {
    const store = new PgVectorStore(db, DIMENSION, silentLog);
    const result = await store.search(unitVector(10), 5);
    expect(result.outcome).toBe('success');
    if (result.outcome !== 'success') return;

    const results = result.data;
    expect(results).toHaveLength(5);

    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i]?.similarityScore ?? 0).toBeGreaterThanOrEqual(
        results[i + 1]?.similarityScore ?? 0,
      );
    }
  });
});
