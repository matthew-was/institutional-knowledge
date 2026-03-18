/**
 * Pipeline steps repository.
 *
 * Encapsulates read access to the pipeline_steps table.
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
  };
}

export type PipelineStepsRepository = ReturnType<
  typeof createPipelineStepsRepository
>;
