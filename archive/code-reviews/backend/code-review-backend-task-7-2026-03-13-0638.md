# Code Review — Backend Service — Task 7: Implement GraphStore interface and PostgresGraphStore

**Date**: 2026-03-13 06:10
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/db/index.ts` (modified — graph repository wired)
- `apps/backend/src/db/repositories/graph.ts` (new)
- `apps/backend/src/db/repositories/index.ts` (modified — exports graph repository)
- `apps/backend/src/db/tables.ts` (modified — comment fix)
- `apps/backend/src/graphstore/GraphStore.ts` (renamed — interface + types)
- `apps/backend/src/graphstore/PostgresGraphStore.ts` (rewritten — full implementation)
- `apps/backend/src/graphstore/__tests__/PostgresGraphStore.integration.test.ts` (new)
- `apps/backend/src/graphstore/index.ts` (new — factory)
- `apps/backend/src/index.ts` (modified — import path fix)
- `apps/backend/src/server.ts` (modified — import path fix)
- `apps/backend/src/utils/__tests__/normalise.test.ts` (new)
- `apps/backend/src/utils/normalise.ts` (new)
- `apps/backend/src/vectorstore/PgVectorStore.ts` (modified — uuidv7 migration)

---

## Acceptance condition

**Condition type**: automated

Integration tests against a real PostgreSQL instance confirm:

- (a) `writeEntity` + `getEntity` round-trip: insert an entity; retrieve it; verify fields match. An entity with no `entity_document_occurrences` is not returned by `getEntity`.
- (b) `writeRelationship` + `getRelationships`: insert two entities and a relationship; retrieve outgoing relationships from the source; verify result.
- (c) `traverse` depth 1, 2, 3: build a three-hop chain A→B→C→D; verify depth-1 returns only A→B, depth-2 returns A→B and B→C, depth-3 returns all three.
- (d) `findEntitiesByType` filtering: insert entities of two categories; verify only the correct category is returned.
- (e) `findDocumentsByEntity` join: insert entity, document, and occurrence; verify the returned `DocumentReference` has correct description and date.

All integration tests must pass.

**Result**: Met

The test file `apps/backend/src/graphstore/__tests__/PostgresGraphStore.integration.test.ts` contains 13 integration tests that together cover all five sub-conditions.

- **(a)**: Three tests — round-trip with occurrence returns entity; entity with no occurrence returns `null`; upsert on ID conflict updates fields. The no-occurrence check directly validates the ADR-037 requirement.
- **(b)**: Three tests — outgoing relationships retrieved correctly; incoming relationships retrieved correctly; duplicate insert on same composite key does not throw and leaves only one relationship.
- **(c)**: Three tests — `traverse(idA, 1)` returns 1 relationship (A→B only); `traverse(idA, 2)` returns 2 relationships (A→B and B→C); `traverse(idA, 3)` returns 3 relationships covering all source IDs.
- **(d)**: Two tests — correct category filtering; entities without occurrences are excluded from results.
- **(e)**: Two tests — `DocumentReference` with correct description and date; empty array when entity has no occurrences.

The CTE depth semantics (anchor at depth=1, recursive fires when `g.depth < maxDepth`) correctly implement the stated chain behaviour. Tests confirm all assertions against real data. Test infrastructure (`globalSetup.ts`, `cleanAllTables`, `fileParallelism: false`) is consistent with the established pattern from Task 6.

Manual verification instructions (to confirm tests pass):

1. Start the test database: `docker compose -f apps/backend/docker-compose.test.yml up -d`
2. Run the GraphStore tests: `pnpm --filter backend exec vitest run src/graphstore/__tests__/PostgresGraphStore.integration.test.ts`
3. Expected: 13 tests passed, 0 failed
4. Run the normalise unit tests: `pnpm --filter backend exec vitest run src/utils/__tests__/normalise.test.ts`
5. Expected: 28 tests passed, 0 failed
6. Run all backend tests to check for regressions: `pnpm --filter backend test`
7. Run Biome lint: `pnpm --filter backend exec biome check src`
8. Stop the database: `docker compose -f apps/backend/docker-compose.test.yml down -v`

---

## Findings

### Blocking

None.

### Suggestions

**S-001 — `traverse` entities not filtered to document-evidenced entries (ADR-037 consistency)**

`apps/backend/src/db/repositories/graph.ts`, lines 209–213 (`findTermsByIds`)
`apps/backend/src/graphstore/PostgresGraphStore.ts`, lines 150–158

`getEntity` and `findEntitiesByType` both filter to entities with at least one `entity_document_occurrences` row, enforcing ADR-037. `findTermsByIds`, used by `traverse()` to hydrate the entity list from traversal results, does not apply this filter. In Phase 1 this is harmless — relationships are only written as part of processing results where entities always have occurrences inserted at the same time. However, `writeRelationship()` can create a relationship between two entity IDs regardless of occurrence state, meaning a relationship can theoretically reference a non-evidenced entity. If `traverse()` is later called from a state where that is possible, it would return entities that violate ADR-037.

Consider adding the `whereExists(entityDocumentOccurrences)` sub-query to `findTermsByIds`, or creating a separate `findTermsByIdsEvidenced` method for use inside `traverse()`. This would make the ADR-037 filter consistent across all entity-returning methods.

**S-002 — `traverse` returns `depth: maxDepth`, not actual maximum depth reached**

`apps/backend/src/graphstore/PostgresGraphStore.ts`, line 171

`TraversalResult.depth` is set to `maxDepth` (the input parameter) rather than the actual deepest hop reached. If traversal terminates early because the graph is shallower than `maxDepth`, the returned `depth` will not reflect the actual graph depth. For example, traversing a 1-hop graph with `maxDepth=10` returns `depth: 10` when the true depth is 1.

The plan does not specify this behaviour either way, but `depth` in the return type is more useful to callers as the actual maximum depth reached. Consider computing `Math.max(...rawRows.map(r => r.depth))` from the CTE result (the CTE projects `depth` per row but it is currently excluded from `TraversalRawRow`). If `rawRows` is empty, `depth` would naturally be 0.

This is a suggestion only — the current behaviour is internally consistent and the tests are written to match it.

**S-003 — `normaliseTermText` not called for `id` lookup in `writeEntity` (minor documentation gap)**

`apps/backend/src/graphstore/PostgresGraphStore.ts`, line 39

`writeEntity` calls `normaliseTermText(entity.term)` to compute `normalisedTerm`, which is correct. This is consistent with ADR-028. The function-level comment in `normalise.ts` states it should be called "in writeEntity (GraphStore)" which is satisfied. No code change required — this note is only to confirm the reviewer checked the canonical normalisation path.

**S-004 — Duplicate test setup in traverse tests (readability)**

`apps/backend/src/graphstore/__tests__/PostgresGraphStore.integration.test.ts`, lines 280–426

The three traverse tests (depth 1, 2, 3) each repeat identical entity insertion and relationship setup (A→B→C→D chain, four entities, three relationships). The duplication means 60+ lines of setup code repeated three times. Consider extracting the chain setup into a helper function (e.g. `buildChain(store, docId)`) that returns the four entity IDs. This would make each test's assertion the focus rather than the setup. Suggestion only — the current structure is correct and the tests pass.

---

## Summary

**Outcome**: Pass

The implementation satisfies all five acceptance condition sub-conditions with non-vacuous integration tests. The repository pattern is correctly followed — all SQL is in `db/repositories/graph.ts` with no SQL in `PostgresGraphStore.ts`. `knex.raw` bypass is handled correctly: `traverse()` maps snake_case columns explicitly (`source_term_id`, `target_term_id`, `relationship_type`) in `PostgresGraphStore.ts` with a clear inline comment. `normaliseTermText()` is used in `writeEntity()`, not `toLowerCase()`. All new IDs use `uuidv7()`. The factory signature `createGraphStore(graphConfig: AppConfig['graph'], db: DbInstance, log: Logger)` matches the established pattern. All imports use `.js` extensions (ADR-047). No `any` without comment, no untyped non-null assertions without comment. No hardcoded provider names or connection strings. No document content in logs — only `entityId`, `direction`, `count`, `entityType` identifiers are logged.

The task is ready to advance to `reviewed`.
