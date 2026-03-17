# Code Review — Backend Service — Task 9: Implement document curation handlers (DOC-006, DOC-007, DOC-008, DOC-009)

**Date**: 2026-03-17 08:29
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/services/curation.ts` (new)
- `apps/backend/src/services/curation.test.ts` (new)
- `apps/backend/src/routes/curation.ts` (new)
- `apps/backend/src/db/repositories/pipelineSteps.ts` (new)
- `apps/backend/src/db/repositories/documents.ts` (modified)
- `apps/backend/src/db/repositories/index.ts` (modified)
- `apps/backend/src/db/index.ts` (modified)
- `apps/backend/src/routes/index.ts` (modified)
- `apps/backend/src/index.ts` (modified)
- `apps/backend/src/server.ts` (modified)

---

## Acceptance condition

**Restated**: Vitest unit tests with mocked Knex confirm:
(a) `getDocumentQueue`: returns paginated results; returns only documents with active flags; derives `archiveReference` for each row.
(b) `getDocument`: returns 404 for unknown ID; returns all metadata fields including `organisations` array.
(c) `clearFlag`: returns 409 when no flag exists; sets `flag_reason` and `flagged_at` to null when flag exists; does not modify `pipeline_steps`.
(d) `updateDocumentMetadata`: returns 400 for whitespace-only description; returns 400 for invalid date; applies partial update (only provided fields updated); re-derives `archiveReference` after update.
All tests pass.

**Condition type**: automated

**Result**: Not met

Parts (a), (b), (c), and the whitespace-description, partial-update, and archiveReference sub-cases of (d) are all tested and passing (13 tests, confirmed by running `vitest run`).

The acceptance condition for part (d) also explicitly requires a test that "returns 400 for invalid date". No such test exists anywhere in the test suite. Date validation is implemented — the `UpdateDocumentMetadataRequest` Zod schema enforces `\d{4}-\d{2}-\d{2}` format via regex, and the `validate` middleware returns 400 on failure — but this code path is not covered by any test.

This is a blocking finding; see Blocking section below.

---

## Findings

### Blocking

**B-001 — Missing test for invalid date validation (acceptance condition d)**

`apps/backend/src/services/curation.test.ts` — no test at any level

The acceptance condition explicitly requires: "returns 400 for invalid date". Date validation is enforced entirely by the Zod schema (`UpdateDocumentMetadataRequest` in `packages/shared/src/schemas/documents.ts`, line 232–234) via the `validate` middleware. The service never receives an invalid date; it does not check the format itself.

A unit test at the service layer cannot exercise this path because the service type signature only accepts already-validated input. The test must be added at the route layer, testing the `validate` middleware with an invalid date string (e.g. `'not-a-date'` or `'2000-99'`) against the `UpdateDocumentMetadataRequestSchema` and confirming a 400 is returned. Alternatively, a unit test directly against the `UpdateDocumentMetadataRequest` Zod schema (calling `.safeParse` with an invalid date and asserting `.success === false`) would demonstrate the date validation is in place, provided the test file comment explains that date validation is enforced by the schema, not the service.

What must change: add a test that confirms `returns 400 for invalid date` as stated in the acceptance condition. The exact approach (schema unit test or route-layer test) is left to the implementer, but the test must demonstrate the actual validation behaviour, not a weaker approximation.

---

### Suggestions

**S-001 — `pipelineStatus` maps a failed step name or empty string; the contract field carries that semantic**

`apps/backend/src/services/curation.ts`, line 84

`pipelineStatus: failedStep ?? ''` maps `null` (no failed step) to an empty string. The `DocumentQueueItem` schema accepts `z.string()` with no nullable, so this is structurally correct. However, a document with no failed step but an active flag (possible in early pipeline stages) will return `pipelineStatus: ''`, which is an ambiguous signal. Consider a sentinel value such as `'no_failed_step'`, or update the `DocumentQueueItem` schema to mark `pipelineStatus` as nullable and return `null` instead. This is a minor API clarity issue, not a correctness bug, and can be deferred to Task 10 or a later iteration.

**S-002 — `updateMetadata` does two DB round-trips (UPDATE then SELECT)**

`apps/backend/src/db/repositories/documents.ts`, lines 143–144

`updateMetadata` issues an `UPDATE` and then a separate `SELECT` to return the updated row. Knex's `.update(...).returning('*')` (or `.returning([...columns])`) on PostgreSQL returns the updated row in a single round-trip. Two queries is correct and safe; one query is more efficient. The current code is not wrong, and the improvement may not be worth the refactor now — mentioning it here for awareness.

**S-003 — `DocumentQueueItem.submitterIdentity` is included in the response but not in the acceptance condition test assertions**

`apps/backend/src/services/curation.test.ts`, lines 94–109

The `getDocumentQueue` tests confirm `total`, `page`, `pageSize`, `documents.length`, `flagReason`, and `archiveReference`. The `submitterIdentity` field is present in the mock row and in the mapped response but is never asserted in any test. This is not a blocking issue (the acceptance condition does not require it), but a future reviewer would benefit from seeing the full response shape asserted at least once.

---

## Summary

**Outcome**: Fail

One blocking finding (B-001): the acceptance condition explicitly requires a test for "returns 400 for invalid date" and no such test exists. The underlying validation is implemented correctly; the test coverage gap is the only issue. All other aspects of the implementation are well-structured, follow the service pattern, comply with the dependency composition rules, and satisfy the remaining acceptance condition sub-cases.

Task returns to `in_progress`. Once B-001 is resolved and all tests pass, the task may be resubmitted for review.
