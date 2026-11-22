/**
 * Read the Express error envelope from a Ky HTTPError.
 *
 * Ky 2 reads the response body when it builds an HTTPError and exposes the
 * parsed result as `err.data`. The body stream is already consumed by then, so
 * calling `err.response.json()` no longer works. Use this helper instead.
 */

import type { HTTPError } from 'ky';

export interface ExpressErrorBody {
  error: string;
  message?: string;
}

/**
 * Returns the `{ error, message? }` envelope Express sent, or
 * `{ error: fallbackError }` when the body was empty or not in that shape.
 */
export function readErrorBody(
  err: HTTPError,
  fallbackError: string,
): ExpressErrorBody {
  const data: unknown = err.data;
  if (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof data.error === 'string'
  ) {
    const message =
      'message' in data && typeof data.message === 'string'
        ? data.message
        : undefined;
    return message === undefined
      ? { error: data.error }
      : { error: data.error, message };
  }
  return { error: fallbackError };
}
