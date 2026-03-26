# Code Review — Frontend Service — Task 6: Document upload — Hono route, handler, and request functions

**Date**: 2026-03-25 21:09
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/server/requests/documents.ts`
- `apps/frontend/server/handlers/uploadHandler.ts`
- `apps/frontend/server/routes/documents.ts`
- `apps/frontend/server/requests/client.ts`
- `apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.ts`
- `apps/frontend/src/components/DocumentUploadForm/DocumentUploadForm.tsx`
- `apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.browser.test.ts`
- `apps/frontend/src/components/DocumentUploadForm/DocumentUploadForm.browser.test.tsx`
- `apps/frontend/server/__tests__/server.test.ts`

---

## Acceptance condition

**Stated condition** (type: automated):

> All three server layers implemented; handler cleanup logic verified by Tier 2 handler tests
> (delete called on each failure path); 409 envelope reads `response.data.existingRecord`
> confirmed by Tier 2 route handler test; UI form wires to API via `useSWRMutation`; all
> Tier 2 tests pass; `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Result**: Not met.

The three server layers are implemented. `pnpm biome check` (src and server) and
`pnpm --filter frontend tsc --noEmit` pass. The UI form wires to `useSWRMutation`.

However, the following automated conditions are unmet:

1. **Handler cleanup logic is not verified by Tier 2 handler tests.** No handler test file
   exists. The task requires handler tests confirming `deleteUpload` is called when
   `uploadFileBytes` fails, when `finalizeUpload` fails, and when a 409 duplicate is
   returned.

2. **The 409 envelope reading `response.data.existingRecord` is not confirmed by a Tier 2
   route handler test.** The existing `server/__tests__/server.test.ts` file has three tests
   (empty body → 400; no internal key in response headers; auth no-op). None test the 409
   response path or verify the envelope shape.

3. **The Tier 2 UI behaviour tests for 201 navigation, 409 duplicate rendering, and 5xx
   error display are absent.** `DocumentUploadForm.browser.test.tsx` contains only the
   loading state test. The task requires three additional MSW-based UI behaviour tests.

---

## Findings

### Blocking

**B-1 — Missing Tier 2 handler tests**

No handler test file exists for `uploadHandler`. The acceptance condition explicitly requires
handler tests confirming:

- Three-step sequence called in order
- `deleteUpload` called when `uploadFileBytes` fails
- `deleteUpload` called when `finalizeUpload` fails
- Duplicate 409 from `uploadFileBytes`: `deleteUpload` called; duplicate error re-thrown
  with `existingRecord`
- Typed success return on happy path

The composite upload orchestration in `uploadHandler` is non-trivial logic (three sequential
calls, two failure paths with cleanup, duplicate error re-classification). The
`development-principles.md` Tier 2 handler tests section identifies this handler as "the
primary target" for handler-level testing. These tests must be added before the task can
proceed.

A handler test file belongs at `apps/frontend/server/handlers/__tests__/uploadHandler.test.ts`
(or equivalent). It imports `uploadHandler` directly and mocks the `DocumentsRequests`
interface.

---

**B-2 — Missing Tier 2 route handler tests**

`apps/frontend/server/__tests__/server.test.ts` does not test the upload route's success
path (201), duplicate path (409), or non-duplicate error path (5xx). The acceptance condition
requires a test that confirms the 409 envelope shape (`{ error, data: { existingRecord } }`)
specifically.

Required tests (supertest against the Hono app; mock or MSW intercepts at the Express
boundary `http://[express.baseUrl]/api/documents/*`):

- `POST /api/documents/upload`: returns 201 with finalized response on full success
- Returns 409 with `{ error: 'duplicate_detected', data: { existingRecord: { ... } } }` when
  upload step returns duplicate; `existingRecord` nested under `data`
- Returns error status on Express failure; cleanup endpoint called

---

**B-3 — Missing Tier 2 UI behaviour tests**

`DocumentUploadForm.browser.test.tsx` contains only the in-flight loading state test. The
task requires three additional MSW-based tests (MSW intercepts at the Hono API route
`/api/documents/upload`):

- Submitting a valid form triggers POST; on 201 response, navigates to success page
- API 409 response renders `DuplicateConflictAlert` with data from
  `response.data.existingRecord`; submit button re-enabled
- Server error (5xx) shows generic error message; submit button re-enabled

---

**B-4 — Route handler does not catch exceptions from `uploadHandler`**

`apps/frontend/server/routes/documents.ts`, line 35:

```typescript
const result = await uploadHandler(deps.expressClient.documents, {
  file,
  date,
  description,
});
```

The call to `uploadHandler` is not wrapped in a try/catch. The handler re-throws on two
paths: when `uploadFileBytes` throws a non-duplicate error (line 67 of `uploadHandler.ts`)
and when `finalizeUpload` throws (line 77 of `uploadHandler.ts`). In both cases, the
exception propagates to Hono's default error handler with no structured logging and no
controlled response shape.

The task specification requires: "Returns HTTP 400/422/5xx on other errors" and "Logs using
Pino (info on success, error on 5xx, warn on 4xx)." The `deps.log.error(...)` call that
should fire on 5xx is never reached.

The route handler must wrap `await uploadHandler(...)` in a try/catch, log the error with
`deps.log.error`, and return a structured 500 response.

---

**B-5 — Vacuous test assertion (CR-015)**

`apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.browser.test.ts`,
lines 70–74:

```typescript
it('handleSubmit does not proceed when form data fails Zod validation', async () => {
  // ...
  expect(result.current.isSubmitting).toBe(false);
  expect(result.current.serverError).toBeNull();
});
```

Both assertions check the initial state of the hook. `isSubmitting` is always `false` at
initialisation (the `swr/mutation` mock returns `isMutating: false`), and `serverError` is
always `null` at initialisation. If `handleSubmit` were removed entirely — or replaced with
a no-op — both assertions would still pass. Neither assertion is falsifiable with respect to
the behaviour under test.

The test must assert on a state that is only reachable if `handleSubmit` was called and the
Zod validation path was exercised. For example: asserting that `errors` contains field-level
messages (which RHF sets when validation fails), or asserting that the RHF `isSubmitted`
flag becomes `true` (confirming the submit was attempted). CR-015.

---

**B-6 — Plain `fetch` used in hook instead of `fetchWrapper` (plan divergence)**

`apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.ts`, lines 18–24:

```typescript
async function submitUpload(_key: string, { arg }: { arg: FormData }) {
  return fetch('/api/documents/upload', {
    method: 'POST',
    body: arg,
  });
}
```

The plan (`senior-developer-frontend-plan.md`, HTTP libraries section) states: "No plain
`fetch` calls in hooks — all requests go through `useSWR`/`useSWRMutation`" and explicitly
that requests "call through `fetchWrapper`." The `development-principles.md` custom hook
definition repeats this: "Uses useSWR for data fetching and useSWRMutation for mutations —
both call through `fetchWrapper`."

The `submitUpload` fetcher bypasses `fetchWrapper` with a direct `fetch` call. This is a
plan compliance violation. The fetcher must use `fetchWrapper`.

Note for the implementer: `fetchWrapper` sets `content-type: application/json` by default.
For multipart/form-data uploads, the fetcher must pass an explicit content-type header (or
no content-type, and ensure `fetchWrapper` does not override it) so the browser can set the
correct multipart boundary. The implementation must confirm `fetchWrapper` is used in a way
that does not break the multipart encoding.

---

### Suggestions

**S-1 — `UploadErrorType` includes `upload_failed` which is never returned**

`apps/frontend/server/handlers/uploadHandler.ts`, line 26:

```typescript
export type UploadErrorType = 'duplicate_detected' | 'upload_failed';
```

`upload_failed` is declared in the union but the handler never returns it — non-duplicate
failures are re-thrown, not returned as a `ServiceResult` error. The route handler's final
branch (`c.json({ error: result.errorType, ... }, 422)`) is therefore unreachable under the
current implementation.

If `upload_failed` is intended for future use, document it with a comment. If it is not
needed, remove it to keep the type surface accurate.

---

**S-2 — `initiateUpload` failure leaves no cleanup path**

`apps/frontend/server/handlers/uploadHandler.ts`, line 41:

If `requests.initiateUpload(...)` throws, there is no uploadId yet and no cleanup is needed
— this is correct by design. However, there is no comment documenting this. A future
maintainer may read the handler and wonder why the first step has no cleanup. A brief inline
comment (`// If initiateUpload throws, no uploadId exists yet — no cleanup needed`) would
make the intent explicit.

---

## Summary

**Outcome**: Fail

Six blocking findings:

- B-1: Tier 2 handler tests absent (acceptance condition unmet)
- B-2: Tier 2 route handler tests absent, including 409 envelope check (acceptance condition unmet)
- B-3: Tier 2 UI behaviour tests for 201/409/5xx absent (acceptance condition unmet)
- B-4: Route handler does not catch exceptions from `uploadHandler`; Pino error log unreachable; uncontrolled 500 response
- B-5: Vacuous test assertions in `useDocumentUpload.browser.test.ts` (CR-015)
- B-6: Plain `fetch` used in `submitUpload` fetcher instead of `fetchWrapper` (plan divergence)

Task status set to `review_failed`. The task returns to `in_progress`.

The review is ready for the user to check.
