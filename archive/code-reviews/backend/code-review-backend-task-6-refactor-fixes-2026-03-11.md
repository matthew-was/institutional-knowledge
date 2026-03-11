# Code Review — Backend Service — Task 6 Refactor Fixes: B-001, B-002, S-001, S-004

**Date**: 2026-03-11 16:32
**Task status at review**: done (Task 6 is done; this review covers fix commits resolving findings
from the prior refactor review)
**Prior review**: `archive/code-reviews/backend/code-review-backend-task-6-refactor-2026-03-11-1137.md`
**Files reviewed**:

- `apps/backend/src/db/index.ts`
- `apps/backend/src/db/repositories/embeddings.ts`
- `apps/backend/src/db/utils.ts`
- `apps/backend/src/graphstore/PostgresGraphStore.ts`
- `apps/backend/src/server.ts`
- `apps/backend/src/vectorstore/__tests__/PgVectorStore.integration.test.ts`

---

## Acceptance condition

Task 6's acceptance condition: integration tests against a real PostgreSQL instance confirm:
(a) `write` + `search` round-trip
(b) dimension mismatch throws a descriptive error
(c) topK limiting — 5 embeddings, topK=3 returns exactly 3 results
(d) empty database search returns an empty array

**Condition type**: automated

**Result**: Met

The integration tests in `apps/backend/src/vectorstore/__tests__/PgVectorStore.integration.test.ts`
cover all four conditions. The fix commits do not change the observable behaviour of
`PgVectorStore.write()` or `PgVectorStore.search()`. All assertions remain valid.

---

## Prior findings — resolution status

### B-001 — `createGraphStore` factory signature

`apps/backend/src/graphstore/PostgresGraphStore.ts`, lines 82–91:

```typescript
export function createGraphStore(
  graphConfig: AppConfig['graph'],
  db: DbInstance,
  log: Logger,
): GraphStore {
  if (graphConfig.provider === 'postgresql') {
    return new PostgresGraphStore(db, log);
  }
  throw new Error(`Unknown graph provider: ${graphConfig.provider}`);
}
```

`apps/backend/src/server.ts`, line 65:

```typescript
const graphStore = createGraphStore(config.graph, db, log);
```

**Resolved.** The factory now accepts `AppConfig['graph']`, `DbInstance`, and `Logger`, matching
the plan specification and the pattern established by `createStorageService` and
`createVectorStore`. `server.ts` passes `config.graph` and `log` rather than the raw provider
string. `PostgresGraphStore` stores `_log` as a private field, ready for Task 7 to wire logging
into the full implementation.

### B-002 — `createDb` migration extension mismatch in tests

`apps/backend/src/db/index.ts`, lines 108–146:

The fix introduces `createTestDb` — a synchronous, exported function that builds the same Knex
instance (with `wrapIdentifier` and `postProcessResponse` hooks) but skips the `SELECT 1`
connectivity check and `migrate.latest()`. Schema lifecycle remains with `globalSetup.ts`, which
uses `extension: 'ts'` and `loadExtensions: ['.ts']`. `createDb` retains `extension: 'js'`
unchanged, which is correct for compiled production output.

**Resolved.** `createTestDb` is correctly structured. `DbInstance` is inferred from
`buildDbInstance` and exported as a named type (`export type DbInstance = ReturnType<typeof buildDbInstance>`),
so test files can import it cleanly. The integration test file now calls `createTestDb(...)` at
module scope (synchronous), avoiding the `beforeAll` async ceremony that was previously needed
for `createDb`.

### S-001 — `as unknown as SearchResult[]` double cast

`apps/backend/src/db/repositories/embeddings.ts`, lines 69–76:

The `Object.fromEntries` + double cast is replaced with an explicit per-field object literal:

```typescript
return result.rows.map((row) => ({
  chunkId: row.chunk_id as string,
  documentId: row.document_id as string,
  text: row.text as string,
  chunkIndex: row.chunk_index as number,
  tokenCount: row.token_count as number,
  similarityScore: row.similarity_score as number,
}));
```

**Resolved.** The snake_case-to-camelCase correspondence is now explicit and visible in the source.
Adding a new field to `SearchResult` will surface a compile-time error if the mapping is not
updated. The `camelCase` import is no longer present in `embeddings.ts`. The per-field `as T`
casts are unavoidable given that `knex.raw` returns `Record<string, unknown>` rows; they are
narrower and more readable than the previous double cast.

### S-004 — Redundant `as string` cast in `camelCase`

`apps/backend/src/db/utils.ts`, line 39:

```typescript
return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
```

**Resolved.** The `as string` cast is removed. `char` is typed by the explicit parameter
annotation in the callback signature.

---

## Findings

### Blocking

None.

### Suggestions

**S-005 — `postProcessResponse` implementation duplicated between `createDb` and `createTestDb`**

`apps/backend/src/db/index.ts`, lines 68–78 and lines 130–140.

The `postProcessResponse` callback (including the inner `toCamel` function) is copied verbatim
in both `createDb` and `createTestDb`. The `buildDbInstance` refactor correctly factored out the
repository and destroy logic, but the Knex configuration block itself was not factored. If the
`postProcessResponse` or `wrapIdentifier` logic ever changes, both functions must be updated in
sync.

A shared inline constant (e.g. `const knexConfig = (dbConfig: AppConfig['db']) => ({ ... })`)
or a small `buildKnexConfig` helper would remove the duplication. Not blocking because the
current implementation is functionally correct and the duplication is short (10 lines).

---

## Summary

**Outcome**: Pass

All four prior findings are correctly resolved:

- **B-001**: `createGraphStore` now accepts `AppConfig['graph']` and `Logger`, matching the plan
  and the established factory pattern.
- **B-002**: `createTestDb` correctly omits `SELECT 1` and `migrate.latest()`, leaving schema
  management entirely to `globalSetup.ts`. Production `createDb` is unchanged and correct for
  compiled output.
- **S-001**: Explicit per-field mapping replaces the double cast; the snake_case-to-camelCase
  correspondence is now statically visible.
- **S-004**: Redundant `as string` cast removed from `camelCase`.

No regressions were introduced. One new suggestion (S-005) flags duplicated Knex configuration
in `createDb` and `createTestDb`; it is not blocking.

The refactor commits are ready to merge with the Task 6 branch.
