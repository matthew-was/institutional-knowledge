# Code Review — Backend Service — Task 16: Implement startup sweeps

**Date**: 2026-03-21 09:07
**Task status at review**: in_review
**Files reviewed**:

- `apps/backend/src/startup/uploadSweep.ts`
- `apps/backend/src/startup/ingestionSweep.ts`
- `apps/backend/src/startup/__tests__/uploadSweep.integration.test.ts`
- `apps/backend/src/startup/__tests__/ingestionSweep.integration.test.ts`
- `apps/backend/src/db/repositories/documents.ts` (added `getNonFinalizedUploads`)
- `apps/backend/src/server.ts` (sweep wiring)

---

## Acceptance condition

**Stated condition**: Integration test confirms: insert documents with status `initiated`,
`uploaded`, and `stored` (not `finalized`) into a real test database; start Express (or call
the sweep function directly); verify all three non-finalized documents are absent from the
database and their storage files have been deleted. Verify that `finalized` documents are
unaffected. Test passes.

**Condition type**: automated

**Result**: Met

The upload sweep test suite in `uploadSweep.integration.test.ts` covers all three required
non-finalized statuses in dedicated tests (lines 128–168) and in a combined "single sweep"
test (lines 170–197). Each test inserts a real document row and a real file on disk, calls
`uploadStartupSweep` directly against a real PostgreSQL test database and a real
`LocalStorageService` backed by a temp directory, and then asserts both that the database
record is absent and that the file has been deleted. The `finalized` document preservation
test (lines 199–215) confirms that `finalized` documents are untouched by the sweep.

The sweep functions are called directly (not via supertest), which is correct for this
acceptance condition — the acceptance condition explicitly permits calling the sweep function
directly, and these are standalone startup functions, not HTTP handlers. The two-tier rule
applies to route handlers; these are not route handlers.

---

## Findings

### Blocking

None.

### Suggestions

**S-1 — `_cleanupRunById` storage deletes happen inside the outer transaction in
`IngestionService`; the startup sweep correctly moves them outside — but the divergence
is not documented.**

`apps/backend/src/startup/ingestionSweep.ts`, lines 1–19 (file header comment)

In `IngestionService._cleanupRunById`, storage deletes happen inside the transaction that
the caller (`runStartSweep`) opens. This is technically harmless because storage operations
cannot participate in a SQL transaction anyway, but it violates the sentinel pattern
recorded in `development-principles.md` (the "three-step sentinel" anti-pattern row). The
startup sweep correctly separates storage deletes from the DB transaction. The file header
comment says the sweep "mirrors `_cleanupRunById` logic exactly, but operates as a
standalone function" — this slightly overstates the similarity. A one-line note that the
startup sweep intentionally moves storage deletes outside the transaction (whereas
`_cleanupRunById` does not) would make the divergence explicit and help a future reader
who compares the two.

This is a documentation suggestion only; the code logic in the sweep is correct.

**S-2 — `src/index.ts` vs `src/server.ts` in the task description**

`apps/backend/src/server.ts`

The task description (backend-tasks.md Task 16) says sweeps are invoked from `src/index.ts`.
The implementation places them in `src/server.ts`, which is where the startup sequence has
always lived — `server.ts` already handled migrations and service construction before this
task. The `index.ts` module is the app factory (`createApp()`), not the startup entry point.
The implementation is correct; the task description contains a small error. This does not
require any code change, but the task description could be corrected if it is used as a
reference in future.

**S-3 — No ingestion sweep test for a run whose staging directory does not exist**

`apps/backend/src/startup/__tests__/ingestionSweep.integration.test.ts`

`ingestionStartupSweep` calls `storage.deleteStagingDirectory(run.id)` for every swept run.
`LocalStorageService.deleteStagingDirectory` is idempotent (ENOENT is swallowed), so a
run with no staging directory will not cause an error. The test suite does not include a case
where the staging directory was never created (e.g. a run record inserted directly into the
DB without going through the normal flow). This edge case is covered by the idempotency
guarantee rather than by a test. Acceptable, but worth noting for completeness.

---

## Summary

**Outcome**: Pass

The implementation correctly separates the two startup sweeps into standalone functions
(`uploadStartupSweep`, `ingestionStartupSweep`) that take `DbInstance`, `StorageService`,
and `Logger` as parameters — no service construction required at startup. The
`ingestionSweep` diverges from `_cleanupRunById` in one intentional and correct way:
storage deletes are moved outside the DB transaction, matching the sentinel pattern.

The `getNonFinalizedUploads()` repository method correctly applies the
`whereNull('ingestionRunId')` guard, ensuring the upload sweep does not touch
ingestion-run-linked documents. This is directly tested (line 217–240 of
`uploadSweep.integration.test.ts`).

Both test suites call the sweep functions directly against a real PostgreSQL test database
and a real filesystem-backed `LocalStorageService`. No mocked dependencies are used for
the I/O paths. The two-tier rule is respected — these are not route handler tests and do
not require supertest; direct function calls are correct for standalone startup functions.

Task status set to `review_passed`.

The review is ready for the user to check.
