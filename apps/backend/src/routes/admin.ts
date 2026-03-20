/**
 * Admin route handlers (ADMIN-001).
 *
 * Owns all HTTP concerns for the admin maintenance endpoints.
 * Delegates domain logic to AdminService and maps ServiceResult
 * outcomes to HTTP responses.
 *
 * Unexpected errors are forwarded to the global error handler via next(err).
 */

import { Router } from 'express';
import type { AdminService, ReindexError } from '../services/admin.js';
import { sendServiceError } from './routeUtils.js';

// ---------------------------------------------------------------------------
// Error → HTTP status mapping
// ---------------------------------------------------------------------------

// ReindexError is `never` — no domain error types for this operation.
// The Record<never, number> satisfies the exhaustiveness pattern used across
// all route files even though the map has no entries.
const ERROR_STATUS: Record<ReindexError, number> = {};

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createAdminRouter(service: AdminService): Router {
  const router = Router();

  // ADMIN-001: Rebuild embedding index
  router.post(
    '/admin/reindex-embeddings',
    async (_req, res, next): Promise<void> => {
      try {
        const result = await service.reindexEmbeddings();

        if (result.outcome === 'error') {
          // ReindexError is never — this branch is unreachable at runtime.
          // The exhaustive check is kept so TypeScript enforces the pattern
          // if ReindexError gains variants in the future.
          sendServiceError(res, ERROR_STATUS[result.errorType], result);
          return;
        }

        res.status(200).json(result.data);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
