import type { Knex } from 'knex';

/**
 * Migration 001: Create the documents table.
 *
 * The partial unique index on file_hash (WHERE status = 'finalized') implements
 * duplicate detection per ADR-009. Only finalized documents are checked for
 * hash collisions — in-progress uploads share no uniqueness constraint.
 *
 * Note: ingestion_run_id is NOT added here. It is added by migration 006 after
 * the ingestion_runs table exists (foreign key dependency).
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('documents', (table) => {
    table.uuid('id').primary();
    table.text('status').notNullable();
    table.text('filename').notNullable();
    table.text('content_type').notNullable();
    table.bigInteger('file_size_bytes').nullable();
    table.text('file_hash').nullable();
    table.text('storage_path').nullable();
    table.text('date').nullable();
    table.text('description').notNullable();
    table.text('document_type').nullable();
    table.specificType('people', 'text[]').nullable();
    table.specificType('organisations', 'text[]').nullable();
    table.specificType('land_references', 'text[]').nullable();
    table.text('flag_reason').nullable();
    table.timestamp('flagged_at', { useTz: true }).nullable();
    table.text('submitter_identity').notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  // Partial unique index: only one finalized document may have a given file_hash.
  // Non-finalized documents (initiated, uploaded, stored) are excluded so
  // uploads in progress do not conflict with each other or with finalized records.
  await knex.raw(`
    CREATE UNIQUE INDEX documents_file_hash_finalized_unique
    ON documents (file_hash)
    WHERE status = 'finalized'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('documents');
}
