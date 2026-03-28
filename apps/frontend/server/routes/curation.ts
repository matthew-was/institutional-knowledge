import {
  AddVocabularyTermRequest,
  DocumentQueueParams,
  UpdateDocumentMetadataRequest,
  VocabularyQueueParams,
} from '@institutional-knowledge/shared';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { AppConfig } from '../config';
import { createCurationHandlers } from '../handlers/curationHandler';
import type { ExpressClient } from '../requests/client';
import type { CurationErrorType } from '../requests/curation';
import { sendHonoServiceError } from './routeUtils';

export interface CurationDeps {
  config: AppConfig;
  expressClient: ExpressClient;
  log: Logger;
}

const ERROR_STATUS: Record<CurationErrorType, ContentfulStatusCode> = {
  not_found: 404,
  no_active_flag: 409,
  invalid_params: 400,
  invalid_state: 409,
  duplicate_term: 409,
};

export function createCurationRouter(deps: CurationDeps): Hono {
  const router = new Hono();
  const handlers = createCurationHandlers(deps.expressClient.curation);

  /**
   * GET /api/curation/documents — DOC-006
   * Fetches the document curation queue from Express and returns it as-is.
   */
  router.get('/documents', async (c) => {
    const parsed = DocumentQueueParams.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json(
        { error: 'invalid_params', message: parsed.error.issues[0]?.message },
        400,
      );
    }

    try {
      const data = await handlers.fetchDocumentQueue(parsed.data);
      return c.json(data, 200);
    } catch (err) {
      deps.log.error({ err }, 'Unexpected error fetching document queue');
      return c.json(
        { error: 'fetch_failed', message: 'Failed to fetch document queue.' },
        500,
      );
    }
  });

  /**
   * GET /api/curation/documents/:id — DOC-007
   * Fetches document detail from Express. Propagates 404.
   */
  router.get('/documents/:id', async (c) => {
    const rawId = c.req.param('id');
    if (!z.uuid().safeParse(rawId).success) {
      return c.json(
        { error: 'invalid_params', message: 'id must be a valid UUID.' },
        400,
      );
    }
    const id = rawId;

    try {
      const result = await handlers.fetchDocumentDetail(id);
      if (result.outcome === 'error') {
        deps.log.warn(
          { errorType: result.errorType, documentId: id },
          'Fetch document detail error',
        );
        return sendHonoServiceError(c, ERROR_STATUS[result.errorType], result);
      }
      deps.log.info({ documentId: id }, 'Document detail fetched');
      return c.json(result.data, 200);
    } catch (err) {
      deps.log.error(
        { err, documentId: id },
        'Unexpected error fetching document detail',
      );
      return c.json(
        { error: 'fetch_failed', message: 'Failed to fetch document detail.' },
        500,
      );
    }
  });

  /**
   * POST /api/curation/documents/:id/clear-flag — DOC-008
   * Clears the review flag on a document. Propagates 404 and 409 from Express.
   */
  router.post('/documents/:id/clear-flag', async (c) => {
    const rawId = c.req.param('id');
    if (!z.uuid().safeParse(rawId).success) {
      return c.json(
        { error: 'invalid_params', message: 'id must be a valid UUID.' },
        400,
      );
    }
    const id = rawId;

    try {
      const result = await handlers.clearDocumentFlag(id);
      if (result.outcome === 'error') {
        deps.log.warn(
          { errorType: result.errorType, documentId: id },
          'Clear flag error',
        );
        return sendHonoServiceError(c, ERROR_STATUS[result.errorType], result);
      }
      deps.log.info({ documentId: id }, 'Flag cleared');
      return c.json(result.data, 200);
    } catch (err) {
      deps.log.error({ err, documentId: id }, 'Unexpected error clearing flag');
      return c.json(
        {
          error: 'clear_flag_failed',
          message: 'An unexpected error occurred.',
        },
        500,
      );
    }
  });

  /**
   * PATCH /api/curation/documents/:id/metadata — DOC-009
   * Updates document metadata via Express. Propagates 400 and 404.
   */
  router.patch('/documents/:id/metadata', async (c) => {
    const rawId = c.req.param('id');
    if (!z.uuid().safeParse(rawId).success) {
      return c.json(
        { error: 'invalid_params', message: 'id must be a valid UUID.' },
        400,
      );
    }
    const id = rawId;

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json(
        {
          error: 'invalid_params',
          message: 'Request body must be valid JSON.',
        },
        400,
      );
    }

    const parsed = UpdateDocumentMetadataRequest.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          error: 'invalid_params',
          message: parsed.error.issues[0]?.message ?? 'Invalid request body.',
        },
        400,
      );
    }

    try {
      const result = await handlers.updateDocumentMetadata(id, parsed.data);
      if (result.outcome === 'error') {
        deps.log.warn(
          { errorType: result.errorType, documentId: id },
          'Update metadata error',
        );
        return sendHonoServiceError(c, ERROR_STATUS[result.errorType], result);
      }
      deps.log.info({ documentId: id }, 'Document metadata updated');
      return c.json(result.data, 200);
    } catch (err) {
      deps.log.error(
        { err, documentId: id },
        'Unexpected error updating document metadata',
      );
      return c.json(
        {
          error: 'update_failed',
          message: 'An unexpected error occurred while updating metadata.',
        },
        500,
      );
    }
  });

  /**
   * GET /api/curation/vocabulary — VOC-001
   * Fetches the vocabulary review queue from Express.
   */
  router.get('/vocabulary', async (c) => {
    const parsed = VocabularyQueueParams.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json(
        { error: 'invalid_params', message: parsed.error.issues[0]?.message },
        400,
      );
    }

    try {
      const data = await handlers.fetchVocabularyQueue(parsed.data);
      return c.json(data, 200);
    } catch (err) {
      deps.log.error({ err }, 'Unexpected error fetching vocabulary queue');
      return c.json(
        { error: 'fetch_failed', message: 'Failed to fetch vocabulary queue.' },
        500,
      );
    }
  });

  // /vocabulary/terms must be registered before /vocabulary/:termId/* to prevent
  // the literal segment "terms" being captured as a :termId parameter.
  /**
   * POST /api/curation/vocabulary/terms — VOC-004
   * Adds a manual vocabulary term. Returns 201 on success.
   * Propagates 400 (invalid body), 409 (duplicate term), 404 (targetTermId not found).
   */
  router.post('/vocabulary/terms', async (c) => {
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json(
        {
          error: 'invalid_params',
          message: 'Request body must be valid JSON.',
        },
        400,
      );
    }

    const parsed = AddVocabularyTermRequest.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          error: 'invalid_params',
          message: parsed.error.issues[0]?.message ?? 'Invalid request body.',
        },
        400,
      );
    }

    try {
      const result = await handlers.addVocabularyTerm(parsed.data);
      if (result.outcome === 'error') {
        deps.log.warn(
          { errorType: result.errorType },
          'Add vocabulary term error',
        );
        return sendHonoServiceError(c, ERROR_STATUS[result.errorType], result);
      }
      deps.log.info({ termId: result.data.termId }, 'Vocabulary term added');
      return c.json(result.data, 201);
    } catch (err) {
      deps.log.error({ err }, 'Unexpected error adding vocabulary term');
      return c.json(
        {
          error: 'add_term_failed',
          message: 'An unexpected error occurred while adding the term.',
        },
        500,
      );
    }
  });

  /**
   * POST /api/curation/vocabulary/:termId/accept — VOC-002
   * Accepts a vocabulary candidate. Propagates 404 and 409 from Express.
   */
  router.post('/vocabulary/:termId/accept', async (c) => {
    const rawTermId = c.req.param('termId');
    if (!z.uuid().safeParse(rawTermId).success) {
      return c.json(
        { error: 'invalid_params', message: 'termId must be a valid UUID.' },
        400,
      );
    }
    const termId = rawTermId;

    try {
      const result = await handlers.acceptVocabularyCandidate(termId);
      if (result.outcome === 'error') {
        deps.log.warn(
          { errorType: result.errorType, termId },
          'Accept vocabulary candidate error',
        );
        return sendHonoServiceError(c, ERROR_STATUS[result.errorType], result);
      }
      deps.log.info({ termId }, 'Vocabulary candidate accepted');
      return c.json(result.data, 200);
    } catch (err) {
      deps.log.error(
        { err, termId },
        'Unexpected error accepting vocabulary candidate',
      );
      return c.json(
        {
          error: 'accept_failed',
          message: 'An unexpected error occurred while accepting the term.',
        },
        500,
      );
    }
  });

  /**
   * POST /api/curation/vocabulary/:termId/reject — VOC-003
   * Rejects a vocabulary candidate. Propagates 404 and 409 from Express.
   */
  router.post('/vocabulary/:termId/reject', async (c) => {
    const rawTermId = c.req.param('termId');
    if (!z.uuid().safeParse(rawTermId).success) {
      return c.json(
        { error: 'invalid_params', message: 'termId must be a valid UUID.' },
        400,
      );
    }
    const termId = rawTermId;

    try {
      const result = await handlers.rejectVocabularyCandidate(termId);
      if (result.outcome === 'error') {
        deps.log.warn(
          { errorType: result.errorType, termId },
          'Reject vocabulary candidate error',
        );
        return sendHonoServiceError(c, ERROR_STATUS[result.errorType], result);
      }
      deps.log.info({ termId }, 'Vocabulary candidate rejected');
      return c.json(result.data, 200);
    } catch (err) {
      deps.log.error(
        { err, termId },
        'Unexpected error rejecting vocabulary candidate',
      );
      return c.json(
        {
          error: 'reject_failed',
          message: 'An unexpected error occurred while rejecting the term.',
        },
        500,
      );
    }
  });

  return router;
}
