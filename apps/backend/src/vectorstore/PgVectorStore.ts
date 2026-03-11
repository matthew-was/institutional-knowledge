/**
 * PgVectorStore — Phase 1 pgvector implementation of VectorStore (ADR-033).
 *
 * Uses the pgvector <=> cosine distance operator for similarity search.
 * The embedding dimension is validated at both write and search time against
 * the configured value to catch dimension mismatches before a database round-trip.
 *
 * write() inserts a row into the embeddings table. The corresponding chunks row
 * must already exist before write() is called (inserted by the handler).
 *
 * search() executes a cosine similarity query joining embeddings and chunks,
 * ordered by similarity (highest first), limited to topK results.
 */

import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { KnexInstance } from '../db/index.js';
import type { SearchResult, VectorStore } from './VectorStore.js';

// ---------------------------------------------------------------------------
// Row shapes for raw query results
// ---------------------------------------------------------------------------

interface SearchRow {
  chunk_id: string;
  document_id: string;
  text: string;
  chunk_index: number;
  token_count: number;
  similarity_score: string; // PostgreSQL returns numeric as string
}

// ---------------------------------------------------------------------------
// PgVectorStore
// ---------------------------------------------------------------------------

export class PgVectorStore implements VectorStore {
  private readonly knex: KnexInstance;
  private readonly embeddingDimension: number;
  private readonly log: Logger;

  constructor(knex: KnexInstance, embeddingDimension: number, log: Logger) {
    this.knex = knex;
    this.embeddingDimension = embeddingDimension;
    this.log = log.child({ component: 'PgVectorStore' });
  }

  /**
   * Insert an embedding into the embeddings table.
   * The chunk row (chunkId) must already exist before this is called.
   * Throws if embedding.length does not match the configured dimension.
   */
  async write(
    documentId: string,
    chunkId: string,
    embedding: number[],
  ): Promise<void> {
    if (embedding.length !== this.embeddingDimension) {
      throw new Error(
        `PgVectorStore.write: embedding dimension mismatch — expected ${this.embeddingDimension}, received ${embedding.length}`,
      );
    }

    this.log.debug({ documentId, chunkId }, 'write: inserting embedding');

    const id = randomUUID();
    // pgvector expects the vector literal as a bracketed JSON array string.
    // Cast ?::vector tells PostgreSQL to interpret the string as a vector value.
    await this.knex.raw(
      'INSERT INTO embeddings (id, chunk_id, document_id, embedding) VALUES (?, ?, ?, ?::vector)',
      [id, chunkId, documentId, JSON.stringify(embedding)],
    );

    this.log.debug({ documentId, chunkId, embeddingId: id }, 'write: complete');
  }

  /**
   * Search for the topK most similar chunks to the given query embedding.
   * Throws if queryEmbedding.length does not match the configured dimension.
   * Phase 1: no filters, no similarity threshold.
   */
  async search(
    queryEmbedding: number[],
    topK: number,
    _filters?: Record<string, unknown>,
  ): Promise<SearchResult[]> {
    if (queryEmbedding.length !== this.embeddingDimension) {
      throw new Error(
        `PgVectorStore.search: embedding dimension mismatch — expected ${this.embeddingDimension}, received ${queryEmbedding.length}`,
      );
    }

    this.log.debug(
      { topK, dimension: queryEmbedding.length },
      'search: executing',
    );

    const vectorLiteral = JSON.stringify(queryEmbedding);

    // The query embedding appears twice: once in the SELECT expression for the
    // similarity score and once in the ORDER BY clause. pgvector requires the
    // literal cast on both occurrences.
    const result = await this.knex.raw<{ rows: SearchRow[] }>(
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

    const rows = result.rows;
    this.log.debug({ topK, resultCount: rows.length }, 'search: complete');

    return rows.map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      text: row.text,
      chunkIndex: row.chunk_index,
      tokenCount: row.token_count,
      similarityScore: Number(row.similarity_score),
    }));
  }
}
