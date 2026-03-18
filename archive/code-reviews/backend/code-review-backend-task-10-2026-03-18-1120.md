# Code Review — Backend Service — Task 10: Implement vocabulary curation handlers (VOC-001, VOC-002, VOC-003, VOC-004)

**Date**: 2026-03-18 11:20
**Task status at review**: code_complete
**Round**: 2 (first review at `documentation/tasks/code-reviews/code-review-backend-task-10-2026-03-18-0746.md`)
**Files reviewed**:

- `apps/backend/src/services/vocabulary.ts` (new)
- `apps/backend/src/routes/vocabulary.ts` (new)
- `apps/backend/src/routes/routeUtils.ts` (new)
- `apps/backend/src/db/repositories/graph.ts` (extended)
- `apps/backend/src/db/repositories/pipelineSteps.ts` (JSDoc corrected)
- `apps/backend/src/routes/documents.ts` (now uses `sendServiceError`)
- `apps/backend/src/routes/curation.ts` (now uses `sendServiceError`)
- `apps/backend/src/routes/index.ts` (vocabulary router registered)
- `apps/backend/src/index.ts` (`vocabularyService` added to `AppDependencies`)
- `apps/backend/src/server.ts` (`createVocabularyService` wired in)
- `apps/backend/src/routes/__tests__/vocabulary.integration.test.ts` (new)
- `apps/backend/src/routes/__tests__/documents.integration.test.ts` (updated assertion)
- `apps/backend/src/routes/__tests__/curation.integration.test.ts` (seed helpers fixed)
- `apps/backend/src/middleware/__tests__/middleware.test.ts` (stub deps updated)
- `packages/shared/src/schemas/vocabulary.ts` (schemas completed)
- `documentation/process/code-review-principles.md` (CR-004 rewritten, CR-006 added, CR-001 scoped)
- `documentation/process/development-principles.md` (multiple additions)

---

## First review outcome and resolution

The first review (round 1) had one escalated finding: B-001, the `getFlaggedVocabTerms` multi-table JOIN in the graph repository as a potential CR-004 violation. That finding was escalated to the Head of Development, who resolved it by rewriting CR-004 to explicitly permit within-domain read JOINs and restrict only cross-domain mutations. The updated CR-004 is now in `documentation/process/code-review-principles.md`. The finding is therefore resolved: the JOIN is within the graph domain (vocabulary_terms, entity_document_occurrences, documents as incidental context) and is permitted under the current CR-004.

This round reviews the full implementation against the updated principles.

---

## Acceptance condition

The acceptance condition states: "Vitest unit tests with mocked Knex confirm: (a) `acceptCandidate`: returns 409 when source is not `llm_extracted`; updates source to `candidate_accepted` when valid. (b) `rejectCandidate`: within a transaction, inserts to `rejected_terms` and deletes from `vocabulary_terms`; cascading deletes are called; returns `{ rejected: true }`. (c) `addManualTerm`: returns 409 when normalised term matches an existing vocabulary term; returns 409 when it matches a rejected term; returns 404 when a `targetTermId` does not exist; inserts term and relationships in a transaction on success; returns the new term with `normalisedTerm`. (d) `getVocabularyQueue`: returns paginated results for `llm_extracted` terms; includes source document description and date from earliest occurrence. All tests pass."

**Condition type**: automated

**Result**: Met — via route integration tests rather than mocked-Knex unit tests (same justification as Round 1; the anti-pattern table in `development-principles.md` prohibits mocked-database service tests, which supersedes the task's phrasing).

Coverage:

- **(a) acceptCandidate**: tests at lines 256–292 of `vocabulary.integration.test.ts` confirm 409 for wrong source (`wrong_source` error type, status 409) and 200 with DB state verification that `source` is updated to `candidate_accepted`.
- **(b) rejectCandidate**: tests at lines 324–369 confirm 200 with `{ termId, rejected: true }`, term removed from `vocabulary_terms`, row inserted in `rejected_terms`, and cascade to `entity_document_occurrences` via a dedicated cascade test.
- **(c) addManualTerm**: tests at lines 395–499 confirm 409 for duplicate vocabulary term, 409 for duplicate rejected term, 404 for missing `targetTermId`, 201 with DB state verification on success, and relationship row inserted on success with relationships.
- **(d) getVocabularyQueue**: tests at lines 177–232 confirm paginated results for `llm_extracted` terms with source document description and date from the earliest occurrence.

The 400-for-missing-required-fields conditions are structurally met via `AddVocabularyTermRequest` in `packages/shared/src/schemas/vocabulary.ts` (`term: z.string().min(1)`, `category: z.string().min(1)`), enforced by `validate({ body })` before the service is called. CR-001.

---

## Findings

### Blocking

**B-001 — `vocabulary.ts` service uses `uuidv4()` instead of `uuidv7()` — plan deviation and codebase inconsistency**

**File**: `apps/backend/src/services/vocabulary.ts`, lines 21 and 132, 184, 187

The service imports `v4 as uuidv4` from `uuid` and uses it to generate the `rejected_terms` ID, the new `vocabulary_terms` ID, and the `vocabulary_relationships` IDs. Every other application-layer ID generator in this codebase uses `v7`: `apps/backend/src/services/documents.ts` (line 26), `apps/backend/src/vectorstore/PgVectorStore.ts` (line 19), `apps/backend/src/graphstore/PostgresGraphStore.ts` (line 12). The `db/tables.ts` file states at line 13 that IDs "are generated by application code (`uuidv7()`) before insert". The task description at line 799 of `backend-tasks.md` explicitly states "Generate UUID v7".

The `development-principles.md` anti-pattern table currently reads `v4 as uuidv4` as "the project standard", which is inconsistent with the actual codebase pattern and with the task description. That entry in `development-principles.md` appears to be outdated documentation that was not updated when the codebase moved to v7. The correct project standard, as evidenced by all other service files and the `tables.ts` canonical comment, is `uuidv7`.

The implementation must be changed to use `v7 as uuidv7` for all ID generation in `vocabulary.ts`. The `development-principles.md` anti-pattern table entry for `crypto.randomUUID()` should also be corrected to reference `v7 as uuidv7` as the project standard. This is a **blocking** finding — the implementation deviates from the plan and from the established codebase pattern.

---

### Suggestions

**S-001 — `insertVocabTerm` seed helper in integration test uses `db._knex` with raw snake_case column names**

**File**: `apps/backend/src/routes/__tests__/vocabulary.integration.test.ts`, lines 101–125

The `insertVocabTerm` seed helper writes directly to `vocabulary_terms` via `db._knex('vocabulary_terms').insert(...)` with raw snake_case column names (`normalised_term`, `source`, etc.). This is an intentional choice documented in the Round 1 review (S-002 was noted as acceptable because `db.graph.upsertTerm` performs an upsert and would mask specific `source` values). The updated `_knex` access rules in `development-principles.md` confirm this: "Use `db._knex` only for tables that have no repository insert method or when verifying raw DB state after a test." This pattern is acceptable.

**S-002 — `getFlaggedVocabTerms` has a doubled JSDoc block**

**File**: `apps/backend/src/db/repositories/graph.ts`, lines 318–330

There are two consecutive JSDoc comments immediately before `getFlaggedVocabTerms`: the first (lines 318–322) is a paginated-query description that was left as a stub from earlier work and appears to be orphaned or a duplicate of the JSDoc content at lines 325–330. The orphaned block reads "Paginated query of vocabulary_terms where source = 'llm_extracted'..." followed immediately by another JSDoc that begins "Atomically insert a rejected_terms row..." which is the comment for `rejectTerm`, not `getFlaggedVocabTerms`. Looking at the actual order: the `rejectTerm` method (line 331) and `addTermWithRelationships` method (line 345) both have correct JSDoc. The orphaned first block at lines 318–322 is a leftover stub that was not cleaned up. No functional impact, but it makes the file harder to read.

---

## Summary

**Outcome**: Fail

One blocking finding (B-001): `vocabulary.ts` uses `uuidv4()` for ID generation in three places, deviating from the plan (which specifies "UUID v7") and from the codebase pattern established in all other service and implementation files. The `development-principles.md` anti-pattern entry for UUID generation also needs to be corrected to reference `v7` as the project standard.

All other review areas pass:

- CR-004 (domain-responsibility): `getFlaggedVocabTerms` and the two transaction methods (`rejectTerm`, `addTermWithRelationships`) are all within the graph domain and are permitted under the updated CR-004.
- CR-006 (exhaustive `ERROR_STATUS`): `vocabulary.ts` route handler declares `const ERROR_STATUS: Record<VocabularyErrorType, number>` with all four error types mapped. No `??` fallback, no cast. Compliant.
- Error Response Pattern: `sendServiceError` is used uniformly across `vocabulary.ts`, `documents.ts`, and `curation.ts`. The `routeUtils.ts` helper correctly selects `data:` vs `message:` based on `errorData` presence. `duplicate_detected` in `documents.ts` now uses the `{ error, data }` envelope.
- `_knex` access rules: no direct `db._knex` usage in services or route handlers; transaction methods `rejectTerm` and `addTermWithRelationships` correctly use `db.transaction()` within the repository where `db` is the raw `Knex` instance. Multi-domain transaction boundary usage is not present. Compliant.
- Schema placement: path params (`TermIdParams`) local to `vocabulary.ts` route file; query params (`VocabularyQueueParams`) and body schemas (`AddVocabularyTermRequest`) in `packages/shared/src/schemas/vocabulary.ts`. Compliant.
- TypeScript strict mode: no unexplained `any`, no unexplained non-null assertions, all function parameters and return types explicitly typed.
- Security at boundaries: all inputs validated via `validate()` middleware with Zod schemas; no document content in logs (only `termId` logged); no hardcoded secrets.
- Infrastructure as Configuration: no hardcoded provider names, connection strings, or model names.
- Dependency injection: `createVocabularyRouter` receives `VocabularyService` only; `createVocabularyService` receives `{ db, log }` only.
- Error handling: all error paths return semantically correct status codes (404 for not found, 409 for conflict, 400 for validation); no silent swallowing; `next(err)` used only for unexpected exceptions.
- Data access compliance: ADR-031 respected; no direct DB connections outside the repository layer.
- Plan compliance: all four routes implemented at correct paths with correct HTTP methods; route registration order (VOC-004 before VOC-002/003) is correct.
- Test quality: full HTTP → validate → service → DB stack exercised; DB state verified after mutations; cascade deletion covered.
- Two-tier rule: integration tests only (no mocked-database service tests); middleware unit tests test pure middleware behaviour without a database. Compliant.
