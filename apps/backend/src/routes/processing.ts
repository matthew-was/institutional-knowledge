/**
 * Processing route handlers (PROC-001, PROC-002).
 *
 * Owns all HTTP concerns for the document processing pipeline. Delegates
 * domain logic to ProcessingService and maps ServiceResult outcomes to HTTP
 * responses. Unexpected errors are forwarded to the global error handler via
 * next(err).
 */

import type { ProcessingResultsRequest } from '@institutional-knowledge/shared/schemas/processing';
import {
  ProcessingResultsRequest as ProcessingResultsRequestSchema,
  TriggerProcessingRequest as TriggerProcessingRequestSchema,
} from '@institutional-knowledge/shared/schemas/processing';
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import type {
  ProcessingErrorType,
  ProcessingService,
} from '../services/processing.js';
import { sendServiceError } from './routeUtils.js';

// ---------------------------------------------------------------------------
// Error → HTTP status mapping
// ---------------------------------------------------------------------------

const ERROR_STATUS: Record<ProcessingErrorType, number> = {
  not_found: 404,
  conflict: 409,
};

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createProcessingRouter(service: ProcessingService): Router {
  const router = Router();

  // PROC-002: Receive processing results from Python
  router.post(
    '/processing/results',
    validate({ body: ProcessingResultsRequestSchema }),
    async (req, res, next) => {
      try {
        const body = req.body as ProcessingResultsRequest;
        const result = await service.receiveProcessingResults(body);
        if (result.outcome === 'error') {
          sendServiceError(res, ERROR_STATUS[result.errorType], result);
          return;
        }
        res.json(result.data);
      } catch (err) {
        next(err);
      }
    },
  );

  // PROC-001: Trigger a processing run
  router.post(
    '/processing/trigger',
    validate({ body: TriggerProcessingRequestSchema }),
    async (_req, res, next) => {
      try {
        const result = await service.triggerProcessing();
        if (result.outcome === 'error') {
          sendServiceError(res, ERROR_STATUS[result.errorType], result);
          return;
        }
        res.json(result.data);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
