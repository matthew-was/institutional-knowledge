import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useVocabularyQueue } from './useVocabularyQueue';

const mswServer = setupServer();

beforeAll(() => mswServer.listen());
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

/**
 * Wrap each renderHook in a fresh SWRConfig with an isolated Map cache
 * so that cached data from one test does not bleed into the next.
 */
function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
  );
}

const sampleCandidate = {
  termId: '01927c3a-5b2e-7000-8000-000000000001',
  term: 'Smith Estate',
  category: 'Organisation',
  confidence: 0.87,
  description: null,
  sourceDocumentDescription: 'Estate inventory 1952',
  sourceDocumentDate: '1952-01-01',
  createdAt: '2026-03-13T10:00:00Z',
};

describe('useVocabularyQueue', () => {
  it('fetches candidates on mount and returns them', async () => {
    mswServer.use(
      http.get('/api/curation/vocabulary', () =>
        HttpResponse.json(
          {
            candidates: [sampleCandidate],
            total: 1,
            page: 1,
            pageSize: 50,
          },
          { status: 200 },
        ),
      ),
    );

    const { result } = renderHook(() => useVocabularyQueue(), { wrapper });

    // Starts in a loading state
    expect(result.current.isLoading).toBe(true);
    expect(result.current.candidates).toEqual([]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeUndefined();
    expect(result.current.candidates).toHaveLength(1);
    expect(result.current.candidates[0]?.termId).toBe(
      '01927c3a-5b2e-7000-8000-000000000001',
    );
    expect(result.current.candidates[0]?.term).toBe('Smith Estate');
  });

  it('returns an empty candidates array when the queue is empty', async () => {
    mswServer.use(
      http.get('/api/curation/vocabulary', () =>
        HttpResponse.json(
          { candidates: [], total: 0, page: 1, pageSize: 50 },
          { status: 200 },
        ),
      ),
    );

    const { result } = renderHook(() => useVocabularyQueue(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.candidates).toEqual([]);
    expect(result.current.error).toBeUndefined();
  });

  it('sets error when the API returns a non-ok response', async () => {
    mswServer.use(
      http.get('/api/curation/vocabulary', () =>
        HttpResponse.json(
          {
            error: 'fetch_failed',
            message: 'Failed to fetch vocabulary queue.',
          },
          { status: 500 },
        ),
      ),
    );

    const { result } = renderHook(() => useVocabularyQueue(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeDefined();
    expect(result.current.candidates).toEqual([]);
  });

  it('re-fetches when mutate is called', async () => {
    let requestCount = 0;

    mswServer.use(
      http.get('/api/curation/vocabulary', () => {
        requestCount += 1;
        return HttpResponse.json(
          {
            candidates: [sampleCandidate],
            total: 1,
            page: 1,
            pageSize: 50,
          },
          { status: 200 },
        );
      }),
    );

    const { result } = renderHook(() => useVocabularyQueue(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(requestCount).toBe(1);

    await result.current.mutate();

    expect(requestCount).toBe(2);
  });
});
