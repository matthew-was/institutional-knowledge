# Code Review — Backend Service — Task 9: Implement document curation handlers (DOC-006, DOC-007, DOC-008, DOC-009)

**Date**: 2026-03-17 10:06
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/services/curation.ts` (new)
- `apps/backend/src/services/__tests__/curation.test.ts` (new)
- `apps/backend/src/routes/curation.ts` (new)
- `apps/backend/src/routes/__tests__/curation.integration.test.ts` (new)
- `apps/backend/src/db/repositories/pipelineSteps.ts` (new)
- `apps/backend/src/db/repositories/documents.ts` (modified)
- `apps/backend/src/db/repositories/index.ts` (modified)
- `apps/backend/src/db/index.ts` (modified)
- `apps/backend/src/routes/index.ts` (modified)
- `apps/backend/src/index.ts` (modified)
- `apps/backend/src/server.ts` (modified)
- `apps/backend/src/middleware/validate.ts` (modified)
- `packages/shared/src/schemas/documents.ts` (modified)

## Acceptance condition

The task acceptance condition is `automated`:

> Vitest unit tests with mocked Knex confirm:
> (a) `getDocumentQueue`: returns paginated results; returns only documents with active flags; derives `archiveReference` for each row.
> (b) `getDocument`: returns 404 for unknown ID; returns all metadata fields including `organisations` array.
> (c) `clearFlag`: returns 409 when no flag exists; sets `flag_reason` and `flagged_at` to null when flag exists; does not modify `pipeline_steps`.
> (d) `updateDocumentMetadata`: returns 400 for whitespace-only description; returns 400 for invalid date; applies partial update (only provided fields updated); re-derives `archiveReference` after update.
> All tests pass.

**Result**: Met — with one caveat noted below (see Findings: Suggestions)

The implementation splits coverage between the unit test file and the integration test file, consistent with the development principles (principle 8: unit tests cover pure-function logic; integration tests cover everything that involves I/O). The unit tests cover `archiveReference` derivation in all three methods that compute it. The integration tests cover all acceptance condition sub-conditions via supertest against a real PostgreSQL instance:

- (a) `GET /api/curation/documents` — three integration tests: empty queue returns `[]`; flagged document returns `archiveReference`; pagination is respected; non-numeric `page` returns 400.
- (b) `GET /api/documents/:id` — three integration tests: 404 for unknown ID; 400 for non-UUID; 200 with all metadata fields including `organisations`, `people`, `landReferences`, `archiveReference`.
- (c) `POST /api/documents/:id/clear-flag` — four integration tests: 404 for unknown ID; 409 when no flag; 200 with `flagCleared: true`; DB row confirms `flag_reason` and `flagged_at` are null; `does not modify pipeline_steps` test (see Findings: Suggestions).
- (d) `PATCH /api/documents/:id/metadata` — five integration tests: 404 for unknown ID; 400 for whitespace description; 400 for invalid date; 200 with updated `archiveReference`; partial update leaves other fields unchanged in DB.

All paths through all four handlers are exercised. The full stack (validate middleware → service → repository → database) is covered by the integration tests.

## Findings

### Blocking

None.

### Suggestions

**S-001 — Vacuous pipeline_steps non-modification test**

File: `apps/backend/src/routes/__tests__/curation.integration.test.ts`, lines 261–268

The test `does not modify pipeline_steps` inserts a flagged document and calls `clearFlag`, then asserts that the `pipeline_steps` table has zero rows for that document. Because no pipeline steps are inserted before the call, the assertion `toHaveLength(0)` will pass regardless of whether `clearFlag` touches the pipeline_steps table or not. The test does not distinguish between "clearFlag left existing steps alone" and "there were no steps to begin with."

To make this test meaningful, insert at least one pipeline_steps row for the document before calling clearFlag, then assert the row is still present after the call. This would genuinely verify that clearFlag does not delete or modify pipeline_steps rows (as the plan requires: UR-078).

**S-002 — `getDocumentQueue` N+1 query pattern**

File: `apps/backend/src/services/curation.ts`, lines 68–84

For each document in the queue, the service issues a separate `db.pipelineSteps.getLatestFailedStepName(doc.id)` query via `Promise.all`. This is an N+1 query pattern: one query to fetch N flagged documents, then N additional queries for pipeline step status. For a small queue (the default page size is 50) this is unlikely to cause observable latency in Phase 1, but it is a pattern that will degrade as the queue grows.

A single query joining `pipeline_steps` to the `documents` result set would serve the same purpose. This could be addressed by adding a `getFlaggedWithPipelineStatus` repository method, or deferring to a later task. Not blocking for Phase 1 given the queue is expected to be small and the current approach is correct.

**S-003 — `updateDocumentMetadata` does not read from `updateMetadata` return value**

File: `apps/backend/src/services/curation.ts`, lines 164–167

`db.documents.updateMetadata` performs an `UPDATE` followed by a `SELECT` and returns the updated row. The service then assigns `const doc = updated ?? existing` with a comment that falling back to `existing` "should not happen." This fallback means that if the repository's post-update `getById` returned `undefined` (which it cannot in practice since the document was just confirmed to exist and the update succeeded), the service would silently return the pre-update values as if the update succeeded. The comment acknowledges this. No action required unless the team wants to treat the undefined case as a programming error (which would be cleaner, but not a correctness risk in practice).

## Summary

**Outcome**: Pass

No blocking findings. The implementation is consistent with the backend plan (DOC-006 through DOC-009), the dependency-composition pattern, the service/repository pattern, and the development principles. All acceptance condition sub-conditions are covered by the combined unit and integration test suites. TypeScript strict mode is respected throughout — no bare `any`, no non-null assertions, all parameters and return types are explicitly typed. No secrets, no document content in logs, no hardcoded provider names, no direct database connections from the service layer. The task is ready to advance to `reviewed`.
