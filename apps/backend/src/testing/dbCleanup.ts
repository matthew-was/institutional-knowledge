/**
 * Database cleanup helper for integration tests.
 *
 * cleanAllTables() truncates all data tables in a single statement with CASCADE,
 * which PostgreSQL propagates through all FK relationships automatically.
 * Call this in afterEach() in any test file that writes to the database.
 */

import type { Knex } from 'knex';

const ALL_TABLES = [
  'embeddings',
  'pipeline_steps',
  'chunks',
  'entity_document_occurrences',
  'vocabulary_relationships',
  'rejected_terms',
  'processing_runs',
  'documents',
  'vocabulary_terms',
  'ingestion_runs',
].join(', ');

export async function cleanAllTables(db: Knex): Promise<void> {
  await db.raw(`TRUNCATE ${ALL_TABLES} RESTART IDENTITY CASCADE`);
}
