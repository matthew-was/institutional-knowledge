# Code Review — Frontend Service — Task 6: Document upload — Hono route, handler, and request functions

**Date**: 2026-03-26 06:23
**Task status at review**: in_review
**Round**: 2 (previous review: `code-review-frontend-task-6-2026-03-25-2109.md`)
**Files reviewed**:

- `apps/frontend/server/requests/documents.ts`
- `apps/frontend/server/handlers/uploadHandler.ts`
- `apps/frontend/server/routes/documents.ts`
- `apps/frontend/server/handlers/__tests__/uploadHandler.test.ts`
- `apps/frontend/server/__tests__/documents.upload.test.ts`
- `apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.ts`
- `apps/frontend/src/components/DocumentUploadForm/DocumentUploadForm.tsx`
- `apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.browser.test.ts`
- `apps/frontend/src/components/DocumentUploadForm/DocumentUploadForm.browser.test.tsx`
- `apps/frontend/src/lib/fetchWrapper.ts`

---

## Round 1 findings — resolution check

All six blocking findings from the previous review have been addressed:

- **B-1** (Missing Tier 2 handler tests): `server/handlers/__tests__/uploadHandler.test.ts` now
  exists with six test cases covering the happy path, each error branch, and the unexpected-throw
  path.
- **B-2** (Missing Tier 2 route handler tests): `server/__tests__/documents.upload.test.ts` now
  exists with 201, 409 (envelope shape confirmed), and 5xx tests against the Hono app via
  supertest and MSW.
- **B-3** (Missing Tier 2 UI behaviour tests): `DocumentUploadForm.browser.test.tsx` now has
  201 navigation, 409 duplicate alert, and 5xx server error tests.
- **B-4** (Route handler missing try/catch): `routes/documents.ts` wraps `uploadHandler` in a
  try/catch block; `deps.log.error` is called and a structured 500 is returned.
- **B-5** (Vacuous assertions in `useDocumentUpload.browser.test.ts`): The validation test now
  asserts `result.current.errors.file` is defined — falsifiable with respect to the validation
  branch exercised.
- **B-6** (Plain `fetch` in hook): `useDocumentUpload.ts` now calls `fetchWrapper` with
  `{ method: 'POST', body: arg }`. `fetchWrapper` correctly skips the `content-type` header when
  `body instanceof FormData` (confirmed at `fetchWrapper.ts` line 21), preserving the multipart
  boundary.

Both suggestions from round 1 have also been addressed:

- **S-1** (`upload_failed` in `UploadErrorType`): The route handler now maps `upload_failed: 500`
  in `ERROR_STATUS`, making the variant reachable via the fallback path in `initiateUpload` and
  `uploadFile`; the concern is resolved.
- **S-2** (Comment on `initiateUpload` cleanup): `uploadHandler.ts` line 42 now carries the
  clarifying comment.

---

## Acceptance condition

**Stated condition** (type: automated):

> All three server layers implemented; handler cleanup logic verified by Tier 2 handler tests
> (delete called on each failure path); 409 envelope reads `response.data.existingRecord`
> confirmed by Tier 2 route handler test; UI form wires to API via `useSWRMutation`; all
> Tier 2 tests pass; `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Result**: Not met — one blocking finding remains (see B-1 below).

The three server layers are implemented. `uploadHandler.test.ts` confirms delete is called on
each failure path. `documents.upload.test.ts` line 140 asserts `res.body.existingRecord` is
`undefined`, confirming `existingRecord` is nested under `data` — not at the top level. The UI
form calls `useSWRMutation` with `fetchWrapper`. The lint and typecheck conditions cannot be
independently verified in this session.

One automated test assertion remains vacuous (CR-015), which prevents the condition from being
fully met.

---

## Findings

### Blocking

**B-1 — Vacuous assertion in "handleFileSelect clears serverError and duplicateRecord" test (CR-015)**

`apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.browser.test.ts`,
lines 45–58:

```typescript
it('handleFileSelect clears serverError and duplicateRecord', () => {
  const { result } = makeHook();
  // ...
  act(() => {
    result.current.handleFileSelect(file, null);
  });

  expect(result.current.serverError).toBeNull();
  expect(result.current.duplicateRecord).toBeNull();
});
```

`makeHook()` creates a fresh hook instance. `serverError` and `duplicateRecord` initialise to
`null` in `useState` (lines 43–45 of `useDocumentUpload.ts`). The test never sets them to a
non-null value before calling `handleFileSelect`. Both assertions would pass even if
`handleFileSelect` never called `setServerError(null)` or `setDuplicateRecord(null)`. Neither
assertion is falsifiable with respect to the "clears" behaviour under test.

To make the assertions falsifiable, the test must put `serverError` and `duplicateRecord` into a
non-null state before calling `handleFileSelect`, then assert they return to `null`. CR-015.

---

### Suggestions

**S-1 — Method names in `DocumentsRequests` interface diverge from the plan's API table**

`apps/frontend/server/requests/documents.ts`, lines 60 and 85:

The plan (`senior-developer-frontend-plan.md` line 1167 and `frontend-tasks.md` line 1637)
names the methods `uploadFileBytes` and `deleteUpload` in the request function table. The
implementation uses `uploadFile` and `delete` respectively.

The divergence is internally consistent — the handler, the interface, and all tests use the
same names — but it means Task 17's contract sweep test (which references the plan table) will
need to reference the actual names rather than the plan's names. The developer should either
update the plan table to reflect the chosen names, or rename the methods to match the plan
before Task 17 is implemented.

This is a **Suggestion**, not blocking, because the acceptance condition for Task 6 does not
specify method names and the implementation is self-consistent.

---

## Summary

**Outcome**: Fail

One blocking finding:

- B-1: Vacuous assertions in "handleFileSelect clears serverError and duplicateRecord" test
  (`useDocumentUpload.browser.test.ts` lines 55–57); both assertions check initial state and are
  not falsifiable with respect to the behaviour under test. CR-015.

Task status set to `review_failed`. The task returns to `in_progress`.

The review is ready for the user to check.
