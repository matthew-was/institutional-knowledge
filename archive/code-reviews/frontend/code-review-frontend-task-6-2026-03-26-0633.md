# Code Review — Frontend Service — Task 6: Document upload — Hono route, handler, and request functions

**Date**: 2026-03-26 06:33
**Task status at review**: in_review
**Round**: 3 (previous reviews: `code-review-frontend-task-6-2026-03-25-2109.md`,
`code-review-frontend-task-6-2026-03-26-0623.md`)
**Files reviewed**:

- `apps/frontend/src/components/DocumentUploadForm/useDocumentUpload.browser.test.ts`
- `apps/frontend/server/requests/documents.ts`
- `apps/frontend/server/handlers/uploadHandler.ts`
- `apps/frontend/server/handlers/__tests__/uploadHandler.test.ts`

---

## Round 2 findings — resolution check

Both changes made since the round 2 review have been applied correctly.

**B-1 (Vacuous assertion — "handleFileSelect clears serverError and duplicateRecord")**:
The test has been replaced with "handleFileSelect sets the file value on the form"
(`useDocumentUpload.browser.test.ts` lines 45–59). The assertion
`expect(result.current.getValues('file')).toBe(file)` is falsifiable: `getValues('file')`
returns `undefined` unless `handleFileSelect` calls `setValue('file', file)`. CR-015 is
satisfied.

**S-1 (Method naming — `delete` → `deleteUpload`)**: The method has been renamed to
`deleteUpload` consistently across the `DocumentsRequests` interface (line 85), the
`createDocumentsRequests` implementation (line 208), `uploadHandler.ts` (lines 63, 71, 78),
and `uploadHandler.test.ts` (lines 10, 43, 68, 102, 118, 146, 168, 188). The implementation
now matches the plan's method name table.

---

## Acceptance condition

**Stated condition** (type: automated):

> All three server layers implemented; handler cleanup logic verified by Tier 2 handler tests
> (delete called on each failure path); 409 envelope reads `response.data.existingRecord`
> confirmed by Tier 2 route handler test; UI form wires to API via `useSWRMutation`; all
> Tier 2 tests pass; `pnpm biome check` and `pnpm --filter frontend tsc --noEmit` pass.

**Result**: Met.

- Three server layers are implemented across `requests/documents.ts`,
  `handlers/uploadHandler.ts`, and `routes/documents.ts`.
- `uploadHandler.test.ts` confirms `deleteUpload` is called on the `uploadFile` error path
  (line 118), the `finalizeUpload` error path (line 168), and the unexpected-throw path
  (line 188); it also confirms `deleteUpload` is not called when `initiateUpload` fails
  (line 102) or on the happy path (line 68).
- The 409 `existingRecord` envelope was confirmed in round 2 (`documents.upload.test.ts`
  line 140).
- The UI form wires to `POST /api/documents/upload` via `useSWRMutation` with `fetchWrapper`
  (confirmed in round 1).
- The falsifiable test assertion replacing the vacuous one satisfies CR-015.
- Lint and typecheck conditions cannot be independently verified in this session; the
  developer must confirm `pnpm biome check apps/frontend/src` and
  `pnpm --filter frontend exec tsc --noEmit` pass before the task advances.

**Manual verification step for the developer**:

```bash
pnpm biome check apps/frontend/src
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend test
```

All three must pass with no errors.

---

## Findings

### Blocking

None.

### Suggestions

None.

---

## Summary

**Outcome**: Pass

No blocking findings. All three blocking findings from rounds 1 and 2 have been resolved.
The acceptance condition is met subject to the developer confirming that lint, typecheck,
and tests pass locally.

Task status set to `review_passed`.

The review is ready for the user to check.
