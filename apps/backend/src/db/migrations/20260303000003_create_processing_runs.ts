import type { Knex } from 'knex';

/**
 * Migration 003: Create the processing_runs table.
 *
 * Records each batch processing trigger (PROC-001). The handler for
 * POST /api/processing/trigger creates a processing_runs row before dispatching
 * to the Python service. The row is updated to 'completed' or 'failed' by the
 * detached async processing loop.
 *
 * This migration does NOT add any column to the documents table.
 * The ingestion_run_id column is added by migration 006.
 *
 * Depends on migration 001.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('processing_runs', (table) => {
    table.uuid('id').primary();
    table.text('status').notNullable();
    table.integer('documents_queued').notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('processing_runs');
}
