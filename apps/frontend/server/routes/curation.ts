import {
  DocumentQueueParams,
  UpdateDocumentMetadataRequest,
} from '@institutional-knowledge/shared';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppConfig } from '../config';
import {
  clearDocumentFlagHandler,
  fetchDocumentDetailHandler,
  fetchDocumentQueueHandler,
  updateDocumentMetadataHandler,
} from '../handlers/curationHandler';
import type { ExpressClient } from '../requests/client';

export interface CurationDeps {
  config: AppConfig;
  expressClient: ExpressClient;
}

/**
 * Error types that may be propagated from Express for the clear-flag operation.
 * Maps to the HTTP status codes we forward to the browser.
 */
type ClearFlagErrorType = 'not_found' | 'no_active_flag';

const CLEAR_FLAG_ERROR_STATUS: Record<ClearFlagErrorType, number> = {
  not_found: 404,
  no_active_flag: 409,
};

export function createCurationRouter(deps: CurationDeps): Hono {
  const router = new Hono();

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
      const data = await fetchDocumentQueueHandler(
        deps.expressClient.curation,
        parsed.data,
      );
      return c.json(data, 200);
    } catch {
      return c.json(
        { error: 'fetch_failed', message: 'Failed to fetch document queue.' },
        500,
      );
    }
  });

  /**
   * POST /api/curation/documents/:id/clear-flag — DOC-008
   * Clears the review flag on a document. Propagates 404 and 409 from Express.
   */
  router.post('/documents/:id/clear-flag', async (c) => {
    const documentId = c.req.param('id');

    try {
      const data = await clearDocumentFlagHandler(
        deps.expressClient.curation,
        documentId,
      );
      return c.json(data, 200);
    } catch (err) {
      // Inspect the error to propagate 404/409 from Express faithfully.
      // HTTPError is thrown by Ky on non-2xx responses.
      if (isHttpError(err)) {
        const status = err.response.status;

        if (status === 404) {
          const body = await err.response
            .json<{ error: string; message?: string }>()
            .catch(() => ({ error: 'not_found', message: undefined }));
          return c.json(
            {
              error: body.error,
              message: body.message ?? 'Document not found.',
            },
            CLEAR_FLAG_ERROR_STATUS.not_found as ContentfulStatusCode,
          );
        }

        if (status === 409) {
          const body = await err.response
            .json<{ error: string; message?: string }>()
            .catch(() => ({ error: 'no_active_flag', message: undefined }));
          return c.json(
            {
              error: body.error,
              message: body.message ?? 'Document has no active flag.',
            },
            CLEAR_FLAG_ERROR_STATUS.no_active_flag as ContentfulStatusCode,
          );
        }
      }

      return c.json(
        {
          error: 'clear_flag_failed',
          message: 'An unexpected error occurred while clearing the flag.',
        },
        500,
      );
    }
  });

  /**
   * GET /api/curation/documents/:id — DOC-007
   * Fetches document detail from Express and returns it as-is. Propagates 404.
   */
  router.get('/documents/:id', async (c) => {
    const documentId = c.req.param('id');

    try {
      const data = await fetchDocumentDetailHandler(
        deps.expressClient.curation,
        documentId,
      );
      return c.json(data, 200);
    } catch (err) {
      if (isHttpError(err) && err.response.status === 404) {
        const body = await err.response
          .json<{ error: string; message?: string }>()
          .catch(() => ({ error: 'not_found', message: undefined }));
        return c.json(
          { error: body.error, message: body.message ?? 'Document not found.' },
          404 as ContentfulStatusCode,
        );
      }

      return c.json(
        {
          error: 'fetch_failed',
          message: 'Failed to fetch document detail.',
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
    const documentId = c.req.param('id');

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
      const data = await updateDocumentMetadataHandler(
        deps.expressClient.curation,
        documentId,
        parsed.data,
      );
      return c.json(data, 200);
    } catch (err) {
      if (isHttpError(err)) {
        const status = err.response.status;

        if (status === 404) {
          const body = await err.response
            .json<{ error: string; message?: string }>()
            .catch(() => ({ error: 'not_found', message: undefined }));
          return c.json(
            {
              error: body.error,
              message: body.message ?? 'Document not found.',
            },
            404 as ContentfulStatusCode,
          );
        }

        if (status === 400) {
          const body = await err.response
            .json<{ error: string; message?: string }>()
            .catch(() => ({
              error: 'invalid_params',
              message: undefined,
            }));
          return c.json(
            {
              error: body.error,
              message: body.message ?? 'Invalid request.',
            },
            400 as ContentfulStatusCode,
          );
        }
      }

      return c.json(
        {
          error: 'update_failed',
          message: 'An unexpected error occurred while updating metadata.',
        },
        500,
      );
    }
  });

  router.get('/vocabulary', (c) => c.json({ error: 'not_implemented' }, 501));
  // /vocabulary/terms must be registered before /vocabulary/:termId/* to prevent
  // the literal segment "terms" being captured as a :termId parameter.
  router.post('/vocabulary/terms', (c) =>
    c.json({ error: 'not_implemented' }, 501),
  );
  router.post('/vocabulary/:termId/accept', (c) =>
    c.json({ error: 'not_implemented' }, 501),
  );
  router.post('/vocabulary/:termId/reject', (c) =>
    c.json({ error: 'not_implemented' }, 501),
  );

  return router;
}

/**
 * Type guard for Ky HTTPError — checks for a `response` property with a
 * `status` field, which is the shape Ky uses for HTTP errors.
 */
function isHttpError(
  err: unknown,
): err is { response: { status: number; json: <T>() => Promise<T> } } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    typeof (err as { response: unknown }).response === 'object' &&
    (err as { response: unknown }).response !== null &&
    'status' in (err as { response: { status: unknown } }).response
  );
}
