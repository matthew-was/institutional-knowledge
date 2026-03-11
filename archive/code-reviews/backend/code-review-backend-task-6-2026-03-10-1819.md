# Code Review — Backend Service — Task 6: Implement VectorStore interface and PgVectorStore

**Date**: 2026-03-10 18:19
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/vectorstore/VectorStore.ts`
- `apps/backend/src/vectorstore/PgVectorStore.ts`
- `apps/backend/src/vectorstore/index.ts`
- `apps/backend/src/vectorstore/__tests__/PgVectorStore.integration.test.ts`
- `apps/backend/src/testing/globalSetup.ts`
- `apps/backend/src/testing/dbCleanup.ts`
- `apps/backend/src/db/migrations/__tests__/migrations.integration.test.ts`
- `apps/backend/vitest.config.ts`
- `apps/backend/src/server.ts`
- `apps/backend/src/index.ts`

---

## Acceptance condition

**Restated**: Integration tests against a real PostgreSQL instance (with pgvector) confirm:

- (a) `write` + `search` round-trip: insert a chunk and embedding; search with the same vector; verify the chunk is returned as the top result.
- (b) Dimension mismatch: searching with a vector of wrong length throws a descriptive error.
- (c) topK limiting: inserting 5 embeddings and searching with topK=3 returns exactly 3 results.
- (d) Empty database search returns an empty results array without error.

**Condition type**: automated

**Result**: Met

The test file at `apps/backend/src/vectorstore/__tests__/PgVectorStore.integration.test.ts` contains four `describe` blocks that map directly to acceptance conditions (a)–(d). Each tests actual database behaviour against a real PostgreSQL instance. The header comment explicitly maps each block to its acceptance condition letter. The tests are not vacuous: they assert specific field values (`chunkId`, `documentId`, `text`, `similarityScore`), exact error messages (condition b), exact array length (condition c), and an empty array (condition d).

The results ordering test (separate `it` within the topK suite) is a bonus verification of sort correctness and does not replace condition (c); it strengthens it.

---

## Findings

### Blocking

None.

---

### Suggestions

**S-001 — `vitest.config.ts`: parallel file execution with shared `afterEach(cleanAllTables)` is unsafe for future integration test files**

`apps/backend/vitest.config.ts` — the previous `fileParallelism: false` setting has been removed. The comment in the file states: "Test files may run in parallel since schema lifecycle is managed by globalSetup, not per-file." This reasoning is incomplete.

`globalSetup.ts` manages schema lifecycle (DDL). It does not manage data isolation between test files. Data isolation is handled by `afterEach(cleanAllTables)` within each test file. If two integration test files run in parallel and both call `afterEach(cleanAllTables)`, one file's cleanup will truncate data that the other file's currently-running test just inserted. This produces intermittent failures that are hard to diagnose.

Currently there are only two integration test files, and `migrations.integration.test.ts` queries only system tables (`information_schema`, `pg_indexes`) which are unaffected by `TRUNCATE`. So there is no actual collision today. However, Tasks 9–17 each add integration test files that write to user tables. Once a second data-writing integration test file exists, parallel execution will cause race conditions.

The recommended fix is to reinstate `fileParallelism: false` in `vitest.config.ts` and update the comment to explain why: "Integration test files share a single test database and use afterEach(cleanAllTables) for data isolation. Parallel file execution would allow one file's afterEach to truncate data mid-test in another file. Files run sequentially; tests within a file run in parallel (Vitest default)."

This is a suggestion rather than a blocking finding because it does not affect the current task's tests. However, the developer should act on it before any further integration test files are added — ideally as part of this task since the removal was intentional here.

---

**S-002 — `vectorstore/index.ts`: factory signature diverges from the plan specification**

`apps/backend/src/vectorstore/index.ts` lines 17–22.

The backend plan and task description both specify: `createVectorStore(config, knex)` — a two-parameter signature where the factory reads `vectorStore.provider` and `embedding.dimension` from the config block internally.

The implementation uses: `createVectorStore(provider: string, knex, embeddingDimension: number, log: Logger)` — four parameters with the values pre-extracted by the call site (`server.ts`).

The `storage/index.ts` factory takes `(storageConfig: AppConfig['storage'], log: Logger)` and reads `storageConfig.provider` internally, consistent with the plan's pattern for `createStorageService`.

For consistency with `storage/index.ts` and the plan, `createVectorStore` could accept a config subobject (e.g. `vectorStoreConfig: AppConfig['vectorStore']` plus `embeddingDimension`) rather than raw primitives. The current implementation is not incorrect — the factory still selects the provider at runtime and the values come from config — but it departs from the pattern established by the storage module and the plan's stated signature.

This is a suggestion, not blocking. The developer may apply it or leave it as-is. If left as-is, a note acknowledging the divergence from the plan would be helpful in the task verification record.

---

**S-003 — `globalSetup.ts`: `rollback(undefined, true)` rolls back all batches; consider documenting intent**

`apps/backend/src/testing/globalSetup.ts` line 37.

`db.migrate.rollback(undefined, true)` — the second argument `true` is the `all` flag, which rolls back all migration batches (not just the most recent). This is appropriate for test teardown (clean slate for the next run) but is not obvious to a reader unfamiliar with the Knex API. A brief inline comment would make the intent clear and prevent a future developer from "correcting" it to `rollback()` (which would leave earlier migrations applied).

Suggested comment: `// rollback all batches — leaves a clean slate for the next test run`.

---

**S-004 — `PgVectorStore.integration.test.ts`: `token_count` calculated by word split may be fragile for a test helper**

`apps/backend/src/vectorstore/__tests__/PgVectorStore.integration.test.ts` lines 83–85.

The `insertChunk` helper calculates `token_count` as `text.split(' ').length`. The test at line 129 asserts `result.tokenCount.toBeGreaterThan(0)`, which is deliberately weak — it does not assert a specific count. This is intentional and reasonable for an integration test that only needs to verify the value is persisted and returned. No change required; noted for awareness.

---

## Summary

**Outcome**: Pass

No blocking findings. The implementation is correct, well-structured, and the tests cover all four acceptance conditions. The `?::vector` cast with `JSON.stringify` is the correct pgvector wire format. The duplicate `queryEmbedding` in `search()` is intentional and commented. The `Number()` cast on `similarity_score` correctly handles PostgreSQL returning numeric expressions as strings. The `globalSetup.ts` export shape (`setup` / `teardown`) matches Vitest's expected contract. The `TRUNCATE ... RESTART IDENTITY CASCADE` in `dbCleanup.ts` is correct SQL with no injection risk (table names are hardcoded constants). The migration test is correctly updated to rely on `globalSetup` rather than managing its own schema lifecycle.

The developer should review S-001 (parallel file execution) before adding any further integration test files — it is safe today but will cause intermittent failures once a second data-writing integration test file exists.

The task is ready to advance to `reviewed`.
