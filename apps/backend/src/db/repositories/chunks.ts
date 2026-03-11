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
    async insert(row: ChunkInsert): Promise<void> {
      await db<ChunkRow>('chunks').insert(row);
    },

    /**
     * Retrieve a single chunk by ID. Returns undefined if not found.
     */
    async getById(id: string): Promise<ChunkRow | undefined> {
      return db<ChunkRow>('chunks').where({ id }).first();
    },
  };
}

export type ChunksRepository = ReturnType<typeof createChunksRepository>;
