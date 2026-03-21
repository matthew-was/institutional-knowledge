# Code Review — Backend Service — Task 16: Implement startup sweeps

**Date**: 2026-03-21 09:56
**Task status at review**: in_review
**Round**: 2 (second review — actioning suggestions from round 1)
**Files reviewed**:

- `apps/backend/src/startup/uploadSweep.ts`
- `apps/backend/src/startup/ingestionSweep.ts`
- `apps/backend/src/startup/__tests__/uploadSweep.integration.test.ts`
- `apps/backend/src/startup/__tests__/ingestionSweep.integration.test.ts`
- `documentation/process/development-principles.md` (Startup Sweep Design Principle section)
- `apps/backend/src/server.ts` (sweep call sites)
- `apps/backend/src/db/repositories/documents.ts` (getNonFinalizedUploads)
- `apps/backend/src/db/repositories/ingestionRuns.ts` (getIncomplete, getDocumentsByRunId)

---

## Acceptance condition

**Condition**: Integration test confirms: insert documents with status `initiated`, `uploaded`,
and `stored` (not `finalized`) into a real test database; start Express (or call the sweep
function directly); verify all three non-finalized documents are absent from the database and
their storage files have been deleted. Verify that `finalized` documents are unaffected. Test
passes.

**Condition type**: automated

**Result**: Met

Both test suites call the sweep functions directly against a real PostgreSQL test database and
a real `LocalStorageService` backed by a temp directory. The `uploadSweep` test covers each of
the three non-finalized statuses individually, all three together in a single sweep, and the
`finalized` document preservation case. The `ingestionSweep` test covers the equivalent paths
for the ingestion run flow. Both test suites confirm file deletion and record deletion
independently.

---

## Changes reviewed (S-1 through new principle)

### S-1 — Per-document best-effort sequential processing

Both sweep functions are confirmed to use a `for...of` loop with a `try/catch` per document
and no transaction wrapper. The file operation precedes the database record delete (file-first
ordering). This is correct and matches the new development principle.

`uploadSweep.ts` orders operations correctly:

- `stored` documents: `deletePermanentFile` → `db.documents.delete`
- `initiated`/`uploaded` documents: `deleteStagingFile` → `db.documents.delete`

`ingestionSweep.ts` orders operations correctly per document:

1. `deleteStagingFile` (always, idempotent)
2. `deletePermanentFile` (if `stored`)
3. `db.documents.delete` (if not `finalized`)

The run-level cleanup (staging directory and run record) is in a separate `try/catch` after
the document loop, which is the correct placement.

### S-2 — Task description corrected to `src/server.ts`

Confirmed: `documentation/tasks/backend-tasks.md` Task 16 description now reads `src/server.ts`.

### S-3 — Comment in `ingestionSweep.integration.test.ts`

Line 239 of `ingestionSweep.integration.test.ts` includes:

> "Note: no test for sweeping a run whose staging directory was never created —
> deleteStagingDirectory uses `{ force: true }` which makes it idempotent against missing directories."

This correctly explains the omission.

### New development principle

The `Startup Sweep Design Principle` section in `development-principles.md` (lines 417–452)
accurately captures the four design rules: file-first ordering, per-document isolation,
no transaction wrapper, and intentional divergence from service-layer cleanup methods.

### `ingestionSweep.ts` comment

The file-level JSDoc references "the startup sweep design principle in development-principles.md"
and provides the step-by-step ordering for document and run cleanup. The comment is accurate
and cites the principle correctly.

### Error-continuation tests

**`uploadSweep` test** (`continues past a failing document...`, line 253):

The test wraps `LocalStorageService` in an inline `StorageService` object that throws on
`deletePermanentFile` for `failStoragePath`. Document 1 is `stored` — in `uploadSweep.ts`
the path is `deletePermanentFile` → `db.documents.delete`. The throw fires before the DB
delete, so `failId` row survives. The test asserts `getById(failId)` is defined — correct.
Document 2 (`initiated`) has a real staging file and succeeds. The test asserts `getById(successId)`
is undefined and the staging file is gone — correct. File-first ordering is demonstrated.

**`ingestionSweep` test** (`continues to next document when one document file delete throws`,
line 237):

The test wraps storage to throw on `deleteStagingFile` for `failFilename`. Document 1 is
`stored` — in `ingestionSweep.ts` the first per-document operation is `deleteStagingFile`.
The throw fires before `deletePermanentFile` and before `db.documents.delete`, so `failDocId`
row survives. The test asserts `getById(failDocId)` is defined — correct.

Document 2 (`uploaded`) has a real staging file and succeeds. The test asserts
`getById(successDocId)` is undefined and the staging file is gone — correct.

The run itself is asserted deleted (line 295): the run-level `try/catch` fires after all
documents are processed and both the staging directory delete and run record delete succeed
(no test wrapper interference). This assertion correctly confirms that one bad document does
not block the run cleanup.

---

## Findings

### Blocking

None.

### Suggestions

**S-A** — UUID version in test seed helpers

`uploadSweep.integration.test.ts` line 15 and `ingestionSweep.integration.test.ts` line 15
both import `v4 as uuidv4` from `uuid`. The project standard is `v7 as uuidv7` (see
`development-principles.md` prohibited list — the prohibition targets `crypto.randomUUID()`,
not uuid v4, but `uuidv7` is stated as the project standard).

Note: `routes/__tests__/ingestion.integration.test.ts`, `documents.integration.test.ts`, and
`curation.integration.test.ts` also use `v4`, so this is a pre-existing pattern in test files.
If the project decides to standardise tests on `v7`, this should be addressed as a codebase-wide
change rather than piecemeal. Not blocking.

---

## Summary

**Outcome**: Pass

All four S-1 to S-3 items from round 1 have been correctly addressed. The error-continuation
tests accurately exercise file-first ordering and confirm that one failing document does not
block cleanup of subsequent documents or the run record. The new development principle is
accurate and well-placed. No blocking findings.

Task status set to `review_passed`.

The review is ready for the user to check.
