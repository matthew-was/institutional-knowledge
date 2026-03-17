/**
 * Documents repository.
 *
 * Encapsulates all database access for the documents table.
 * All queries use the Knex query builder — no knex.raw required.
 */

import type { Knex } from 'knex';
import type { DocumentInsert, DocumentRow } from '../tables.js';

export function createDocumentsRepository(db: Knex) {
  return {
    /**
     * Insert a new document row.
     */
    async insert(row: DocumentInsert): Promise<void> {
      await db<DocumentRow>('documents').insert(row);
    },

    /**
     * Retrieve a document by ID. Returns undefined if not found.
     */
    async getById(id: string): Promise<DocumentRow | undefined> {
      return db<DocumentRow>('documents').where({ id }).first();
    },

    /**
     * Update a document row after file bytes are received (DOC-002).
     * Sets fileHash, fileSizeBytes, and status to 'uploaded'.
     */
    async updateAfterUpload(
      id: string,
      fileHash: string,
      fileSizeBytes: number,
    ): Promise<void> {
      await db<DocumentRow>('documents')
        .where({ id })
        .update({
          fileHash,
          fileSizeBytes: String(fileSizeBytes),
          status: 'uploaded',
        });
    },

    /**
     * Update a document row after the file is moved to permanent storage (DOC-003).
     * Sets storagePath and status to 'finalized'.
     */
    async updateAfterFinalize(id: string, storagePath: string): Promise<void> {
      await db<DocumentRow>('documents')
        .where({ id })
        .update({ storagePath, status: 'finalized' });
    },

    /**
     * Find a finalized document with the given file hash, excluding the given ID.
     * Used for duplicate detection (DOC-002). Returns undefined if no match.
     */
    async findFinalizedByHash(
      fileHash: string,
      excludeId: string,
    ): Promise<DocumentRow | undefined> {
      return db<DocumentRow>('documents')
        .where({ fileHash, status: 'finalized' })
        .whereNot({ id: excludeId })
        .first();
    },

    /**
     * Delete a document row by ID.
     */
    async delete(id: string): Promise<void> {
      await db<DocumentRow>('documents').where({ id }).delete();
    },
  };
}

export type DocumentsRepository = ReturnType<typeof createDocumentsRepository>;
