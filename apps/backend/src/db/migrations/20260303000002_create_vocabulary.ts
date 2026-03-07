import type { Knex } from 'knex';

/**
 * Migration 002: Create the vocabulary tables.
 *
 * Four tables:
 *   - vocabulary_terms: canonical term records (sources: llm_extracted,
 *     candidate_accepted, manual)
 *   - vocabulary_relationships: directed edges between terms (e.g. broader,
 *     related, instance_of)
 *   - rejected_terms: terms explicitly rejected during curation; suppresses
 *     future llm_extracted insertions of the same normalised form
 *   - entity_document_occurrences: many-to-many join between terms and documents;
 *     records which documents evidence each entity in the graph (ADR-037)
 *
 * Depends on migration 001 (entity_document_occurrences references documents).
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('vocabulary_terms', (table) => {
    table.uuid('id').primary();
    table.text('term').notNullable();
    table.text('normalised_term').notNullable().unique();
    table.text('category').notNullable();
    table.text('description').nullable();
    // '{}' is the PostgreSQL empty-array literal for a text[] column, not a JSON object
    table.specificType('aliases', 'text[]').notNullable().defaultTo('{}');
    table.text('source').notNullable();
    table.float('confidence').nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('vocabulary_relationships', (table) => {
    table.uuid('id').primary();
    table
      .uuid('source_term_id')
      .notNullable()
      .references('id')
      .inTable('vocabulary_terms')
      .onDelete('CASCADE');
    table
      .uuid('target_term_id')
      .notNullable()
      .references('id')
      .inTable('vocabulary_terms')
      .onDelete('CASCADE');
    table.text('relationship_type').notNullable();
    table.float('confidence').nullable();
    table.unique(['source_term_id', 'target_term_id', 'relationship_type']);
  });

  await knex.schema.createTable('rejected_terms', (table) => {
    table.uuid('id').primary();
    table.text('normalised_term').notNullable().unique();
    table.text('original_term').notNullable();
    table
      .timestamp('rejected_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('entity_document_occurrences', (table) => {
    table.uuid('id').primary();
    table
      .uuid('term_id')
      .notNullable()
      .references('id')
      .inTable('vocabulary_terms')
      .onDelete('CASCADE');
    table
      .uuid('document_id')
      .notNullable()
      .references('id')
      .inTable('documents')
      .onDelete('CASCADE');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.unique(['term_id', 'document_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse dependency order
  await knex.schema.dropTableIfExists('entity_document_occurrences');
  await knex.schema.dropTableIfExists('rejected_terms');
  await knex.schema.dropTableIfExists('vocabulary_relationships');
  await knex.schema.dropTableIfExists('vocabulary_terms');
}
