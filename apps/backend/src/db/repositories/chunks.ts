/**
 * Chunks repository.
 *
 * Encapsulates all database access for the chunks table.
 * All queries use the Knex query builder — no knex.raw required for chunks.
 */

import type { Knex } from 'knex';
import type { ChunkInsert, ChunkRow } from '../tables.js';

export function createChunksRepository(db: Knex) {
  return {
    /**
     * Insert a single chunk row.
     */
    async insert(row: ChunkInsert, trx?: Knex.Transaction): Promise<void> {
      const qb = trx ?? db;
      await qb<ChunkRow>('chunks').insert(row);
    },
  };
}

export type ChunksRepository = ReturnType<typeof createChunksRepository>;
