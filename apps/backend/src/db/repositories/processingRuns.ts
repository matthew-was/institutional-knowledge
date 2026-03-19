/**
 * Processing runs repository.
 *
 * Encapsulates all database access for the processing_runs table.
 * A processing run is created by triggerProcessing (PROC-001) and completed
 * by the async processing loop after all documents have been processed.
 */

import type { Knex } from 'knex';
import type { ProcessingRunInsert, ProcessingRunRow } from '../tables.js';

export function createProcessingRunsRepository(db: Knex) {
  return {
    /**
     * Return the first processing run with status 'in_progress', or undefined
     * if no such run exists. Used by triggerProcessing to detect conflicts.
     */
    async findInProgressRun(): Promise<ProcessingRunRow | undefined> {
      return db<ProcessingRunRow>('processingRuns')
        .where({ status: 'in_progress' })
        .first();
    },

    /**
     * Insert a new processing run row.
     */
    async createRun(row: ProcessingRunInsert): Promise<void> {
      await db<ProcessingRunRow>('processingRuns').insert(row);
    },

    /**
     * Update a processing run to a terminal status ('completed' or 'failed')
     * and record the completion time.
     */
    async completeRun(
      id: string,
      status: 'completed' | 'failed',
      completedAt: Date,
    ): Promise<void> {
      await db<ProcessingRunRow>('processingRuns')
        .where({ id })
        .update({ status, completedAt });
    },
  };
}

export type ProcessingRunsRepository = ReturnType<
  typeof createProcessingRunsRepository
>;
