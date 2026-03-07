import type { Knex } from 'knex';

/**
 * Migration 006: Create the ingestion_runs table and add ingestion_run_id to
 * the documents table.
 *
 * ingestion_run_id is added here (not in migration 001) because the ingestion_runs
 * table must exist before a foreign key can reference it. Per the backend plan
 * (migration ordering conflict resolution), migration 003 creates processing_runs
 * only; migration 006 creates ingestion_runs and adds ingestion_run_id.
 *
 * Statuses: in_progress → moving → completed
 *
 * Depends on migration 001 (alter documents table).
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ingestion_runs', (table) => {
    table.uuid('id').primary();
    table.text('status').notNullable();
    table.text('source_directory').notNullable();
    table.boolean('grouped').notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true }).nullable();
  });

  await knex.schema.alterTable('documents', (table) => {
    table
      .uuid('ingestion_run_id')
      .nullable()
      .references('id')
      .inTable('ingestion_runs')
      .onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('documents', (table) => {
    table.dropColumn('ingestion_run_id');
  });
  await knex.schema.dropTableIfExists('ingestion_runs');
}
