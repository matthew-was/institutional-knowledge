/**
 * Documents route group factory.
 *
 * Registers the four document upload/lifecycle endpoints:
 *   POST   /documents/initiate            DOC-001
 *   POST   /documents/:uploadId/upload    DOC-002
 *   POST   /documents/:uploadId/finalize  DOC-003
 *   DELETE /documents/:uploadId           DOC-005
 *
 * This file owns all HTTP concerns: request parsing, response serialisation,
 * and status code decisions. The DocumentService has no knowledge of Express.
 *
 * Expected outcomes (result.outcome === 'error') are handled directly via
 * res.json(). next(err) is reserved for unexpected errors only (DB failures,
 * bugs) — createErrorHandler is never invoked for business logic failures.
 *
 * Auth is applied globally via createApp — not re-applied here.
 * Body validation (validate) is applied at route level; params are destructured
 * at the top of each handler using z.infer<typeof Schema> to avoid per-call casts.
 * multer memory storage is applied at route level for DOC-002.
 */

import { InitiateUploadRequest } from '@institutional-knowledge/shared/schemas/documents';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import type {
  DocumentErrorType,
  DocumentService,
} from '../services/documents.js';

// Validates :uploadId route parameter as a UUID before reaching the handler.
// Prevents service calls with structurally invalid IDs.
const UploadIdParams = z.object({ uploadId: z.uuid() });

// Memory storage — file bytes are passed to DocumentService for all disk I/O
const upload = multer({ storage: multer.memoryStorage() });

// ---------------------------------------------------------------------------
// Error type → HTTP status mapping
// ---------------------------------------------------------------------------

const ERROR_STATUS: Record<DocumentErrorType, number> = {
  unsupported_extension: 422,
  file_too_large: 422,
  whitespace_description: 400,
  not_found: 404,
  duplicate_detected: 409,
  finalized_document: 409,
};

function errorStatus(errorType: string): number {
  return ERROR_STATUS[errorType as DocumentErrorType] ?? 400;
}

export function createDocumentsRouter(service: DocumentService): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // DOC-001: POST /documents/initiate
  // -------------------------------------------------------------------------

  router.post(
    '/documents/initiate',
    validate({ body: InitiateUploadRequest }),
    async (req, res, next) => {
      const body = req.body as z.infer<typeof InitiateUploadRequest>;
      try {
        const result = await service.initiateUpload(body);
        if (result.outcome === 'error') {
          res
            .status(errorStatus(result.errorType))
            .json({ error: result.errorType, message: result.errorMessage });
          return;
        }
        res.status(201).json(result.data);
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // DOC-002: POST /documents/:uploadId/upload
  // -------------------------------------------------------------------------

  router.post(
    '/documents/:uploadId/upload',
    validate({ params: UploadIdParams }),
    upload.single('file'),
    async (req, res, next) => {
      const { uploadId } = req.params as z.infer<typeof UploadIdParams>;
      try {
        if (req.file === undefined) {
          res.status(400).json({
            error: 'missing_file',
            message: "Multipart field 'file' is required",
          });
          return;
        }

        const result = await service.uploadFile({
          uploadId,
          fileBuffer: req.file.buffer,
          fileSize: req.file.size,
        });

        if (result.outcome === 'error') {
          if (result.errorType === 'duplicate_detected') {
            // DuplicateConflictResponse has a custom body shape per OpenAPI spec
            res.status(409).json(result.errorData);
            return;
          }
          res
            .status(errorStatus(result.errorType))
            .json({ error: result.errorType, message: result.errorMessage });
          return;
        }

        res.status(200).json(result.data);
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // DOC-003: POST /documents/:uploadId/finalize
  // -------------------------------------------------------------------------

  router.post(
    '/documents/:uploadId/finalize',
    validate({ params: UploadIdParams }),
    async (req, res, next) => {
      const { uploadId } = req.params as z.infer<typeof UploadIdParams>;
      try {
        const result = await service.finalizeUpload(uploadId);
        if (result.outcome === 'error') {
          res
            .status(errorStatus(result.errorType))
            .json({ error: result.errorType, message: result.errorMessage });
          return;
        }
        res.status(200).json(result.data);
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // DOC-005: DELETE /documents/:uploadId
  // -------------------------------------------------------------------------

  router.delete(
    '/documents/:uploadId',
    validate({ params: UploadIdParams }),
    async (req, res, next) => {
      const { uploadId } = req.params as z.infer<typeof UploadIdParams>;
      try {
        const result = await service.cleanupUpload(uploadId);
        if (result.outcome === 'error') {
          res
            .status(errorStatus(result.errorType))
            .json({ error: result.errorType, message: result.errorMessage });
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
