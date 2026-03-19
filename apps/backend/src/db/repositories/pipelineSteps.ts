/**
 * Pipeline steps repository.
 *
 * Encapsulates all database access for the pipeline_steps table.
 * Express is the sole DB writer (ADR-031). Pipeline step records are written by Express
 * handlers that receive processing outcomes from the Python service via HTTP.
 */

import type { Knex } from 'knex';
import type { PipelineStepRow } from '../tables.js';

export function createPipelineStepsRepository(db: Knex) {
  return {
    /**
     * Return the step_name of the most recent failed pipeline step for a
     * document, or null if no failed step exists. Used by DOC-006 to build
     * the pipelineStatus summary in the document queue response.
     */
    async getLatestFailedStepName(documentId: string): Promise<string | null> {
      const row = await db<PipelineStepRow>('pipeline_steps')
        .where({ documentId, status: 'failed' })
        .orderBy('createdAt', 'desc')
        .first();
      return row?.stepName ?? null;
    },

    /**
     * Update a pipeline step after processing: increment attemptCount, set
     * status, errorMessage, and completedAt. Used by PROC-002.
     */
    async updateStep(
      documentId: string,
      stepName: string,
      update: {
        status: string;
        errorMessage: string | null;
        completedAt: Date;
      },
      trx?: Knex.Transaction,
    ): Promise<void> {
      const qb = trx ?? db;
      await qb<PipelineStepRow>('pipeline_steps')
        .where({ documentId, stepName })
        .update({
          status: update.status,
          errorMessage: update.errorMessage,
          completedAt: update.completedAt,
          attemptCount: qb.raw('attempt_count + 1'),
        });
    },

    /**
     * Return step names for a document that have status 'pending' or 'failed'
     * and have not exceeded maxRetries. Used by the async processing loop
     * (PROC-001) to determine which steps to run next.
     */
    async getIncompleteStepNames(
      documentId: string,
      maxRetries: number,
    ): Promise<string[]> {
      const rows = await db<PipelineStepRow>('pipeline_steps')
        .select('stepName')
        .where({ documentId })
        .whereIn('status', ['pending', 'failed'])
        .where('attemptCount', '<', maxRetries);
      return rows.map((r) => r.stepName);
    },

    /**
     * Mark the given step names as 'running' and record startedAt. Called
     * immediately before dispatching to the Python service (PROC-001).
     */
    async markStepsRunning(
      documentId: string,
      stepNames: string[],
    ): Promise<void> {
      if (stepNames.length === 0) return;
      await db<PipelineStepRow>('pipeline_steps')
        .where({ documentId })
        .whereIn('stepName', stepNames)
        .update({ status: 'running', startedAt: db.fn.now() });
    },

    /**
     * Reset pipeline steps that have been 'running' longer than the given
     * timeout to 'failed'. Called at the start of triggerProcessing (PROC-001)
     * to recover from interrupted runs.
     */
    async resetStaleRunningSteps(timeoutMinutes: number): Promise<void> {
      const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
      await db<PipelineStepRow>('pipeline_steps')
        .where({ status: 'running' })
        .where('startedAt', '<', cutoff)
        .update({ status: 'failed' });
    },

    /**
     * Return distinct document IDs that have at least one pipeline step with
     * status 'pending' or 'failed' and attemptCount below maxRetries.
     * Used by triggerProcessing (PROC-001) to build the processing queue.
     */
    async getDocumentsWithIncompleteSteps(
      maxRetries: number,
    ): Promise<string[]> {
      const rows = await db<PipelineStepRow>('pipeline_steps')
        .distinct('documentId')
        .whereIn('status', ['pending', 'failed'])
        .where('attemptCount', '<', maxRetries);
      return rows.map((r) => r.documentId);
    },
  };
}

export type PipelineStepsRepository = ReturnType<
  typeof createPipelineStepsRepository
>;
