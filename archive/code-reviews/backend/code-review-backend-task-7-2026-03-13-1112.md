# Code Review — Backend Service — Task 7: Implement GraphStore interface and PostgresGraphStore

**Date**: 2026-03-13 11:12
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/db/index.ts`
- `apps/backend/src/db/repositories/graph.ts`
- `apps/backend/src/db/repositories/index.ts`
- `apps/backend/src/db/tables.ts`
- `apps/backend/src/graphstore/GraphStore.ts`
- `apps/backend/src/graphstore/PostgresGraphStore.ts`
- `apps/backend/src/graphstore/__tests__/PostgresGraphStore.integration.test.ts`
- `apps/backend/src/graphstore/index.ts`
- `apps/backend/src/index.ts`
- `apps/backend/src/server.ts`
- `apps/backend/src/utils/__tests__/normalise.test.ts`
- `apps/backend/src/utils/normalise.ts`
- `apps/backend/src/vectorstore/PgVectorStore.ts`

---

## Acceptance condition

**Restated**: Integration tests against a real PostgreSQL instance confirm:

- (a) `writeEntity` + `getEntity` round-trip: insert an entity; retrieve it; verify fields match. An entity with no `entity_document_occurrences` is not returned by `getEntity`.
- (b) `writeRelationship` + `getRelationships`: insert two entities and a relationship; retrieve outgoing relationships; verify result.
- (c) `traverse` depth 1, 2, 3: build a three-hop chain; verify that traversal with `maxDepth=1` returns only depth-1 neighbours, `maxDepth=2` returns depth-1 and depth-2, and so on.
- (d) `findEntitiesByType` filtering: insert entities of two categories; verify only the correct category is returned.
- (e) `findDocumentsByEntity` join: insert entity, document, and occurrence; verify the returned document reference has the correct description and date.

**Condition type**: automated

**Result**: Met

All five sub-conditions are covered by integration tests in
`apps/backend/src/graphstore/__tests__/PostgresGraphStore.integration.test.ts`:

- **(a)** Two tests: a full round-trip including the before-occurrence null check
  (ADR-037 compliance verified inline), and an explicit "entity with no occurrences
  returns null" test. A third test confirms the upsert-on-conflict behaviour.
- **(b)** Three tests: outgoing filter, incoming filter, and duplicate-insert idempotency
  (including a count assertion confirming no duplicates persist).
- **(c)** `it.each` with depth 1, 2, 3; each case asserts `result.relationships` length and
  `result.depth` equals the requested depth. The `buildChain()` helper builds the three-hop
  chain A→B→C→D. Tests confirm relationship sources at each depth boundary.
- **(d)** Two tests: category-based filtering across two categories (person/place), and
  exclusion of entities with no occurrences.
- **(e)** Two tests: correct `description` and `date` from the joined document row, and empty
  array when the entity has no occurrences.

All tests are non-vacuous. Assertions check actual field values, not just presence. Test infrastructure follows the established pattern: `createTestDb`, `globalSetup.ts`-managed schema lifecycle, `cleanAllTables` in `afterEach`.

**Manual verification**: The developer must run the integration tests against the live test database before marking this task `reviewed`:

```bash
docker compose -f apps/backend/docker-compose.test.yml up -d
pnpm --filter backend test
docker compose -f apps/backend/docker-compose.test.yml down -v
```

Expected: 13 integration tests pass (PostgresGraphStore suite) plus all previously passing tests.
Also confirm TypeScript compiles and Biome passes:

```bash
pnpm --filter backend build
pnpm --filter backend exec biome check src
```

---

## Findings

### Blocking

None.

---

### Suggestions

**S-001** — `apps/backend/src/db/repositories/graph.ts`, line 158 and line 179: The recursive CTE uses `UNION ALL` rather than `UNION`. On graphs with cycles, `UNION ALL` will loop indefinitely (or until `maxDepth` stops the recursion). The estate archive is expected to be a directed acyclic graph (DAG) in practice — property chains, family trees, succession — so cycles are unlikely in real data. However, since the schema places no constraint on directed cycles, a curated relationship like A→B and B→A with the same type would cause the traversal to expand exponentially up to `maxDepth`. This is noted in ADR-037 as an accepted tradeoff ("PostgreSQL recursive CTEs become expensive for deep traversals"), but the specific case of cycles is worth documenting. Consider adding a comment to the CTE explaining that `UNION ALL` is deliberate (faster for DAG-shaped graphs) and that the `maxDepth` guard provides the cycle break. No code change required unless cycle protection is deemed necessary — the comment is the suggestion.

**S-002** — `apps/backend/src/graphstore/PostgresGraphStore.ts`, lines 135–140: `confidence` is hardcoded to `null` in the `traverse()` relationship mapping because the CTE does not project it. The comment correctly explains the rationale. For completeness, consider whether future callers will rely on traverse results and expect non-null confidence where it exists — if so, a `getRelationships()` follow-up call would be needed. The current comment directs callers to `getRelationships()` which is sufficient for Phase 1, but an explicit note in the `GraphStore.ts` interface doc-comment for `traverse()` would help future implementers understand the intentional omission.

**S-003** — `apps/backend/src/graphstore/__tests__/PostgresGraphStore.integration.test.ts`, lines 54–68: `insertDocument` helper uses raw snake_case column names (`content_type`, `submitter_identity`, etc.) via `db._knex`. This is correct because `_knex` bypasses `wrapIdentifier`. However, the usage is inconsistent with the second `insertDocument`-style insert at line 457 (also in the test file, inside the `findDocumentsByEntity` test), which also uses raw snake_case. Both are correct, but a shared helper for constructing full document rows would reduce duplication and make the test file easier to extend. This is a minor readability observation only.

**S-004** — `apps/backend/src/db/repositories/graph.ts`, line 120: The `'both'` direction case uses `.where(...).orWhere(...)` on a Knex query builder. Depending on how other `.where()` calls are chained, `orWhere` can produce surprising precedence behaviour (wrapping is sometimes needed). In the current code there are no other `.where()` calls on this query before the direction branch, so the behaviour is correct. A defensive `.where(function() { this.where(...).orWhere(...) })` pattern would make the intent explicit and guard against a future developer adding another filter. Noting as a suggestion rather than a blocking finding because the current usage is correct.

---

## Summary

**Outcome**: Pass

No blocking findings. The implementation satisfies all five acceptance condition sub-conditions with non-vacuous integration tests against a real PostgreSQL instance. The code complies with all applicable ADRs: ADR-037 (GraphStore interface behind factory, document-evidenced filter), ADR-028 (normalised_term via `normaliseTermText()`), ADR-031 (no direct DB access from Python, Express sole DB writer pattern not violated), ADR-047 (all imports use `.js` extensions). The repository pattern is correctly applied: all SQL is in `db/repositories/graph.ts`; `PostgresGraphStore` contains no SQL. Factory signature matches the established pattern (`AppConfig['graph']`, `DbInstance`, `Logger`). `uuidv7()` used for all new IDs. `knex.raw` bypass documented and snake_case mapping done explicitly in `PostgresGraphStore.traverse()`. The `normaliseTermText()` unit test suite (28 tests) is comprehensive and covers all documented behaviours including Unicode, edge cases, and deduplication consistency.

The task is ready to advance to `reviewed` once the developer has confirmed all integration tests pass against the live test database.
