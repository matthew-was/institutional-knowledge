import type { Knex } from 'knex';

/**
 * Migration 004: Enable pgvector and create the chunks and embeddings tables.
 *
 * The embedding dimension is hardcoded here (384, matching e5-small via ADR-024).
 * Migrations run outside the application lifecycle and cannot safely read nconf
 * config at migration time. An env var would introduce a second config surface
 * that must be kept in sync with embedding.dimension in config.json5 — rejected
 * in favour of an explicit value here. If the model changes, write a new migration
 * to ALTER the column type; do not change this value in place.
 *
 * The IVFFlat index is created with lists=1 initially. For production use after
 * initial data load, run POST /api/admin/reindex-embeddings to rebuild the index
 * with tuned parameters (e.g. lists = sqrt(row_count)).
 *
 * Depends on migration 001 (foreign keys to documents).
 * Requires pgvector extension to be available in the PostgreSQL instance.
 */

const EMBEDDING_DIMENSION = 384;

export async function up(knex: Knex): Promise<void> {
  const dimension = EMBEDDING_DIMENSION;

  await knex.raw('CREATE EXTENSION IF NOT EXISTS vector');

  await knex.schema.createTable('chunks', (table) => {
    table.uuid('id').primary();
    table
      .uuid('document_id')
      .notNullable()
      .references('id')
      .inTable('documents')
      .onDelete('CASCADE');
    table.integer('chunk_index').notNullable();
    table.text('text').notNullable();
    table.integer('token_count').notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('embeddings', (table) => {
    table.uuid('id').primary();
    // chunk_id has a unique constraint: one embedding per chunk
    table
      .uuid('chunk_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('chunks')
      .onDelete('CASCADE');
    table
      .uuid('document_id')
      .notNullable()
      .references('id')
      .inTable('documents')
      .onDelete('CASCADE');
    // vector(N) is a pgvector type; Knex does not natively support it
    table.specificType('embedding', `vector(${dimension})`).notNullable();
  });

  // IVFFlat index using cosine distance operator class.
  // lists=1 is functional but not optimal; rebuild after initial data load.
  await knex.raw(
    'CREATE INDEX embeddings_embedding_ivfflat_idx ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('embeddings');
  await knex.schema.dropTableIfExists('chunks');
  // Do not drop the vector extension — other migrations or tools may depend on it
}
