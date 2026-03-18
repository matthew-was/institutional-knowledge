/**
 * Zod request validation middleware factory.
 *
 * Usage:
 *   router.post('/documents', validate({ body: MyBodySchema }), handler)
 *
 * Validates req.body, req.params, and req.query against the provided Zod
 * schemas (all optional). On failure, returns 400 with structured error
 * details. On success, writes the parsed (coerced) values back to req.body,
 * req.params, and req.query.
 *
 * Why write back? Route handlers cast the request fields directly
 * (e.g. `req.query as DocumentQueueParams`). That cast is only safe if the
 * field contains the Zod-parsed output — not the raw string values from the
 * URL. For example, `z.coerce.number()` turns `"1"` into `1`; without
 * write-back the handler would cast a string and the type would be a lie.
 *
 * Why Object.defineProperty for req.query? In some environments (supertest,
 * raw IncomingMessage) req.query is a getter-only property on the prototype.
 * Direct assignment throws a TypeError. Object.defineProperty creates an own
 * property on the instance, shadowing the getter — the same mechanism Express
 * uses internally during normal request setup.
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
        // req.query is a getter-only property in some environments (e.g. supertest).
        // Use Object.defineProperty to safely overwrite it with the parsed data.
        Object.defineProperty(req, 'query', {
          value: result.data,
          writable: true,
          configurable: true,
        });
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
