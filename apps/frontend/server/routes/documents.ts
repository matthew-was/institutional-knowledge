import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { AppConfig } from '../config';
import {
  createUploadHandlers,
  type UploadErrorType,
  type UploadHandlerResult,
} from '../handlers/uploadHandler';
import type { ExpressClient } from '../requests/client';

export interface DocumentsDeps {
  config: AppConfig;
  expressClient: ExpressClient;
  log: Logger;
}

const ERROR_STATUS: Record<UploadErrorType, ContentfulStatusCode> = {
  unsupported_extension: 422,
  file_too_large: 422,
  whitespace_description: 400,
  not_found: 404,
  duplicate_detected: 409,
  finalized_document: 409,
  missing_file: 400,
  upload_failed: 500,
};

export function createDocumentsRouter(deps: DocumentsDeps): Hono {
  const router = new Hono();
  const handlers = createUploadHandlers(deps.expressClient.documents);

  router.post('/upload', async (c) => {
    const body = await c.req.parseBody();
    const { file, date, description } = body;

    if (
      !(file instanceof File) ||
      typeof date !== 'string' ||
      typeof description !== 'string' ||
      description.length === 0
    ) {
      return c.json(
        {
          error: 'invalid_input',
          message: 'file, date, and description are required.',
        },
        400,
      );
    }

    let result: UploadHandlerResult;
    try {
      result = await handlers.upload({ file, date, description });
    } catch (err) {
      deps.log.error({ err }, 'Unexpected error during upload');
      return c.json(
        { error: 'upload_failed', message: 'An unexpected error occurred.' },
        500,
      );
    }

    if (result.outcome === 'success') {
      deps.log.info({ documentId: result.data.documentId }, 'Upload finalised');
      return c.json(result.data, 201);
    }

    const status = ERROR_STATUS[result.errorType];
    deps.log.warn({ errorType: result.errorType }, 'Upload error');

    if (result.errorType === 'duplicate_detected') {
      return c.json(
        { error: result.errorType, data: { existingRecord: result.errorData } },
        status,
      );
    }

    return c.json(
      { error: result.errorType, message: result.errorMessage },
      status,
    );
  });

  router.delete('/:uploadId', (c) => {
    const rawId = c.req.param('uploadId');
    if (!z.uuid().safeParse(rawId).success) {
      return c.json(
        { error: 'invalid_params', message: 'uploadId must be a valid UUID.' },
        400,
      );
    }
    return c.json({ error: 'not_implemented' }, 501);
  });

  return router;
}
