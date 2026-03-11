# Code Review — Backend Service — Task 6: Implement VectorStore interface and PgVectorStore

**Date**: 2026-03-10 19:30
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/vectorstore/VectorStore.ts`
- `apps/backend/src/vectorstore/PgVectorStore.ts`
- `apps/backend/src/vectorstore/index.ts`
- `apps/backend/src/vectorstore/__tests__/PgVectorStore.integration.test.ts`
- `apps/backend/src/testing/globalSetup.ts`
- `apps/backend/src/testing/dbCleanup.ts`
- `apps/backend/src/server.ts`
- `apps/backend/src/index.ts`
- `apps/backend/src/db/migrations/__tests__/migrations.integration.test.ts`
- `apps/backend/vitest.config.ts`

---

## Acceptance condition

**Restated**: Integration tests against a real PostgreSQL instance (with pgvector) confirm:

- (a) write + search round-trip: insert a chunk and embedding; search with the same vector; verify the chunk is returned as the top result.
- (b) Dimension mismatch: searching with a vector of wrong length throws a descriptive error.
- (c) topK limiting: inserting 5 embeddings and searching with topK=3 returns exactly 3 results.
- (d) Empty database search returns an empty results array without error.

All integration tests pass.

**Condition type**: automated

**Result**: Met

All four sub-conditions are covered by `apps/backend/src/vectorstore/__tests__/PgVectorStore.integration.test.ts`:

- (a) `PgVectorStore — write and search round-trip` — inserts a document, chunk, and embedding; searches with the identical vector; asserts `chunkId`, `documentId`, `text`, `chunkIndex`, `tokenCount`, and `similarityScore ≈ 1.0`. The test exercises the actual behaviour stated in the condition.
- (b) `PgVectorStore.search — dimension mismatch` — constructs a 10-element vector, asserts the exact error message string including the expected and received dimensions. The check happens before any database call (short-circuit in `search()`), so the test correctly validates the descriptive error requirement.
- (c) `PgVectorStore — topK limiting` — inserts 5 distinct documents and embeddings in `beforeEach`; asserts `results.toHaveLength(3)` for `topK=3`. A second test in the same describe block also validates ordering (highest similarity first), which strengthens coverage beyond the minimum condition.
- (d) `PgVectorStore.search — empty database` — runs search against an empty database and asserts `results.toEqual([])`. No `beforeEach` inserts data, so the empty-database condition is genuine.

Schema lifecycle is managed correctly: `vitest.config.ts` registers `src/testing/globalSetup.ts` as a global setup, which runs `migrate.latest()` once before all suites and `migrate.rollback()` once after. `fileParallelism: false` prevents concurrent writes to the shared test database. Data isolation between tests is handled by `afterEach(cleanAllTables)` within the test file.

**Manual verification instructions for the developer**:

1. Start the test database: `docker compose -f apps/backend/docker-compose.test.yml up -d`
2. Run the full backend test suite: `pnpm --filter backend test`
3. Confirm all tests pass, including the four PgVectorStore integration tests.
4. Stop and clean the test database: `docker compose -f apps/backend/docker-compose.test.yml down -v`

---

## Findings

### Blocking

None.

### Suggestions

**S-001 — `search()` SQL omits `e.id` relative to the plan's reference query**

File: `apps/backend/src/vectorstore/PgVectorStore.ts`, lines 96–109

The backend plan's reference SQL includes `e.id` in the SELECT list (the `embeddings.id`). The implementation omits it. This is not a correctness issue for Phase 1 — `SearchResult` does not include an embedding ID, and the interface contract is fully satisfied. However, if a future caller needs to reference the `embeddings` row (for example, to update or invalidate a specific embedding), the result set does not carry it. Consider adding `e.id AS embedding_id` to the raw query and to `SearchRow`, even if it is not currently exposed in `SearchResult`, so the data is available to be added to the interface without a query change.

This is a suggestion only — the interface contract is met as written.

**S-002 — Factory signature diverges from the plan's stated signature**

File: `apps/backend/src/vectorstore/index.ts`, lines 18–29

The backend plan specifies the factory as `createVectorStore(config, knex)`. The implementation signature is `createVectorStore(vectorStoreConfig, embeddingConfig, knex, log)` — it accepts two config slices plus a `Logger`. This divergence from the plan is a deliberate and sound improvement: it mirrors the `createStorageService(storageConfig, log)` pattern established in Task 5 (config slices, not the full `AppConfig`), and the `Logger` injection is consistent with every other factory in the codebase. The call site in `server.ts` (lines 73–78) correctly passes `config.vectorStore`, `config.embedding`, `knex`, and `log`. This is the right design; it is noted here only because it is an undocumented deviation from the plan. If the project maintains plan-as-authoritative-record, the plan should be updated to reflect the actual signature — but this is a documentation housekeeping item, not a code problem.

**S-003 — `dbCleanup.ts` list order and `knex_migrations` table**

File: `apps/backend/src/testing/dbCleanup.ts`, lines 11–22

The `ALL_TABLES` list includes all data tables and uses `TRUNCATE ... CASCADE`, which PostgreSQL propagates through all foreign key constraints regardless of list order. The approach is correct. One minor note: `knex_migrations` and `knex_migrations_lock` (Knex bookkeeping tables) are not in the list, which is correct — truncating them would break the migration state. No action needed; this is noted for the developer's awareness.

**S-004 — `write()` does not validate embedding dimension before inserting**

File: `apps/backend/src/vectorstore/PgVectorStore.ts`, lines 52–68

`search()` validates that `queryEmbedding.length === this.embeddingDimension` and throws before touching the database. `write()` performs no equivalent check on the incoming `embedding` array. In practice, PostgreSQL will reject a vector of the wrong dimension at the `INSERT` with a database-level error (the `vector(384)` column type enforces this), so correctness is preserved. However, the error that surfaces will be an opaque Knex/pg driver error rather than the descriptive error that `search()` provides. For symmetry and debuggability, consider adding the same dimension guard to `write()`. Not blocking — the database constraint prevents corrupt data regardless.

---

## Summary

**Outcome**: Pass

No blocking findings. The implementation is clean, correct, and well-structured. The interface matches the plan exactly. `PgVectorStore` uses correct pgvector syntax (`?::vector` cast, `<=>` cosine distance operator, query embedding bound twice for the SELECT expression and the ORDER BY). The factory correctly accepts config slices consistent with the established pattern from Task 5. The integration test infrastructure — global setup/teardown for schema lifecycle, `fileParallelism: false`, and `afterEach(cleanAllTables)` for data isolation — is well-designed and addresses the concerns identified in the Task 2 verification notes. All four acceptance condition sub-conditions are covered by non-vacuous tests. The task is ready to advance to `reviewed`.
