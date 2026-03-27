/**
 * Tier 2 UI behaviour tests — useAcceptCandidate hook.
 *
 * MSW intercepts at the Hono API route boundary:
 *   POST /api/curation/vocabulary/:termId/accept
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { useAcceptCandidate } from './useAcceptCandidate';

const mswServer = setupServer();

beforeAll(() => mswServer.listen());
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
  );
}

const termId = '01927c3a-5b2e-7000-8000-000000000001';
const acceptUrl = `/api/curation/vocabulary/${termId}/accept`;

describe('useAcceptCandidate', () => {
  it('triggers a POST to the accept endpoint and calls onSuccess on 200', async () => {
    const onSuccess = vi.fn();

    mswServer.use(
      http.post(acceptUrl, () =>
        HttpResponse.json(
          { termId, term: 'Smith Estate', source: 'candidate_accepted' },
          { status: 200 },
        ),
      ),
    );

    const { result } = renderHook(() => useAcceptCandidate(termId, onSuccess), {
      wrapper,
    });

    await act(async () => {
      await result.current.handleAccept();
    });

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
  });

  it('shows loading state (isAccepting) while the request is in flight', async () => {
    const onSuccess = vi.fn();
    let resolveRequest!: () => void;

    mswServer.use(
      http.post(
        acceptUrl,
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = () =>
              resolve(
                HttpResponse.json(
                  {
                    termId,
                    term: 'Smith Estate',
                    source: 'candidate_accepted',
                  },
                  { status: 200 },
                ),
              );
          }),
      ),
    );

    const { result } = renderHook(() => useAcceptCandidate(termId, onSuccess), {
      wrapper,
    });

    // Start the mutation without awaiting
    act(() => {
      result.current.handleAccept().catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isAccepting).toBe(true));

    // Resolve the request
    act(() => resolveRequest());

    await waitFor(() => expect(result.current.isAccepting).toBe(false));
  });

  it('sets error message when the API returns a non-ok response', async () => {
    const onSuccess = vi.fn();

    mswServer.use(
      http.post(acceptUrl, () =>
        HttpResponse.json(
          { error: 'not_found', message: 'Term not found.' },
          { status: 404 },
        ),
      ),
    );

    const { result } = renderHook(() => useAcceptCandidate(termId, onSuccess), {
      wrapper,
    });

    await act(async () => {
      await result.current.handleAccept();
    });

    expect(onSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.error).toBe('Term not found.'));
  });

  it('re-fetches the queue (calls onSuccess) after a successful accept', async () => {
    const onSuccess = vi.fn();

    mswServer.use(
      http.post(acceptUrl, () =>
        HttpResponse.json(
          { termId, term: 'Smith Estate', source: 'candidate_accepted' },
          { status: 200 },
        ),
      ),
    );

    const { result } = renderHook(() => useAcceptCandidate(termId, onSuccess), {
      wrapper,
    });

    await act(async () => {
      await result.current.handleAccept();
    });

    // onSuccess triggers the queue re-fetch in the parent component
    expect(onSuccess).toHaveBeenCalledOnce();
  });
});
