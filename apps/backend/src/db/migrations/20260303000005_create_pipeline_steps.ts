import type { Knex } from 'knex';

/**
 * Migration 005: Create the pipeline_steps table.
 *
 * Each row tracks the status of one named processing step for one document.
 * The unique constraint on (document_id, step_name) ensures each document has
 * at most one row per step. Steps are created when a document enters the
 * processing queue and updated as the Python service reports results.
 *
 * Statuses: pending → running → completed | failed
 *
 * Depends on migration 001 (foreign key to documents).
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('pipeline_steps', (table) => {
    table.uuid('id').primary();
    table
      .uuid('document_id')
      .notNullable()
      .references('id')
      .inTable('documents')
      .onDelete('CASCADE');
    table.text('step_name').notNullable();
    table.text('status').notNullable();
    table.integer('attempt_count').notNullable().defaultTo(0);
    table.text('error_message').nullable();
    table.timestamp('started_at', { useTz: true }).nullable();
    table.timestamp('completed_at', { useTz: true }).nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.unique(['document_id', 'step_name']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('pipeline_steps');
}
