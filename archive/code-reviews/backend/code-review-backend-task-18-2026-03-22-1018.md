# Code Review — Backend Service — Task 18: Integration test suite (end-to-end database tests)

**Date**: 2026-03-22 10:18
**Task status at review**: in_review
**Files reviewed**:

- `apps/backend/src/db/__tests__/migrations.test.ts` (new file)
- `apps/backend/src/startup/__tests__/uploadSweep.integration.test.ts` (existing — Task 16)

---

## Acceptance condition

> `apps/backend/src/db/__tests__/migrations.test.ts` passes when run with
> `pnpm --filter backend test`, and `uploadSweep.integration.test.ts` (Task 16) confirms
> all three sweep states. No test requires manual observation — all assertions are
> programmatic.

**Condition type**: automated

**Result**: Met

### migrations.test.ts

The file contains two `it` blocks:

1. **"creates all 10 expected tables"** — queries `information_schema.tables` for all
   `BASE TABLE` rows in the `public` schema, then asserts `toContain` for each of the 10
   table names listed in the task description. The names were verified against the six
   migration files: `documents`, `chunks`, `embeddings`, `pipeline_steps`,
   `processing_runs`, `vocabulary_terms`, `vocabulary_relationships`,
   `entity_document_occurrences`, `ingestion_runs`, `rejected_terms`. All 10 are
   present and correct.

2. **"creates the IVFFlat index on the embeddings table"** — queries `pg_indexes` for all
   indexes on the `embeddings` table, then asserts `toContain` for
   `embeddings_embedding_ivfflat_idx`. The index name was verified against migration
   `20260303000004_create_chunks_and_embeddings.ts` line 68, where it is created by
   `knex.raw`.

Neither test is vacuous: the `toContain` assertions are per-item and will fail individually
if any expected table or index is missing. The query filter `table_type = 'BASE TABLE'`
correctly excludes views and Knex's own internal tracking tables (`knex_migrations`,
`knex_migrations_lock`).

### uploadSweep.integration.test.ts

The file covers all three required non-finalized states:

- **"initiated"** — line 129: inserts document with `status: 'initiated'`, writes a staging
  file, runs the sweep, asserts the DB record is gone and the staging file is deleted.
- **"uploaded"** — line 141: same pattern with `status: 'uploaded'`.
- **"stored"** — line 153: inserts document with `status: 'stored'` and a real permanent
  file path, runs the sweep, asserts the DB record is gone and the permanent file is
  deleted.

The "finalized" preservation test (line 200) confirms a finalized document is not touched.
The multi-status test (line 171) confirms all three are cleaned in a single sweep call.

Both parts of the acceptance condition are met.

---

## Findings

### Blocking

None.

### Suggestions

**S-001 — `migrations.test.ts` calls `db._knex` directly for read queries that are not
inside a transaction boundary**

File: `apps/backend/src/db/__tests__/migrations.test.ts`, lines 25 and 53.

The test issues `db._knex.raw(...)` calls to query `information_schema.tables` and
`pg_indexes`. The `_knex` access rules in `development-principles.md` permit `_knex`
access in integration tests for "verifying raw DB state after a test" and for tables
with no repository method. Querying `information_schema` and `pg_indexes` has no
repository equivalent, so this use is fully within the permitted scope. No change is
required.

This is noted as a non-issue, not a finding.

---

## Summary

**Outcome**: Pass

Both files satisfy the acceptance condition. `migrations.test.ts` correctly asserts all 10
expected tables and the IVFFlat index name against the live test database schema.
`uploadSweep.integration.test.ts` covers all three required non-finalized sweep states
(`initiated`, `uploaded`, `stored`) plus finalized-document preservation. No blocking
findings were identified.

Task status set to `review_passed`.

The review is ready for the user to check.
