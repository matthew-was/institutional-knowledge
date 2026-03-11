/**
 * Case-conversion utilities for the database layer.
 *
 * wrapIdentifier (Knex config) uses snakeCase to convert camelCase JS
 * identifiers to snake_case column names before sending queries to PostgreSQL.
 *
 * postProcessResponse (Knex config) uses camelCase to convert snake_case
 * column names from PostgreSQL results back to camelCase for the JS layer.
 *
 * All application code works exclusively in camelCase. Snake_case only appears
 * inside raw SQL strings (knex.raw) and migration files, which run outside the
 * Knex query builder pipeline.
 */

/**
 * Convert a camelCase or PascalCase identifier to snake_case.
 *
 * @example snakeCase('chunkId')    // 'chunk_id'
 * @example snakeCase('documentId') // 'document_id'
 * @example snakeCase('createdAt')  // 'created_at'
 * @example snakeCase('*')          // '*'  (pass-through for wildcards)
 */
export function snakeCase(value: string): string {
  if (value === '*') return '*';
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Convert a snake_case identifier to camelCase.
 *
 * @example camelCase('chunk_id')    // 'chunkId'
 * @example camelCase('document_id') // 'documentId'
 * @example camelCase('created_at')  // 'createdAt'
 */
export function camelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}
