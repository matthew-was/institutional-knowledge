# Code Review — Backend Service — Task 6: Implement VectorStore interface and PgVectorStore

**Date**: 2026-03-10 19:52
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/db/migrations/__tests__/migrations.integration.test.ts`
- `apps/backend/src/index.ts`
- `apps/backend/src/server.ts`
- `apps/backend/src/testing/dbCleanup.ts`
- `apps/backend/src/testing/globalSetup.ts`
- `apps/backend/src/vectorstore/PgVectorStore.ts`
- `apps/backend/src/vectorstore/VectorStore.ts`
- `apps/backend/src/vectorstore/__tests__/PgVectorStore.integration.test.ts`
- `apps/backend/src/vectorstore/index.ts`
- `apps/backend/vitest.config.ts`
- `documentation/tasks/backend-tasks.md`
- `documentation/tasks/integration-lead-backend-plan.md`

---

## Acceptance condition

**Restated**: Integration tests against a real PostgreSQL instance (with pgvector) must confirm:

- (a) `write` + `search` round-trip: insert a chunk and embedding; search with the same vector;
  verify the chunk is returned as the top result.
- (b) Dimension mismatch: searching with a vector of wrong length throws a descriptive error.
- (c) topK limiting: inserting 5 embeddings and searching with topK=3 returns exactly 3 results.
- (d) Empty database search returns an empty results array without error.

**Condition type**: automated

**Result**: Met

All four acceptance conditions are covered by tests in
`src/vectorstore/__tests__/PgVectorStore.integration.test.ts`:

- (a) "returns the inserted chunk as the top result when searched with the same vector" — inserts
  one document, one chunk, writes an embedding, calls `search(embedding, 1)`, asserts length
  1, correct field values, and `similarityScore` close to 1.0. Substantive test.
- (b) "throws a descriptive error when queryEmbedding.length does not match configured dimension"
  — uses a 10-element vector against a DIMENSION=384 store; asserts the exact error message
  string. Substantive test.
- (c) "returns exactly topK results when more embeddings exist" — inserts 5 documents, 5 chunks,
  5 embeddings; calls `search(unitVector(10), 3)`; asserts `toHaveLength(3)`. Substantive test.
- (d) "returns an empty array when no embeddings exist" — calls `search` on a clean database;
  asserts `toEqual([])`. Substantive test.

**Dimension mismatch on `write`**: The acceptance condition states "dimension mismatch" for the
`search` path only. However, note that the S-004 change from the previous review round added
dimension validation to `write()` as well — this is an addition beyond the stated condition. No
test covers the `write()` dimension mismatch path. This is not a blocking finding because the
condition is met as stated, but it is noted under Suggestions.

**Manual verification steps** (for developer to run before advancing):

```bash
docker compose -f apps/backend/docker-compose.test.yml up -d
pnpm --filter backend test
docker compose -f apps/backend/docker-compose.test.yml down -v
```

Expected: all integration tests pass (including migrations suite and PgVectorStore suite).

---

## Findings

### Blocking

None.

---

### Suggestions

**S-001 — `write()` dimension mismatch has no test coverage**

`PgVectorStore.write()` validates embedding dimension and throws a descriptive error
(`PgVectorStore.write: embedding dimension mismatch — expected N, received M`). This guard was
added as part of S-004 from the previous review, but no test exercises it. The acceptance
condition does not require it, so this is not blocking. The guard is correct and useful — a
test would confirm it remains in place as the codebase evolves.

File: `apps/backend/src/vectorstore/__tests__/PgVectorStore.integration.test.ts`

Suggested addition: a test in the existing "dimension mismatch" `describe` block that calls
`store.write(docId, chunkId, wrongDimensionVector)` and asserts the same error pattern as the
`search` mismatch test.

**S-002 — `createGraphStore` signature inconsistency with the updated plan**

`src/graphstore/PostgresGraphStore.ts` line 74: `createGraphStore(provider: string, knex:
KnexInstance)` — the factory accepts a raw provider string, not an `AppConfig['graph']` config
slice. The updated backend plan (revised as part of S-002 from the previous round) now documents
the correct pattern as: "Accepts the `AppConfig['graph']` config slice and a `Logger`,
consistent with the factory pattern established by `createStorageService` and
`createVectorStore`."

`server.ts` line 79 calls `createGraphStore(config.graph.provider, knex)` — extracting just the
provider string rather than passing the full slice.

This inconsistency was present before this review round and was not part of the three changes
being re-reviewed. It is flagged here for completeness: the `createGraphStore` signature was not
updated to match the plan that was revised in S-002. Aligning it in a later task (Task 7 or
whenever `PostgresGraphStore` is fully implemented) is acceptable since it is a stub today.
This is a suggestion, not blocking.

File: `apps/backend/src/graphstore/PostgresGraphStore.ts` — line 74
File: `apps/backend/src/server.ts` — line 79

---

## Review of the three targeted changes

### S-001 (previous): `fileParallelism: false` reinstated

`vitest.config.ts` line 13: `fileParallelism: false` is present with a clear explanatory
comment. Correctly implemented.

### S-002 (previous): `createVectorStore` signature updated

`src/vectorstore/index.ts`: `createVectorStore(vectorStoreConfig: AppConfig['vectorStore'],
embeddingConfig: AppConfig['embedding'], knex: KnexInstance, log: Logger)` — correctly accepts
typed config slices and a Logger, matching the `createStorageService` pattern. The factory
passes `embeddingConfig.dimension` to `PgVectorStore`, not a raw number. `server.ts` calls the
factory with `config.vectorStore`, `config.embedding`, `knex`, and `log` — correct.
`integration-lead-backend-plan.md` updated with the correct factory signature wording.
Correctly implemented.

### S-004 (previous): `write()` dimension validation added

`PgVectorStore.ts` lines 58–62: dimension guard checks `embedding.length !== this.embeddingDimension`
and throws a descriptive error matching the pattern used in `search()`. Class JSDoc updated at
lines 1–13 to document the validation. Correctly implemented.

---

## Summary

**Outcome**: Pass

No blocking findings. The three targeted changes from the previous review round are all correctly
implemented. The acceptance condition is fully met by substantive integration tests. The task is
ready to advance to `reviewed`.

The two suggestions above (write-path mismatch test; GraphStore factory signature alignment) are
optional improvements that can be addressed in a later task or alongside the full GraphStore
implementation.
