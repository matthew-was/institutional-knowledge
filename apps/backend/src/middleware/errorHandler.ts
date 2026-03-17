/**
 * Global error handler middleware.
 *
 * Catches unexpected errors forwarded via next(err) from route handlers.
 * Expected domain errors (not found, conflict, validation) are handled in the
 * route layer and never reach this handler.
 * Logs the full error via Pino. Returns a generic 500 — no stack trace in response.
 *
 * No document content or credentials are logged — only identifiers and status.
 */

import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

export function createErrorHandler(log: Logger) {
  // Express error handlers must have exactly 4 parameters — the unused _next is required
  // for Express to recognise this as an error handler. The _ prefix suppresses the
  // noUnusedVariables lint rule.
  return function errorHandler(
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void {
    log.error({ reqId: req.id, err }, 'Unhandled error');
    res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  };
}
