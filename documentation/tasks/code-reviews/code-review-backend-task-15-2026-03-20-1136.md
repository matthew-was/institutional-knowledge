# Code Review — Backend Service — Task 15: Implement health check and admin endpoints

**Date**: 2026-03-20 11:36
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/services/admin.ts`
- `apps/backend/src/routes/admin.ts`
- `apps/backend/src/routes/__tests__/admin.integration.test.ts`
- `apps/backend/src/testing/testHelpers.ts`
- `apps/backend/src/middleware/__tests__/middleware.test.ts`
- `apps/backend/src/routes/__tests__/documents.integration.test.ts`
- `apps/backend/src/routes/__tests__/curation.integration.test.ts`
- `apps/backend/src/routes/__tests__/vocabulary.integration.test.ts`
- `apps/backend/src/routes/__tests__/processing.integration.test.ts`
- `apps/backend/src/routes/__tests__/search.integration.test.ts`
- `apps/backend/src/routes/__tests__/ingestion.integration.test.ts`
- `apps/backend/src/index.ts`
- `apps/backend/src/routes/index.ts`
- `apps/backend/src/server.ts`
- `documentation/process/development-principles.md`

---

## Acceptance condition

**Condition type**: automated

**Restatement**:

Route integration tests (supertest → validate → service → real database) confirm:

(a) `healthCheck`: `GET /api/health` returns `{ status: 'ok', timestamp: <ISO string> }`.

(b) `reindexEmbeddings`: `POST /api/admin/reindex-embeddings` against a real database that
has the embeddings IVFFlat index (migration 004); the command executes without error and the
index remains queryable via `VectorStore.search()`.

**Result**: Not met (one test covers condition (b) and one additional test covers the 401
response, but the blocking finding in §B-1 below means the test exercises the wrong code
path — the service calls `db._knex.raw` directly rather than going through a repository.
Condition (b) is not met in conformance with the project's structural rules. Condition (a)
is met: `GET /api/health` test at line 90–99 of `admin.integration.test.ts` correctly
asserts status 200, `status: 'ok'`, and a parseable ISO string for `timestamp`.)

---

## Findings

### Blocking

#### B-1 — SQL in service code: `db._knex.raw` called from `AdminService`, not from a repository

**File**: `apps/backend/src/services/admin.ts`, lines 54–56

The `reindexEmbeddings` method calls `db._knex.raw(...)` directly:

```typescript
await db._knex.raw(
  'REINDEX INDEX CONCURRENTLY embeddings_embedding_ivfflat_idx',
);
```

The Repository Pattern in `development-principles.md` is explicit: "All SQL lives in
`apps/backend/src/db/repositories/`." The `_knex` access rules table lists the permitted
callers of `db._knex` — services (`services/*.ts`) are not among them, with the only
service-adjacent exception being "multi-table transactions" (i.e. passing `db._knex` to
`knex.transaction()`). This is not a transaction boundary — it is a DDL statement executed
from service code. The anti-pattern table also prohibits "Accessing `db._knex` outside tests
or transactions."

The fact that `REINDEX INDEX CONCURRENTLY` cannot run inside a transaction does not make
service-level SQL acceptable. The correct fix is to move the `db._knex.raw` call into a
repository method — the `EmbeddingsRepository` is the natural home, since the operation
targets the `embeddings` table's index. The service then calls
`db.embeddings.reindexIvfflat()` (or a similarly named method) and passes no arguments.
The repository receives raw `Knex` and may call `knex.raw` freely.

This is a blocking finding per the Repository Pattern and CR-004.

---

#### B-2 — Inline `res.json()` in error branch instead of `sendServiceError`

**File**: `apps/backend/src/routes/admin.ts`, lines 41–46

The error branch uses an inline `res.status(...).json(...)` call:

```typescript
const status = ERROR_STATUS[result.errorType];
res.status(status).json({
  error: result.errorType,
  message: result.errorMessage,
});
```

`development-principles.md` lists this exact form as prohibited: "Inline
`res.status(...).json({ error, message })` in a route handler instead of `sendServiceError`."
Every other route file (`documents.ts`, `curation.ts`, `vocabulary.ts`, `processing.ts`,
`search.ts`, `ingestion.ts`) imports and uses `sendServiceError`. The admin route does not
import `sendServiceError` at all.

The fact that `ReindexError` is `never` and the branch is unreachable at runtime does not
exempt it — the prohibition is architectural (envelope shape is enforced in one place), and
future additions to `ReindexError` should not require discovering that the pattern was broken.
The fix is to import `sendServiceError` and replace the inline call:

```typescript
sendServiceError(res, ERROR_STATUS[result.errorType], result);
```

This is a blocking finding per the Error Response Pattern anti-pattern prohibition.

---

### Suggestions

#### S-1 — Plan divergence: `{ status: 'reindexing' }` vs `{ reindexed: boolean }`

**File**: `documentation/tasks/integration-lead-backend-plan.md`, line 329

The backend plan specifies the response body as `{ status: 'reindexing' }`:

> Returns `{ status: 'reindexing' }` immediately

The implementation returns `{ reindexed: true }`, which matches the contracts document
(`integration-lead-contracts.md` ADMIN-001, line 1140: `reindexed: boolean`) and the task
description ("Return `{ reindexed: true }` immediately (per ADMIN-001 contract)").

The implementation is correct — the contracts document is the authoritative source for the
API contract. However, the plan is now inconsistent with both the contract and the
implementation. The developer should update the plan to reflect the correct response shape,
or note the divergence explicitly. This is a suggestion only.

#### S-2 — `vectorStore` passed as an override in `admin.integration.test.ts` but not directly called by the admin route

**File**: `apps/backend/src/routes/__tests__/admin.integration.test.ts`, lines 63–71

`vectorStore` is passed to `createTestApp` via `overrides`. The admin route itself does not
call `vectorStore` — the vector store is used post-reindex to verify the index is still
queryable, but that call is made directly (`vectorStore.search(...)` at line 119), not
through the app. Passing `vectorStore` to `createTestApp` does not affect the test's
behaviour; the test constructs the `vectorStore` independently and calls it directly.

This is harmless but slightly misleading — it implies the admin route depends on
`vectorStore` when it does not. Removing `vectorStore` from the `createTestApp` overrides
call and keeping only `{ adminService }` would better reflect the actual dependencies. This
is a suggestion only.

---

## Summary

**Outcome**: Fail

Two blocking findings prevent this task from advancing to `reviewed`:

1. **B-1**: `db._knex.raw` is called directly from `AdminService`, violating the Repository
   Pattern. The `REINDEX` DDL must move to a method on `EmbeddingsRepository`; the service
   calls that method via `db.embeddings`.

2. **B-2**: The admin route's error branch uses an inline `res.status(...).json(...)` call
   instead of `sendServiceError`, violating the Error Response Pattern anti-pattern
   prohibition.

The `createTestApp` migration across all seven integration test files and the `makeStubDeps`
helper for middleware unit tests are correct and well-structured. Acceptance condition (a)
for the health check is met. Once the two blocking findings are resolved, the test suite
will confirm condition (b) against a structurally compliant implementation.

Task returns to `in_progress`.
