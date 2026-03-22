/**
 * Integration tests for migration correctness.
 *
 * Verifies that after globalSetup.ts has run migrate.latest(), all expected
 * tables and indexes exist in the test database. This is a read-only test —
 * no data is written and no cleanup is needed.
 *
 * Uses createTestDb and TEST_DB_CONFIG from the existing test infrastructure.
 * The schema is managed by globalSetup.ts (runs migrate.latest() once before
 * the full suite), so these assertions reflect the real migration output.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { TEST_DB_CONFIG } from '../../testing/testDb.js';
import { createTestDb } from '../index.js';

const db = createTestDb(TEST_DB_CONFIG);

afterAll(async () => {
  await db.destroy();
});

describe('migration correctness', () => {
  it('creates all 10 expected tables', async () => {
    const result = await db._knex.raw<{ rows: Array<{ table_name: string }> }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'`,
    );

    const tableNames = result.rows.map((r) => r.table_name);

    const expectedTables = [
      'documents',
      'chunks',
      'embeddings',
      'pipeline_steps',
      'processing_runs',
      'vocabulary_terms',
      'vocabulary_relationships',
      'entity_document_occurrences',
      'ingestion_runs',
      'rejected_terms',
    ];

    for (const table of expectedTables) {
      expect(tableNames, `expected table '${table}' to exist`).toContain(table);
    }
  });

  it('creates the IVFFlat index on the embeddings table', async () => {
    const result = await db._knex.raw<{ rows: Array<{ indexname: string }> }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'embeddings'`,
    );

    const indexNames = result.rows.map((r) => r.indexname);

    expect(
      indexNames,
      "expected index 'embeddings_embedding_ivfflat_idx' to exist on 'embeddings'",
    ).toContain('embeddings_embedding_ivfflat_idx');
  });
});
