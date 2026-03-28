# Task 13a Implementation Notes — Frontend Server Pattern Normalisation

## Background

The frontend Hono custom server was built incrementally across Tasks 2–13. The documents
route (Task 6) established the correct patterns: `ServiceResult` in the request layer,
clean `outcome` branching in routes, logging at all levels, and handler composition.
The curation routes (Tasks 8–13) drifted from this as each task built on the previous.

This document records the detailed implementation guidance for the implementer.

## Root cause of the divergence

The `documents.ts` request functions use `ServiceResult` — they catch `HTTPError`, parse
the response body, and return a structured `{ outcome: 'error', errorType, errorMessage }`
branch. The route layer never sees raw HTTP errors and only branches on `result.outcome`.

The `curation.ts` request functions return the raw response type and let `HTTPError`
propagate. Every curation route handler therefore needs a try/catch block, an `isHttpError`
type guard, manual status code inspection (`if (status === 404)`), and inline JSON body
reads. This is 20–30 lines of boilerplate per route that should live in the request layer.

---

## Detailed change instructions

### Change 1: `server/routes/routeUtils.ts` (new file)

Create an equivalent of `apps/backend/src/routes/routeUtils.ts`. The key difference is
that Hono's `c.json()` returns a `Response` object, whereas Express's `res.json()` is
`void`. The function must return the `Response`.

Reference: `apps/backend/src/routes/routeUtils.ts` — `sendServiceError` function.

```ts
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Serialise a ServiceResult error branch to the standard error envelope.
 * Equivalent of sendServiceError in apps/backend/src/routes/routeUtils.ts.
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
  return c.json({ error: result.errorType, message: result.errorMessage }, status);
}
```

---

### Change 2: `server/requests/curation.ts`

**Add** `CurationErrorType` union export at the top (after imports):

```ts
export type CurationErrorType =
  | 'not_found'
  | 'no_active_flag'
  | 'invalid_params'
  | 'invalid_state';
```

**Add** imports:

```ts
import { HTTPError } from 'ky';
import type { ServiceResult } from '@institutional-knowledge/shared';
```

**Change the interface** — update return types for 5 methods:

```ts
fetchDocumentDetail(documentId: string): Promise<ServiceResult<DocumentDetailResponse, CurationErrorType>>;
clearDocumentFlag(documentId: string): Promise<ServiceResult<ClearFlagResponse, CurationErrorType>>;
updateDocumentMetadata(documentId, patch): Promise<ServiceResult<UpdateDocumentMetadataResponse, CurationErrorType>>;
acceptTerm(termId: string): Promise<ServiceResult<AcceptCandidateResponse, CurationErrorType>>;
rejectTerm(termId: string): Promise<ServiceResult<RejectCandidateResponse, CurationErrorType>>;
```

`fetchDocumentQueue` and `fetchVocabulary` remain unchanged — they return plain types and
throw on failure. There is no business-logic error variant for list operations.

**Change the implementation** — wrap each of the 5 methods. Use the same pattern as
`initiateUpload` in `requests/documents.ts`:

```ts
async fetchDocumentDetail(documentId: string): Promise<ServiceResult<DocumentDetailResponse, CurationErrorType>> {
  try {
    const data = await http.get(`api/documents/${documentId}`).json<DocumentDetailResponse>();
    return { outcome: 'success', data };
  } catch (err) {
    if (err instanceof HTTPError && err.response.status < 500) {
      const body = await err.response
        .json<{ error: string; message?: string }>()
        .catch((): { error: string; message?: string } => ({ error: 'not_found' }));
      return { outcome: 'error', errorType: body.error as CurationErrorType, errorMessage: body.message ?? body.error };
    }
    throw err;
  }
},
```

Apply identically to `clearDocumentFlag`, `updateDocumentMetadata`, `acceptTerm`,
`rejectTerm`.

---

### Change 3: `server/requests/documents.ts`

Remove `findById`, `clearFlag`, and `patchMetadata` entirely — from both the
`DocumentsRequests` interface and the factory object.

These are `throw new Error('not_implemented')` stubs. DOC-007/008/009 are already fully
implemented in `requests/curation.ts` — these stubs are duplicates from an earlier design
that were never connected to any route or hook.

Also remove the now-unused imports: `ClearFlagResponse`, `DocumentDetailResponse`,
`UpdateDocumentMetadataRequest`, `UpdateDocumentMetadataResponse`.

---

### Change 4: `server/handlers/curationHandler.ts`

Replace the 7 individual exported functions with a single factory. The `requests` object
is closed over at construction; each method only takes its operation-specific params.

The method names drop the `Handler` suffix — the factory name already provides the context.

```ts
export function createCurationHandlers(requests: CurationRequests) {
  return {
    fetchDocumentQueue(params?: DocumentQueueParams): Promise<DocumentQueueResponse> {
      return requests.fetchDocumentQueue(params);
    },
    fetchDocumentDetail(documentId: string): Promise<ServiceResult<DocumentDetailResponse, CurationErrorType>> {
      return requests.fetchDocumentDetail(documentId);
    },
    clearDocumentFlag(documentId: string): Promise<ServiceResult<ClearFlagResponse, CurationErrorType>> {
      return requests.clearDocumentFlag(documentId);
    },
    updateDocumentMetadata(
      documentId: string,
      patch: UpdateDocumentMetadataRequest,
    ): Promise<ServiceResult<UpdateDocumentMetadataResponse, CurationErrorType>> {
      return requests.updateDocumentMetadata(documentId, patch);
    },
    fetchVocabularyQueue(params?: VocabularyQueueParams): Promise<VocabularyQueueResponse> {
      return requests.fetchVocabulary(params);
    },
    acceptVocabularyCandidate(termId: string): Promise<ServiceResult<AcceptCandidateResponse, CurationErrorType>> {
      return requests.acceptTerm(termId);
    },
    rejectVocabularyCandidate(termId: string): Promise<ServiceResult<RejectCandidateResponse, CurationErrorType>> {
      return requests.rejectTerm(termId);
    },
  };
}
```

Import `CurationErrorType` from `'../requests/curation'`. Import `ServiceResult` from
shared. Remove all the old import types that are no longer individually needed.

---

### Change 5: `server/handlers/uploadHandler.ts`

Wrap the existing function body in a factory. Internal logic is unchanged — only the
outer structure changes.

```ts
export function createUploadHandlers(requests: DocumentsRequests) {
  return {
    async upload(
      payload: { file: File; date: string; description: string },
    ): Promise<UploadHandlerResult> {
      // ... existing body of uploadHandler unchanged ...
    },
  };
}
```

Remove the top-level `export async function uploadHandler(...)`. Keep `UploadHandlerResult`
and the `export type { UploadErrorType }` re-export.

---

### Change 6: `server/routes/curation.ts`

**`CurationDeps` interface** — add `log: Logger`:

```ts
export interface CurationDeps {
  config: AppConfig;
  expressClient: ExpressClient;
  log: Logger;
}
```

**Top of `createCurationRouter` factory** — create handlers once:

```ts
export function createCurationRouter(deps: CurationDeps): Hono {
  const router = new Hono();
  const handlers = createCurationHandlers(deps.expressClient.curation);
  // ...
```

**Replace fragmented error maps** with a single map typed as `ContentfulStatusCode`
(eliminates all `as ContentfulStatusCode` casts):

```ts
const ERROR_STATUS: Record<CurationErrorType, ContentfulStatusCode> = {
  not_found: 404,
  no_active_flag: 409,
  invalid_params: 400,
  invalid_state: 409,
};
```

**Route param validation** — add inline Zod UUID check at the top of each route that
takes `:id` or `:termId`. Use `z.uuid()` (no need for a full schema object):

```ts
router.post('/documents/:id/clear-flag', async (c) => {
  const rawId = c.req.param('id');
  if (!z.uuid().safeParse(rawId).success) {
    return c.json({ error: 'invalid_params', message: 'id must be a valid UUID.' }, 400);
  }
  const id = rawId; // now known to be a UUID string
  // ...
```

**Route bodies** — replace all `try { ... } catch (err) { if (isHttpError(err)) { ... } }`
blocks with `result.outcome` branching. Template:

```ts
router.post('/documents/:id/clear-flag', async (c) => {
  // ... UUID check ...
  try {
    const result = await handlers.clearDocumentFlag(id);
    if (result.outcome === 'error') {
      deps.log.warn({ errorType: result.errorType, documentId: id }, 'Clear flag error');
      return sendHonoServiceError(c, ERROR_STATUS[result.errorType], result);
    }
    deps.log.info({ documentId: id }, 'Flag cleared');
    return c.json(result.data, 200);
  } catch (err) {
    deps.log.error({ err, documentId: id }, 'Unexpected error clearing flag');
    return c.json({ error: 'clear_flag_failed', message: 'An unexpected error occurred.' }, 500);
  }
});
```

Apply to: `GET /documents/:id`, `POST /documents/:id/clear-flag`,
`PATCH /documents/:id/metadata`, `POST /vocabulary/:termId/accept`,
`POST /vocabulary/:termId/reject`.

For list routes (`GET /documents`, `GET /vocabulary`) where the request function throws
on failure, only add `log.error` in the catch block.

**Delete** the `isHttpError` function (lines 392–407 in the current file).

**Update imports**:

- Remove: 7 individual handler function imports, `CLEAR_FLAG_ERROR_STATUS`,
  `VOCABULARY_ERROR_STATUS`, `ClearFlagErrorType`, `VocabularyErrorType`
- Add: `import { createCurationHandlers } from '../handlers/curationHandler'`
- Add: `import { sendHonoServiceError } from './routeUtils'`
- Add: `import type { CurationErrorType } from '../requests/curation'`
- Add: `import type { Logger } from 'pino'`
- Add: `import { z } from 'zod'`

---

### Change 7: `server/routes/documents.ts`

**Top of `createDocumentsRouter` factory** — create handler once:

```ts
export function createDocumentsRouter(deps: DocumentsDeps): Hono {
  const router = new Hono();
  const handlers = createUploadHandlers(deps.expressClient.documents);
  // ...
```

**Upload route body** — replace `uploadHandler(deps.expressClient.documents, { ... })` with
`handlers.upload({ file, date, description })`. Everything else in the route is unchanged.

**Route param validation** on `DELETE /:uploadId` — add inline UUID check:

```ts
router.delete('/:uploadId', async (c) => {
  const rawId = c.req.param('uploadId');
  if (!z.uuid().safeParse(rawId).success) {
    return c.json({ error: 'invalid_params', message: 'uploadId must be a valid UUID.' }, 400);
  }
  return c.json({ error: 'not_implemented' }, 501);
});
```

**Remove dead stubs** — delete the route registrations for:

- `router.get('/:id', ...)`
- `router.post('/:id/clear-flag', ...)`
- `router.patch('/:id/metadata', ...)`

Keep `router.delete('/:uploadId', ...)`.

**Update imports**:

- Remove: `uploadHandler` import, `type UploadHandlerResult`
- Add: `import { createUploadHandlers } from '../handlers/uploadHandler'`
- Add: `import { z } from 'zod'` (if not already present)

---

### Change 8: `server/routes/index.ts`

No code change. `ServerDeps` already includes `log: Logger`. Once `CurationDeps` declares
`log`, the full `ServerDeps` object satisfies it. Verify this compiles without change.

---

### Change 9: `server/__tests__/testHelpers.ts` (new file)

Extract the repeated setup from all 5 Tier 2 test files. The current boilerplate in every
file is:

```ts
const testConfig = parseConfig({ server: ..., express: ..., upload: ... });
const silentLog = pino({ level: 'silent' });
const app = createHonoApp({ config: testConfig, expressClient: createExpressClient(testConfig), log: silentLog });
const httpServer = createAdaptorServer({ fetch: app.fetch });
const request = supertest(httpServer);
const mswServer = setupServer();
beforeAll(() => mswServer.listen());
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
```

The helper should export two things:

1. `createTestRequest()` — returns a supertest `SuperTest` instance backed by the Hono app
2. `createMswServer()` — returns an MSW `SetupServerApi` instance

Or alternatively export a single `createTestContext()` that returns both, with lifecycle
hooks registered internally. Choose whichever is cleaner.

Reference: `apps/backend/src/testing/testHelpers.ts` for the backend's equivalent pattern.

Update all 5 test files to use the helper. The test assertions and describe/it blocks
do not change — only the setup boilerplate at the top of each file.

---

### Change 10: `server/handlers/__tests__/uploadHandler.test.ts`

Update import and call sites:

```ts
// Before
import { ..., uploadHandler } from '../uploadHandler';
// ...
const result = await uploadHandler(requests, payload);

// After
import { ..., createUploadHandlers } from '../uploadHandler';
// ...
const result = await createUploadHandlers(requests).upload(payload);
```

The `makeRequests` helper and all test assertions are unchanged.

---

## Files changed summary

| File | Action |
| --- | --- |
| `server/routes/routeUtils.ts` | New |
| `server/__tests__/testHelpers.ts` | New |
| `server/requests/curation.ts` | Add `CurationErrorType`; wrap 5 methods in `ServiceResult` |
| `server/requests/documents.ts` | Remove `findById`, `clearFlag`, `patchMetadata` |
| `server/handlers/curationHandler.ts` | Replace 7 functions with `createCurationHandlers` factory |
| `server/handlers/uploadHandler.ts` | Replace `uploadHandler` with `createUploadHandlers` factory |
| `server/routes/curation.ts` | `ServiceResult` branching, logging, param validation, remove `isHttpError` |
| `server/routes/documents.ts` | Factory pattern, UUID param validation, remove 3 dead stubs |
| `server/routes/index.ts` | Verify compiles — no code change expected |
| `server/handlers/__tests__/uploadHandler.test.ts` | Update call sites |
| `server/__tests__/server.test.ts` | Use `testHelpers` |
| `server/__tests__/curation.test.ts` | Use `testHelpers` |
| `server/__tests__/curation.documents.test.ts` | Use `testHelpers` |
| `server/__tests__/curation.vocabulary.test.ts` | Use `testHelpers` |
| `server/__tests__/documents.upload.test.ts` | Use `testHelpers` |

## Verification checklist

```bash
pnpm biome check apps/frontend/src
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend test
```

All existing Tier 2 MSW/supertest test assertions pass without modification. The HTTP
contract is unchanged. The upload handler unit test needs call-site updates only.
