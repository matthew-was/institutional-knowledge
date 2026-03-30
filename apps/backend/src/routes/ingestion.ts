/**
 * Ingestion route handlers (ING-001, ING-002, ING-003, ING-004).
 *
 * Owns all HTTP concerns for the CLI bulk ingestion endpoints.
 * Delegates domain logic to IngestionService and maps ServiceResult
 * outcomes to HTTP responses.
 *
 * ING-003 uses multer (in-memory storage) to parse multipart/form-data.
 * The buffer is passed directly to the service; no disk temp files are used.
 *
 * Unexpected errors are forwarded to the global error handler via next(err).
 */

import type { DocumentErrorType } from '@institutional-knowledge/shared';
import type { CreateIngestionRunRequest } from '@institutional-knowledge/shared/schemas/ingestion';
import { CreateIngestionRunRequest as CreateIngestionRunRequestSchema } from '@institutional-knowledge/shared/schemas/ingestion';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import type {
  AddFileToRunError,
  CleanupRunError,
  CompleteRunError,
  IngestionService,
} from '../services/ingestion.js';
import { sendServiceError } from './routeUtils.js';

// ---------------------------------------------------------------------------
// Path parameter schemas (local — not exported to OpenAPI, per schema-placement rule)
// ---------------------------------------------------------------------------

// Validates :runId as a non-empty string. UUID validation is intentionally
// omitted — the service returns not_found for unknown IDs regardless of format.
const RunIdParams = z.object({ runId: z.string().min(1) });

// ---------------------------------------------------------------------------
// Multer — in-memory storage for ING-003
// ---------------------------------------------------------------------------

const upload = multer({ storage: multer.memoryStorage() });

// ---------------------------------------------------------------------------
// Error → HTTP status mapping
// ---------------------------------------------------------------------------

const COMPLETE_RUN_STATUS: Record<CompleteRunError, number> = {
  not_found: 404,
  conflict: 409,
};

const ADD_FILE_STATUS: Record<AddFileToRunError, number> = {
  not_found: 404,
  conflict: 409,
  duplicate_detected: 409,
  invalid_filename: 422,
  file_validation_failed: 422,
  group_validation_failed: 422,
};

const CLEANUP_RUN_STATUS: Record<CleanupRunError, number> = {
  not_found: 404,
};

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createIngestionRouter(service: IngestionService): Router {
  const router = Router();

  // ING-001: Create ingestion run (POST /ingestion/runs)
  router.post(
    '/ingestion/runs',
    validate({ body: CreateIngestionRunRequestSchema }),
    async (req, res, next) => {
      try {
        const body = req.body as CreateIngestionRunRequest;
        const result = await service.createIngestionRun(body);
        // createIngestionRun never returns an error outcome — sweep is best-effort
        if (result.outcome !== 'success') {
          next(new Error('Unexpected error from createIngestionRun'));
          return;
        }
        res.status(201).json(result.data);
      } catch (err) {
        next(err);
      }
    },
  );

  // ING-002: Complete ingestion run (POST /ingestion/runs/:runId/complete)
  router.post(
    '/ingestion/runs/:runId/complete',
    validate({ params: RunIdParams }),
    async (req, res, next) => {
      try {
        const { runId } = req.params as z.infer<typeof RunIdParams>;
        const result = await service.completeRun(runId);
        if (result.outcome === 'error') {
          sendServiceError(res, COMPLETE_RUN_STATUS[result.errorType], result);
          return;
        }
        res.json(result.data);
      } catch (err) {
        next(err);
      }
    },
  );

  // ING-003: Add file to ingestion run (POST /ingestion/runs/:runId/files)
  router.post(
    '/ingestion/runs/:runId/files',
    validate({ params: RunIdParams }),
    upload.single('file'),
    async (req, res, next) => {
      try {
        const { runId } = req.params as z.infer<typeof RunIdParams>;

        if (req.file === undefined) {
          const errorType: DocumentErrorType = 'missing_file';
          res.status(400).json({
            error: errorType,
            message: 'A file field is required in the multipart body',
          });
          return;
        }

        // multer v2 types originalname as string | string[] for multi-file
        // compatibility; for upload.single() it is always a scalar string.
        const originalFilename = Array.isArray(req.file.originalname)
          ? (req.file.originalname[0] ?? 'unknown')
          : req.file.originalname;

        const result = await service.addFileToRun(runId, req.file.buffer, {
          originalFilename,
          date: typeof req.body.date === 'string' ? req.body.date : undefined,
          description:
            typeof req.body.description === 'string'
              ? req.body.description
              : undefined,
          groupName:
            typeof req.body.groupName === 'string'
              ? req.body.groupName
              : undefined,
          sequenceNumber:
            typeof req.body.sequenceNumber === 'string'
              ? req.body.sequenceNumber
              : undefined,
        });

        if (result.outcome === 'error') {
          sendServiceError(res, ADD_FILE_STATUS[result.errorType], result);
          return;
        }
        res.status(201).json(result.data);
      } catch (err) {
        next(err);
      }
    },
  );

  // ING-004: Cleanup ingestion run (DELETE /ingestion/runs/:runId)
  router.delete(
    '/ingestion/runs/:runId',
    validate({ params: RunIdParams }),
    async (req, res, next) => {
      try {
        const { runId } = req.params as z.infer<typeof RunIdParams>;
        const result = await service.cleanupRun(runId);
        if (result.outcome === 'error') {
          sendServiceError(res, CLEANUP_RUN_STATUS[result.errorType], result);
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
