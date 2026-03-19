# Code Review — Backend Service — Tasks 11 & 12: Processing Trigger and Processing Results

**Date**: 2026-03-19 06:56
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/services/processing.ts`
- `apps/backend/src/routes/processing.ts`
- `apps/backend/src/routes/__tests__/processing.integration.test.ts`
- `apps/backend/src/db/repositories/processingRuns.ts`
- `apps/backend/src/db/repositories/index.ts`
- `apps/backend/src/db/index.ts`
- `apps/backend/src/utils/pythonClient.ts`
- `apps/backend/src/vectorstore/VectorStore.ts`
- `apps/backend/src/vectorstore/PgVectorStore.ts`
- `apps/backend/src/routes/index.ts`
- `apps/backend/src/index.ts`
- `apps/backend/src/server.ts`
- `apps/backend/src/db/repositories/graph.ts` (relevant methods)
- `apps/backend/src/db/repositories/pipelineSteps.ts`
- `apps/backend/src/db/repositories/documents.ts` (relevant methods)

---

## Acceptance condition

### Task 11 — PROC-001: POST /api/processing/trigger

**Condition type**: automated (route integration tests)

**(a) Returns 409 when a `processing_runs` record with `in_progress` status already exists.**

Met. Test: `returns 409 when a processing run is already in_progress`. Inserts an `in_progress` run via `insertProcessingRun`, calls the endpoint, asserts `res.status === 409` and `res.body.error === 'conflict'`. Exercises real DB via the service.

**(b) Resets stale `running` steps to `failed` before querying documents.**

Met. Test: `resets stale running steps to failed before querying documents`. Inserts a step with `startedAt` 2 hours in the past (well beyond the 30-minute config timeout), triggers processing, then asserts `step.status === 'failed'`. The mock for `fetch` is correctly scoped with `vi.stubGlobal` / `vi.unstubAllGlobals()`.

**(c) Returns `{ runId, documentsQueued }` synchronously; does not wait for the async loop.**

Met. Test: `returns { runId, documentsQueued } synchronously`. Inserts a document with a pending step, calls the endpoint, asserts `res.status === 200`, `res.body.runId` matches a UUID pattern, and `res.body.documentsQueued === 1`. The response arrives before the async loop completes.

**(d) Async loop calls Python HTTP endpoint once per document; calls `receiveProcessingResults`; updates `processing_runs` to `completed` after all documents finish.**

Met. Test: `completes the async loop and marks the processing run as completed`. Uses `vi.waitFor` to poll until `processing_runs.status === 'completed'`, with a 5-second timeout and 100ms interval. `fetch` is stubbed to return a valid `ProcessingResultsRequest`-shaped response. The `receiveProcessingResults` path is exercised end-to-end because the mock response is a valid payload — the service processes it against the real DB.

### Task 12 — PROC-002: POST /api/processing/results

**Condition type**: automated (route integration tests)

**(a) Full successful pipeline write across all seven tables.**

Met. Test: `writes rows across all seven tables on a full payload (B-2)`. Inserts a real document and a pipeline step beforehand (FK constraint satisfied). Submits a full payload with `stepResults`, `metadata`, one chunk with a 384-dimension embedding, two entities, one relationship, and empty flags. Asserts across `documents` (metadata applied), `pipeline_steps` (status updated, `attemptCount` incremented), `chunks` (row inserted, text confirmed), `embeddings` (row inserted for correct `chunkId`), `vocabulary_terms` (new entity with `source: 'llm_extracted'`), `entity_document_occurrences` (occurrence row inserted), `vocabulary_relationships` (one relationship inserted).

**(b) Entity deduplication — new entity.**

Met. Test: `inserts a new vocabulary_terms row for a new entity`. Confirms term inserted with correct `source` and an `entity_document_occurrences` row.

**(c) Entity deduplication — existing entity with alias append.**

Met. Test: `appends alias and inserts occurrence when entity matches existing term`. Confirms no new `vocabulary_terms` row, alias appended, occurrence inserted. Additional idempotency test: `appendAlias is idempotent — posting the same entity twice does not duplicate the alias (S-1)`. Asserts alias appears exactly once after two identical submissions.

**(d) Entity deduplication — rejected entity suppression.**

Met. Test: `suppresses entity whose normalisedName matches a rejected term`. Confirms no `vocabulary_terms` row and no `entity_document_occurrences` row inserted.

**(e) Relationship deduplication.**

Met. Test: `silently ignores duplicate relationship inserts`. Submits the same relationship twice; asserts exactly one row in `vocabulary_relationships`. Note: the assertion queries `{ source_termId: sourceId, target_termId: targetId }` using `_knex` directly (snake_case query on camelCase column — see finding S-1 below).

**(f) Flag writing.**

Met. Test: `sets flagReason and flaggedAt when flags are present`. Confirms `flagReason` and `flaggedAt` are non-null after the call.

**(g) Transaction rollback on failure.**

Met. Test: `rolls back the entire transaction when a write fails mid-way (B-3)`. Sends a chunk with embedding dimension 1 (wrong for the 384-column). The PgVectorStore dimension guard fires before the DB insert and throws via the service logic (`if (writeResult.outcome === 'error') throw`). The transaction rolls back. Asserts `res.status === 500` (unexpected error → error handler), `pipeline_steps` row unchanged (`status: 'running'`, `attemptCount: 0`), no chunks, no embeddings.

**(h) Conditional description overwrite (UR-053).**

Met. Three tests: overwrites when `metadata.description` is non-null/non-empty; preserves when null; preserves when empty string.

**Result**: Met (all conditions)

---

## Findings

### Blocking

None.

---

### Suggestions

**S-1 — Test uses raw snake_case column name in `_knex` query (relationship deduplication test)**

File: `apps/backend/src/routes/__tests__/processing.integration.test.ts`, line 554–557

```typescript
const rels = await db._knex('vocabulary_relationships').where({
  source_termId: sourceId,
  target_termId: targetId,
});
```

The column names `source_termId` and `target_termId` are neither correct snake_case (`source_term_id`, `target_term_id`) nor the camelCase that `wrapIdentifier` would translate. This is a mixed-case form that likely works only because `wrapIdentifier` applies a camelCase-to-snake_case conversion on the string as given (treating the capital `I` as the start of a new word segment). The assertion is not wrong in practice — the test passes — but the intent is ambiguous and the column name form is inconsistent with every other direct `_knex` assertion in the test file, which uses camelCase (e.g. `{ documentId, stepName: 'ocr' }`, `{ termId: ..., documentId: ... }`). Using the camelCase form `{ sourceTermId, targetTermId }` would be consistent with the rest of the test file and make the `wrapIdentifier` behaviour explicit rather than incidental.

**S-2 — `processesRuns` repository methods do not accept `trx` parameter**

File: `apps/backend/src/db/repositories/processingRuns.ts`, lines 18–43

`findInProgressRun`, `createRun`, and `completeRun` do not accept an optional `trx?: Knex.Transaction` parameter. The `processingRuns` table is not currently written inside the `receiveProcessingResults` transaction (it is written outside — run creation happens before the transaction, run completion happens after the loop). This is correct for the current design. However, the pattern in `development-principles.md` states that repository methods that *may* participate in a transaction should accept `trx`. If a future task needs to roll back a run creation together with other writes, the absence of `trx` will require a repository change at that point. The methods are not called inside a transaction today, so this is not a blocking issue — flagged as a suggestion for consistency with the established pattern.

**S-3 — `pythonClient.ts` response typed with `as Promise<...>` cast rather than runtime validation**

File: `apps/backend/src/utils/pythonClient.ts`, line 43

```typescript
return res.json() as Promise<ProcessingResultsRequest>;
```

The response from Python is cast to `ProcessingResultsRequest` without Zod validation. This is consistent with the project's current pattern for internal service calls (the `validate` middleware handles incoming Express requests; Python responses are trusted). However, if Python returns a malformed response, the error will surface as a confusing runtime failure inside `receiveProcessingResults` rather than as a clear deserialization error. A `ProcessingResultsRequestSchema.parse(await res.json())` call here would give a Zod parse error with field paths rather than a deep runtime failure. This is a suggestion, not blocking — the internal trust model (ADR-044) accepts this risk for Phase 1.

---

## Status of Previous Review Findings (2026-03-19-0616)

**B-1 (blocking — VectorStore.write() not participating in the transaction)**: Fixed.

`VectorStore.write()` now accepts an optional `trx?: Knex.Transaction` parameter (interface: `VectorStore.ts` line 37–42; implementation: `PgVectorStore.ts` line 49). `EmbeddingsRepository.insert()` accepts `trx` and uses `const qb = trx ?? db`. `ProcessingService.receiveProcessingResults()` calls `vectorStore.write(documentId, chunkId, chunk.embedding, trx)` inside the transaction block. If `write` returns an error, the service throws, triggering rollback. All three layers are consistent.

**B-2 (blocking — full 7-table test lacked a real document row causing FK failure)**: Fixed.

The `writes rows across all seven tables on a full payload (B-2)` test now calls `insertDocument()` before calling the endpoint. The FK constraint on `chunks.document_id → documents.id` is satisfied. The test passes and verifies all seven tables.

**S-1 (suggestion — config accessed via `deps.config`)**: Addressed.

`ProcessingServiceDeps` includes `config: AppConfig`. The factory destructures it as `const { db, config, log, vectorStore } = deps` and accesses it via `config.pipeline.*`, `config.python.*`, `config.auth.*`. No reconstruction of config inside the service.

**S-2 (suggestion — VectorStore interface, PgVectorStore, and callers consistent on `trx`)**: Addressed.

Interface, implementation, and `ProcessingService` caller are all consistent. `EmbeddingsRepository.insert()` accepts `trx`. `PgVectorStore.write()` threads it to `this.db.embeddings.insert(row, trx)`.

**S-3 (suggestion — all 7 writes inside single transaction)**: Addressed.

All seven writes in `receiveProcessingResults` are inside the `db._knex.transaction(async (trx) => { ... })` block: `pipelineSteps.updateStep(..., trx)`, `documents.applyProcessingMetadata(..., trx)`, `chunks.insert(..., trx)`, `vectorStore.write(..., trx)` (which calls `embeddings.insert(..., trx)`), `graph.findVocabTermByNormalisedTerm(..., trx)`, `graph.appendAlias(..., trx)`, `graph.insertOccurrence(..., trx)`, `graph.findNormalisedTermInRejected(..., trx)`, `graph.upsertTerm(..., trx)`, `graph.insertRelationship(..., trx)`, `documents.setFlag(..., trx)`. The B-3 rollback test confirms atomicity.

---

## Summary

**Outcome**: Pass

No blocking findings. Both tasks satisfy their acceptance conditions. The previous blocking findings B-1 and B-2 are correctly resolved. Suggestions S-1, S-2, S-3 have been addressed in the implementation. Three new suggestions are raised (none blocking): a mixed-case column name in a test assertion (S-1), `processingRuns` repository methods not accepting `trx` for future-proofing (S-2), and an unvalidated Python response cast (S-3). All three are optional improvements.

Tasks 11 and 12 are ready to advance to `reviewed`.
