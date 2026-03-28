/**
 * Route-layer utilities.
 *
 * Helpers used by route handler files. These are HTTP-layer concerns and are
 * not appropriate for the handler or request layers.
 */

import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Serialise a ServiceResult error branch to the standard error envelope:
 *   { error, message } — when errorData is absent
 *   { error, data }    — when errorData is present
 *
 * Equivalent of sendServiceError in apps/backend/src/routes/routeUtils.ts.
 * Route handlers must call this function rather than inlining c.json() for
 * error responses, so that the envelope shape is enforced in one place.
 *
 * Returns the Hono Response so callers can `return sendHonoServiceError(...)`.
 */
export function sendHonoServiceError<K extends string, E>(
  c: Context,
  status: ContentfulStatusCode,
  result: { errorType: K; errorMessage: string; errorData?: E },
): Response {
  if (result.errorData !== undefined) {
    return c.json({ error: result.errorType, data: result.errorData }, status);
  }
  return c.json(
    { error: result.errorType, message: result.errorMessage },
    status,
  );
}
