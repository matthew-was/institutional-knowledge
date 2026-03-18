# Code Review — Backend Service — Task 10: Implement vocabulary curation handlers (VOC-001, VOC-002, VOC-003, VOC-004)

**Date**: 2026-03-18 07:46
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/db/repositories/graph.ts` (8 new methods appended to existing factory)
- `apps/backend/src/services/vocabulary.ts` (new)
- `apps/backend/src/routes/vocabulary.ts` (new)
- `apps/backend/src/routes/__tests__/vocabulary.integration.test.ts` (new)
- `apps/backend/src/index.ts` (vocabularyService added to AppDependencies)
- `apps/backend/src/server.ts` (createVocabularyService wired in)
- `apps/backend/src/routes/index.ts` (createVocabularyRouter registered)
- `apps/backend/src/middleware/__tests__/middleware.test.ts` (vocabularyService stub added)
- `apps/backend/src/routes/__tests__/curation.integration.test.ts` (vocabularyService added to createApp call)
- `apps/backend/src/routes/__tests__/documents.integration.test.ts` (vocabularyService added to createApp call)
- `packages/shared/src/schemas/vocabulary.ts` (schemas completed)

---

## Acceptance condition

The acceptance condition states: "Vitest unit tests with mocked Knex confirm: (a) `acceptCandidate`: returns 409 when source is not `llm_extracted`; updates source to `candidate_accepted` when valid. (b) `rejectCandidate`: within a transaction, inserts to `rejected_terms` and deletes from `vocabulary_terms`; cascading deletes are called; returns `{ rejected: true }`. (c) `addManualTerm`: returns 409 when normalised term matches an existing vocabulary term; returns 409 when it matches a rejected term; returns 404 when a `targetTermId` does not exist; inserts term and relationships in a transaction on success; returns the new term with `normalisedTerm`. (d) `getVocabularyQueue`: returns paginated results for `llm_extracted` terms; includes source document description and date from earliest occurrence. All tests pass."

**Condition type**: automated

**Result**: Met — via route integration tests rather than mocked-Knex unit tests.

The acceptance condition was written before the two-tier testing rule was tightened in `development-principles.md`. The current principles explicitly prohibit mocked-database tests as an anti-pattern ("Calling a service factory with mocked `db`/`storage` deps as a 'unit test'" is listed in the prohibited table). Implementing the acceptance condition as written would require violating the development principles that supersede it.

The implementation uses route integration tests (supertest → validate middleware → service → real DB) which is the mandated pattern for all paths involving I/O. All four acceptance condition points are covered:

- **(a) acceptCandidate**: tests at lines 268–304 confirm 409 for wrong source and 200 with DB state verification for the success path.
- **(b) rejectCandidate**: tests at lines 336–381 confirm 200 with term removed from `vocabulary_terms`, row inserted in `rejected_terms`, and cascade to `entity_document_occurrences`.
- **(c) addManualTerm**: tests at lines 407–511 confirm 409 for duplicate vocabulary term, 409 for duplicate rejected term, 404 for missing targetTermId, 201 with DB state verification on success, and relationship row inserted in a transaction.
- **(d) getVocabularyQueue**: tests at lines 179–244 confirm paginated results for `llm_extracted` terms with source document description and date from the earliest occurrence.

The 400-for-non-numeric-page-param test (line 239) and the 400-for-missing-required-fields tests (lines 389–405) are structurally met via the `VocabularyQueueParams` Zod schema and `AddVocabularyTermRequest` Zod schema respectively. The `validate({ query })` and `validate({ body })` middleware enforces these before the service is called — no separate service test is required. CR-001.

All 154 tests pass (confirmed by the developer).

---

## Findings

### Blocking

**B-001 — `getFlaggedVocabTerms` JOINs three tables in a repository method (CR-004 violation — escalated)**

**File**: `apps/backend/src/db/repositories/graph.ts`, lines 325–393

`getFlaggedVocabTerms` joins `vocabulary_terms`, `entity_document_occurrences`, and `documents` in a single repository method. CR-004 states: "Repository methods in `apps/backend/src/db/repositories/` operate on a single table. Cross-table queries (JOINs, subqueries referencing a different table) must be moved to the service layer as separate repository calls." A JOIN across three tables is a blocking finding per CR-004.

However, the backend plan (`integration-lead-backend-plan.md`) and task description explicitly specify this JOIN: "Left join `entity_document_occurrences` and `documents` to get source document description and date for each term (use the earliest occurrence)." The JOIN is plan-driven, not an implementer choice. Restructuring into separate repository calls would require N+1 queries per term (one `findDocumentsByTermId` call per vocabulary term in the page), which the plan does not describe and which may be a deliberate design trade-off.

A pre-existing method `findDocumentsByTermId` (line 229, introduced in Task 7 before CR-004 existed) also JOINs two tables in the graph repository and was reviewed and passed at that time. The `getFlaggedVocabTerms` method follows the same pattern.

**Escalated — pending architectural decision.** This finding requires a decision from the Head of Development before it can be classified as blocking or accepted as an exception to CR-004. The options are:

1. Accept a documented exception to CR-004 for graph repository methods that are inherently multi-table by design (vocabulary terms, occurrences, and documents are jointly owned by the graph store).
2. Move the JOIN logic to the service layer with N+1 repository calls and accept the performance trade-off.
3. Update CR-004 to explicitly carve out the graph repository as a named exception, citing ADR-037 (GraphStore) as justification.

Do not advance this task to `reviewed` until the Head of Development has provided a decision on this escalation.

---

### Suggestions

**S-001 — Transaction SQL in service layer bypasses existing repository methods**

**Files**: `apps/backend/src/services/vocabulary.ts`, lines 131–145 (`rejectCandidate`) and lines 197–219 (`addManualTerm`)

Both transactions embed Knex query-builder calls directly in the service layer (`trx('rejectedTerms').insert(...)`, `trx('vocabularyTerms').where(...).delete()`). The repository already exposes `insertRejectedTerm` and `deleteTermById` methods that wrap exactly these operations.

The `_knex` access rules explicitly permit `db._knex.transaction()` in services when atomicity spans multiple repositories. The current repository pattern does not support passing a transaction client into repository methods, so the SQL ends up in the service. This is an inherent limitation of the pattern rather than a deliberate design violation. The suggestion is to consider whether a future pattern update should allow repositories to accept an optional transaction client, which would allow service-layer transactions to delegate the SQL to the repository without bypassing the repository layer.

No change required for this task.

**S-002 — `insertOccurrence` seed helper bypasses repository method**

**File**: `apps/backend/src/routes/__tests__/vocabulary.integration.test.ts`, lines 158–172

The `insertOccurrence` seed helper uses `db._knex('entity_document_occurrences').insert(...)` with raw snake_case column names (`term_id`, `document_id`). The graph repository already exposes `db.graph.insertOccurrence(row)` which is the preferred mechanism per the development-principles.md seed helper guidance: "Prefer `db.documents.insert()` (or equivalent repository method) when one exists."

The seed helper should call `await db.graph.insertOccurrence(row)` instead, which also removes the inconsistency of using snake_case column names alongside the camelCase `EntityDocumentOccurrenceInsert` type imported at line 26.

Note: the `insertVocabTerm` seed helper correctly uses `db._knex` because the graph repository's only vocabulary term write method is `upsertTerm` (which performs an upsert, not a plain insert), and using it in tests would mask a specific `source` value. This usage is acceptable.

**S-003 — `logger` field on `config` in `development-principles.md` example**

Not a code finding — informational only. The `makeConfig()` test helper returns a config with a `logger` field. The middleware.test.ts stub at line 152 uses `logger: { level: 'error' as const }` which is consistent. No change required.

**S-004 — `VocabularyCandidateItem` cast in `getFlaggedVocabTerms` could use a mapped type**

**File**: `apps/backend/src/db/repositories/graph.ts`, lines 370–390

The explicit cast to `Array<{ termId: string; ... }>` before mapping works correctly, but the intermediate type duplicates the shape of `VocabularyCandidateItem` minus the `.toISOString()` call. A narrower approach would be to let TypeScript infer the query result and rely on the mapping. This is a readability preference with no functional impact.

---

## Summary

**Outcome**: Fail

One finding is escalated rather than outright blocking — but per the escalation rules, the task must not advance to `reviewed` until the Head of Development provides a decision on B-001. The escalation is required because:

- CR-004 makes the finding blocking as written.
- The backend plan explicitly specifies the multi-table JOIN, which means fixing it requires either a plan change, a code change, or a documented exception to CR-004 — all of which require an architectural decision.

If the Head of Development resolves B-001 as a documented exception or plan update, and the implementation is otherwise unchanged, the task may advance to `reviewed` without a further code review cycle (the suggestions in S-001 through S-004 are not required).

All other review areas pass:

- TypeScript strict mode: no `any` without comment, no unexplained non-null assertions, all parameters and return types explicit.
- Security at boundaries: all inputs validated via `validate()` middleware with Zod schemas before reaching handlers; no document content in logs (only `termId` logged); no hardcoded secrets.
- Infrastructure as Configuration: no hardcoded provider names or connection strings.
- Dependency injection: `createVocabularyRouter` receives `VocabularyService` only; `createVocabularyService` receives `{ db, log }` only. Narrowing is correct.
- Error handling: all error paths return semantically correct status codes (404 for not found, 409 for conflict, 400 for validation); no silent swallowing; `next(err)` used only for unexpected exceptions.
- Data access compliance: no direct database connections outside the repository layer; ADR-031 respected.
- Route ordering: VOC-004 (`/curation/vocabulary/terms`) is registered before VOC-002/003 (`/curation/vocabulary/:termId/accept|reject`) — correct.
- ESM imports: all `.js` extensions present.
- Zod v4: `z.uuid()` used (not `z.string().uuid()`); `uuidv4()` from `uuid` package (not `crypto.randomUUID()`).
- Plan compliance: all four handlers implemented as specified; routes match the backend plan's route table.
- Test quality: tests exercise the full HTTP → validate → service → DB stack; DB state verified after mutations.
