/**
 * Ingestion runs repository.
 *
 * Encapsulates all database access for the ingestion_runs table.
 * Also provides a cross-table read for documents belonging to a run,
 * which is acceptable because the relationship is directional: an
 * ingestion run owns its documents (ADR-018).
 */

import type { Knex } from 'knex';
import type {
  DocumentRow,
  IngestionRunInsert,
  IngestionRunRow,
} from '../tables.js';

export function createIngestionRunsRepository(db: Knex) {
  return {
    /**
     * Insert a new ingestion run row.
     */
    async insert(
      row: IngestionRunInsert,
      trx?: Knex.Transaction,
    ): Promise<void> {
      const qb = trx ?? db;
      await qb<IngestionRunRow>('ingestionRuns').insert(row);
    },

    /**
     * Return a run by ID, or undefined if not found.
     */
    async getById(id: string): Promise<IngestionRunRow | undefined> {
      return db<IngestionRunRow>('ingestionRuns').where({ id }).first();
    },

    /**
     * Return all runs that are NOT in 'completed' status.
     * Used by the run-start sweep (ADR-018) to clean up incomplete runs.
     */
    async getIncomplete(): Promise<IngestionRunRow[]> {
      return db<IngestionRunRow>('ingestionRuns').whereNot({
        status: 'completed',
      });
    },

    /**
     * Partially update an ingestion run — status and/or completedAt.
     */
    async update(
      id: string,
      patch: Partial<Pick<IngestionRunRow, 'status' | 'completedAt'>>,
      trx?: Knex.Transaction,
    ): Promise<void> {
      const qb = trx ?? db;
      await qb<IngestionRunRow>('ingestionRuns').where({ id }).update(patch);
    },

    /**
     * Delete an ingestion run record by ID.
     */
    async delete(id: string, trx?: Knex.Transaction): Promise<void> {
      const qb = trx ?? db;
      await qb<IngestionRunRow>('ingestionRuns').where({ id }).delete();
    },

    /**
     * Return all document rows with ingestion_run_id = runId.
     * Cross-table read: the ingestion run owns its documents, so this
     * directional join is owned by this repository.
     */
    async getDocumentsByRunId(
      runId: string,
      trx?: Knex.Transaction,
    ): Promise<DocumentRow[]> {
      const qb = trx ?? db;
      return qb<DocumentRow>('documents').where({ ingestionRunId: runId });
    },
  };
}

export type IngestionRunsRepository = ReturnType<
  typeof createIngestionRunsRepository
>;
