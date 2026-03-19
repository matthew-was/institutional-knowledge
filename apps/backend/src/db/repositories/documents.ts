/**
 * Documents repository.
 *
 * Encapsulates all database access for the documents table.
 * All queries use the Knex query builder — no knex.raw required.
 */

import type { ProcessingMetadata } from '@institutional-knowledge/shared/schemas/processing';
import type { Knex } from 'knex';
import type { DocumentInsert, DocumentRow } from '../tables.js';

/**
 * Fields that may be updated via DOC-009 (updateDocumentMetadata).
 * All fields are optional — only provided fields are written to the DB.
 */
export interface DocumentMetadataFields {
  date?: string;
  description?: string;
  documentType?: string | null;
  people?: string[];
  organisations?: string[];
  landReferences?: string[];
}

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

    /**
     * Return a paginated list of documents with an active flag, ordered by
     * flaggedAt ASC. Also returns the total count of flagged documents.
     * Used by DOC-006 (getDocumentQueue).
     */
    async getFlagged(
      page: number,
      pageSize: number,
    ): Promise<{ rows: DocumentRow[]; total: number }> {
      const [countResult, rows] = await Promise.all([
        db<DocumentRow>('documents')
          .whereNotNull('flagReason')
          .count<{ count: string }>('* as count')
          .first(),
        db<DocumentRow>('documents')
          .whereNotNull('flagReason')
          .orderBy('flaggedAt', 'asc')
          .limit(pageSize)
          .offset((page - 1) * pageSize),
      ]);
      return { rows, total: Number(countResult?.count ?? 0) };
    },

    /**
     * Clear the flag on a document by setting flagReason and flaggedAt to null.
     * Used by DOC-008 (clearFlag).
     */
    async clearFlag(id: string): Promise<void> {
      await db<DocumentRow>('documents')
        .where({ id })
        .update({ flagReason: null, flaggedAt: null });
    },

    /**
     * Partially update metadata fields on a document. Only provided (non-undefined)
     * fields are written. Always updates updatedAt. Returns the updated row.
     * Used by DOC-009 (updateDocumentMetadata).
     */
    async updateMetadata(
      id: string,
      fields: DocumentMetadataFields,
    ): Promise<DocumentRow | undefined> {
      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (fields.date !== undefined) update.date = fields.date;
      if (fields.description !== undefined)
        update.description = fields.description;
      if (fields.documentType !== undefined)
        update.documentType = fields.documentType;
      if (fields.people !== undefined) update.people = fields.people;
      if (fields.organisations !== undefined)
        update.organisations = fields.organisations;
      if (fields.landReferences !== undefined)
        update.landReferences = fields.landReferences;

      await db<DocumentRow>('documents').where({ id }).update(update);
      return db<DocumentRow>('documents').where({ id }).first();
    },

    /**
     * Apply pipeline-extracted metadata to a document. Overwrites documentType,
     * people, organisations, and landReferences unconditionally when provided.
     * Description is overwritten only when metadata.description is non-null and
     * non-empty (UR-053 — preserve curator-supplied description otherwise).
     * Always sets updatedAt. Used by PROC-002 (receiveProcessingResults).
     */
    async applyProcessingMetadata(
      id: string,
      metadata: ProcessingMetadata,
      trx?: Knex.Transaction,
    ): Promise<void> {
      const qb = trx ?? db;
      const update: Record<string, unknown> = {
        documentType: metadata.documentType,
        people: metadata.people,
        organisations: metadata.organisations,
        landReferences: metadata.landReferences,
        updatedAt: new Date(),
      };
      if (metadata.description !== null && metadata.description !== '') {
        update.description = metadata.description;
      }
      await qb<DocumentRow>('documents').where({ id }).update(update);
    },

    /**
     * Set a flag on a document. Used by PROC-002 when the Python service
     * returns one or more flags for a document.
     */
    async setFlag(
      id: string,
      flagReason: string,
      flaggedAt: Date,
      trx?: Knex.Transaction,
    ): Promise<void> {
      const qb = trx ?? db;
      await qb<DocumentRow>('documents')
        .where({ id })
        .update({ flagReason, flaggedAt });
    },
  };
}

export type DocumentsRepository = ReturnType<typeof createDocumentsRepository>;
