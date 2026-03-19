/**
 * Search route handlers (QUERY-001, QUERY-002).
 *
 * Owns all HTTP concerns for the search callback endpoints called by the
 * Python query handler. Delegates domain logic to SearchService and maps
 * ServiceResult outcomes to HTTP responses.
 *
 * Unexpected errors are forwarded to the global error handler via next(err).
 */

import type {
  GraphSearchRequest,
  VectorSearchRequest,
} from '@institutional-knowledge/shared/schemas/search';
import {
  GraphSearchRequest as GraphSearchRequestSchema,
  VectorSearchRequest as VectorSearchRequestSchema,
} from '@institutional-knowledge/shared/schemas/search';
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import type { SearchErrorType, SearchService } from '../services/search.js';
import { sendServiceError } from './routeUtils.js';

// ---------------------------------------------------------------------------
// Error → HTTP status mapping
// ---------------------------------------------------------------------------

const ERROR_STATUS: Record<SearchErrorType, number> = {
  dimension_mismatch: 400,
  depth_exceeded: 400,
};

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createSearchRouter(service: SearchService): Router {
  const router = Router();

  // QUERY-001: Vector search callback (Python to Express)
  router.post(
    '/search/vector',
    validate({ body: VectorSearchRequestSchema }),
    async (req, res, next) => {
      try {
        const body = req.body as VectorSearchRequest;
        const result = await service.vectorSearch(body);
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

  // QUERY-002: Graph traversal callback (Python to Express)
  router.post(
    '/search/graph',
    validate({ body: GraphSearchRequestSchema }),
    async (req, res, next) => {
      try {
        const body = req.body as GraphSearchRequest;
        const result = await service.graphSearch(body);
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
