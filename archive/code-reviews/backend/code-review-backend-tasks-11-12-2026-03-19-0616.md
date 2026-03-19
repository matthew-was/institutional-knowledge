# Code Review — Backend Service — Tasks 11 & 12: Processing Trigger and Results Handlers

**Date**: 2026-03-19 06:16
**Task status at review**: code_complete (both tasks)
**Files reviewed**:

- `apps/backend/src/routes/processing.ts`
- `apps/backend/src/services/processing.ts`
- `apps/backend/src/db/repositories/processingRuns.ts`
- `apps/backend/src/utils/pythonClient.ts`
- `apps/backend/src/routes/__tests__/processing.integration.test.ts`
- `apps/backend/src/db/repositories/documents.ts`
- `apps/backend/src/db/repositories/graph.ts`
- `apps/backend/src/db/repositories/pipelineSteps.ts`
- `apps/backend/src/db/repositories/chunks.ts`
- `apps/backend/src/db/repositories/embeddings.ts`
- `apps/backend/src/db/index.ts`
- `apps/backend/src/db/repositories/index.ts`
- `apps/backend/src/routes/index.ts`
- `apps/backend/src/index.ts`
- `apps/backend/src/server.ts`
- `packages/shared/src/schemas/processing.ts`

---

## Acceptance Conditions

### Task 11 (PROC-001) — automated

The acceptance condition requires route integration tests confirming:

- (a) Returns 409 when a `processing_runs` record with `in_progress` status already exists.
- (b) Resets stale `running` steps (older than the timeout) to `failed` before querying documents.
- (c) Returns `{ runId, documentsQueued }` synchronously; does not wait for the async loop.
- (d) The async loop calls the Python HTTP endpoint once per document (mock `fetch` via
  `vi.stubGlobal`); calls `receiveProcessingResults` service logic with the Python response;
  updates `processing_runs` to `completed` after all documents finish.

**Result**: Partially met — see Blocking finding B-1 below.

- (a): Covered by test "returns 409 when a processing run is already in_progress" (line 673). Pass.
- (b): Covered by test "resets stale running steps to failed before querying documents" (line 689). The test inserts a step started 2 hours ago against a 30-minute timeout and verifies it transitions to `failed`. Pass.
- (c): Covered by test "returns `{ runId, documentsQueued }` synchronously" (line 734). Pass.
- (d): Async loop completion covered by test "completes the async loop and marks the processing run as completed" (line 776). Python call mock confirmed via `vi.stubGlobal`. Pass.

### Task 12 (PROC-002) — automated

The acceptance condition requires route integration tests confirming:

- (a) Full successful pipeline write across `documents`, `chunks`, `embeddings`,
  `vocabulary_terms`, `vocabulary_relationships`, `entity_document_occurrences`, and
  `pipeline_steps`.
- (b) Entity deduplication — new entity: inserts new `vocabulary_terms` row with
  `source = 'llm_extracted'`.
- (c) Entity deduplication — existing entity with alias append.
- (d) Entity deduplication — rejected entity suppression.
- (e) Relationship deduplication: duplicate composite key insert is silently ignored.
- (f) Flag writing.
- (g) Transaction rollback on failure.
- (h) Conditional description overwrite.

**Result**: Partially met — see Blocking finding B-1 below.

- (a): The B-2 test ("writes rows across all seven tables on a full payload", line 527) sends
  `relationships: []`, so `vocabulary_relationships` is not written to and is verified empty.
  Relationship insertion is tested separately (line 460), but the stated acceptance condition
  requires a single "full payload" test that writes rows to all seven tables. The B-2 test
  is a weaker approximation: it does not demonstrate that a relationship row can be part of the
  atomic transaction covering all seven tables simultaneously.
- (b): Covered by "inserts a new vocabulary_terms row for a new entity" (line 333). Pass.
- (c): Covered by "appends alias and inserts occurrence when entity matches existing term"
  (line 373). The test confirms the alias IS appended; the repository-level no-op for duplicate
  aliases is enforced by `whereRaw('NOT (? = ANY(aliases))')` in `graph.ts` but is not
  exercised by a test that submits the same alias twice. This is a minor gap addressed as
  a Suggestion below.
- (d): Covered by "suppresses entity whose normalisedName matches a rejected term" (line 424). Pass.
- (e): Covered by "silently ignores duplicate relationship inserts" (line 460). Pass.
- (f): Covered by "sets flagReason and flaggedAt when flags are present" (line 504). Pass.
- (g): Covered by "rolls back the entire transaction when a write fails mid-way" (line 616). Pass.
- (h): Covered by three tests: description overwrite (line 247), preserved when null (line 277),
  preserved when empty string (line 305). Pass.

---

## Findings

### Blocking

**B-1 — Plan deviation: `VectorStore.write()` not called; embeddings written directly to repository**

- **Files**: `apps/backend/src/services/processing.ts` lines 110–118;
  `apps/backend/src/db/repositories/embeddings.ts`
- **Issue**: The backend plan (`integration-lead-backend-plan.md`, line 284) and Task 12
  description (step 5) both specify: "For each chunk: insert `chunks` row; call
  `VectorStore.write()` with chunk ID and embedding." The `ProcessingServiceDeps` interface
  does not include a `vectorStore` dependency. The service calls `db.embeddings.insert()`
  directly, bypassing the `VectorStore` abstraction entirely.

  This has two consequences:

  1. **Infrastructure as Configuration violated**: embedding writes are now hardwired to the
     `PgVectorStore` implementation via the repository layer. A future non-PostgreSQL vector
     store (e.g. dedicated Pinecone or Weaviate store) cannot be swapped in without modifying
     the processing service. The `VectorStore` interface exists precisely to prevent this.

  2. **Embedding dimension validation skipped**: `PgVectorStore.write()` validates that
     `embedding.length === this.embeddingDimension` before issuing the DB insert. By calling
     `db.embeddings.insert()` directly, the service skips this guard. The only enforcement
     left is the database-level pgvector cast failure (as demonstrated in the B-3 rollback
     test), which surfaces as a 500 rather than a meaningful validation error.

  **What must change**: `ProcessingServiceDeps` must include a `vectorStore: VectorStore`
  field. The `receiveProcessingResults` logic must call `vectorStore.write(documentId,
  chunkId, chunk.embedding)` instead of `db.embeddings.insert(...)` directly. The service
  factory in `server.ts` and the test setup in `processing.integration.test.ts` must pass
  the `vectorStore` into `createProcessingService`. Note: the dimension validation result
  from `VectorStore.write()` (which returns `ServiceResult<void, VectorStoreErrorType>`)
  must be checked — a `dimension_mismatch` outcome should cause the transaction to roll back
  with an appropriate error.

**B-2 — Acceptance condition (a) not met: B-2 test does not write to `vocabulary_relationships`**

- **File**: `apps/backend/src/routes/__tests__/processing.integration.test.ts` lines 527–614
- **Issue**: The Task 12 acceptance condition (a) reads: "submit a full
  `ProcessingResultsRequest` payload; verify all rows are present across `documents`,
  `chunks`, `embeddings`, `vocabulary_terms`, `vocabulary_relationships`,
  `entity_document_occurrences`, and `pipeline_steps`." The B-2 test submits
  `relationships: []`, meaning no row is written to `vocabulary_relationships`. The test
  verifies the table is empty (`expect(rels).toHaveLength(0)`), which is not evidence that
  a relationship row CAN be part of the full atomic write. Relationship insertion is tested
  in a separate test, but the acceptance condition explicitly requires a single "full payload"
  test that writes to all seven tables.

  **What must change**: The B-2 test payload must include at least one relationship entry (with
  `sourceEntityName` and `targetEntityName` matching one of the entity `normalisedName` values
  already in the payload), so that a `vocabulary_relationships` row is written within the same
  transaction as all other tables. The assertion on `vocabulary_relationships` must confirm at
  least one row is present.

---

### Suggestions

**S-1 — Alias idempotency not exercised by a test**

- **File**: `apps/backend/src/routes/__tests__/processing.integration.test.ts`
- The `appendAlias` method in `graph.ts` uses `whereRaw('NOT (? = ANY(aliases))', [alias])`
  to prevent duplicate alias entries. This guard is not exercised by any test — no test submits
  the same entity twice (with the same `name`) to verify that the alias array does not grow
  beyond one entry. Adding a test that submits the same payload twice and asserts
  `term.aliases` has exactly one copy of the alias would confirm the idempotency guard works
  end-to-end.

**S-2 — Service error outcome from `VectorStore.write()` not checked in async loop**

- **File**: `apps/backend/src/services/processing.ts` (async loop, applies once B-1 is fixed)
- Once `VectorStore.write()` is called from the service, its return value is a
  `ServiceResult<void, VectorStoreErrorType>`. In the current direct-to-repository approach
  the dimension error surfaces as a thrown exception, which the loop's `catch` handles. After
  fixing B-1, the `dimension_mismatch` outcome must be handled explicitly — either by throwing
  from within the transaction if the result is an error (so the transaction rolls back), or by
  treating it as a processing error and logging it accordingly. The current pattern of ignoring
  `ServiceResult` error outcomes inside a transaction is not safe.

**S-3 — `allErrored` logic treats a `not_found` ServiceResult as success**

- **File**: `apps/backend/src/services/processing.ts` lines 267–295
- In `runAsyncLoop`, `allErrored = false` is set whenever `receiveResults(pythonResponse)`
  returns without throwing — including when `receiveResults` returns `{ outcome: 'error',
  errorType: 'not_found' }`. A `not_found` outcome means the document was not persisted but
  the loop continues as if the document succeeded. This means `processing_runs` can end up
  with status `completed` even when documents were silently not processed. The consequence
  is low-severity in Phase 1 (the document would be retried on the next trigger), but the
  run status is misleading. Consider checking the `ServiceResult.outcome` after calling
  `receiveResults` and treating an error outcome as a document error.

---

## Summary

**Outcome**: Fail

Two blocking findings prevent the task from advancing:

- **B-1**: The `VectorStore` abstraction is bypassed for embedding writes, violating the
  Infrastructure as Configuration principle and skipping the dimension validation guard.
  The backend plan and task description both explicitly require `VectorStore.write()` to be
  called. The `ProcessingServiceDeps` interface must be updated and the service must be
  wired to the `vectorStore` dependency.

- **B-2**: The B-2 integration test (acceptance condition (a)) does not write a row to
  `vocabulary_relationships`, making it a weaker approximation of the stated acceptance
  condition. The payload must include at least one relationship to satisfy the "full payload
  across all seven tables" requirement.

Both findings must be resolved before the task returns to `reviewed` status.
