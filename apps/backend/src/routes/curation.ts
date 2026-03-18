/**
 * Curation route handlers (DOC-006, DOC-007, DOC-008, DOC-009).
 *
 * Owns all HTTP concerns for the document curation workflow. Delegates domain
 * logic to CurationService and maps ServiceResult outcomes to HTTP responses.
 * Unexpected errors are forwarded to the global error handler via next(err).
 */

import type {
  DocumentQueueParams,
  UpdateDocumentMetadataRequest,
} from '@institutional-knowledge/shared/schemas/documents';
import {
  DocumentQueueParams as DocumentQueueParamsSchema,
  UpdateDocumentMetadataRequest as UpdateDocumentMetadataRequestSchema,
} from '@institutional-knowledge/shared/schemas/documents';
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import type {
  CurationErrorType,
  CurationService,
} from '../services/curation.js';
import { sendServiceError } from './routeUtils.js';

// ---------------------------------------------------------------------------
// Route-layer param schema (not a contract schema — not exported to OpenAPI)
// ---------------------------------------------------------------------------

const DocumentIdParams = z.object({ id: z.uuid() });

// ---------------------------------------------------------------------------
// Error → HTTP status mapping
// ---------------------------------------------------------------------------

const ERROR_STATUS: Record<CurationErrorType, number> = {
  not_found: 404,
  no_flag_to_clear: 409,
};

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createCurationRouter(service: CurationService): Router {
  const router = Router();

  // DOC-006: Fetch document queue
  router.get(
    '/curation/documents',
    validate({ query: DocumentQueueParamsSchema }),
    async (req, res, next) => {
      try {
        const query = req.query as DocumentQueueParams;
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 50;
        const result = await service.getDocumentQueue(page, pageSize);
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

  // DOC-007: Fetch document detail
  router.get(
    '/documents/:id',
    validate({ params: DocumentIdParams }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof DocumentIdParams>;
        const result = await service.getDocument(id);
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

  // DOC-008: Clear a flag
  router.post(
    '/documents/:id/clear-flag',
    validate({ params: DocumentIdParams }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof DocumentIdParams>;
        const result = await service.clearFlag(id);
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

  // DOC-009: Update document metadata
  router.patch(
    '/documents/:id/metadata',
    validate({
      params: DocumentIdParams,
      body: UpdateDocumentMetadataRequestSchema,
    }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof DocumentIdParams>;
        const body = req.body as UpdateDocumentMetadataRequest;
        const result = await service.updateDocumentMetadata(id, body);
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
