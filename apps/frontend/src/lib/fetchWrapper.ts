/**
 * Thin project utility wrapping plain fetch.
 *
 * Sets consistent content-type: application/json and prepends the given base
 * path on every call. Passed as the fetcher argument to useSWR and useSWRMutation.
 *
 * Must not contain any Next.js or Hono imports.
 */

export interface FetchWrapperOptions extends RequestInit {
  basePath?: string;
}

export async function fetchWrapper(
  path: string,
  { basePath = '', ...init }: FetchWrapperOptions = {},
): Promise<Response> {
  const url = `${basePath}${path}`;
  const headers = new Headers(init.headers);

  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return fetch(url, { ...init, headers });
}
