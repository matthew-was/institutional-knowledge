/**
 * Vocabulary route handlers (VOC-001, VOC-002, VOC-003, VOC-004).
 *
 * Owns all HTTP concerns for the vocabulary curation workflow. Delegates domain
 * logic to VocabularyService and maps ServiceResult outcomes to HTTP responses.
 * Unexpected errors are forwarded to the global error handler via next(err).
 *
 * Route registration order matters for VOC-004 vs VOC-002/VOC-003:
 *   POST /curation/vocabulary/terms  (VOC-004) — registered BEFORE
 *   POST /curation/vocabulary/:termId/accept  (VOC-002)
 *   POST /curation/vocabulary/:termId/reject  (VOC-003)
 * so that Express does not treat the literal segment 'terms' as a :termId param.
 */

import type {
  AddVocabularyTermRequest,
  VocabularyQueueParams,
} from '@institutional-knowledge/shared/schemas/vocabulary';
import {
  AddVocabularyTermRequest as AddVocabularyTermRequestSchema,
  VocabularyQueueParams as VocabularyQueueParamsSchema,
} from '@institutional-knowledge/shared/schemas/vocabulary';
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import type {
  VocabularyErrorType,
  VocabularyService,
} from '../services/vocabulary.js';
import { sendServiceError } from './routeUtils.js';

// ---------------------------------------------------------------------------
// Route-layer param schema (not a contract schema — not exported to OpenAPI)
// ---------------------------------------------------------------------------

const TermIdParams = z.object({ termId: z.uuid() });

// ---------------------------------------------------------------------------
// Error → HTTP status mapping
// ---------------------------------------------------------------------------

const ERROR_STATUS: Record<VocabularyErrorType, number> = {
  not_found: 404,
  wrong_source: 409,
  duplicate_term: 409,
  target_not_found: 404,
};

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createVocabularyRouter(service: VocabularyService): Router {
  const router = Router();

  // VOC-001: Fetch vocabulary review queue
  router.get(
    '/curation/vocabulary',
    validate({ query: VocabularyQueueParamsSchema }),
    async (req, res, next) => {
      try {
        const query = req.query as VocabularyQueueParams;
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 50;
        const result = await service.getVocabularyQueue(page, pageSize);
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

  // VOC-004: Add a manual term — registered BEFORE :termId routes so Express
  // does not match the literal segment 'terms' as a :termId parameter value.
  router.post(
    '/curation/vocabulary/terms',
    validate({ body: AddVocabularyTermRequestSchema }),
    async (req, res, next) => {
      try {
        const body = req.body as AddVocabularyTermRequest;
        const result = await service.addManualTerm(body);
        if (result.outcome === 'error') {
          sendServiceError(res, ERROR_STATUS[result.errorType], result);
          return;
        }
        res.status(201).json(result.data);
      } catch (err) {
        next(err);
      }
    },
  );

  // VOC-002: Accept a candidate
  router.post(
    '/curation/vocabulary/:termId/accept',
    validate({ params: TermIdParams }),
    async (req, res, next) => {
      try {
        const { termId } = req.params as z.infer<typeof TermIdParams>;
        const result = await service.acceptCandidate(termId);
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

  // VOC-003: Reject a candidate
  router.post(
    '/curation/vocabulary/:termId/reject',
    validate({ params: TermIdParams }),
    async (req, res, next) => {
      try {
        const { termId } = req.params as z.infer<typeof TermIdParams>;
        const result = await service.rejectCandidate(termId);
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
