/**
 * Zod request validation middleware factory.
 *
 * Usage:
 *   router.post('/documents', validate({ body: MyBodySchema }), handler)
 *
 * Validates req.body, req.params, and req.query against the provided Zod
 * schemas (all optional). On failure, returns 400 with structured error
 * details. On success, attaches the parsed (type-safe, coerced) values back
 * to req.body, req.params, and req.query.
 */

import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

interface ValidateSchemas {
  body?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
}

export function validate(schemas: ValidateSchemas) {
  return function validationMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    // Collect issues from all schemas before responding so the caller receives
    // all validation problems in a single 400 rather than one failure at a time.
    const errors: z.core.$ZodIssue[] = [];

    if (schemas.body !== undefined) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        errors.push(...result.error.issues);
      } else {
        req.body = result.data;
      }
    }

    if (schemas.params !== undefined) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        errors.push(...result.error.issues);
      } else {
        // Cast required: Zod returns `unknown`, but Express types req.params as
        // ParamsDictionary (Record<string, string>). The schema author is
        // responsible for ensuring the Zod schema matches that shape.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        req.params = result.data as typeof req.params;
      }
    }

    if (schemas.query !== undefined) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        errors.push(...result.error.issues);
      } else {
        // Cast required: Zod returns `unknown`, but Express types req.query as
        // ParsedQs (a recursive string/array type). Same responsibility as above.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        req.query = result.data as typeof req.query;
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Request validation failed',
        details: errors,
      });
      return;
    }

    next();
  };
}
