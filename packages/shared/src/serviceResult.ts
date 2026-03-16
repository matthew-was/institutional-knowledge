/**
 * Generic service result type.
 *
 * Used by all backend service methods (Tasks 8–19) as the standard return type.
 * The service layer returns a discriminated union — the route layer owns all HTTP
 * decisions (status codes, response bodies) based on the outcome.
 *
 * T — the success data type
 * K — the union of valid errorType strings (defaults to string)
 * E — the type of errorData for structured error payloads (defaults to never for
 *     methods whose error cases carry only a message string)
 */
export type ServiceResult<T, K extends string = string, E = never> =
  | { outcome: 'success'; data: T }
  | { outcome: 'error'; errorType: K; errorMessage: string; errorData?: E };
