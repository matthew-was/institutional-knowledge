/**
 * Tier 1 — Request function contract sweep.
 *
 * Asserts the outbound Express contract for every request function across
 * documents.ts and curation.ts. Each test verifies:
 *
 *   - The correct HTTP method was used (get/post/patch/delete)
 *   - The correct URL was constructed (including path parameters)
 *   - Any request body or query parameters are structured as the contract requires
 *
 * The `x-internal-key` header is set once in the Ky instance factory
 * (`createExpressClient` → `ky.create({ headers: { 'x-internal-key': ... } })`).
 * It is not passed per-request — Ky merges it automatically. A dedicated test
 * below asserts that `ky.create` is called with `x-internal-key` in headers,
 * which is the only layer where this assertion is meaningful.
 *
 * Tooling: Vitest. No MSW, no running server (pure unit test — Tier 1).
 */

import type { KyInstance } from 'ky';
import ky from 'ky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExpressClient } from '../client';
import { createCurationRequests } from '../curation';
import { createDocumentsRequests } from '../documents';

vi.mock('ky');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wraps a resolved value in a ResponsePromise-like object.
 * The request functions call `.json()` on whatever the Ky method returns.
 */
function makeResponsePromise(value: unknown) {
  return { json: () => Promise.resolve(value) };
}

/**
 * Returns a minimal mock KyInstance that records calls.
 *
 * Each method spy is set up per-test using `mockReturnValue` so that the spy
 * state is fresh and the return value can carry test-specific data.
 */
function makeMockHttp(): {
  http: KyInstance;
  spies: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
} {
  const spies = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  // Cast: we only need the four HTTP methods used by the request functions.
  return { http: spies as unknown as KyInstance, spies };
}

// ---------------------------------------------------------------------------
// createExpressClient — x-internal-key header contract
// ---------------------------------------------------------------------------

describe('createExpressClient — x-internal-key header', () => {
  it('passes x-internal-key to ky.create so it is sent on every outbound call', () => {
    const mockCreate = vi.mocked(ky.create);
    mockCreate.mockReturnValue({} as KyInstance);

    const config = {
      server: { host: 'localhost', port: 3000 },
      express: {
        baseUrl: 'http://localhost:4000',
        internalKey: 'test-secret-key',
      },
      upload: { maxFileSizeMb: 50, acceptedExtensions: ['.pdf'] },
    };

    createExpressClient(config as Parameters<typeof createExpressClient>[0]);

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArg = mockCreate.mock.calls[0]?.[0];
    expect(
      (callArg as { headers?: Record<string, string> })?.headers?.[
        'x-internal-key'
      ],
    ).toBe('test-secret-key');
  });
});

// ---------------------------------------------------------------------------
// documents.ts — DOC-001 to DOC-005
// ---------------------------------------------------------------------------

describe('documents.ts request functions', () => {
  let http: KyInstance;
  let spies: ReturnType<typeof makeMockHttp>['spies'];

  beforeEach(() => {
    const mock = makeMockHttp();
    http = mock.http;
    spies = mock.spies;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // DOC-001
  it('initiateUpload — POST api/documents/initiate with filename, contentType, fileSizeBytes, date, description', async () => {
    spies.post.mockReturnValue(
      makeResponsePromise({ uploadId: 'uid-1', status: 'initiated' }),
    );
    const requests = createDocumentsRequests(http);

    const body = {
      filename: '1987-06-15 - wedding.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: 204800,
      date: '1987-06-15',
      description: 'Wedding photograph',
    };

    const result = await requests.initiateUpload(body);

    expect(spies.post).toHaveBeenCalledOnce();
    const [url, options] = spies.post.mock.calls[0] as [
      string,
      { json?: unknown },
    ];
    expect(url).toBe('api/documents/initiate');
    expect(options?.json).toEqual(body);

    // Falsifiable: confirm the success branch was returned
    expect(result.outcome).toBe('success');
  });

  // DOC-002
  it('uploadFile — POST api/documents/:uploadId/upload with FormData as body (not json)', async () => {
    spies.post.mockReturnValue(
      makeResponsePromise({
        uploadId: 'uid-1',
        status: 'uploaded',
        fileHash: 'abc123',
      }),
    );
    const requests = createDocumentsRequests(http);
    const formData = new FormData();
    formData.append('file', new Blob(['content']), 'test.pdf');

    const result = await requests.uploadFile('uid-1', formData);

    expect(spies.post).toHaveBeenCalledOnce();
    const [url, options] = spies.post.mock.calls[0] as [
      string,
      { body?: unknown; json?: unknown },
    ];
    expect(url).toBe('api/documents/uid-1/upload');
    // FormData is passed as `body`, not `json` — Ky sets the multipart boundary
    expect(options?.body).toBe(formData);
    expect(options?.json).toBeUndefined();

    expect(result.outcome).toBe('success');
  });

  // DOC-003
  it('finalizeUpload — POST api/documents/:uploadId/finalize with no body', async () => {
    spies.post.mockReturnValue(
      makeResponsePromise({
        documentId: 'doc-1',
        description: 'Wedding photograph',
        date: '1987-06-15',
        archiveReference: '1987-06-15 — Wedding photograph',
        status: 'finalized',
      }),
    );
    const requests = createDocumentsRequests(http);

    const result = await requests.finalizeUpload('uid-1');

    expect(spies.post).toHaveBeenCalledOnce();
    const [url, options] = spies.post.mock.calls[0] as [
      string,
      Record<string, unknown> | undefined,
    ];
    expect(url).toBe('api/documents/uid-1/finalize');
    // No body should be passed for finalize
    expect(options?.json).toBeUndefined();
    expect(options?.body).toBeUndefined();

    expect(result.outcome).toBe('success');
  });

  // DOC-005
  it('deleteUpload — DELETE api/documents/:uploadId', async () => {
    spies.delete.mockReturnValue(makeResponsePromise(null));
    const requests = createDocumentsRequests(http);

    await requests.deleteUpload('uid-1');

    expect(spies.delete).toHaveBeenCalledOnce();
    const [url] = spies.delete.mock.calls[0] as [string];
    expect(url).toBe('api/documents/uid-1');
  });
});

// ---------------------------------------------------------------------------
// curation.ts — DOC-006 to DOC-009 and VOC-001 to VOC-004
// ---------------------------------------------------------------------------

describe('curation.ts request functions', () => {
  let http: KyInstance;
  let spies: ReturnType<typeof makeMockHttp>['spies'];

  beforeEach(() => {
    const mock = makeMockHttp();
    http = mock.http;
    spies = mock.spies;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // DOC-006
  it('fetchDocumentQueue — GET api/curation/documents with optional page/pageSize params', async () => {
    spies.get.mockReturnValue(
      makeResponsePromise({ items: [], total: 0, page: 1, pageSize: 50 }),
    );
    const requests = createCurationRequests(http);

    await requests.fetchDocumentQueue({ page: 2, pageSize: 25 });

    expect(spies.get).toHaveBeenCalledOnce();
    const [url, options] = spies.get.mock.calls[0] as [
      string,
      { searchParams?: unknown },
    ];
    expect(url).toBe('api/curation/documents');
    expect(options?.searchParams).toEqual({ page: 2, pageSize: 25 });
  });

  // DOC-007
  it('fetchDocumentDetail — GET api/documents/:id', async () => {
    spies.get.mockReturnValue(
      makeResponsePromise({
        documentId: 'doc-1',
        description: 'Test',
        date: null,
        status: 'pending_review',
      }),
    );
    const requests = createCurationRequests(http);

    const result = await requests.fetchDocumentDetail('doc-1');

    expect(spies.get).toHaveBeenCalledOnce();
    const [url] = spies.get.mock.calls[0] as [string];
    expect(url).toBe('api/documents/doc-1');

    expect(result.outcome).toBe('success');
  });

  // DOC-008
  it('clearDocumentFlag — POST api/documents/:id/clear-flag with no body', async () => {
    spies.post.mockReturnValue(
      makeResponsePromise({ documentId: 'doc-1', status: 'active' }),
    );
    const requests = createCurationRequests(http);

    const result = await requests.clearDocumentFlag('doc-1');

    expect(spies.post).toHaveBeenCalledOnce();
    const [url, options] = spies.post.mock.calls[0] as [
      string,
      Record<string, unknown> | undefined,
    ];
    expect(url).toBe('api/documents/doc-1/clear-flag');
    expect(options?.json).toBeUndefined();

    expect(result.outcome).toBe('success');
  });

  // DOC-009
  it('updateDocumentMetadata — PATCH api/documents/:id/metadata with patch body', async () => {
    spies.patch.mockReturnValue(
      makeResponsePromise({
        documentId: 'doc-1',
        description: 'Updated description',
      }),
    );
    const requests = createCurationRequests(http);

    const patch = { description: 'Updated description', people: ['Alice'] };

    const result = await requests.updateDocumentMetadata('doc-1', patch);

    expect(spies.patch).toHaveBeenCalledOnce();
    const [url, options] = spies.patch.mock.calls[0] as [
      string,
      { json?: unknown },
    ];
    expect(url).toBe('api/documents/doc-1/metadata');
    expect(options?.json).toEqual(patch);

    expect(result.outcome).toBe('success');
  });

  // VOC-001
  it('fetchVocabulary — GET api/curation/vocabulary with optional page/pageSize params', async () => {
    spies.get.mockReturnValue(
      makeResponsePromise({ items: [], total: 0, page: 1, pageSize: 50 }),
    );
    const requests = createCurationRequests(http);

    await requests.fetchVocabulary({ page: 1, pageSize: 10 });

    expect(spies.get).toHaveBeenCalledOnce();
    const [url, options] = spies.get.mock.calls[0] as [
      string,
      { searchParams?: unknown },
    ];
    expect(url).toBe('api/curation/vocabulary');
    expect(options?.searchParams).toEqual({ page: 1, pageSize: 10 });
  });

  // VOC-002
  it('acceptTerm — POST api/curation/vocabulary/:termId/accept with no body', async () => {
    const termId = 'term-uuid-1';
    spies.post.mockReturnValue(
      makeResponsePromise({
        termId,
        term: 'paddock',
        status: 'accepted',
      }),
    );
    const requests = createCurationRequests(http);

    const result = await requests.acceptTerm(termId);

    expect(spies.post).toHaveBeenCalledOnce();
    const [url, options] = spies.post.mock.calls[0] as [
      string,
      Record<string, unknown> | undefined,
    ];
    expect(url).toBe(`api/curation/vocabulary/${termId}/accept`);
    expect(options?.json).toBeUndefined();

    expect(result.outcome).toBe('success');
  });

  // VOC-003
  it('rejectTerm — POST api/curation/vocabulary/:termId/reject with no body', async () => {
    const termId = 'term-uuid-2';
    spies.post.mockReturnValue(
      makeResponsePromise({
        termId,
        term: 'paddock',
        status: 'rejected',
      }),
    );
    const requests = createCurationRequests(http);

    const result = await requests.rejectTerm(termId);

    expect(spies.post).toHaveBeenCalledOnce();
    const [url, options] = spies.post.mock.calls[0] as [
      string,
      Record<string, unknown> | undefined,
    ];
    expect(url).toBe(`api/curation/vocabulary/${termId}/reject`);
    expect(options?.json).toBeUndefined();

    expect(result.outcome).toBe('success');
  });

  // VOC-004
  it('addTerm — POST api/curation/vocabulary/terms with term, category, and optional fields in body', async () => {
    spies.post.mockReturnValue(
      makeResponsePromise({
        termId: 'new-term-uuid',
        term: 'north field',
        category: 'land_reference',
        status: 'accepted',
      }),
    );
    const requests = createCurationRequests(http);

    const body = {
      term: 'north field',
      category: 'land_reference',
      description: 'The northern pasture',
      aliases: ['top field'],
    };

    const result = await requests.addTerm(body);

    expect(spies.post).toHaveBeenCalledOnce();
    const [url, options] = spies.post.mock.calls[0] as [
      string,
      { json?: unknown },
    ];
    expect(url).toBe('api/curation/vocabulary/terms');
    expect(options?.json).toEqual(body);

    expect(result.outcome).toBe('success');
  });
});
