# Code Review — Backend Service — Test Refactor (PR #17)

**Date**: 2026-03-17 22:03
**Scope**: Test infrastructure refactor on `chore/test-refactor` branch (PR #17)
**Base branch**: `feature/backend-task-9`
**Files reviewed**:

- `apps/backend/src/routes/__tests__/documents.integration.test.ts` (created)
- `apps/backend/src/utils/__tests__/archiveReference.test.ts` (created)
- `documentation/process/development-principles.md` (updated testing section)
- `CLAUDE.md` (updated status line — not reviewed for content)
- Deleted: `apps/backend/src/services/__tests__/documents.test.ts`
- Deleted: `apps/backend/src/services/__tests__/documents.integration.test.ts`
- Deleted: `apps/backend/src/services/__tests__/curation.test.ts`

---

## Context

This PR is not associated with a single task in the normal sense — it is a cross-cutting
refactor that brings the test suite for Tasks 8 and 9 into conformance with a tightened
two-tier testing rule. Both tasks are already at `done` status. The review therefore
assesses:

1. Whether the replacement tests preserve at least the coverage the deleted tests provided
   for the acceptance conditions of Tasks 8 and 9.
2. Whether the new tests are correct, complete, and consistent with the established
   integration test pattern.
3. Whether `development-principles.md` accurately reflects the rule as now enforced.

---

## Coverage gap analysis — Task 8 (DOC-001/002/003/005)

Task 8 acceptance condition type is `both`. The original verified suite comprised:

- **Mocked unit tests** (`documents.test.ts`, 444 lines): covered all sub-conditions (a)–(d)
  at the service level.
- **Middle-tier integration test** (`documents.integration.test.ts`): covered the
  initiate → upload → finalize happy-path lifecycle and a cleanup test against a real database,
  but called service methods directly rather than via supertest.

The replacement is `routes/__tests__/documents.integration.test.ts` (18 tests via supertest)
plus `utils/__tests__/archiveReference.test.ts` (5 unit tests).

### Coverage preserved

| Sub-condition | Original test | Replacement |
| --- | --- | --- |
| (a) 422 for unsupported extension | `documents.test.ts` | `documents.integration.test.ts` line 134 |
| (a) 422 for file too large | `documents.test.ts` | `documents.integration.test.ts` line 150 |
| (a) 400 for whitespace description | `documents.test.ts` | `documents.integration.test.ts` line 166 |
| (a) 201 with uploadId on valid request | `documents.test.ts` | `documents.integration.test.ts` line 196 |
| (b) 404 for unknown uploadId | `documents.test.ts` | `documents.integration.test.ts` line 238 |
| (b) 400 for non-UUID param | Not present originally | `documents.integration.test.ts` line 226 (new) |
| (b) 409 with DuplicateConflictResponse on hash match | `documents.test.ts` | `documents.integration.test.ts` line 251 |
| (b) 200 with fileHash on success | `documents.test.ts` | `documents.integration.test.ts` line 308 |
| (c) 404 when status not uploaded | `documents.test.ts` | `documents.integration.test.ts` line 371 |
| (c) 200 with archiveReference on success | `documents.test.ts` + integration | `documents.integration.test.ts` line 392 |
| (d) 409 for finalized document | `documents.test.ts` | `documents.integration.test.ts` line 459 |
| (d) 200 with `deleted: true` on success | `documents.test.ts` | `documents.integration.test.ts` line 468 |
| (d) Calls deleteStagingFile for uploaded status | `documents.test.ts` (spy) | `documents.integration.test.ts` line 491 (filesystem assertion) |
| (d) Calls deleteStagingFile for initiated status | `documents.test.ts` (spy) | `documents.integration.test.ts` line 468 (initiated doc deleted, row gone) |
| (d) Calls deletePermanentFile for stored status | `documents.test.ts` (spy) | **Not covered — see Blocking finding B-001** |
| Full lifecycle: finalize → staging gone, permanent exists | Middle-tier integration | `documents.integration.test.ts` line 392 |
| `[undated]` archiveReference form | `documents.test.ts` (`date: null`) | `archiveReference.test.ts` line 34 |

---

## Findings

### Blocking

**B-001 — `cleanupUpload` with `stored` status not covered**

File: `apps/backend/src/routes/__tests__/documents.integration.test.ts`

Task 8 acceptance condition (d) explicitly requires: "calls `StorageService.deletePermanentFile`
for status `stored`." The deleted `documents.test.ts` verified this with a spy. The new
integration test suite covers two cleanup paths — `initiated` (line 468) and `uploaded`
(line 491) — but has no test for a document at `stored` status.

The `stored` status is a transitional state in the `cleanupUpload` service implementation
(`services/documents.ts`, lines 366–370): the service calls `storage.deletePermanentFile`
when `doc.storagePath !== null`. This path is now untested.

To test this via the integration layer, a document in `stored` status must be seeded into the
database. The simplest approach is a direct insert via `db._knex` (consistent with the pattern
already used by `insertFinalizedDocument`), with a real file pre-written at `basePath` so that
the `deletePermanentFile` call succeeds.

This must be added before the PR can proceed.

---

### Suggestions

**S-001 — `insertFinalizedDocument` uses `db._knex` directly for `insert`**

File: `apps/backend/src/routes/__tests__/documents.integration.test.ts`, line 104

The test helper calls `db._knex('documents').insert(...)` directly rather than going through
`db.documents.insert()`. The same approach is used in the curation integration test (line 97),
so it is a consistent established pattern. The `_knex` access rules in
`development-principles.md` do not explicitly list test seed helpers — they list only cleanup
(`dbCleanup.ts`) and multi-table transactions.

This is not blocking because the pattern is already present in the curation test (which was
reviewed and passed). However, it may be worth adding "test seed helpers in integration test
files" to the `_knex` access table in development-principles.md to make the exception
explicit.

**S-002 — `row.fileHash` at line 345: relies on `postProcessResponse` applying to direct Knex query**

File: `apps/backend/src/routes/__tests__/documents.integration.test.ts`, line 345

The assertion `expect(row.fileHash).toBe(res.body.fileHash)` relies on
`postProcessResponse` converting `file_hash` to `fileHash` when using `db._knex`. This is
correct because `createTestDb` uses the same `createKnexInstance` function as `createDb`,
which installs `postProcessResponse`. It works, but the camelCase key is mildly surprising to
a reader who expects `db._knex` to return raw snake_case. A one-line comment would help
scanability.

**S-003 — Missing test for `initiateUpload` invalid date format**

File: `apps/backend/src/routes/__tests__/documents.integration.test.ts`

The original Task 8 acceptance condition (a) includes: "returns 400 for invalid date format."
Task 8's verification note explains that this case is handled structurally — the Zod
`InitiateUploadRequest` schema validates the date regex and the `validate` middleware returns
400 before the service is called. The new integration test suite exercises the middleware end-
to-end and is the correct place for this test, but no test for `date: 'not-a-date'` on
`POST /api/documents/initiate` appears in the file.

This is a suggestion rather than blocking because: (1) the Task 8 acceptance condition for
this sub-case was verified by the Zod schema structure, not an explicit test, in the original
verification record; (2) the curation integration test for DOC-009 does test the analogous
case (`date: 'not-a-date'` on PATCH, line 310), confirming the middleware path works. However,
now that the integration test file is the primary test document for DOC-001, a direct test for
the invalid date rejection on the initiate endpoint would be useful for completeness.

---

## Assessment of `development-principles.md` changes

The updated testing section is clear and accurate. The three additions are sound:

1. The tightened unit test definition (calling the function directly, not via a service
   factory) correctly articulates the rule.
2. The "Pure-function unit tests and integration test depth" paragraph (lines 109–113) provides
   a useful division of responsibility — edge cases belong in unit tests, integration tests
   assert the happy path for shared utilities.
3. The new prohibited-pattern row ("Calling a service factory with mocked `db`/`storage` deps
   as a 'unit test'") is correctly worded and explains why the pattern is prohibited.

One observation: the updated principles document removes the previous exception for "tests that
verify coordination between the service and a non-database external dependency (e.g. file
storage + database together in a lifecycle test)." That exception was used to justify the
middle-tier `documents.integration.test.ts`. The removal is correct — those tests are now
replaced by supertest-based integration tests that exercise the same paths more completely.

---

## Summary

**Outcome**: Fail

One blocking finding (B-001): the `stored`-status cleanup path in `cleanupUpload` (DOC-005
acceptance condition d) is not covered by the replacement tests. This path was previously
verified by a spy in the deleted `documents.test.ts`. The developer must add an integration
test for this case before the PR can proceed.

Three suggestions (S-001 to S-003) are non-blocking. The developer may apply them or not.

The `archiveReference.test.ts` unit test file is correct and complete for its scope. The
`development-principles.md` changes are accurate. The remainder of the new
`documents.integration.test.ts` is correct, well-structured, and consistent with the canonical
curation integration test pattern.
