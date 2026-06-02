import type { Knex } from 'knex';

/**
 * Migration 008: Alter embedding column dimension from 384 to 1024.
 *
 * ADR-053 selected qwen3-embedding:0.6b as the embedding model (resolving OQ-3).
 * That model outputs 1024-dimensional vectors. Migration 004 hardcoded 384 as a
 * provisional placeholder matching e5-small (ADR-024); this migration supersedes it.
 *
 * The IVFFlat index must be dropped before the column type can be altered, then
 * recreated at the new dimension. No data migration is required — no embeddings
 * have been written to this column in production.
 *
 * The down migration restores the original 384-dimension type. This is safe only
 * while no 1024-dimension embeddings exist; do not run down after ingestion begins.
 */

const OLD_DIMENSION = 384;
const NEW_DIMENSION = 1024;

export async function up(knex: Knex): Promise<void> {
  // Drop the index before altering the column type — pgvector requires this
  await knex.raw('DROP INDEX IF EXISTS embeddings_embedding_ivfflat_idx');

  // ALTER the column from vector(384) to vector(1024)
  await knex.raw(
    `ALTER TABLE embeddings ALTER COLUMN embedding TYPE vector(${NEW_DIMENSION})`,
  );

  // Recreate the IVFFlat index at the new dimension
  await knex.raw(
    'CREATE INDEX embeddings_embedding_ivfflat_idx ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS embeddings_embedding_ivfflat_idx');

  await knex.raw(
    `ALTER TABLE embeddings ALTER COLUMN embedding TYPE vector(${OLD_DIMENSION})`,
  );

  await knex.raw(
    'CREATE INDEX embeddings_embedding_ivfflat_idx ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1)',
  );
}
