/**
 * Route-layer utilities.
 *
 * Helpers used by route handler files. These are HTTP-layer concerns and are
 * not appropriate for the service or repository layers.
 */

import type { Response } from 'express';

/**
 * Serialise a ServiceResult error branch to the standard error envelope:
 *   { error, message } — when errorData is absent
 *   { error, data }    — when errorData is present
 *
 * Implements the Error Response Pattern from development-principles.md.
 * Route handlers must call this function rather than inlining res.json() for
 * error responses, so that the envelope shape is enforced in one place.
 */
export function sendServiceError<K extends string, E>(
  res: Response,
  status: number,
  result: { errorType: K; errorMessage: string; errorData?: E },
): void {
  if (result.errorData !== undefined) {
    res
      .status(status)
      .json({ error: result.errorType, data: result.errorData });
  } else {
    res
      .status(status)
      .json({ error: result.errorType, message: result.errorMessage });
  }
}
