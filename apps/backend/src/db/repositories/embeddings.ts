/**
 * Embeddings repository.
 *
 * Encapsulates all database access for the embeddings table.
 * search() also joins the chunks table to return chunk text and metadata.
 *
 * Note on knex.raw usage: the pgvector <=> cosine distance operator and the
 * ?::vector cast are PostgreSQL-specific syntax that the Knex query builder
 * cannot express natively. knex.raw is therefore required in two places:
 *   - insert: the embedding value must be cast with ?::vector
 *   - search: the full cosine similarity query uses <=> and ?::vector
 * All other SQL is expressed through the Knex query builder.
 *
 * Note on camelCase: wrapIdentifier converts camelCase field names to
 * snake_case automatically for query builder calls. Inside knex.raw strings,
 * column names must be written in snake_case manually (the raw string bypasses
 * wrapIdentifier). postProcessResponse converts result rows back to camelCase.
 */

import type { Knex } from 'knex';
import type { SearchResult } from '../../vectorstore/VectorStore.js';
import type { EmbeddingInsert, EmbeddingRow } from '../tables.js';

export function createEmbeddingsRepository(db: Knex) {
  return {
    /**
     * Insert a single embedding row.
     * Accepts the embedding as a number[] and applies the ?::vector cast
     * required by the pgvector extension internally, so callers do not need
     * to construct knex.raw fragments.
     */
    async insert(row: EmbeddingInsert): Promise<void> {
      await db<EmbeddingRow>('embeddings').insert({
        ...row,
        embedding: db.raw('?::vector', [JSON.stringify(row.embedding)]),
      });
    },

    /**
     * Search for the topK most similar chunks to the given query embedding
     * using cosine similarity (pgvector <=> operator).
     *
     * The query embedding appears twice in the SQL:
     *   - Once in the SELECT expression to compute 1 - distance = similarity
     *   - Once in the ORDER BY clause for the sort
     * pgvector requires the ?::vector cast on both occurrences.
     *
     * Column names in the raw SQL are snake_case because knex.raw bypasses
     * wrapIdentifier. postProcessResponse converts them to camelCase on return.
     */
    async search(vectorLiteral: string, topK: number): Promise<SearchResult[]> {
      // knex.raw bypasses postProcessResponse for nested rows, so we map
      // each row to an explicit object literal to satisfy the type checker
      // and make the snake_case→camelCase correspondence visible.
      const result = await db.raw<{ rows: Record<string, unknown>[] }>(
        `SELECT
          e.chunk_id,
          e.document_id,
          c.text,
          c.chunk_index,
          c.token_count,
          1 - (e.embedding <=> ?::vector) AS similarity_score
        FROM embeddings e
        JOIN chunks c ON c.id = e.chunk_id
        ORDER BY e.embedding <=> ?::vector
        LIMIT ?`,
        [vectorLiteral, vectorLiteral, topK],
      );
      return result.rows.map((row) => ({
        chunkId: row.chunk_id as string,
        documentId: row.document_id as string,
        text: row.text as string,
        chunkIndex: row.chunk_index as number,
        tokenCount: row.token_count as number,
        similarityScore: row.similarity_score as number,
      }));
    },
  };
}

export type EmbeddingsRepository = ReturnType<
  typeof createEmbeddingsRepository
>;
