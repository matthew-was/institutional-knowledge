import type { Knex } from 'knex';

/**
 * Migration 007: Add group_name column to the documents table.
 *
 * Replaces the fragile `description.startsWith(groupName)` convention used by
 * the bulk ingestion CLI. Group membership is now a proper schema column so
 * queries can filter by it directly (Chore 4 / S-003).
 *
 * The column is nullable because existing documents were created before this
 * migration and have no group, and standalone (non-grouped) ingestion runs
 * do not use groups at all.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('documents', (table) => {
    table.text('group_name').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('documents', (table) => {
    table.dropColumn('group_name');
  });
}
