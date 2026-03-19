# Code Review — Backend Service — Tasks 11 & 12: Processing Trigger and Results Handlers

**Date**: 2026-03-18 21:41
**Task status at review**: code_complete (both tasks)
**Files reviewed**:

- `apps/backend/src/services/processing.ts` (new)
- `apps/backend/src/routes/processing.ts` (new)
- `apps/backend/src/utils/pythonClient.ts` (new)
- `apps/backend/src/db/repositories/processingRuns.ts` (new)
- `apps/backend/src/routes/__tests__/processing.integration.test.ts` (new)
- `apps/backend/src/db/repositories/documents.ts` (modified — added `applyProcessingMetadata`, `setFlag`)
- `apps/backend/src/db/repositories/pipelineSteps.ts` (modified — added 5 write methods)
- `apps/backend/src/db/repositories/graph.ts` (modified — added `findVocabTermByNormalisedTerm`, `appendAlias`)
- `apps/backend/src/db/repositories/index.ts` (modified)
- `apps/backend/src/db/index.ts` (modified — added `processingRuns` to `DbInstance`)
- `apps/backend/src/index.ts` (modified — added `processingService` to `AppDependencies`)
- `apps/backend/src/server.ts` (modified — instantiated `processingService`)
- `apps/backend/src/routes/index.ts` (modified — registered processing router)
- `apps/backend/src/middleware/__tests__/middleware.test.ts` (modified — added `processingService` stub)
- `apps/backend/src/routes/__tests__/curation.integration.test.ts` (modified)
- `apps/backend/src/routes/__tests__/documents.integration.test.ts` (modified)
- `apps/backend/src/routes/__tests__/vocabulary.integration.test.ts` (modified)
- `packages/shared/src/schemas/processing.ts` (new schemas)

---

## Acceptance Condition — Task 11 (PROC-001)

**Stated condition** (type: `automated`):

Vitest unit tests with mocked Knex and mocked HTTP client confirm:
(a) Returns 409 when a `processing_runs` record with `in_progress` status already exists.
(b) Resets stale `running` steps to `failed` before querying documents.
(c) Returns `{ runId, documentsQueued }` synchronously; does not wait for the async loop.
(d) The async loop: calls the Python HTTP endpoint once per document; calls
`receiveProcessingResults` service logic with the Python response; updates `processing_runs`
to `completed` after all documents finish.

**Result**: Not met.

No unit tests exist for Task 11. The only tests are in
`apps/backend/src/routes/__tests__/processing.integration.test.ts`, which are integration
tests against a real database — not the mocked-Knex unit tests required by the acceptance
condition. While the integration tests cover conditions (a), (b), (c), and (d) empirically,
the acceptance condition explicitly requires unit tests with mocked Knex and a mocked HTTP
client. This is a **blocking** finding.

---

## Acceptance Condition — Task 12 (PROC-002)

**Stated condition** (type: `both`):

Automated (unit tests with mocked Knex, mocked VectorStore, mocked config):
(a) Full successful pipeline write: all tables updated correctly.
(b) Entity deduplication — new entity inserts new `vocabulary_terms` row with `source = 'llm_extracted'`.
(c) Entity deduplication — existing entity: finds row; appends alias if not already present.
(d) Rejected entity suppression: entity matching `rejected_terms.normalised_term` is skipped.
(e) Relationship deduplication: duplicate composite key insert silently ignored.
(f) Flag writing: `flag_reason` and `flagged_at` set when `flags` is non-empty.
(g) Transaction rollback on failure: when a write throws, entire transaction rolls back.
(h) Conditional description overwrite: overwritten when non-null/non-empty; preserved otherwise.

Integration (real database):

- Submit full `ProcessingResultsRequest` payload; verify all rows across `documents`,
  `chunks`, `embeddings`, `vocabulary_terms`, `vocabulary_relationships`,
  `entity_document_occurrences`, `pipeline_steps`.
- Submit two payloads with overlapping entity names; verify single `vocabulary_terms` row
  with updated `aliases`.
- Submit payload with deliberately invalid entity reference; verify transaction rolled back
  with no partial writes in any table.

**Result**: Not met.

Unit tests: none. The automated acceptance conditions (a)–(h) are uncovered.

Integration tests: partially met. The integration test covers (b), (c), (d), (e), (f), and
(h). However:

- The full pipeline write test verifying rows across all seven tables is absent. The test for
  (b) only verifies `vocabulary_terms` and `entity_document_occurrences`; no test submits a
  payload with chunks and asserts on `chunks` and `embeddings` rows.
- The transaction rollback test is absent. The acceptance condition explicitly requires
  submitting a payload with a deliberately invalid entity reference and verifying that no
  partial writes remain in any table.

Both the missing unit tests and the two missing integration test scenarios are **blocking**
findings.

---

## Findings

### Blocking

**B-1 — Missing unit tests for Tasks 11 and 12**

Both acceptance conditions explicitly require Vitest unit tests with mocked dependencies
(mocked Knex, mocked HTTP client for Task 11; mocked Knex, mocked VectorStore, and mocked
config for Task 12). No such tests exist. The acceptance conditions are not met. A unit test
file (e.g. `apps/backend/src/services/__tests__/processing.test.ts`) must be created
covering all lettered sub-conditions for both tasks.

**B-2 — Missing integration test: full pipeline write across all seven tables**

`apps/backend/src/routes/__tests__/processing.integration.test.ts`

The Task 12 acceptance condition requires an integration test that submits a full
`ProcessingResultsRequest` payload (with chunks, entities, relationships, and step results)
and asserts that rows are present across all seven tables: `documents`, `chunks`,
`embeddings`, `vocabulary_terms`, `vocabulary_relationships`,
`entity_document_occurrences`, and `pipeline_steps`. No such test exists.

**B-3 — Missing integration test: transaction rollback on failure**

`apps/backend/src/routes/__tests__/processing.integration.test.ts`

The Task 12 acceptance condition requires a test that submits a payload designed to cause a
write failure mid-transaction and verifies that no partial writes remain in any table. This
test is absent.

**B-4 — Transaction writes bypass the repository layer**

`apps/backend/src/services/processing.ts`, lines 75–82, 96–102, 114–121, 129–142, 156–165

Inside the `db._knex.transaction` callback, writes to `pipeline_steps`, `chunks`,
`vocabulary_terms`, `entity_document_occurrences`, and `vocabulary_relationships` are made
via `trx('table_name')` directly in the service — bypassing repository methods. The
Repository Pattern (`development-principles.md`) requires that all SQL live in
`apps/backend/src/db/repositories/`; services must call repository methods, never write
SQL directly. The repositories already exist for these tables
(`pipelineSteps`, `chunks`, `graph`). The service must call repository methods with the
transaction object, not issue table queries inline. This is a CR-004 violation.

**B-5 — `applyProcessingMetadata` and `setFlag` execute outside the transaction**

`apps/backend/src/services/processing.ts`, lines 87–91 and 169–172

Both calls use `db.documents.*` (the non-transacted connection), not `trx`. They are
physically inside the `transaction()` callback but are not part of the transaction: they
execute on a separate connection and will not be rolled back if the transaction aborts.

The task description states the handler must execute all writes in a single database
transaction. Metadata and flag writes must participate in the same transaction as
pipeline-step, chunk, and entity writes.

**B-6 — `db.graph.findVocabTermByNormalisedTerm` and `db.graph.appendAlias` execute outside the transaction**

`apps/backend/src/services/processing.ts`, lines 108–113 and 148–153

These calls also use `db.graph.*` rather than a transacted query. The reads for
`findVocabTermByNormalisedTerm` could see stale committed data from a concurrent writer
rather than the state within the current transaction. `appendAlias` writes outside the
transaction and is not rolled back on transaction failure. All reads and writes that are
logically part of the atomic operation must use the transaction object.

**B-7 — `processingRuns` repository not listed in `DbInstance` documentation**

`documentation/process/development-principles.md`, Repository Pattern section (the
`DbInstance` listing)

`development-principles.md` contains the authoritative `DbInstance` listing. The prohibitions
table states: "Adding a repository to `DbInstance` without updating the `DbInstance` listing
in `development-principles.md`" is explicitly prohibited. The `processingRuns` repository
has been added to `apps/backend/src/db/index.ts` but the `DbInstance` type listing in
`development-principles.md` has not been updated to include `processingRuns`.

---

### Suggestions

**S-1 — `triggerProcessing` accepts `config` as a method argument rather than as a
factory dependency**

`apps/backend/src/services/processing.ts`, lines 40–42, 183–185

`config` is passed to `triggerProcessing` at call time rather than closed over in the factory.
This forces the route layer to hold and pass config explicitly, makes the service interface
harder to test (callers must supply a full `AppConfig`), and is inconsistent with how other
services receive config (as a factory dependency). Consider moving `config` into
`ProcessingServiceDeps` so it is available in the closure like `db`, `vectorStore`, and `log`.

**S-2 — SQL injection pattern in `resetStaleRunningSteps`**

`apps/backend/src/db/repositories/pipelineSteps.ts`, line 93

```typescript
db.raw(`NOW() - INTERVAL '${timeoutMinutes} minutes'`)
```

`timeoutMinutes` is interpolated directly into the raw SQL string. The value is
config-sourced and validated as a positive number, so this is not a user-input risk in
practice. However, the parameterised form is the correct pattern and should be used to
make the intent explicit and future-proof against any refactoring that could introduce a
user-controlled value.

**S-3 — `vectorStore.write` inside the transaction callback is not part of the transaction**

`apps/backend/src/services/processing.ts`, line 103

`vectorStore.write` is called inside the `db._knex.transaction` callback but operates on a
separate connection (pgvector via its own Knex instance or HTTP call). If `vectorStore.write`
succeeds but a later write in the same transaction fails, the embeddings row will persist
while the chunks row is rolled back. This is a known limitation of cross-store atomicity.
Adding a comment to this effect (or considering whether the embedding write should be deferred
until after the transaction commits) would make the design intent explicit and avoid confusion
for future maintainers.

**S-4 — Router factory receives `config` as a second argument**

`apps/backend/src/routes/processing.ts`, lines 37–40

The router factory signature is `createProcessingRouter(service: ProcessingService, config: AppConfig)`.
Passing `config` as a second argument to a router factory is inconsistent with the established
narrowing rule: route factories receive one service. If S-1 is addressed by moving `config`
into `ProcessingServiceDeps`, this router signature simplifies to
`createProcessingRouter(service: ProcessingService)`.
This is a consequential suggestion, not blocking on its own, but it follows from S-1.

---

## Summary

**Outcome**: Fail

Seven blocking findings require the task to return to `in_progress`:

- B-1: No unit tests for either task — the primary acceptance condition requirement is unmet.
- B-2: Full pipeline write integration test absent — required by Task 12 acceptance condition.
- B-3: Transaction rollback integration test absent — required by Task 12 acceptance condition.
- B-4: Service writes SQL directly to tables inside the transaction, bypassing repositories
  — Repository Pattern violation (CR-004, `development-principles.md`).
- B-5: `applyProcessingMetadata` and `setFlag` execute outside the transaction despite being
  logically part of the atomic write — the transaction guarantee is broken.
- B-6: `findVocabTermByNormalisedTerm` and `appendAlias` inside the transaction callback use
  the non-transacted connection — reads may be stale and the alias write will not roll back
  on transaction failure.
- B-7: `processingRuns` added to `DbInstance` but `development-principles.md` listing not
  updated — violates the explicit rule in the prohibitions table.

The task returns to `in_progress`.
