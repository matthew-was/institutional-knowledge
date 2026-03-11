/**
 * PgVectorStore — Phase 1 pgvector implementation of VectorStore (ADR-033).
 *
 * Uses the pgvector <=> cosine distance operator for similarity search.
 * The embedding dimension is validated at both write and search time against
 * the configured value to catch dimension mismatches before a database round-trip.
 *
 * All database access is delegated to the embeddings and chunks repositories.
 * No SQL is written in this file.
 *
 * write() inserts a row into the embeddings table. The corresponding chunks row
 * must already exist before write() is called (inserted by the handler).
 *
 * search() executes a cosine similarity query joining embeddings and chunks,
 * ordered by similarity (highest first), limited to topK results.
 */

import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { DbInstance } from '../db/index.js';
import type { SearchResult, VectorStore } from './VectorStore.js';

export class PgVectorStore implements VectorStore {
  private readonly db: DbInstance;
  private readonly embeddingDimension: number;
  private readonly log: Logger;

  constructor(db: DbInstance, embeddingDimension: number, log: Logger) {
    this.db = db;
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
    await this.db.embeddings.insert({ id, chunkId, documentId, embedding });

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

    const results = await this.db.embeddings.search(
      JSON.stringify(queryEmbedding),
      topK,
    );

    this.log.debug({ topK, resultCount: results.length }, 'search: complete');
    return results;
  }
}
