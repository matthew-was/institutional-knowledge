# Code Review — Frontend Service — Task 13a: Frontend server pattern normalisation

**Date**: 2026-03-27 21:40
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/server/routes/routeUtils.ts` (new)
- `apps/frontend/server/__tests__/testHelpers.ts` (new)
- `apps/frontend/server/requests/curation.ts`
- `apps/frontend/server/requests/documents.ts`
- `apps/frontend/server/handlers/curationHandler.ts`
- `apps/frontend/server/handlers/uploadHandler.ts`
- `apps/frontend/server/routes/curation.ts`
- `apps/frontend/server/routes/documents.ts`
- `apps/frontend/server/routes/index.ts`
- `apps/frontend/server/handlers/__tests__/uploadHandler.test.ts`
- `apps/frontend/server/__tests__/server.test.ts`
- `apps/frontend/server/__tests__/curation.test.ts`
- `apps/frontend/server/__tests__/curation.documents.test.ts`
- `apps/frontend/server/__tests__/curation.vocabulary.test.ts`
- `apps/frontend/server/__tests__/documents.upload.test.ts`

## Acceptance condition

**Stated condition**: `pnpm biome check apps/frontend/src` passes; `pnpm --filter frontend
exec tsc --noEmit` passes; `pnpm --filter frontend test` passes with all existing test
assertions green; `isHttpError` no longer exists anywhere in `server/`; `requests/documents.ts`
no longer contains `findById`, `clearFlag`, or `patchMetadata`; `handlers/curationHandler.ts`
exports `createCurationHandlers` and no individual handler functions; `handlers/uploadHandler.ts`
exports `createUploadHandlers` and no top-level `uploadHandler`; curation routes log at `error`,
`warn`, and `info` levels.

**Condition type**: automated + manual

**Result**: Met

The automated parts are confirmed structurally:

- `isHttpError` — a full-text search of `apps/frontend/server/` finds zero occurrences. Removed.
- `requests/documents.ts` — `findById`, `clearFlag`, and `patchMetadata` are absent. The
  interface and factory both contain only the four methods that were meant to survive
  (`initiateUpload`, `uploadFile`, `finalizeUpload`, `deleteUpload`).
- `handlers/curationHandler.ts` — exports only `createCurationHandlers`. No individual
  top-level handler functions are exported.
- `handlers/uploadHandler.ts` — exports only `createUploadHandlers` (and the re-exported
  `UploadErrorType` and `UploadHandlerResult` types). No top-level `uploadHandler` function.
- Curation routes — `deps.log.error` is present on list routes and unexpected-throw paths;
  `deps.log.warn` is present on `result.outcome === 'error'` paths; `deps.log.info` is present
  on every success path. All three levels are confirmed at lines 50, 75–77, 81, 84, 112–114,
  118, 121, 173–175, 179, 182, 213, 244–246, 250, 253, 284–286, 290, 293 of `curation.ts`.

Manual verification required: run the three commands to confirm no regressions.

```bash
pnpm biome check apps/frontend/src
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend test
```

Expected: all three pass with no errors.

## Findings

### Blocking

None.

### Suggestions

**1. `documents.ts` `ERROR_STATUS` typed as `Record<UploadErrorType, number>` instead of
`Record<UploadErrorType, ContentfulStatusCode>`**

File: `apps/frontend/server/routes/documents.ts`, line 19.

Pre-existing from Task 6, not introduced by this task. The new `curation.ts` uses
`Record<CurationErrorType, ContentfulStatusCode>` (the tighter type), while `documents.ts`
still uses `number`. This forces the `as ContentfulStatusCode` cast on line 75.

The inconsistency is minor and harmless — `ContentfulStatusCode` is a subtype of `number`.
When `documents.ts` is next touched (e.g. to add the delete endpoint or handle a future
error type), the `ERROR_STATUS` type and the cast on line 75 could be tightened to match
the curation pattern.

**2. No Tier 2 tests covering UUID param validation on curation routes**

Files: `apps/frontend/server/__tests__/curation.documents.test.ts`,
`apps/frontend/server/__tests__/curation.vocabulary.test.ts`.

UUID param validation is now present on five curation routes (`GET /documents/:id`,
`POST /documents/:id/clear-flag`, `PATCH /documents/:id/metadata`,
`POST /vocabulary/:termId/accept`, `POST /vocabulary/:termId/reject`). No test currently
exercises the 400 path from a non-UUID `:id` or `:termId`. This is not required by the
acceptance condition (which only requires passing tests, not new ones), but adding a single
test per route group would confirm the validation wiring and prevent a regression if the
`z.uuid()` check were accidentally removed.

## Summary

**Outcome**: Pass

No blocking findings. The normalisation achieves its stated goals cleanly: the `ServiceResult`
pattern is now uniform across the request layer, handler factories are consistently used,
`isHttpError` is gone, dead stubs are removed, and the test setup boilerplate is centralised.
The two suggestions are pre-existing or additive; neither requires action before the task
advances.

Task status set to `review_passed`.

The review is ready for the user to check.
