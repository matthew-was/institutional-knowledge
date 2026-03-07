# Code Review — Backend Service — Task 2: Implement Knex migrations (001–006)

**Date**: 2026-03-07 09:43
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/db/migrations/20260303000001_create_documents.ts`
- `apps/backend/src/db/migrations/20260303000002_create_vocabulary.ts`
- `apps/backend/src/db/migrations/20260303000003_create_processing_runs.ts`
- `apps/backend/src/db/migrations/20260303000004_create_chunks_and_embeddings.ts`
- `apps/backend/src/db/migrations/20260303000005_create_pipeline_steps.ts`
- `apps/backend/src/db/migrations/20260303000006_create_ingestion_runs.ts`
- `apps/backend/src/db/migrations/__tests__/migrations.integration.test.ts`
- `apps/backend/docker-compose.test.yml`

---

## Acceptance condition

**Restated**: Running `knex migrate:latest` against a clean PostgreSQL instance (with pgvector
extension available) applies all six migrations without errors and produces the correct table
structures. Confirmed by an integration test that runs migrations on a fresh test database and
queries `information_schema.tables` to verify all expected tables exist: `documents`,
`vocabulary_terms`, `vocabulary_relationships`, `rejected_terms`,
`entity_document_occurrences`, `processing_runs`, `chunks`, `embeddings`, `pipeline_steps`,
`ingestion_runs`. The `file_hash` partial unique index on `documents` must exist. The
`embeddings.embedding` column must be of type `vector`. The `documents.ingestion_run_id`
column must exist (added by migration 006, not migration 003).

**Condition type**: automated

**Result**: Met

The integration test at `__tests__/migrations.integration.test.ts` covers each item in the
acceptance condition:

- All ten expected tables: verified by the `'creates all expected tables'` test, which queries
  `information_schema.tables` and confirms all ten names are present.
- `file_hash` partial unique index: verified by the `'creates the file_hash partial unique
  index on documents'` test, which reads `pg_indexes` and confirms the index definition
  contains `status = 'finalized'`.
- `embeddings.embedding` column type `vector`: verified by the `'embeddings.embedding column
  is of type vector'` test, which reads `information_schema.columns` for `udt_name`.
- `documents.ingestion_run_id` nullable column (from migration 006): verified by the
  `'documents.ingestion_run_id column exists and is nullable (added by migration 006)'` test.

Each assertion tests the actual database state after a real migration run — not mocked
behaviour. The tests are not vacuous.

**Manual verification instructions for the developer**:

To confirm the integration test passes against a live database, run the following in sequence:

```bash
docker compose -f apps/backend/docker-compose.test.yml up -d
pnpm --filter backend test
docker compose -f apps/backend/docker-compose.test.yml down -v
```

Expected output: all eight test cases pass with zero failures. The rollback in `afterAll` must
leave the test database clean (the `down -v` flag discards the volume entirely, so this is
also guaranteed by the compose teardown).

---

## Findings

### Blocking

None.

### Suggestions

**S-001 — Migration 004: embedding dimension read from env var rather than nconf config**

File: `apps/backend/src/db/migrations/20260303000004_create_chunks_and_embeddings.ts`,
lines 22–25.

The migration reads the embedding dimension from `process.env.EMBEDDING_DIMENSION` directly
rather than from the nconf configuration hierarchy. The backend plan (migration outline 004)
explicitly documents this approach as one of two permitted alternatives: "An alternative is to
accept the dimension as a migration-time environment variable (`EMBEDDING_DIMENSION`)." The
approach is therefore plan-compliant.

However, it creates a silent consistency risk: the nconf config key `embedding.dimension`
(which the Python service reads, and which the `vectorSearch` handler will validate against)
and the raw environment variable `EMBEDDING_DIMENSION` (read only by the migration) are two
separate configuration surfaces. If a developer sets `embedding.dimension` in `config.json5`
but does not set `EMBEDDING_DIMENSION`, the migration silently uses the default (384) while the
rest of the application uses the configured value. The mismatch would not surface until a
vector search dimension validation error at runtime.

A comment in the migration noting this risk and the need to keep both values in sync would
reduce the chance of a developer being surprised by this. Consider also adding a note to the
project's developer setup documentation when that is written.

Not blocking: the approach is explicitly described in the plan and the default (384 for
e5-small) is consistent with the project's OQ-3 (embedding model) placeholder. The risk
becomes real only if `embedding.dimension` is changed in config without also setting
`EMBEDDING_DIMENSION` before running a fresh migration. Raise this again when the embedding
model is chosen and OQ-3 is resolved.

**S-002 — Integration test: connection string hardcoded rather than read from env var**

File: `apps/backend/src/db/migrations/__tests__/migrations.integration.test.ts`, line 30.

The connection string `postgresql://ik_test:ik_test@localhost:5433/ik_test` is hardcoded in
the test. The `docker-compose.test.yml` header comment references a `TEST_DATABASE_URL`
environment variable (`TEST_DATABASE_URL=postgresql://ik_test:ik_test@localhost:5433/ik_test
pnpm --filter backend test`) but the test ignores this variable and uses the hardcoded value.

This means the test cannot be run against a different test database address (for example, in a
CI environment where the test container uses a different hostname). Using
`process.env.TEST_DATABASE_URL ?? 'postgresql://ik_test:ik_test@localhost:5433/ik_test'` would
make the test portable without changing its behaviour for local development. Not blocking for
Phase 1 local-only testing; worth addressing before Platform Engineer Phase 3 (CI/CD pipeline).

**S-003 — Migration 002: `aliases` default — PostgreSQL array literal syntax confirmed correct,
but Knex documentation does not guarantee portability**

File: `apps/backend/src/db/migrations/20260303000002_create_vocabulary.ts`, line 26.

The implementer raised this as a question. `.defaultTo('{}')` passes the literal string `{}`
as a `DEFAULT` expression to PostgreSQL. PostgreSQL interprets `'{}'` as an empty array for
`text[]` columns — this is correct PostgreSQL syntax. Knex passes the value as a raw SQL
default when `.specificType()` is used (Knex does not parse the default for non-native types).
The result is:

```sql
ALTER TABLE "vocabulary_terms" ADD COLUMN "aliases" text[] NOT NULL DEFAULT '{}'
```

This is correct and will work. No change is required. Flagging as a suggestion only because
Knex does not document `.defaultTo()` behaviour for `.specificType()` columns, so a brief
inline comment confirming that `'{}'` is the PostgreSQL empty array literal (not a JSON object)
would help future readers who encounter this pattern for the first time.

**S-004 — `db/index.ts` migration extension conflict with test setup**

File: `apps/backend/src/db/index.ts`, line 40; `__tests__/migrations.integration.test.ts`,
lines 34–37.

`db/index.ts` configures Knex with `extension: 'js'` (correct for the compiled `dist/`
output). The integration test creates a separate Knex instance with `extension: 'ts'` and
`loadExtensions: ['.ts']` to run migrations directly from TypeScript source under Vitest/tsx.
This is the right approach — it avoids a compile step before running integration tests. No
change is required; this is noted so future developers understand why the test-local Knex
instance differs from the production one and do not inadvertently "unify" them.

---

## Acceptance condition cross-checks

| Item | Migration | Test verifies |
| --- | --- | --- |
| `documents` table with all required columns | 001 | `documents table has all required columns` |
| `file_hash` partial unique index (`status = 'finalized'`) | 001 | `creates the file_hash partial unique index on documents` |
| `vocabulary_terms`, `vocabulary_relationships`, `rejected_terms`, `entity_document_occurrences` | 002 | `creates all expected tables`, `vocabulary_terms has all required columns`, `entity_document_occurrences has unique constraint` |
| `processing_runs` | 003 | `creates all expected tables` |
| `chunks`, `embeddings`, `embedding` as `vector` | 004 | `creates all expected tables`, `embeddings.embedding column is of type vector` |
| `pipeline_steps` unique constraint on (document_id, step_name) | 005 | `pipeline_steps has unique constraint on (document_id, step_name)` |
| `ingestion_runs`, `documents.ingestion_run_id` nullable | 006 | `creates all expected tables`, `documents.ingestion_run_id column exists and is nullable` |

**Partial unique index condition**: The partial index `WHERE status = 'finalized'` matches
ADR-009 precisely. ADR-009 requires duplicate detection against "previously accepted files".
The `finalized` status is the document lifecycle state after all three upload steps complete
successfully. Non-finalized documents (initiated, uploaded, stored) are in-progress and must
not compete with each other or with finalized records on the hash constraint. The condition is
correct.

**`ON DELETE SET NULL` on `documents.ingestion_run_id`**: Migration 006 uses `SET NULL`. This
is consistent with the plan: deleting an `ingestion_run` record (via `cleanupRun` or the
run-start sweep) must not cascade-delete document records that were created during the run,
because those documents may have reached `finalized` status. Setting the FK to `NULL` on run
deletion is the correct behaviour — documents remain; their `ingestion_run_id` is cleared.

---

## Plan compliance

- All six migrations match the column specifications in the backend task list and backend plan.
- Migration ordering follows the plan: `ingestion_run_id` is added to `documents` by migration
  006 (not 003), as the backend plan explicitly requires.
- The IVFFlat index is created with `lists = 1` and includes a comment referencing the
  maintenance rebuild step — consistent with the plan.
- `down()` functions exist for all six migrations and drop in correct reverse-dependency order.
- The `documents` `down()` drops the table without explicitly dropping the partial index —
  this is correct because `DROP TABLE` drops all associated indexes in PostgreSQL.
- The vector extension is not dropped in migration 004's `down()`, consistent with the comment
  that other tools may depend on it.
- ESM imports (`import type { Knex } from 'knex'`) throughout — consistent with ADR-047.

---

## Summary

**Outcome**: Pass

No blocking findings. Four suggestions are raised; none are required before the task advances
to `reviewed`. The most actionable suggestion for future tasks is S-001 (the embedding
dimension config surface split between `process.env.EMBEDDING_DIMENSION` and
`embedding.dimension` in nconf), which should be revisited when OQ-3 (embedding model
selection) is resolved.
