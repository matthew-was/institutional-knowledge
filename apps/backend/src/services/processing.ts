/**
 * ProcessingService — document processing handlers (PROC-001, PROC-002).
 *
 * Implements the service layer for the processing pipeline. Each method
 * returns ServiceResult<T, K> — the route layer owns all HTTP concerns.
 * No Express imports here.
 *
 * receiveProcessingResults is also called directly by the async processing
 * loop in triggerProcessing, not only via the Express route handler.
 */

import type { ServiceResult } from '@institutional-knowledge/shared';
import type {
  ProcessingResultsRequest,
  ProcessingResultsResponse,
  TriggerProcessingResponse,
} from '@institutional-knowledge/shared/schemas/processing';
import { v7 as uuidv7 } from 'uuid';
import type { AppConfig } from '../config/index.js';
import type { DbInstance } from '../db/index.js';
import type { Logger } from '../middleware/logger.js';
import { callPythonProcess } from '../utils/pythonClient.js';
import type { VectorStore } from '../vectorstore/VectorStore.js';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type ProcessingErrorType = 'not_found' | 'conflict';

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface ProcessingService {
  receiveProcessingResults(
    body: ProcessingResultsRequest,
  ): Promise<ServiceResult<ProcessingResultsResponse, ProcessingErrorType>>;
  triggerProcessing(): Promise<
    ServiceResult<TriggerProcessingResponse, ProcessingErrorType>
  >;
}

export interface ProcessingServiceDeps {
  db: DbInstance;
  config: AppConfig;
  log: Logger;
  vectorStore: VectorStore;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createProcessingService(
  deps: ProcessingServiceDeps,
): ProcessingService {
  const { db, config, log, vectorStore } = deps;

  async function receiveProcessingResults(
    body: ProcessingResultsRequest,
  ): Promise<ServiceResult<ProcessingResultsResponse, ProcessingErrorType>> {
    const doc = await db.documents.getById(body.documentId);
    if (doc === undefined) {
      return {
        outcome: 'error',
        errorType: 'not_found',
        errorMessage: `Document ${body.documentId} not found`,
      };
    }

    await db._knex.transaction(async (trx) => {
      // Step results
      for (const [stepName, result] of Object.entries(body.stepResults)) {
        // eslint-disable-next-line no-await-in-loop
        await db.pipelineSteps.updateStep(
          body.documentId,
          stepName,
          {
            status: result.status,
            errorMessage: result.errorMessage,
            completedAt: new Date(),
          },
          trx,
        );
      }

      // Metadata
      if (body.metadata !== null) {
        await db.documents.applyProcessingMetadata(
          body.documentId,
          body.metadata,
          trx,
        );
      }

      // Chunks + embeddings — both writes use trx so they roll back together
      for (const chunk of body.chunks ?? []) {
        const chunkId = uuidv7();
        // eslint-disable-next-line no-await-in-loop
        await db.chunks.insert(
          {
            id: chunkId,
            documentId: body.documentId,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            tokenCount: chunk.tokenCount,
          },
          trx,
        );
        // vectorStore.write() validates dimension before inserting; if it
        // returns an error we throw so the enclosing transaction rolls back.
        // eslint-disable-next-line no-await-in-loop
        const writeResult = await vectorStore.write(
          body.documentId,
          chunkId,
          chunk.embedding,
          trx,
        );
        if (writeResult.outcome === 'error') {
          throw new Error(
            `Embedding write failed: ${writeResult.errorMessage}`,
          );
        }
      }

      // Entities
      for (const entity of body.entities ?? []) {
        // eslint-disable-next-line no-await-in-loop
        const existing = await db.graph.findVocabTermByNormalisedTerm(
          entity.normalisedName,
          trx,
        );

        if (existing !== undefined) {
          // eslint-disable-next-line no-await-in-loop
          await db.graph.appendAlias(existing.id, entity.name, trx);
          // eslint-disable-next-line no-await-in-loop
          await db.graph.insertOccurrence(
            { id: uuidv7(), termId: existing.id, documentId: body.documentId },
            trx,
          );
        } else {
          // eslint-disable-next-line no-await-in-loop
          const isRejected = await db.graph.findNormalisedTermInRejected(
            entity.normalisedName,
            trx,
          );
          if (isRejected) continue;

          const termId = uuidv7();
          // eslint-disable-next-line no-await-in-loop
          await db.graph.upsertTerm(
            {
              id: termId,
              term: entity.name,
              normalisedTerm: entity.normalisedName,
              category: entity.type,
              description: null,
              aliases: [],
              source: 'llm_extracted',
              confidence: entity.confidence,
            },
            trx,
          );
          // eslint-disable-next-line no-await-in-loop
          await db.graph.insertOccurrence(
            { id: uuidv7(), termId, documentId: body.documentId },
            trx,
          );
        }
      }

      // Relationships
      for (const rel of body.relationships ?? []) {
        // eslint-disable-next-line no-await-in-loop
        const source = await db.graph.findVocabTermByNormalisedTerm(
          rel.sourceEntityName,
          trx,
        );
        // eslint-disable-next-line no-await-in-loop
        const target = await db.graph.findVocabTermByNormalisedTerm(
          rel.targetEntityName,
          trx,
        );
        if (source === undefined || target === undefined) continue;

        // eslint-disable-next-line no-await-in-loop
        await db.graph.insertRelationship(
          {
            id: uuidv7(),
            sourceTermId: source.id,
            targetTermId: target.id,
            relationshipType: rel.relationshipType,
            confidence: rel.confidence,
          },
          trx,
        );
      }

      // Flags
      if (body.flags.length > 0) {
        const flag = body.flags[0];
        await db.documents.setFlag(body.documentId, flag.type, new Date(), trx);
      }
    });

    log.info({ documentId: body.documentId }, 'Processing results received');

    return {
      outcome: 'success',
      data: { documentId: body.documentId, accepted: true },
    };
  }

  async function triggerProcessing(): Promise<
    ServiceResult<TriggerProcessingResponse, ProcessingErrorType>
  > {
    const inProgress = await db.processingRuns.findInProgressRun();
    if (inProgress !== undefined) {
      return {
        outcome: 'error',
        errorType: 'conflict',
        errorMessage: 'A processing run is already in progress',
      };
    }

    await db.pipelineSteps.resetStaleRunningSteps(
      config.pipeline.runningStepTimeoutMinutes,
    );

    const documentIds = await db.pipelineSteps.getDocumentsWithIncompleteSteps(
      config.pipeline.maxRetries,
    );

    const runId = uuidv7();
    await db.processingRuns.createRun({
      id: runId,
      status: 'in_progress',
      documentsQueued: documentIds.length,
      completedAt: null,
    });

    void runAsyncLoop(runId, documentIds, deps, receiveProcessingResults);

    log.info(
      { runId, documentsQueued: documentIds.length },
      'Processing run triggered',
    );

    return {
      outcome: 'success',
      data: { runId, documentsQueued: documentIds.length },
    };
  }

  return { receiveProcessingResults, triggerProcessing };
}

// ---------------------------------------------------------------------------
// Async processing loop (fire-and-forget)
// ---------------------------------------------------------------------------

async function runAsyncLoop(
  runId: string,
  documentIds: string[],
  deps: ProcessingServiceDeps,
  receiveResults: (
    body: ProcessingResultsRequest,
  ) => Promise<ServiceResult<ProcessingResultsResponse, ProcessingErrorType>>,
): Promise<void> {
  const { db, config, log } = deps;
  let allErrored = documentIds.length > 0;

  for (const documentId of documentIds) {
    try {
      const incompleteSteps = await db.pipelineSteps.getIncompleteStepNames(
        documentId,
        config.pipeline.maxRetries,
      );
      await db.pipelineSteps.markStepsRunning(documentId, incompleteSteps);

      const doc = await db.documents.getById(documentId);

      const pythonResponse = await callPythonProcess(
        config.python.baseUrl,
        config.auth.pythonServiceKey,
        {
          documentId,
          fileReference: doc?.storagePath ?? null,
          incompleteSteps,
          previousOutputs: null,
        },
      );

      const result = await receiveResults(pythonResponse);
      if (result.outcome === 'success') {
        allErrored = false;
      } else {
        log.error(
          {
            documentId,
            errorType: result.errorType,
            errorMessage: result.errorMessage,
          },
          'Processing loop: receiveResults returned error for document',
        );
      }
    } catch (err) {
      log.error({ documentId, err }, 'Processing loop error for document');
    }
  }

  const finalStatus = allErrored ? 'failed' : 'completed';
  await db.processingRuns.completeRun(runId, finalStatus, new Date());
  log.info({ runId, status: finalStatus }, 'Processing run complete');
}
