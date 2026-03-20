# Code Review — Backend Service — Task 15: Implement health check and admin endpoints

**Date**: 2026-03-20 11:39
**Task status at review**: code_complete
**Round**: 2 (re-review after B-1 and B-2 fixes from round 1)
**Files reviewed**:

- `apps/backend/src/db/repositories/embeddings.ts` — new `reindexIvfflat()` method
- `apps/backend/src/services/admin.ts` — now calls `db.embeddings.reindexIvfflat()`
- `apps/backend/src/routes/admin.ts` — now uses `sendServiceError`
- `apps/backend/src/routes/__tests__/admin.integration.test.ts` — unchanged from round 1; re-confirmed

All other files from round 1 are unchanged and are not re-reviewed here.

---

## Acceptance condition

**Condition type**: automated

**Restatement**:

Route integration tests (supertest → validate → service → real database) confirm:

(a) `healthCheck`: `GET /api/health` returns `{ status: 'ok', timestamp: <ISO string> }`.

(b) `reindexEmbeddings`: `POST /api/admin/reindex-embeddings` against a real database that
has the embeddings IVFFlat index (migration 004); the command executes without error and the
index remains queryable via `VectorStore.search()`.

**Result**: Met.

- Condition (a): `admin.integration.test.ts` lines 90–99 — `GET /api/health` asserts status
  200, `status: 'ok'`, and that `Date.parse(timestamp)` is not `NaN`. Covers the stated
  condition.
- Condition (b): `admin.integration.test.ts` lines 107–124 — `POST
  /api/admin/reindex-embeddings` asserts status 200, `reindexed: true`, then calls
  `vectorStore.search(zeroVector, 1)` against the real database and confirms the outcome is
  `'success'` and the result is an array. The request now flows through the correct path:
  supertest → route → `AdminService.reindexEmbeddings()` →
  `db.embeddings.reindexIvfflat()` → `db.raw(...)`. Covers the stated condition.

**Manual verification**: to run the test suite against the test database:

```bash
pnpm --filter @institutional-knowledge/backend test
```

(Requires the test database running via
`docker compose -f docker-compose.test.yml up -d`.)

---

## Round 1 blocking findings — status

### B-1 — SQL in service code: `db._knex.raw` called from `AdminService`, not from a repository

**Fixed.** `apps/backend/src/db/repositories/embeddings.ts` now has a `reindexIvfflat()`
method (lines 60–64) that calls `db.raw(...)`. `AdminService.reindexEmbeddings()` calls
`db.embeddings.reindexIvfflat()` (line 49). No SQL in service code. Repository Pattern
satisfied.

### B-2 — Inline `res.json()` in error branch instead of `sendServiceError`

**Fixed.** `apps/backend/src/routes/admin.ts` now imports `sendServiceError` (line 13) and
uses it in the error branch (line 42). The inline `res.status(...).json(...)` form is gone.
Error Response Pattern satisfied.

---

## Findings

### Blocking

None.

### Suggestions

#### S-1 (carried from round 1) — Plan divergence: `{ status: 'reindexing' }` vs `{ reindexed: boolean }`

See round 1 review (`code-review-backend-task-15-2026-03-20-1136.md`, S-1). No change
required; the developer should update the backend plan to match the correct ADMIN-001
contract response shape (`{ reindexed: boolean }`), or note the divergence explicitly.

#### S-2 (carried from round 1) — `vectorStore` passed as an override to `createTestApp` but not used by the admin route

See round 1 review, S-2. `admin.integration.test.ts` line 71 passes `{ vectorStore,
adminService }` to `createTestApp`, but the admin route does not depend on `vectorStore`.
The vector store is constructed independently and called directly at line 119. Removing
`vectorStore` from the overrides argument would better reflect the actual route dependencies.
This is a suggestion only.

#### S-3 (new) — JSDoc for `search()` is placed above `reindexIvfflat()` in `embeddings.ts`

**File**: `apps/backend/src/db/repositories/embeddings.ts`, lines 43–66.

The JSDoc block at lines 43–53 documents the `search()` method (it describes cosine
similarity, the double-occurrence of the query embedding, and snake_case column names). It
was written before `reindexIvfflat()` existed. After the new method was inserted at line 60,
the JSDoc block immediately precedes `reindexIvfflat()`, not `search()`. A JSDoc comment
attaches to the declaration that follows it, so as written, tools and readers will associate
the `search()` description with `reindexIvfflat()`. The `reindexIvfflat()` JSDoc (lines
54–59) is correctly placed before its method. Moving the `reindexIvfflat()` implementation
so it appears after `search()`, or moving the `search()` JSDoc to sit directly above
`search()`, would restore the correct correspondence. This is a suggestion only.

---

## Summary

**Outcome**: Pass

Both blocking findings from round 1 are resolved:

- B-1: `REINDEX` DDL is now inside `EmbeddingsRepository.reindexIvfflat()`;
  `AdminService` calls it via `db.embeddings`. Repository Pattern satisfied.
- B-2: `sendServiceError` is now used in the admin route's error branch. Error Response
  Pattern satisfied.

The acceptance condition is met: both conditions (a) and (b) are covered by route
integration tests that exercise the full stack against a real database.

Three suggestions remain open (S-1 plan divergence, S-2 unnecessary override, S-3 JSDoc
ordering). None are required before advancing.

Task is ready to advance to `reviewed`.
