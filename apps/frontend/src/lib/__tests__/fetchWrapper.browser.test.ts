import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWrapper } from '../fetchWrapper.js';

describe('fetchWrapper', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets content-type: application/json on every call', async () => {
    await fetchWrapper('/api/documents');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [_url, init] = fetchSpy.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(init.headers.get('content-type')).toBe('application/json');
  });

  it('prepends the basePath to the given path', async () => {
    await fetchWrapper('/api/documents', { basePath: 'http://localhost:3000' });

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/documents');
  });

  it('uses an empty base path by default', async () => {
    await fetchWrapper('/api/some-route');

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/some-route');
  });

  it('does not override a caller-supplied content-type header', async () => {
    await fetchWrapper('/api/upload', {
      headers: { 'content-type': 'multipart/form-data' },
    });

    const [_url, init] = fetchSpy.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(init.headers.get('content-type')).toBe('multipart/form-data');
  });

  it('passes additional init options through to fetch', async () => {
    await fetchWrapper('/api/documents', { method: 'POST', body: '{}' });

    const [_url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
  });

  it('does not set content-type when body is a FormData instance', async () => {
    const formData = new FormData();
    formData.append('file', new File(['content'], 'test.pdf'));

    await fetchWrapper('/api/upload', { method: 'POST', body: formData });

    const [_url, init] = fetchSpy.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(init.headers.get('content-type')).toBeNull();
  });
});
