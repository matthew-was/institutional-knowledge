# Code Review — Backend Service — Task 13: Implement search handlers (QUERY-001, QUERY-002)

**Date**: 2026-03-19 08:52
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/services/search.ts` (new)
- `apps/backend/src/routes/search.ts` (new)
- `apps/backend/src/routes/__tests__/search.integration.test.ts` (new)
- `apps/backend/src/db/repositories/embeddings.ts` (modified — documents JOIN)
- `apps/backend/src/db/repositories/graph.ts` (modified — `findTermByNormalisedTerm` added)
- `apps/backend/src/vectorstore/VectorStore.ts` (modified — `document` field on `SearchResult`)
- `apps/backend/src/vectorstore/__tests__/PgVectorStore.integration.test.ts` (modified — round-trip test updated)
- `apps/backend/src/routes/index.ts` (modified — search router registered)
- `apps/backend/src/index.ts` (modified — `SearchService` added to `AppDependencies`)
- `apps/backend/src/server.ts` (modified — `createSearchService` wired)
- `apps/backend/src/routes/__tests__/curation.integration.test.ts` (modified — `searchService` added)
- `apps/backend/src/routes/__tests__/documents.integration.test.ts` (modified — `searchService` added)
- `apps/backend/src/routes/__tests__/vocabulary.integration.test.ts` (modified — `searchService` added)
- `apps/backend/src/middleware/__tests__/middleware.test.ts` (modified — `searchService` stub added)
- `packages/shared/src/schemas/search.ts` (modified — `date` made nullable, `GraphSearchRequest` completed)
- `documentation/process/development-principles.md` (modified — null preference principle added)

---

## Acceptance condition

**Stated condition** (type: automated):

> Route integration tests (supertest → validate → service → real database, per the
> two-tier testing rule) confirm:
> (a) `vectorSearch`: returns 400 when `embedding.length` does not match configured
> dimension; calls `VectorStore.search` with correct arguments against a real database
> with seeded embeddings; returns correctly formatted `VectorSearchResponse` including
> the `document` metadata fields joined from the `documents` table.
> (b) `graphSearch`: returns 400 when `entityNames` is empty; resolves entity names to
> IDs via `normalised_term` lookup against real `vocabulary_terms` rows; calls
> `GraphStore.traverse` and `GraphStore.findDocumentsByEntity` against the real database;
> returns aggregated and deduplicated entities, relationships, and document IDs.

**Result**: Met

**(a) vectorSearch**: Three integration tests in `search.integration.test.ts` cover
this condition:

- `returns 400 when embedding.length does not match configured dimension` — sends a
  10-element vector, asserts `res.status === 400` and `res.body.error === 'dimension_mismatch'`.
- `(a) happy path: returns VectorSearchResponse with document metadata` — seeds a
  document, chunk, and embedding via `db._knex`; sends a POST with the same unit vector;
  asserts the full `VectorSearchResponse` shape including `result.document.description`,
  `result.document.date`, and `result.document.documentType`.
- `returns empty results when no embeddings exist` — confirms the empty-array path.

**(b) graphSearch**: Four integration tests cover this condition:

- `returns 400 when entityNames is empty (Zod min(1) — CR-001)` — structurally met via
  `GraphSearchRequest.entityNames z.array(z.string()).min(1)`. The `validate({ body })`
  middleware enforces this before the service is called. CR-001.
- `returns empty results when entity name does not exist in vocabulary_terms` — confirms
  graceful unresolved-name handling.
- `(b) happy path` — seeds two terms with `entity_document_occurrences` rows and a
  relationship; searches by name; asserts both entities appear in the response with
  correct `relatedDocumentIds` and the relationship is present.
- `deduplicates entities and relationships when multiple entity names resolve to
  overlapping graphs` — asserts `uniqueIds.size === entityIds.length` and relationship
  appears exactly once.

All tests are route integration tests (supertest → validate middleware → service →
repository → real PostgreSQL). No mocked store tests exist. The two-tier testing rule
is satisfied.

---

## Findings

### Blocking

None.

### Suggestions

**S-001** — `packages/shared/src/schemas/search.ts` line 65: `maxDepth` upper bound is `max(5)` but the task description specifies 1–10.

The `GraphSearchRequest` schema defines `maxDepth: z.number().int().min(1).max(5)`. The task description states the valid range is 1–10. The schema constrains the API more narrowly than the spec requires. This is not a correctness issue (5 is a conservative upper bound consistent with the ADR-037 note about recursive CTEs being "well within acceptable performance" for 1–3 hop queries), but it diverges from the documented spec without an explanation in code or comments. If `max(5)` is intentional, a comment citing the reasoning (e.g. "Phase 1 performance bound") should be added. If the spec range was intended, the bound should be updated to `max(10)`.

**S-002** — `apps/backend/src/routes/__tests__/search.integration.test.ts` line 17 (test file header comment):

The comment states "Auth header uses the Python service key 'psk'" but the `AUTH` constant at line 53 is `{ 'x-internal-key': 'pk' }`, which is `pythonKey` (not `pythonServiceKey`). The key value is correct — `pk` is a valid auth key for QUERY-001/QUERY-002 calls from Python. Only the comment label is wrong. Worth correcting to avoid confusion in future reviews.

**S-003** — `apps/backend/src/graphstore/PostgresGraphStore.ts` line 216: null date substituted with empty string in `findDocumentsByEntity`.

The mapping `date: r.date ?? ''` converts null dates to `''` in the `DocumentReference` response. This is consistent with the existing `DocumentReference` interface (which declares `date: string`, not nullable) and was pre-existing before Task 13. However, `''` is indistinguishable from a genuinely empty string and differs from the project's stated preference for explicit `null` for absent data (development-principles.md §7, "Prefer explicit null"). This is a pre-existing issue carried forward, not introduced by Task 13. Flagged here as a suggestion for the next time `DocumentReference` is touched — consider changing `date: string` to `date: string | null` and propagating the null, consistent with how `documents.date` is handled throughout the rest of the codebase.

---

## Summary

**Outcome**: Pass

No blocking findings. The implementation satisfies both conditions of the acceptance criterion. Route integration tests are present for all stated behaviours; `VectorStore.search()` and `GraphStore.traverse()`/`findDocumentsByEntity()` are called via injected dependencies throughout; the `findTermByNormalisedTerm` ADR-037 document-evidenced filter correctly uses the `whereExists` pattern matching `findTermById`; the nullable `date` field propagates correctly through `embeddings.ts` → `VectorStore.ts` → `search.ts` → `search` schema; `graphSearch` correctly resolves the start entity's term and category when it is absent from `traversalResult.entities`. The task is ready to advance to `reviewed`.
