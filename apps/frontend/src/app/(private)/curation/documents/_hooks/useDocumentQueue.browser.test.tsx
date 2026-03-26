import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useDocumentQueue } from './useDocumentQueue';

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

const sampleDocument = {
  documentId: '01927c3a-5b2e-7000-8000-000000000001',
  description: 'Wedding photograph',
  date: '1987-06-15',
  archiveReference: '1987-06-15 — Wedding photograph',
  flagReason: 'OCR quality below threshold',
  flaggedAt: '2026-03-13T10:00:00Z',
  submitterIdentity: 'Primary Archivist',
  pipelineStatus: 'ocr',
};

describe('useDocumentQueue', () => {
  it('returns items from the API on success', async () => {
    mswServer.use(
      http.get('/api/curation/documents', () =>
        HttpResponse.json(
          { documents: [sampleDocument], total: 1, page: 1, pageSize: 50 },
          { status: 200 },
        ),
      ),
    );

    const { result } = renderHook(() => useDocumentQueue(), { wrapper });

    // Starts in a loading state
    expect(result.current.isLoading).toBe(true);
    expect(result.current.items).toEqual([]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeUndefined();
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.documentId).toBe(
      '01927c3a-5b2e-7000-8000-000000000001',
    );
    expect(result.current.items[0]?.description).toBe('Wedding photograph');
  });

  it('returns an empty items array when API returns no documents', async () => {
    mswServer.use(
      http.get('/api/curation/documents', () =>
        HttpResponse.json(
          { documents: [], total: 0, page: 1, pageSize: 50 },
          { status: 200 },
        ),
      ),
    );

    const { result } = renderHook(() => useDocumentQueue(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeUndefined();
  });

  it('sets error when API returns a non-ok response', async () => {
    mswServer.use(
      http.get('/api/curation/documents', () =>
        HttpResponse.json(
          { error: 'fetch_failed', message: 'Failed to fetch document queue.' },
          { status: 500 },
        ),
      ),
    );

    const { result } = renderHook(() => useDocumentQueue(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeDefined();
    expect(result.current.items).toEqual([]);
  });

  it('exposes mutate for revalidation', async () => {
    mswServer.use(
      http.get('/api/curation/documents', () =>
        HttpResponse.json(
          { documents: [sampleDocument], total: 1, page: 1, pageSize: 50 },
          { status: 200 },
        ),
      ),
    );

    const { result } = renderHook(() => useDocumentQueue(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(typeof result.current.mutate).toBe('function');
  });
});
