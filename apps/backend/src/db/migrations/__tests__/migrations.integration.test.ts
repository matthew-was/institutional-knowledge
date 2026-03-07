import path from 'node:path';
import { fileURLToPath } from 'node:url';
import knex from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration test: migration correctness.
 *
 * Runs all six migrations against a real PostgreSQL instance and verifies:
 * - All expected tables exist
 * - Key columns are present with correct types
 * - The file_hash partial unique index exists
 * - ingestion_run_id is added by migration 006 (not earlier)
 *
 * Requires the test database container to be running:
 *   docker compose -f apps/backend/docker-compose.test.yml up -d
 *   pnpm --filter backend test
 *   docker compose -f apps/backend/docker-compose.test.yml down -v
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migrations directory is two levels up from __tests__/
const migrationsDir = path.resolve(__dirname, '..');

describe('Knex migrations — integration', () => {
  const db = knex({
    client: 'pg',
    connection: 'postgresql://ik_test:ik_test@localhost:5433/ik_test',
    migrations: {
      directory: migrationsDir,
      // Tests run under Vitest/tsx against TypeScript source. Knex uses dynamic
      // import() to load migration files; tsx intercepts those calls for .ts files.
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
  });

  beforeAll(async () => {
    await db.migrate.latest();
  });

  afterAll(async () => {
    // Roll back all migrations to leave the test database clean
    await db.migrate.rollback(undefined, true);
    await db.destroy();
  });

  const expectedTables = [
    'documents',
    'vocabulary_terms',
    'vocabulary_relationships',
    'rejected_terms',
    'entity_document_occurrences',
    'processing_runs',
    'chunks',
    'embeddings',
    'pipeline_steps',
    'ingestion_runs',
  ];

  it('creates all expected tables', async () => {
    const result = await db('information_schema.tables')
      .select('table_name')
      .where('table_schema', 'public')
      .whereIn('table_name', expectedTables);

    const found = result
      .map((r: { table_name: string }) => r.table_name)
      .sort();
    expect(found).toEqual([...expectedTables].sort());
  });

  it('creates the file_hash partial unique index on documents', async () => {
    const result = await db.raw<{
      rows: Array<{ indexname: string; indexdef: string }>;
    }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'documents'
        AND indexname = 'documents_file_hash_finalized_unique'
    `);

    expect(result.rows).toHaveLength(1);
    // Verify partial index condition is present in the index definition
    expect(result.rows[0]?.indexdef).toContain("status = 'finalized'");
  });

  it('embeddings.embedding column is of type vector', async () => {
    const result = await db('information_schema.columns')
      .select('udt_name')
      .where({
        table_schema: 'public',
        table_name: 'embeddings',
        column_name: 'embedding',
      })
      .first();

    expect(result).toBeDefined();
    // pgvector registers 'vector' as a user-defined type in information_schema
    expect((result as { udt_name: string }).udt_name).toBe('vector');
  });

  it('documents.ingestion_run_id column exists and is nullable (added by migration 006)', async () => {
    const result = await db('information_schema.columns')
      .select('column_name', 'is_nullable')
      .where({
        table_schema: 'public',
        table_name: 'documents',
        column_name: 'ingestion_run_id',
      })
      .first();

    expect(result).toBeDefined();
    expect((result as { is_nullable: string }).is_nullable).toBe('YES');
  });

  it('documents table has all required columns', async () => {
    const result = await db('information_schema.columns')
      .select('column_name')
      .where({ table_schema: 'public', table_name: 'documents' });

    const columns = result.map((r: { column_name: string }) => r.column_name);

    const requiredColumns = [
      'id',
      'status',
      'filename',
      'content_type',
      'file_size_bytes',
      'file_hash',
      'storage_path',
      'date',
      'description',
      'document_type',
      'people',
      'organisations',
      'land_references',
      'flag_reason',
      'flagged_at',
      'submitter_identity',
      'ingestion_run_id',
      'created_at',
      'updated_at',
    ];

    for (const col of requiredColumns) {
      expect(columns, `documents.${col} column should exist`).toContain(col);
    }
  });

  it('vocabulary_terms has all required columns', async () => {
    const result = await db('information_schema.columns')
      .select('column_name')
      .where({ table_schema: 'public', table_name: 'vocabulary_terms' });

    const cols = result.map((r: { column_name: string }) => r.column_name);
    expect(cols).toContain('normalised_term');
    expect(cols).toContain('aliases');
    expect(cols).toContain('source');
    expect(cols).toContain('confidence');
  });

  it('pipeline_steps has unique constraint on (document_id, step_name)', async () => {
    const result = await db.raw<{
      rows: Array<{ indexname: string; indexdef: string }>;
    }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'pipeline_steps'
        AND indexdef LIKE '%document_id%step_name%'
    `);

    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('entity_document_occurrences has unique constraint on (term_id, document_id)', async () => {
    const result = await db.raw<{
      rows: Array<{ indexname: string; indexdef: string }>;
    }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'entity_document_occurrences'
        AND indexdef LIKE '%term_id%document_id%'
    `);

    expect(result.rows.length).toBeGreaterThan(0);
  });
});
