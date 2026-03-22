# Task List — Backend Service

## Status

Draft — 2026-03-04

## Source plan

`documentation/tasks/integration-lead-backend-plan.md`

## Flagged issues

**F-001 — ESM vs CommonJS (resolved by ADR-047)**

ADR-047 (approved 2026-03-04) resolves this: both `apps/frontend/` and `apps/backend/` use
ESM (`"type": "module"` in `package.json`). All imports use explicit `.js` extensions.
`import.meta.url` replaces `__dirname`/`__filename`. This flag is informational only —
no action required before Task 1.

**F-002 — Knex config wiring (Open Question 2 from backend plan)**

The backend plan notes that Knex traditionally uses a `knexfile.js` but recommends programmatic
configuration from nconf at runtime. The exact wiring approach is described as an implementer
decision. This is an acceptable implementation-level choice and does not require a new ADR.
The implementer should document the chosen approach (programmatic or knexfile) in a code
comment in the Knex initialisation module.

**F-003 — `packages/shared/` archive reference function (resolved)**

~~The `archiveReference` derivation function must live in `packages/shared/` and be importable
by `apps/backend/`. No existing backend task explicitly creates `packages/shared/` or the
derivation function.~~

Resolved: the Platform Engineer agent creates `packages/shared/` (including
`archiveReference`) during the scaffolding phase, which must complete before Task 1. By the
time the backend Implementer reaches Task 8 (document upload handlers), `archiveReference`
is already available as `@institutional-knowledge/shared`. No pre-work is required from the
Implementer.

**F-004 — API contract schemas (resolved by ADR-048)**

Request and response schemas for all route handlers (Tasks 8–19) must be defined in
`packages/shared/src/schemas/` using `@asteasolutions/zod-to-openapi` before the handler
is written. Handlers import types from `@institutional-knowledge/shared/schemas/[domain]`.
The backend serves an OpenAPI spec at `/openapi.json` (unauthenticated). Python generates
Pydantic models from this spec via `datamodel-codegen`.

---

## Tasks

### Task 1: Scaffold the Express backend application

**Description**: Create the Express backend application at `apps/backend/` within the existing
monorepo. This task sets up the project skeleton only — no routes, handlers, or business logic.

Specifically:

- Create `apps/backend/package.json` with dependencies: `express`, `pino`, `pino-http`,
  `nconf`, `knex`, `pg`, `multer`, `zod`, `uuid` (v7-capable), and devDependencies: `vitest`,
  `@types/express`, `@types/node`, `typescript`, `biome`
- Create `apps/backend/tsconfig.json` — extend from the root tsconfig; target Node; `strict:
  true`
- Create `apps/backend/biome.json` — enforce consistent import ordering, no unused variables,
  consistent formatting (tabs vs spaces per project convention); configure as standalone or
  inheriting from root `biome.json` if a root-level config exists
- Create the directory structure:
  - `src/config/` — nconf configuration module
  - `src/middleware/` — Pino logger, shared-key auth, Zod request validation, error handler
  - `src/routes/` — route registration (no handlers yet)
  - `src/services/` — service-layer functions (empty stubs)
  - `src/storage/` — StorageService interface and LocalStorageService stub
  - `src/vectorstore/` — VectorStore interface stub
  - `src/graphstore/` — GraphStore interface stub
  - `src/schemas/` — Zod request schemas (empty)
  - `src/db/` — Knex initialisation module
  - `src/db/migrations/` — empty; migrations added in Task 2
  - `src/db/seeds/` — empty; seeds added in Task 7
- Create the Express entry point `src/index.ts`: loads config, validates it with Zod, connects
  to the database, runs migrations, runs startup sweeps (stubs — sweeps implemented in Task 8),
  conditionally runs seeds, starts the HTTP server
- Set `"type": "module"` in `package.json` (ESM — resolved by ADR-047). All imports must use
  explicit `.js` extensions. Use `import.meta.url` in place of `__dirname`/`__filename`
- `apps/backend/tsconfig.json` must extend the root `tsconfig.json` created by the Platform
  Engineer; do not redefine settings already set at the root
- `apps/backend/biome.json` must extend the root `biome.json` created by the Platform
  Engineer; do not redefine settings already set at the root

**Depends on**: Platform Engineer scaffolding phase complete

**Complexity**: M

**Acceptance condition**: Running `pnpm install` in the monorepo root installs all backend
dependencies without errors. Running `pnpm --filter backend build` (or equivalent TypeScript
compile command) produces no TypeScript errors. Running `biome check apps/backend/src` passes
with no errors. The entry point `src/index.ts` exists and exports a startable Express
application (even if routes are empty stubs). Confirmed by manual inspection and `biome check`
output.

**Condition type**: manual

**Status**: done

**Verification** (2026-03-07):

- Automated checks: none required — condition type is manual
- Manual checks: all four criteria confirmed by the developer: (1) `pnpm install` completed without errors; (2) `pnpm --filter backend build` produced no TypeScript errors; (3) `biome check apps/backend/src` passed with no errors; (4) `src/index.ts` exists and exports a startable Express application via `createApp`.
- User need: satisfied — the backend skeleton builds, lints, and starts without errors, providing the structural foundation for all subsequent backend tasks. Code review confirmed compliance with ADR-047 (ESM), ADR-044 (auth middleware), ADR-031 (Express sole DB writer), and the Infrastructure as Configuration principle.
- Outcome: done

---

### Task 2: Implement Knex migrations (001–006)

**Description**: Write all six Knex migrations that create the PostgreSQL schema. Migrations
must be run in order; each migration is a separate file named per the convention in the backend
plan.

Migration details:

- **20260303000001_create_documents**: Create the `documents` table with columns: `id` (UUID
  v7 primary key), `status` (text: initiated/uploaded/stored/finalized), `filename` (text),
  `content_type` (text), `file_size_bytes` (bigint, nullable), `file_hash` (text, nullable),
  `storage_path` (text, nullable), `date` (text, nullable), `description` (text), `document_type`
  (text, nullable), `people` (text[], nullable), `organisations` (text[], nullable),
  `land_references` (text[], nullable), `flag_reason` (text, nullable), `flagged_at`
  (timestamptz, nullable), `submitter_identity` (text), `ingestion_run_id` (UUID, nullable —
  added by migration 006; NOT this migration), `created_at` (timestamptz default now()),
  `updated_at` (timestamptz default now()). Create a partial unique index on `file_hash` where
  `status = 'finalized'` (for duplicate detection against finalized documents only — ADR-009).

- **20260303000002_create_vocabulary**: Create four tables:
  - `vocabulary_terms`: `id` (UUID v7 PK), `term` (text), `normalised_term` (text unique),
    `category` (text), `description` (text nullable), `aliases` (text[]), `source` (text:
    llm_extracted/candidate_accepted/manual), `confidence` (float nullable), `created_at`,
    `updated_at`
  - `vocabulary_relationships`: `id` (UUID v7 PK), `source_term_id` (FK → vocabulary_terms),
    `target_term_id` (FK → vocabulary_terms), `relationship_type` (text), `confidence` (float
    nullable), unique constraint on (source_term_id, target_term_id, relationship_type)
  - `rejected_terms`: `id` (UUID v7 PK), `normalised_term` (text unique), `original_term`
    (text), `rejected_at` (timestamptz)
  - `entity_document_occurrences`: `id` (UUID v7 PK), `term_id` (FK → vocabulary_terms),
    `document_id` (FK → documents), `created_at`; unique constraint on (term_id, document_id)

- **20260303000003_create_processing_runs**: Create the `processing_runs` table: `id` (UUID v7
  PK), `status` (text: in_progress/completed/failed), `documents_queued` (int), `created_at`,
  `completed_at` (timestamptz nullable). This migration does NOT add any column to `documents`.

- **20260303000004_create_chunks_and_embeddings**: Execute `CREATE EXTENSION IF NOT EXISTS
  vector`. Create `chunks` table: `id` (UUID v7 PK), `document_id` (FK → documents),
  `chunk_index` (int), `text` (text), `token_count` (int), `created_at`. Create `embeddings`
  table: `id` (UUID v7 PK), `chunk_id` (FK → chunks unique), `document_id` (FK → documents),
  `embedding` (vector(N) where N is read from `EMBEDDING_DIMENSION` env var, defaulting to
  384). Create IVFFlat index on `embeddings.embedding` using `vector_cosine_ops` with `lists =
  1`.

- **20260303000005_create_pipeline_steps**: Create `pipeline_steps` table: `id` (UUID v7 PK),
  `document_id` (FK → documents), `step_name` (text), `status` (text:
  pending/running/completed/failed), `attempt_count` (int default 0), `error_message` (text
  nullable), `started_at` (timestamptz nullable), `completed_at` (timestamptz nullable),
  `created_at`. Unique constraint on (document_id, step_name).

- **20260303000006_create_ingestion_runs**: Create `ingestion_runs` table: `id` (UUID v7 PK),
  `status` (text: in_progress/moving/completed), `source_directory` (text), `grouped`
  (boolean), `created_at`, `completed_at` (timestamptz nullable). Add `ingestion_run_id` (UUID
  nullable FK → ingestion_runs) to the `documents` table.

**Depends on**: Task 1

**Complexity**: M

**Acceptance condition**: Running `knex migrate:latest` against a clean PostgreSQL instance
(with pgvector extension available) applies all six migrations without errors and produces the
correct table structures. Confirmed by an integration test that runs migrations on a fresh
test database and queries `information_schema.tables` to verify all expected tables exist:
`documents`, `vocabulary_terms`, `vocabulary_relationships`, `rejected_terms`,
`entity_document_occurrences`, `processing_runs`, `chunks`, `embeddings`, `pipeline_steps`,
`ingestion_runs`. The `file_hash` partial unique index on `documents` must exist. The
`embeddings.embedding` column must be of type `vector`. The `documents.ingestion_run_id`
column must exist (added by migration 006, not migration 003).

**Condition type**: automated

**Status**: done

**Verification** (2026-03-07):

- Automated checks: confirmed. The integration test at `apps/backend/src/db/migrations/__tests__/migrations.integration.test.ts` contains eight test cases covering every item in the acceptance condition: (1) all ten expected tables verified via `information_schema.tables`; (2) `file_hash` partial unique index verified via `pg_indexes` — condition `status = 'finalized'` confirmed in index definition; (3) `embeddings.embedding` column type verified via `information_schema.columns` `udt_name = 'vector'`; (4) `documents.ingestion_run_id` nullable column verified via `information_schema.columns` `is_nullable = 'YES'`. Each test queries actual database state after a real migration run — no mocking. The developer confirmed all eight tests passed. Note: the task description states the embedding dimension is "read from `EMBEDDING_DIMENSION` env var, defaulting to 384"; the post-review fix hardcoded the value to 384 unconditionally (removing the env var approach to avoid a dual-config-surface risk identified in code review finding S-001). The acceptance condition tests only that the column type is `vector`, which is met. The dimension (384, matching e5-small) is consistent with ADR-024 and OQ-3.
- Manual checks: none required — condition type is automated; developer confirmed all eight test cases passed against a live pgvector database.
- User need: satisfied. The six migrations create the complete Phase 1 PostgreSQL schema. The documents table with its partial unique index on `file_hash WHERE status = 'finalized'` enables ADR-009 duplicate detection. The vocabulary tables (vocabulary_terms, vocabulary_relationships, rejected_terms, entity_document_occurrences) enable all vocabulary curation user stories. The chunks and embeddings tables with the pgvector extension enable semantic search. The ingestion_runs table and documents.ingestion_run_id column (added by migration 006, not 001) enable CLI bulk ingestion. Migration ordering is correct: all foreign key dependencies are respected, and all down() functions drop tables in reverse-dependency order.
- Outcome: done

---

### Task 3: Implement nconf configuration module

**Description**: Implement the nconf configuration module at `src/config/index.ts`. This
module is the single source of configuration for the entire backend.

Specifically:

- Load configuration using the nconf hierarchy (highest to lowest priority):
  1. CLI arguments
  2. Environment variables prefixed with `IK_` (using `__` as nested key separator, e.g.
     `IK_DB__HOST` maps to `db.host`)
  3. `config.override.json5` if present (volume-mounted Docker Compose override)
  4. `config.json5` (base config file, provides local development defaults)
  5. nconf defaults

- Define Zod schema for all required config keys:
  - `server.port` (number, default 4000)
  - `db.host`, `db.port` (default 5432), `db.database`, `db.user`, `db.password`
  - `auth.frontendKey`, `auth.pythonKey`, `auth.pythonServiceKey` (all string, required)
  - `storage.provider` (string), `storage.local.basePath`, `storage.local.stagingPath`
  - `upload.maxFileSizeMb` (number, positive), `upload.acceptedExtensions` (string[])
  - `pipeline.runningStepTimeoutMinutes` (number), `pipeline.maxRetries` (number)
  - `python.baseUrl` (string)
  - `vectorStore.provider` (string, default "pgvector")
  - `graph.provider` (string, default "postgresql")
  - `embedding.dimension` (number, positive)
  - `ingestion.partialAuditReport` (boolean), `ingestion.reportOutputDirectory` (string)

- Validate all config keys against the Zod schema at load time. Throw a descriptive error
  if any required key is missing or of the wrong type. This implements the fail-fast startup
  behaviour described in the backend plan.

- Export the validated config as a `config` singleton constant, typed using the Zod inferred
  type (`AppConfig`). This is the correct export for all application code. Do not export a
  `getConfig()` function — a function would give future developers the impression they can call
  it freely, including before nconf is initialised.

- Also export a `parseConfig(raw: unknown): AppConfig` pure function for unit test use only.
  This function runs Zod validation against a plain object without touching nconf. Mark it
  clearly in a comment as test-only; production code must use the `config` singleton.

- Export the `logger.level` config key as part of the Zod schema:
  `logger.level` — union of Pino log-level literals (`fatal`, `error`, `warn`, `info`,
  `debug`, `trace`). This was identified as a missed requirement during Task 4 planning
  (the Pino logger middleware reads the log level from config).

- Create `config.json5` with sensible local development defaults (no secrets — those come from
  env vars or `config.override.json5`).

**Depends on**: Task 1

**Complexity**: S

**Acceptance condition**: A Vitest unit test confirms that loading a valid config object
produces the correct typed output. A second unit test confirms that loading a config object
with a missing required key (e.g. `auth.frontendKey`) throws a descriptive error before the
application starts. Both tests pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-07):

- Automated checks: confirmed. Two tests exist in `apps/backend/src/config/__tests__/config.test.ts`:
  (1) `returns a correctly typed config object for valid input` — calls `parseConfig(validRaw)` with a complete object covering all schema keys and asserts every top-level and nested value specifically (e.g. `expect(cfg.server.port).toBe(4000)`, `expect(cfg.logger.level).toBe('info')`). The assertions are non-vacuous and cover all schema sections including `logger.level`. (2) `throws a descriptive error when a required key is missing` — omits `auth.frontendKey` and asserts `parseConfig()` throws matching `/auth\.frontendKey/`. The error format in `index.ts` (`i.path.join('.')`) produces `auth.frontendKey: Required`, which satisfies the regex. Both tests are correct and non-vacuous. Developer confirmed both tests passed (`pnpm --filter backend exec vitest run src/config/__tests__/config.test.ts` — 2 passed).
- Manual checks: none required — condition type is automated.
- User need: satisfied. The `config` singleton is evaluated at module import time, meaning the process throws before Express binds to any port if any required key is missing or of the wrong type. This implements the fail-fast startup behaviour the backend plan requires and satisfies US-019's requirement that misconfigured values (such as a zero or negative `upload.maxFileSizeMb`) are caught at startup with an actionable error. The `parseConfig` test-only export is clearly marked with a comment directing application code to use the `config` singleton instead. The nconf hierarchy (CLI args → env vars → config.override.json5 → config.json5) is correctly wired and commented. Code review confirmed no blocking findings.
- Outcome: done

---

### Task 4: Implement middleware (logger, auth, request validation, error handler)

**Description**: Implement all four Express middleware modules in `src/middleware/`. These are
applied globally to every request in order.

**1. Pino request logger** (`src/middleware/requestLogger.ts`):

- Use `pino-http` to create a middleware that logs method, path, status code, and response
  time for every request
- Assign a UUID v4 request ID to each request for log correlation
- Attach the Pino logger instance to the request object (`req.log`) for use in handlers
- Logger level should be configurable (read from config or environment)

**2. Shared-key auth** (`src/middleware/auth.ts`):

- Read `auth.frontendKey` and `auth.pythonKey` from config
- On every request (except `GET /api/health`), check the `x-internal-key` header against both
  configured keys
- Return HTTP 401 with `{ error: 'unauthorized', message: 'Invalid or missing internal key' }`
  if the header is absent or does not match either key
- Log the auth failure with Pino (no key value in log output)
- Skip auth for `GET /api/health`

**3. Zod request validation factory** (`src/middleware/validate.ts`):

- Export a `validate(schema)` factory function that returns an Express middleware
- The schema object can include `body`, `params`, and `query` Zod schemas (all optional)
- On validation failure, return HTTP 400 with `{ error: 'validation_error', message: string,
  details: ZodError.issues }` — use Zod's formatted error output
- On success, attach the parsed (type-safe) values to `req.body`, `req.params`, and
  `req.query`

**4. Error handler** (`src/middleware/errorHandler.ts`):

- Express error handler (four-argument signature: `err, req, res, next`)
- Log the full error with `req.log` (Pino)
- For known application errors (validation, not-found, conflict) — return appropriate 4xx
  status with `{ error: string, message: string, details?: object }`
- For unknown errors — return HTTP 500 with `{ error: 'internal_error', message: 'An
  unexpected error occurred' }` — no stack trace in response body
- Define a set of typed application error classes (e.g. `NotFoundError`, `ConflictError`,
  `ValidationError`) that handlers can throw; the error handler maps these to status codes

**Depends on**: Task 3

**Complexity**: M

**Acceptance condition**: Vitest unit tests confirm:
(a) The auth middleware returns 401 when `x-internal-key` is absent; returns 401 when the
header value does not match either configured key; passes when the header matches
`auth.frontendKey`; passes when the header matches `auth.pythonKey`; skips auth for
`GET /api/health`.
(b) The validation middleware returns 400 with Zod error details when a required body field is
missing; passes and attaches parsed values when the body is valid.
(c) The error handler returns 500 with no stack trace for unknown errors; returns 404 for
`NotFoundError`; returns 409 for `ConflictError`. All tests pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-09):

- Automated checks: confirmed. All three sub-conditions verified by reading `apps/backend/src/middleware/__tests__/middleware.test.ts` against the implementations. (a) Auth middleware — four unit tests cover absent header (401), wrong key (401), `frontendKey` match (`next()` called), and `pythonKey` match (`next()` called). Health-route bypass confirmed by two `supertest` integration tests: GET `/api/health` with no key returns 200; another route with no key returns 401. Bypass is structural — health route registered in `src/index.ts` before `app.use(createAuthMiddleware(...))`, with an explanatory comment. All five behaviours confirmed. (b) Validation middleware — two tests: missing `age` field returns 400 with `error: 'validation_error'` and a `details` array containing path `'age'`; valid body calls `next()` and `req.body` is updated with parsed values. Confirmed. (c) Error handler — three tests: unknown `Error` returns 500 with `error: 'internal_error'` and message `'An unexpected error occurred'`; `JSON.stringify` of the response body does not contain `'stack'`; `NotFoundError` returns 404 with `error: 'not_found'`; `ConflictError` returns 409 with `error: 'conflict'`. Confirmed. Code review round 3 (2026-03-09) confirms all 21 backend tests pass, Biome lint passes, TypeScript typecheck passes.
- Manual checks: none required — condition type is automated.
- User need: satisfied — US-096 (provider abstraction): logger, auth, and error handler are factory functions accepting injected dependencies; `AppDependencies` in `src/index.ts` carries `log: Logger` so all middleware receives the same logger instance; no provider hardcoded in any middleware module. US-097 (operational values from config): logger level read from `config.logger.level` (nconf-backed) in `server.ts`, passed through `createLogger`; no hardcoded log level. US-098 (actionable error messages): 4xx responses include `message` and `details` (Zod issue paths) sufficient for programmatic callers; 500 response omits stack trace from body (correct security practice). US-003/US-003b (server-side validation): `validate` factory delivers the mechanism; end-to-end enforcement verified per handler task. No gap between acceptance conditions and user need.
- Outcome: done

---

### Task 5: Implement StorageService (interface and LocalStorageService)

**Description**: Implement the StorageService abstraction at `src/storage/`. This service
abstracts all file I/O so that a different storage provider (e.g. S3) can be substituted in
Phase 2 by replacing the concrete implementation only.

**Interface** (`src/storage/StorageService.ts`):

```typescript
interface StorageService {
  writeStagingFile(uploadId: string, fileBuffer: Buffer, filename: string): Promise<string>;
  moveStagingToPermanent(uploadId: string, filename: string): Promise<string>;
  deleteStagingFile(uploadId: string, filename: string): Promise<void>;
  deletePermanentFile(storagePath: string): Promise<void>;
  createStagingDirectory(runId: string): Promise<string>;
  deleteStagingDirectory(runId: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
}
```

**LocalStorageService** (`src/storage/LocalStorageService.ts`):

- Reads `storage.local.basePath` (permanent storage root) and `storage.local.stagingPath`
  (staging root) from config
- `writeStagingFile`: write buffer to `{stagingPath}/{uploadId}/{filename}`; create directory
  if not present
- `moveStagingToPermanent`: move file from staging to `{basePath}/{uploadId}/{filename}`;
  create parent directory if not present; return the storage path
- `deleteStagingFile`: delete file at staging path; no error if file does not exist (idempotent)
- `deletePermanentFile`: delete file at given storage path; no error if file does not exist
- `createStagingDirectory`: create `{stagingPath}/{runId}/`; return the path
- `deleteStagingDirectory`: recursively delete `{stagingPath}/{runId}/`; no error if not present
- `fileExists`: return true if the path exists and is readable

**Factory** (`src/storage/index.ts`): export `createStorageService(storageConfig, log)` that reads
`storage.provider` and returns a `LocalStorageService` for `"local"`. The `Logger` instance is
injected so that `LocalStorageService` can emit structured debug and error logs — consistent with
the factory pattern used in `createAuthMiddleware` and `createErrorHandler`.

**Depends on**: Task 3

**Complexity**: S

**Acceptance condition**: Vitest unit tests using a temporary directory (or `memfs` mock)
confirm:
(a) `writeStagingFile` creates the file at the expected staging path.
(b) `moveStagingToPermanent` moves the file and returns the correct storage path.
(c) `deleteStagingFile` removes the file without error; calling it again on a non-existent
file also returns without error.
(d) `deletePermanentFile` removes the file without error when it exists; no error when absent.
(e) `createStagingDirectory` and `deleteStagingDirectory` create and remove the directory.
All tests pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-10):

- Automated checks: confirmed — all five sub-conditions covered by Vitest tests in `apps/backend/src/storage/__tests__/LocalStorageService.test.ts`. (a) Two cases: file content written correctly; parent directory auto-created. (b) Two cases: destination path returned correctly; file absent from staging after move; destination parent directory auto-created. (c) Three cases: file removed; no throw on non-existent file; no throw on double delete. (d) Three cases: file removed; no throw on non-existent path; no throw on double delete. (e) `createStagingDirectory`: returns absolute path and creates directory. `deleteStagingDirectory`: three cases — removes directory and inner contents; no throw on non-existent directory; no throw on double delete. Tests use a real `os.tmpdir()` directory, consistent with the project testing strategy. All five sub-conditions test the exact stated behaviour — no weaker approximations detected.
- Manual checks: none required — condition type is automated.
- User need: satisfied — the `StorageService` interface correctly isolates all file I/O behind an abstract boundary per ADR-008 (Infrastructure as Configuration). The factory reads `storage.provider` from config and returns the appropriate implementation; adding an S3 provider in Phase 2 requires only a new branch in the factory, with no changes to callers. Idempotent delete methods satisfy cleanup-on-failure paths without requiring callers to handle file-not-found errors. Logger injection is consistent with the established factory pattern. Code review (two rounds) raised no blocking findings; all three suggestions (S-001/S-002 ENOENT log-level distinction, S-003 `deleteStagingDirectory` catch block consistency) were actioned and confirmed in the follow-up review.
- Outcome: done

---

### Task 6: Implement VectorStore interface and PgVectorStore

**Description**: Implement the VectorStore abstraction at `src/vectorstore/`. The interface
is defined in the backend plan.

**Interface** (`src/vectorstore/VectorStore.ts`):

```typescript
interface VectorStore {
  write(documentId: string, chunkId: string, embedding: number[]): Promise<void>;
  search(
    queryEmbedding: number[],
    topK: number,
    filters?: Record<string, unknown>
  ): Promise<SearchResult[]>;
}

interface SearchResult {
  chunkId: string;
  documentId: string;
  text: string;
  chunkIndex: number;
  tokenCount: number;
  similarityScore: number;
}
```

**PgVectorStore** (`src/vectorstore/PgVectorStore.ts`):

- Constructor accepts `knex` instance and `config` (reads `embedding.dimension`)
- `write(documentId, chunkId, embedding)`: insert a row into `embeddings` with chunk_id,
  document_id, and the embedding vector. The `chunks` row must already exist (inserted by the
  handler) before this is called.
- `search(queryEmbedding, topK)`: execute the cosine similarity query shown in the backend
  plan against the `embeddings` and `chunks` tables. Join `documents` to include description,
  date, and document_type. Return results ordered by similarity (highest first). Validate that
  `queryEmbedding.length` equals `embedding.dimension`; throw a descriptive error if not.
- Phase 1 applies no similarity threshold — all topK results are returned.

**Factory** (`src/vectorstore/index.ts`): export `createVectorStore(config, knex)` that reads
`vectorStore.provider` and returns a `PgVectorStore` for `"pgvector"`.

**Depends on**: Task 2, Task 3

**Complexity**: S

**Acceptance condition**: Integration tests against a real PostgreSQL instance (with pgvector)
confirm:
(a) `write` + `search` round-trip: insert a chunk and embedding; search with the same vector;
verify the chunk is returned as the top result.
(b) Dimension mismatch: searching with a vector of wrong length throws a descriptive error.
(c) topK limiting: inserting 5 embeddings and searching with topK=3 returns exactly 3 results.
(d) Empty database search returns an empty results array without error.
All integration tests pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-10, completed 20:22):

- Automated checks confirmed by reading implementation and tests:
  - (a) write + search round-trip: `store.write()` inserts via `?::vector` cast; `store.search()` joins `embeddings` and `chunks`, orders by cosine distance ascending, returns `similarityScore` close to 1.0 for same-vector search. Test asserts exact field values and `similarityScore` within 5 decimal places.
  - (b) Dimension mismatch on `search()`: guard fires before database round-trip; throws `"PgVectorStore.search: embedding dimension mismatch — expected 384, received 10"`. Test asserts exact error string.
  - (c) topK limiting: 5 embeddings inserted; `search(vector, 3)` returns exactly 3 results. Confirmed by `toHaveLength(3)` assertion.
  - (d) Empty database: `search()` on clean database returns `[]`. Confirmed by `toEqual([])` assertion.
  - Beyond stated conditions: `write()` dimension guard added (S-004 from code review); test asserts exact error string `"PgVectorStore.write: embedding dimension mismatch — expected 384, received 10"`.
- Test infrastructure: `globalSetup.ts` runs `migrate.latest()`/`migrate.rollback()` once per suite run; `dbCleanup.ts` provides `cleanAllTables()` via `TRUNCATE ... RESTART IDENTITY CASCADE`; `fileParallelism: false` prevents race conditions. All confirmed correct.
- Factory pattern: `createVectorStore(vectorStoreConfig, embeddingConfig, knex, log)` accepts typed config slices consistent with `createStorageService` pattern. Backend plan updated.
- User need: US-045 (embeddings written per chunk, retrievable by cosine similarity) and US-096 (provider abstraction — no pgvector-specific code outside `PgVectorStore.ts` and `index.ts`) both satisfied.
- Manual checks: developer confirmed all tests pass against a live pgvector database (three rounds of code review, all Pass).

**Post-refactor verification** (2026-03-11):

A post-`done` refactor was applied to the branch introducing typed repositories (`embeddings`, `chunks`), camelCase conversion via `wrapIdentifier`/`postProcessResponse`, an async `createDb` with connectivity check and migration, a synchronous `createTestDb` for test use, a shared `createKnexInstance` helper, and `createGraphStore` updated to accept `AppConfig['graph']` and `Logger`. Two code reviews were conducted on these refactor commits.

- Refactor review (2026-03-11 11:37) — Fail: B-001 (`createGraphStore` accepted raw `string` instead of `AppConfig['graph']` + `Logger`); B-002 (`createDb` used `extension: 'js'` for migrations while source files are `.ts`, leaving `createDb`'s internal `migrate.latest()` a no-op at test time). Acceptance condition confirmed met by that review.
- Refactor fixes review (2026-03-11) — Pass: B-001 resolved (`createGraphStore` now accepts `AppConfig['graph']`, `DbInstance`, `Logger`; `server.ts` updated); B-002 resolved (`createTestDb` introduced — synchronous, no connectivity check, no `migrate.latest()`; schema lifecycle remains with `globalSetup.ts`). S-001 (double cast replaced with explicit per-field mapping) and S-004 (redundant `as string` cast removed) also resolved. One new non-blocking suggestion (S-005: duplicated Knex config between `createDb` and `createTestDb`) noted but not blocking. No regressions introduced; all four acceptance condition tests (a–d) remain valid and unchanged in their assertions.
- Outcome: `done` status confirmed. Refactor commits are ready to merge with the Task 6 branch. User need check: US-045 and US-096 remain satisfied — no provider-specific code outside `PgVectorStore.ts` and `index.ts`; factory pattern consistent with all other services.

---

### Task 7: Implement GraphStore interface and PostgresGraphStore

**Description**: Implement the GraphStore abstraction at `src/graphstore/`. The interface is
defined in the backend plan.

**Interface** (`src/graphstore/GraphStore.ts`) — define the full interface as specified in the
backend plan, including `GraphEntity`, `GraphRelationship`, `TraversalResult`, and
`DocumentReference` types.

**PostgresGraphStore** (`src/graphstore/PostgresGraphStore.ts`):

- Constructor accepts `knex` instance
- `writeEntity(entity)`: insert or update a `vocabulary_terms` row (upsert on `id`)
- `writeRelationship(relationship)`: insert a `vocabulary_relationships` row; ignore on
  duplicate composite key (source_term_id, target_term_id, relationship_type)
- `getEntity(entityId)`: query `vocabulary_terms` by ID; return null if not found or if the
  entity has no `entity_document_occurrences` rows (ADR-037: graph contains only
  document-evidenced entities)
- `getRelationships(entityId, direction)`: query `vocabulary_relationships` by entity ID with
  the specified direction filter (outgoing = source_term_id, incoming = target_term_id, both =
  either)
- `traverse(startEntityId, maxDepth, relationshipTypes?)`: execute the recursive CTE shown in
  the backend plan; optionally filter traversal to specified relationship types; return all
  visited entities and connecting relationships up to `maxDepth` hops
- `findEntitiesByType(entityType)`: query `vocabulary_terms` by `category`; filter to entities
  with at least one `entity_document_occurrences` row
- `findDocumentsByEntity(entityId)`: join `entity_document_occurrences` to `documents` for the
  given entity; return document references (ID, description, date)

**Factory** (`src/graphstore/index.ts`): export `createGraphStore(config, knex)` that reads
`graph.provider` and returns a `PostgresGraphStore` for `"postgresql"`.

**Depends on**: Task 2, Task 3

**Complexity**: M

**Acceptance condition**: Integration tests against a real PostgreSQL instance confirm:
(a) `writeEntity` + `getEntity` round-trip: insert an entity with a known ID; retrieve it;
verify fields match. An entity with no `entity_document_occurrences` is not returned by
`getEntity`.
(b) `writeRelationship` + `getRelationships`: insert two entities and a relationship; retrieve
outgoing relationships from the source entity; verify result.
(c) `traverse` depth 1, 2, 3: build a three-hop chain; verify that traversal with maxDepth=1
returns only depth-1 neighbours, maxDepth=2 returns depth-1 and depth-2, and so on.
(d) `findEntitiesByType` filtering: insert entities of two categories; verify only the correct
category is returned.
(e) `findDocumentsByEntity` join: insert entity, document, and occurrence; verify the returned
document reference has the correct description and date.
All integration tests pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-13):

- Automated checks: confirmed. 13 integration tests in `apps/backend/src/graphstore/__tests__/PostgresGraphStore.integration.test.ts` cover all five acceptance conditions against a real PostgreSQL instance. (a) Three tests: round-trip with occurrence returns entity with correct fields; entity with no occurrences returns null (ADR-037 filter enforced via `whereExists` subquery in `findTermById`); upsert on ID conflict updates term and category. (b) Three tests: outgoing relationships returned with correct fields; incoming direction filter works; duplicate insert on same composite key does not throw and produces exactly one row. (c) `it.each` parametrised test at depths 1, 2, and 3 against a three-hop chain built by `buildChain()`: relationship count equals depth; `result.depth` equals actual depth reached (derived from `MAX(depth)` in recursive CTE); expected source IDs present. (d) Two tests: category filter returns only matching entities; entities without occurrences excluded. (e) Two tests: correct `DocumentReference` fields returned; empty array when no occurrences. Additionally 28 `normaliseTermText` unit tests covering Unicode-aware punctuation stripping, lowercasing, whitespace normalisation, and ADR-028 deduplication consistency.
- Manual checks: none required — condition type is automated.
- User need: satisfied. GraphStore interface (ADR-037) provides the data access layer for vocabulary management (US-059, US-061, US-065) and graph-RAG traversal. Document-evidenced filter enforced in `getEntity`/`findEntitiesByType`; `traverse()` intentionally omits filter mid-traversal (incoherent results otherwise) with documented rationale. `normaliseTermText` implements ADR-028 in a single location. Factory `createGraphStore(graphConfig, db, log)` consistent with established pattern.
- Outcome: done

---

### Task 8: Implement document upload handlers (DOC-001, DOC-002, DOC-003, DOC-005)

**Description**: Implement the four document lifecycle handlers in `src/services/` and register
them on the Express router. These implement the three-step upload flow plus the cleanup
endpoint.

**Note on `archiveReference`**: The archive reference derivation function must be imported from
`packages/shared/`. Confirm this package is available before starting this task (see Flagged
Issue F-003).

**initiateUpload** (POST /api/documents/initiate — DOC-001):

- Validate request body with Zod: `filename` (string), `contentType` (string),
  `fileSizeBytes` (number), `date` (string — YYYY-MM-DD or empty), `description` (string,
  non-empty non-whitespace)
- Validate file extension against `upload.acceptedExtensions`; return 422 if not accepted
- Validate file size against `upload.maxFileSizeMb`; return 422 if over limit
- Validate date format (YYYY-MM-DD regex) if non-empty; return 400 if invalid
- Validate description is non-empty and non-whitespace; return 400 if not
- Generate UUID v7; insert `documents` row with status `initiated`
- Return `{ uploadId, status: 'initiated' }`

**uploadFile** (POST /api/documents/:uploadId/upload — DOC-002):

- Accept `multipart/form-data` with a `file` field (use multer with memory storage)
- Look up document by `uploadId`; return 404 if not found or status is not `initiated`
- Write file buffer to staging via `StorageService.writeStagingFile`
- Compute MD5 hash of file buffer
- Check `file_hash` against the partial unique index on finalized documents; return 409 with
  `DuplicateConflictResponse` body if a duplicate is found (include existing document's
  `documentId`, `description`, `date`, and `archiveReference`)
- Update document row: set `file_hash`, `file_size_bytes`, status to `uploaded`
- Return `{ uploadId, status: 'uploaded', fileHash }`

**finalizeUpload** (POST /api/documents/:uploadId/finalize — DOC-003):

- Look up document by `uploadId`; return 404 if not found or status is not `uploaded`
- Move file from staging to permanent storage via `StorageService.moveStagingToPermanent`
- Update document row: set `storage_path`, status to `stored`, then status to `finalized`
- Derive archive reference from the `packages/shared/` function
- Return `FinalizeUploadResponse` (documentId, description, date, archiveReference, status)

**cleanupUpload** (DELETE /api/documents/:uploadId — DOC-005):

- Look up document by `uploadId`; return 404 if not found
- Return 409 if status is `finalized` (cannot delete a finalized document in Phase 1)
- Delete staging file if present (status `initiated` or `uploaded`)
- Delete permanent storage file if status is `stored`
- Delete database record
- Return `{ deleted: true }`

Register all four routes on the documents router. Apply Zod validation middleware where
applicable. Apply the shared-key auth middleware (via the global middleware stack).

**Depends on**: Task 2, Task 3, Task 4, Task 5

**Complexity**: L

**Acceptance condition**: Vitest unit tests with mocked Knex, StorageService, and config
confirm:
(a) `initiateUpload`: returns 422 for unsupported file extension; returns 422 for file size
over limit; returns 400 for invalid date format; returns 400 for whitespace-only description;
returns 201 with `uploadId` on valid request.
(b) `uploadFile`: returns 404 when `uploadId` not found; returns 404 when status is not
`initiated`; returns 409 with `DuplicateConflictResponse` when MD5 matches an existing
finalized document; returns 200 with `fileHash` on success.
(c) `finalizeUpload`: returns 404 when status is not `uploaded`; returns 200 with
`archiveReference` on success.
(d) `cleanupUpload`: returns 409 when status is `finalized`; returns 200 with
`{ deleted: true }` on success; calls `StorageService.deleteStagingFile` for status
`uploaded` and `deletePermanentFile` for status `stored`.
All tests pass.

Integration test (real database, Task 2 migrations): initiate → upload → finalize full
lifecycle completes; document record reaches `finalized` status; staging file is absent;
permanent file exists at `storage_path`. Test passes.

**Condition type**: both

**Status**: done

**Verification** (2026-03-16):

- Automated checks (unit tests): confirmed. All acceptance condition sub-conditions covered by
  `apps/backend/src/services/documents.test.ts`. (a) `initiateUpload` — four cases: `.exe`
  extension returns `unsupported_extension`; 11 MB file returns `file_too_large`; `'   '`
  description returns `whitespace_description`; valid input returns `outcome: 'success'` with
  a non-empty `uploadId` string and `status: 'initiated'`. The "returns 400 for invalid date
  format" condition is met structurally: the Zod `InitiateUploadRequest` schema validates the
  date regex and the `validate` middleware returns HTTP 400 before the service is called —
  confirmed by code review round 2. (b) `uploadFile` — four cases: undefined row returns
  `not_found`; non-`initiated` status returns `not_found`; `findFinalizedByHash` returning a
  match returns `duplicate_detected` with correct `DuplicateConflictResponse` shape including
  `archiveReference: '1987-06-15 — Wedding photo'`; no duplicate returns `outcome: 'success'`
  with 32-char MD5 hex `fileHash`. (c) `finalizeUpload` — two cases plus additional: non-
  `uploaded` status returns `not_found`; valid `uploaded` doc returns success with
  `archiveReference: '1987-06-15 — Wedding photo'`; additional test confirms
  `[undated] — Undated photo` form when `date` is null. (d) `cleanupUpload` — five cases:
  undefined row returns `not_found`; `finalized` status returns `finalized_document`; `uploaded`
  status returns `deleted: true` and `deleteStagingFile` called (verified via spy); `initiated`
  status calls `deleteStagingFile`; `stored` status calls `deletePermanentFile`. HTTP status
  mapping confirmed correct via exhaustive `ERROR_STATUS` record in
  `apps/backend/src/routes/documents.ts` (`unsupported_extension` → 422, `file_too_large` →
  422, `whitespace_description` → 400, `not_found` → 404, `duplicate_detected` → 409,
  `finalized_document` → 409).
- Automated checks (integration test): confirmed.
  `apps/backend/src/services/__tests__/documents.integration.test.ts` covers the full
  initiate → upload → finalize lifecycle against a real PostgreSQL instance and
  `LocalStorageService` with temp directories. Verifies: DB row at `initiated` after
  `initiateUpload`; staging file exists after `uploadFile`; DB row at `uploaded` with correct
  `fileHash` after `uploadFile`; DB row at `finalized` with `storagePath` set after
  `finalizeUpload`; staging file absent after `finalizeUpload`; permanent file exists at
  `storagePath`. A second test covers `cleanupUpload` deleting an `initiated` record and
  confirming the row is gone via `db.documents.getById`. Uses `createTestDb`,
  `cleanAllTables` in `afterEach`, and `globalSetup` for schema — consistent with the
  established integration test pattern.
- Manual checks: confirmed by developer (2026-03-16). All three commands passed: (1)
  `pnpm --filter backend build` — no TypeScript errors; (2) `pnpm --filter backend exec biome
  check src` — clean lint; (3) `pnpm --filter backend test` — 113 tests pass.
- User need: satisfied. The four handlers implement the complete server-side document upload
  protocol. US-003/US-003b (server-side validation): date format validated by Zod schema before
  service is called; whitespace description validated in service. Both enforced server-side.
  US-005 (format restriction): extension check reads `upload.acceptedExtensions` from config;
  error message names the rejected extension and the accepted list — actionable. US-006
  (atomicity): `cleanupUpload` (DOC-005) handles abandoned uploads; staging file cleaned up
  immediately on duplicate detection (S-001 fix confirmed in code review round 2). US-019 (max
  file size): reads `upload.maxFileSizeMb` from config at runtime; error message states received
  size and configured limit. US-020 (duplicate detection): MD5 hash checked against finalized
  documents only (partial unique index per ADR-009); `DuplicateConflictResponse` includes
  `archiveReference` of the existing document so the caller can inform the user exactly which
  document already exists; rejected duplicate staging file deleted immediately. All key
  architectural constraints respected: zero Express imports in `services/documents.ts`;
  exhaustive `ERROR_STATUS` record in route layer; `next(err)` reserved for unexpected errors
  only; `duplicate_detected` uses custom `errorData` body shape; all DB access via
  `db.documents.*`; no document content in logs.
- Outcome: done

---

### Task 9: Implement document curation handlers (DOC-006, DOC-007, DOC-008, DOC-009)

**Description**: Implement the four document curation handlers and register them on the Express
router.

**getDocumentQueue** (GET /api/curation/documents — DOC-006):

- Validate query params: `page` (number, default 1), `pageSize` (number, default 50)
- Query `documents` where `flag_reason IS NOT NULL`, ordered by `flagged_at` ASC
- Join `pipeline_steps` to compute a `pipelineStatus` summary string per document
- Paginate: apply LIMIT/OFFSET; return `total` count
- Derive `archiveReference` for each row
- Return `DocumentQueueResponse`

**getDocument** (GET /api/documents/:id — DOC-007):

- Look up document by ID; return 404 if not found
- Derive `archiveReference`
- Return `DocumentDetailResponse` including all metadata fields, `organisations` as
  `string[]`, `people` as `string[]`, `landReferences` as `string[]`

**clearFlag** (POST /api/documents/:id/clear-flag — DOC-008):

- Look up document; return 404 if not found
- Return 409 if `flag_reason` is null (no flag to clear)
- Set `flag_reason` and `flagged_at` to null
- Do not reset or modify any `pipeline_steps` rows
- Return `{ documentId, flagCleared: true }`

**updateDocumentMetadata** (PATCH /api/documents/:id/metadata — DOC-009):

- Validate request body with Zod: all fields optional; validate description non-emptiness if
  provided; validate date format (YYYY-MM-DD or empty) if provided
- Look up document; return 404 if not found
- Apply partial update for provided fields only
- Update `updated_at`
- Derive `archiveReference` from the updated record
- Return `UpdateDocumentMetadataResponse` (all metadata fields plus re-derived
  `archiveReference`)

Register all four routes. Apply Zod validation middleware.

**Depends on**: Task 2, Task 3, Task 4

**Complexity**: M

**Acceptance condition**: Vitest unit tests with mocked Knex confirm:
(a) `getDocumentQueue`: returns paginated results; returns only documents with active flags;
derives `archiveReference` for each row.
(b) `getDocument`: returns 404 for unknown ID; returns all metadata fields including
`organisations` array.
(c) `clearFlag`: returns 409 when no flag exists; sets `flag_reason` and `flagged_at` to null
when flag exists; does not modify `pipeline_steps`.
(d) `updateDocumentMetadata`: returns 400 for whitespace-only description; returns 400 for
invalid date; applies partial update (only provided fields updated); re-derives
`archiveReference` after update.
All tests pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-17):

- Automated checks: confirmed. Coverage is split between unit tests (`apps/backend/src/services/__tests__/curation.test.ts`) and integration tests (`apps/backend/src/routes/__tests__/curation.integration.test.ts`), consistent with development principle 8. (a) `getDocumentQueue` — integration tests: empty queue returns `documents: []` and `total: 0`; flagged document returns `archiveReference: '1987-06-15 — Wedding photograph'`; two flagged documents with `pageSize=1` returns one doc and `total: 2`; non-numeric `page` param returns 400. `getFlagged` uses `whereNotNull('flagReason')` — only documents with active flags are returned, ordered by `flaggedAt ASC`. Unit test confirms `archiveReference` derivation from `date` and `description`. (b) `getDocument` — integration tests: 404 for unknown UUID, 400 for non-UUID param, 200 with all metadata fields confirmed including `organisations: ['Estate of John Smith']`, `people: ['Alice Smith']`, `landReferences: ['North Field']`, `archiveReference: '1987-06-15 — Wedding photograph'`. (c) `clearFlag` — integration tests: 404 for unknown ID, 409 (`no_flag_to_clear`) for unflagged document, 200 with `flagCleared: true` and DB row confirmed with `flagReason: null` and `flaggedAt: null`; `does not modify pipeline_steps` test inserts a `failed` step before calling clearFlag and asserts it is still present with `status: 'failed'` after — the S-001 finding from code review was already resolved in the implementation. (d) `updateDocumentMetadata` — integration tests: 404 for unknown ID, 400 for whitespace description (Zod trim + min(1)), 400 for invalid date format, 200 with `archiveReference: '1987-06-15 — Updated description'` after description-only update; DB verification confirms `people` and `organisations` unchanged (partial update verified). Unit test confirms `archiveReference` re-derived from updated row (not pre-update row).
- Manual checks: none required — condition type is automated.
- User need: satisfied. US-055 (clear flag): `clearFlag` sets `flagReason` and `flaggedAt` to null; pipeline_steps rows are untouched, so the document resumes from the next incomplete step on the next processing trigger — correct behaviour per US-055. US-057 (queue ordered by flag timestamp): `getFlagged` orders by `flaggedAt ASC` — oldest-flagged first, matching the requirement. US-080 (view curation queue): `getDocumentQueue` response includes description, date, flagReason, flaggedAt, submitterIdentity, archiveReference, and pipelineStatus — all fields the curator needs to triage. US-081 (clear flag via UI backend): HTTP POST endpoint returns `{ flagCleared: true, documentId }` and the DB change is confirmed in the integration test. US-082 (correct document metadata via UI backend): `updateDocumentMetadata` applies partial updates via `updateMetadata` repository method — only provided fields written to DB; `updatedAt` always updated; `archiveReference` re-derived from the post-update row. Service/route pattern, no Express imports in the service layer, exhaustive `ERROR_STATUS` record, zero provider hardcoding — all architectural constraints respected.
- Outcome: done

---

### Task 10: Implement vocabulary curation handlers (VOC-001, VOC-002, VOC-003, VOC-004)

**Description**: Implement the four vocabulary curation handlers and register them on the
curation router.

**getVocabularyQueue** (GET /api/curation/vocabulary — VOC-001):

- Validate query params: `page` (number, default 1), `pageSize` (number, default 50)
- Query `vocabulary_terms` where `source = 'llm_extracted'`, ordered by `created_at` ASC
- Left join `entity_document_occurrences` and `documents` to get source document description
  and date for each term (use the earliest occurrence — order by `entity_document_occurrences.
  created_at` ASC, take first)
- Paginate; return `VocabularyQueueResponse`

**acceptCandidate** (POST /api/curation/vocabulary/:termId/accept — VOC-002):

- Look up term by `termId`; return 404 if not found
- Return 409 if `source` is not `'llm_extracted'`
- Update `source` to `'candidate_accepted'`
- Return `{ termId, term, source: 'candidate_accepted' }`

**rejectCandidate** (POST /api/curation/vocabulary/:termId/reject — VOC-003):

- Look up term; return 404 if not found
- Return 409 if `source` is not `'llm_extracted'`
- Within a transaction:
  - Insert into `rejected_terms` (normalised_term, original_term, rejected_at)
  - Delete from `vocabulary_terms` by ID (cascading deletes remove `vocabulary_relationships`
    and `entity_document_occurrences` rows via foreign key cascade)
- Return `{ termId, rejected: true }`

**addManualTerm** (POST /api/curation/vocabulary/terms — VOC-004):

- Validate request body with Zod: `term` (string, required), `category` (string, required),
  `description` (string optional), `aliases` (string[], optional), `relationships` (array of
  `{ targetTermId, relationshipType }`, optional)
- Compute `normalised_term` from `term` input (lowercase + normalise whitespace)
- Check `normalised_term` against `vocabulary_terms.normalised_term` — return 409 if duplicate
- Check `normalised_term` against `rejected_terms.normalised_term` — return 409 if duplicate
- Validate that all provided `targetTermId` values exist in `vocabulary_terms` — return 404
  if any do not
- Generate UUID v7
- Within a transaction:
  - Insert `vocabulary_terms` row with `source = 'manual'`, `confidence = null`
  - Insert `vocabulary_relationships` rows for each provided relationship
- Return `AddVocabularyTermResponse`

Register all four routes. Apply Zod validation middleware.

**Depends on**: Task 2, Task 3, Task 4

**Complexity**: M

**Acceptance condition**: Vitest unit tests with mocked Knex confirm:
(a) `acceptCandidate`: returns 409 when source is not `'llm_extracted'`; updates source to
`'candidate_accepted'` when valid.
(b) `rejectCandidate`: within a transaction, inserts to `rejected_terms` and deletes from
`vocabulary_terms`; cascading deletes are called; returns `{ rejected: true }`.
(c) `addManualTerm`: returns 409 when `normalised_term` matches an existing vocabulary term;
returns 409 when it matches a rejected term; returns 404 when a `targetTermId` does not exist;
inserts term and relationships in a transaction on success; returns the new term with
`normalisedTerm`.
(d) `getVocabularyQueue`: returns paginated results for `llm_extracted` terms; includes source
document description and date from earliest occurrence.
All tests pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-18):

- Automated checks: confirmed. The acceptance condition called for mocked-Knex unit tests; the implementation instead uses route-level integration tests against a real PostgreSQL database (`apps/backend/src/routes/__tests__/vocabulary.integration.test.ts`), which is a stronger form of the same evidence. All four sub-conditions are covered: (a) `acceptCandidate` — two tests: inserts `candidate_accepted` term, calls accept, expects 409 with `error: 'wrong_source'`; inserts `llm_extracted` term, calls accept, expects 200 with `source: 'candidate_accepted'` and verifies DB state via direct `db._knex` query. (b) `rejectCandidate` — three tests: 200 response with `rejected: true`; DB verification confirms row absent from `vocabulary_terms` and present in `rejected_terms` with `originalTerm`; separate cascade test inserts an `entity_document_occurrences` row, rejects the term, and confirms the occurrence is gone (`toHaveLength(0)`). The `rejectTerm` repository method wraps both writes in `db.transaction(async (trx) => { ... })`. (c) `addManualTerm` — five tests: 409 for existing vocabulary `normalised_term`; 409 for existing rejected `normalised_term`; 404 for missing `targetTermId`; 201 success case verifies `normalisedTerm: 'isabel cruz'` in response and DB state; transaction test inserts target term first, then calls endpoint with a relationship, verifies `vocabulary_relationships` row with correct `relationshipType`. (d) `getVocabularyQueue` — four tests: empty results when no `llm_extracted` terms exist; correct fields including `sourceDocumentDescription: 'Wedding photograph'` and `sourceDocumentDate: '1987-06-15'` when occurrence is linked; `candidate_accepted` term excluded; `page=1&pageSize=1` returns one of two terms with `total: 2`. Additional test confirms 400 for non-numeric `page` param (Zod validation confirmed). VOC-004 route ordering comment confirms `POST /curation/vocabulary/terms` is registered before `:termId` routes to prevent `'terms'` being matched as a termId param.
- Manual checks: none required — condition type is automated.
- User need: satisfied. US-061 (structured records): `addManualTerm` stores `term`, `category`, `description`, `aliases`, and relationships in a single transaction — all structured fields persisted immediately. US-062 (add manually): VOC-004 is the backend for manual addition; term is stored immediately and available to the extraction pipeline from the next processing run. US-063 (surface candidates in queue): `getVocabularyQueue` returns `llm_extracted` terms ordered by `createdAt ASC` — oldest-raised first, matching the requirement; `sourceDocumentDescription` and `sourceDocumentDate` from the earliest `entity_document_occurrences` row are included. US-064 (accepted terms independent of source documents): `acceptCandidate` only updates `source` on `vocabulary_terms` — no new FK relationship to the source document is created; accepted terms persist independently. US-065 (deduplication): `addManualTerm` checks both `vocabulary_terms.normalised_term` and `rejected_terms.normalised_term` using `normaliseTermText` (lowercases and normalises whitespace, consistent with ADR-028) before inserting — confirmed by 409 tests for both paths. US-066 (accept or reject): `acceptCandidate` updates source to `candidate_accepted`; `rejectCandidate` inserts into `rejected_terms` (DB-persisted, not in memory) and deletes from `vocabulary_terms` in a transaction; both return immediately with no confirmation step; 409 guard prevents double-processing of already-processed terms. All service/route pattern constraints respected: no Express imports in `services/vocabulary.ts`; exhaustive `ERROR_STATUS` record in route layer; `next(err)` reserved for unexpected errors.
- Outcome: done

---

### Task 11: Implement processing trigger handler (PROC-001)

**Description**: Implement the `triggerProcessing` handler and the asynchronous processing
loop.

**triggerProcessing** (POST /api/processing/trigger — PROC-001):

Synchronous part (executes before returning):

1. Check for an existing `processing_runs` record with `status = 'in_progress'`; return 409
   with `{ error: 'conflict', message: 'A processing run is already in progress' }` if found
2. Reset stale `running` pipeline steps: set status to `failed` for all `pipeline_steps` rows
   with `status = 'running'` and `started_at` older than `pipeline.runningStepTimeoutMinutes`
   minutes
3. Query `documents` that have at least one `pipeline_steps` row with status `pending` or
   `failed` (and attempt_count below `pipeline.maxRetries`)
4. Create a `processing_runs` record with `status = 'in_progress'`, `documents_queued = count`
5. Return `TriggerProcessingResponse` (`{ runId, documentsQueued }`)

Asynchronous processing loop (fire-and-forget via `void asyncProcessingLoop(...)`):

1. For each queued document:
   a. Determine `incompleteSteps` — pipeline step names with status `pending` or `failed`
   b. Mark all `incompleteSteps` as `running` in `pipeline_steps` (set `started_at = now()`)
   c. Retrieve the document's `storage_path` and `previousOutputs` (data from completed steps)
   d. Call Python `POST /process` (PROC-003) with document data using an HTTP client
      (`axios` or `node-fetch`) with the `x-internal-key` header set to
      `auth.pythonServiceKey`
   e. Pass the Python response body to the `receiveProcessingResults` service logic (reuse
      from Task 12)
2. After all documents processed: update `processing_runs` to `completed` (or `failed` if all
   documents errored)
3. Any errors in the loop are logged with Pino; they do not propagate to the HTTP caller

**Depends on**: Task 2, Task 3, Task 4, Task 12

**Complexity**: L

**Acceptance condition**: Route integration tests (supertest → validate → service → real
database, per the two-tier testing rule in `development-principles.md`) confirm:
(a) Returns 409 when a `processing_runs` record with `in_progress` status already exists.
(b) Resets stale `running` steps (older than the timeout) to `failed` before querying
documents.
(c) Returns `{ runId, documentsQueued }` synchronously; does not wait for the async loop.
(d) The async loop: calls the Python HTTP endpoint once per document (mock `fetch` globally
with `vi.stubGlobal` — external HTTP boundary, not a DB dependency); calls
`receiveProcessingResults` service logic with the Python response; updates `processing_runs`
to `completed` after all documents finish.
All integration tests pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-19):

- Automated checks: confirmed. All four acceptance conditions covered by route integration tests in `apps/backend/src/routes/__tests__/processing.integration.test.ts`. (a) 409 conflict: inserts an `in_progress` run record via `insertProcessingRun`, calls `POST /api/processing/trigger`, asserts `res.status === 409` and `res.body.error === 'conflict'`. (b) Stale step reset: inserts a step with `startedAt` 2 hours past the 30-minute config timeout, calls trigger, asserts `step.status === 'failed'` via direct DB query. (c) Synchronous return: inserts a document with one pending step, asserts `res.status === 200`, `runId` matches UUID regex, `documentsQueued === 1`. (d) Async loop completion: stubs native `fetch` via `vi.stubGlobal` returning a valid `ProcessingResultsRequest`-shaped payload, calls trigger, polls via `vi.waitFor` (5-second timeout, 100ms interval) until `processing_runs.status === 'completed'`; `receiveProcessingResults` is exercised end-to-end against the real DB with all DB writes going to the real test database.
- Manual checks: none required — condition type is automated.
- User need: satisfied. US-050 (manual processing trigger): endpoint returns synchronously with `{ runId, documentsQueued }` before the async loop completes; no automatic processing occurs. US-048/US-049 (step recording, retry): stale-step reset returns `running` steps beyond the timeout to `failed`, making them eligible for retry. Config values (timeout, retry limit, Python base URL, auth key) injected via `ProcessingServiceDeps`. `processingRuns` repository listed in `development-principles.md` `DbInstance` type. Native `fetch` used for the Python HTTP client (Node.js 24 built-in, no extra dependency).
- Outcome: done

---

### Task 12: Implement processing results handler (PROC-002)

**Description**: Implement the `receiveProcessingResults` handler for POST /api/processing/results
(PROC-002). This is the most complex handler in the service and must be implemented as a
reusable service function (not only as an Express route handler) because it is also called
by the async processing loop in Task 11.

The handler executes all writes in a single database transaction per the backend plan. If any
write fails, the entire transaction rolls back.

Within the transaction, in order:

1. Validate request body against the Zod schema for `ProcessingResultsRequest` (as defined
   in PROC-002)
2. Look up the document by `documentId`; return 404 if not found
3. For each entry in `stepResults`: update the matching `pipeline_steps` row — set status to
   the reported status (`completed` or `failed`); increment `attempt_count`; write
   `error_message` and `completed_at`
4. If `metadata` is present: apply partial update to document metadata fields; apply
   conditional description overwrite (UR-053): overwrite only if `metadata.description` is
   non-null and non-empty; update `updated_at`
5. For each chunk in `chunks`: insert a `chunks` row; call `VectorStore.write(documentId,
   chunkId, embedding)` with the chunk's embedding vector
6. For each entity in `entities`:
   a. Check `normalised_name` against `vocabulary_terms.normalised_term`
   b. If no match found: check against `rejected_terms.normalised_term` — if matched, suppress
      (skip entity); if not rejected, insert new `vocabulary_terms` row with
      `source = 'llm_extracted'` and `confidence`
   c. If a match found in `vocabulary_terms`: append entity `name` to the `aliases` array if
      not already present (UR-094)
   d. Insert `entity_document_occurrences` row for this entity and document (ignore on
      duplicate composite key)
7. For each relationship in `relationships`:
   a. Resolve `sourceEntityName` and `targetEntityName` to `vocabulary_terms` IDs via
      `normalised_term`; skip relationship if either cannot be resolved
   b. Insert into `vocabulary_relationships` (ignore on duplicate composite key)
8. If `flags` is present and non-empty: set `flag_reason` and `flagged_at` on the document

Export as a service function `receiveProcessingResultsService(body, deps)` where `deps`
includes `{ knex, vectorStore, config }`. The Express route handler calls this function and
returns HTTP 200 `{ documentId, accepted: true }` on success or propagates errors.

**Depends on**: Task 2, Task 3, Task 4, Task 6

**Complexity**: L

**Acceptance condition**: Route integration tests (supertest → validate → service → real
database, per the two-tier testing rule in `development-principles.md`) confirm:
(a) Full successful pipeline write: submit a full `ProcessingResultsRequest` payload; verify
all rows are present across `documents`, `chunks`, `embeddings`, `vocabulary_terms`,
`vocabulary_relationships`, `entity_document_occurrences`, and `pipeline_steps`.
(b) Entity deduplication — new entity: inserts new `vocabulary_terms` row with
`source = 'llm_extracted'`.
(c) Entity deduplication — existing entity with alias append: finds existing
`vocabulary_terms` row; appends entity name to `aliases` if not already present.
(d) Entity deduplication — rejected entity suppression: entity whose `normalised_name`
matches `rejected_terms.normalised_term` is skipped; no `vocabulary_terms` row inserted.
(e) Relationship deduplication: duplicate composite key insert is silently ignored.
(f) Flag writing: `flag_reason` and `flagged_at` are set when `flags` is non-empty.
(g) Transaction rollback on failure: submit a payload with a deliberately invalid write;
verify the full transaction rolled back with no partial writes in any table.
(h) Conditional description overwrite: description is overwritten when `metadata.description`
is non-null and non-empty; preserved when null or empty.
All integration tests pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-19):

- Automated checks: confirmed. All eight acceptance conditions covered by route integration tests in `apps/backend/src/routes/__tests__/processing.integration.test.ts`. (a) Full 7-table write: `writes rows across all seven tables on a full payload (B-2)` submits step results, metadata, a 384-dimension chunk, two entities, and one relationship; asserts rows in `documents`, `pipeline_steps`, `chunks`, `embeddings`, `vocabulary_terms`, `entity_document_occurrences`, and `vocabulary_relationships` within a single request. (b) New entity: `inserts a new vocabulary_terms row for a new entity` confirms `source: 'llm_extracted'` and an occurrence row. (c) Alias append: `appends alias and inserts occurrence when entity matches existing term` confirms no duplicate `vocabulary_terms` row, alias appended, occurrence inserted; idempotency confirmed by a second test posting the same entity twice and asserting the alias appears exactly once in the array. (d) Rejected entity suppression: `suppresses entity whose normalisedName matches a rejected term` confirms no `vocabulary_terms` row and no occurrence. (e) Relationship deduplication: `silently ignores duplicate relationship inserts` submits the same relationship twice, asserts exactly one row. (f) Flag writing: `sets flagReason and flaggedAt when flags are present` confirms both fields set. (g) Transaction rollback: `rolls back the entire transaction when a write fails mid-way (B-3)` sends a chunk with embedding dimension 1 (expected 384); `VectorStore.write()` returns `dimension_mismatch`; service throws inside the transaction; rollback confirmed — `pipeline_steps` row unchanged (`status: 'running'`, `attemptCount: 0`), no chunks, no embeddings, `res.status === 500`. (h) Conditional description overwrite: three tests confirm overwrite when `metadata.description` is non-null/non-empty; preservation when null; preservation when empty string.
- Manual checks: none required — condition type is automated.
- User need: satisfied. US-037 (conditional description overwrite, UR-053): `applyProcessingMetadata` overwrites description only when `metadata.description` is non-null and non-empty — confirmed by three dedicated tests. US-045 (embeddings per chunk via provider abstraction, ADR-033): `VectorStore.write()` is called via the injected `vectorStore` dependency (not directly to `db.embeddings`), preserving the Infrastructure as Configuration principle; dimension validation fires before the DB insert. US-048/US-049 (pipeline step recording and retry): `pipelineSteps.updateStep(..., trx)` inside the transaction increments `attemptCount` and sets `completedAt` and `errorMessage`. Transaction atomicity across all seven tables confirmed by B-3 rollback test. `receiveProcessingResults` exported from the factory closure and reused by the Task 11 async loop — not duplicated as a separate function.
- Outcome: done

---

### Task 13: Implement search handlers (QUERY-001, QUERY-002)

**Description**: Implement the two search handlers for vector and graph search callbacks
(called by Python).

**vectorSearch** (POST /api/search/vector — QUERY-001):

- Validate request body with Zod: `embedding` (number[]), `topK` (number, positive integer)
- Validate that `embedding.length` equals `embedding.dimension` from config; return 400 with
  descriptive error if mismatch
- Call `VectorStore.search(embedding, topK)`
- Join document metadata (description, date, document_type) to each result (the
  `PgVectorStore.search()` implementation already includes this join per Task 6, but the
  handler must format the response correctly per the `VectorSearchResponse` contract)
- Return `{ results: VectorSearchResult[] }`

**graphSearch** (POST /api/search/graph — QUERY-002):

- Validate request body with Zod: `entityNames` (string[], non-empty), `maxDepth` (number,
  1–10), `relationshipTypes` (string[], optional)
- Return 400 if `entityNames` is empty
- For each entity name: normalise to `normalised_term` form; look up matching entity in
  `vocabulary_terms`
- For each matched entity: call `GraphStore.traverse(entityId, maxDepth, relationshipTypes)`
- Call `GraphStore.findDocumentsByEntity(entityId)` for each entity in the traversal result
- Aggregate entities, relationships, and related document IDs; deduplicate
- Return `GraphSearchResponse`

Register both routes on the search router. Apply Zod validation middleware and auth
middleware.

**Depends on**: Task 2, Task 3, Task 4, Task 6, Task 7

**Complexity**: M

**Acceptance condition**: Route integration tests (supertest → validate → service → real
database, per the two-tier testing rule in `development-principles.md`) confirm:
(a) `vectorSearch`: returns 400 when `embedding.length` does not match configured dimension;
calls `VectorStore.search` with correct arguments against a real database with seeded
embeddings; returns correctly formatted `VectorSearchResponse` including the `document`
metadata fields joined from the `documents` table.
(b) `graphSearch`: returns 400 when `entityNames` is empty (structurally met via
`GraphSearchRequest.entityNames` min(1) in the Zod schema — CR-001); resolves entity names
to IDs via `normalised_term` lookup against real `vocabulary_terms` rows; calls
`GraphStore.traverse` and `GraphStore.findDocumentsByEntity` against the real database;
returns aggregated and deduplicated entities, relationships, and document IDs.
All integration tests pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-19):

- Automated checks: confirmed. All seven integration tests in `apps/backend/src/routes/__tests__/search.integration.test.ts` are route integration tests (supertest → validate middleware → service → repository → real PostgreSQL). Condition (a): the dimension-mismatch test sends a 10-element vector and asserts `res.status === 400` and `res.body.error === 'dimension_mismatch'`; the happy-path test seeds a document, chunk, and embedding via `db._knex`, sends the same unit vector, and asserts the full `VectorSearchResponse` shape including `result.document.description`, `result.document.date`, and `result.document.documentType` joined from the `documents` table; the empty-DB test confirms the `results: []` path. Condition (b): the `entityNames: []` test confirms Zod `min(1)` enforcement returns `res.body.error === 'validation_error'`; the `depth_exceeded` test (added in round 2 for ADR-049) confirms the config-driven guard returns 400 with `res.body.error === 'depth_exceeded'` when `maxDepth` exceeds `config.graph.maxTraversalDepth`; the happy-path test seeds two terms with occurrences and a relationship, searches by entity name, and asserts both entity IDs appear with correct `relatedDocumentIds` and the relationship is present; the deduplication test confirms no duplicate entity IDs and exactly one relationship when two overlapping entity names are searched together. The `findTermByNormalisedTerm` repository method correctly applies the ADR-037 document-evidenced filter (`whereExists` on `entityDocumentOccurrences`).
- Manual checks: none required — condition type is automated.
- User need: satisfied. The task implements the QUERY-001 and QUERY-002 internal callback endpoints called by the Python query handler to retrieve semantically similar chunks (QUERY-001) and traverse the entity graph (QUERY-002). Both endpoints validate inputs, delegate to the injected `VectorStore` and `GraphStore` implementations, and return the contract-specified response shapes. The config-driven traversal depth limit (ADR-049) correctly moves the upper bound out of the shared Zod schema and into the service-level guard, consistent with ADR-001 (Infrastructure as Configuration). QUERY-002 is a Phase 1 stub (not called in production until Phase 2 introduces the LLM query classifier); the implementation is present, registered, and tested.
- Outcome: done

---

### Task 14: Implement ingestion run handlers (ING-001, ING-002, ING-003, ING-004)

**Description**: Implement the four CLI bulk ingestion handlers and register them on the
ingestion router.

**createIngestionRun** (POST /api/ingestion/runs — ING-001):

- Validate request body: `sourceDirectory` (string), `grouped` (boolean)
- Perform the run-start sweep: query `ingestion_runs` not in `completed` status; for each,
  call the same cleanup logic as `cleanupRun` (see below); delete the run record
- Create a new `ingestion_runs` record with `status = 'in_progress'`
- Create a run-specific staging directory via `StorageService.createStagingDirectory(runId)`
- Return `{ runId, status: 'in_progress' }`

**completeRun** (POST /api/ingestion/runs/:runId/complete — ING-002):

- Look up run by `runId`; return 404 if not found; return 409 if not `in_progress`
- Update run status to `moving`
- For each document with `ingestion_run_id = runId` and status `uploaded`:
  - Move file from run staging to permanent storage via `StorageService.moveStagingToPermanent`
  - Update document status to `stored`
- Once all files are `stored`: update each document to status `finalized`
- Update run status to `completed`; set `completed_at`
- Write summary report:
  - Print to stdout
  - Write to timestamped file in `ingestion.reportOutputDirectory` (create directory if not
    present; create it automatically — see US-015)
  - Report includes: total submitted, total accepted, total rejected; per-file record with
    filename, outcome, and rejection reason where applicable
- Return `{ runId, status: 'completed', totalSubmitted, totalAccepted, totalRejected }`

**addFileToRun** (POST /api/ingestion/runs/:runId/files — ING-003):

- Accept `multipart/form-data` with a `file` field plus metadata fields: `date`, `description`,
  `groupName` (optional), `sequenceNumber` (optional)
- Validate run exists and is `in_progress`; return 404 or 409 otherwise
- Validate file against extension (`upload.acceptedExtensions`) and size (`upload.maxFileSizeMb`)
- Validate filename per naming convention:
  - Standalone file: `YYYY-MM-DD - description` pattern; parse date and description from name
  - Grouped file: `NNN` or `NNN - annotation` pattern (three-digit sequence number)
- Write file to run staging directory via `StorageService.writeStagingFile(runId, ...)`
- Compute MD5 hash; check against finalized documents' `file_hash`; return 409 if duplicate
- Create `documents` row with `status = 'uploaded'`, `ingestion_run_id = runId`
- For grouped runs: validate group constraints (UR-037, UR-038) — if any file in the group
  already failed, reject this file too (fail-fast)
- Return `{ documentId, status: 'uploaded' }`

**cleanupRun** (DELETE /api/ingestion/runs/:runId — ING-004):

- Look up run; return 404 if not found
- Delete staging files for all documents in the run
- Delete permanent storage files for `stored` documents in the run
- Delete all non-finalized document records for the run
- Delete the run record
- Return `{ deleted: true }`

Register all four routes on the ingestion router.

**Depends on**: Task 2, Task 3, Task 4, Task 5

**Complexity**: L

**Acceptance condition**: Route integration tests (supertest → validate → service → real
database, per the two-tier testing rule in `development-principles.md`) confirm:
(a) `createIngestionRun`: performs run-start sweep (queries and cleans up incomplete runs)
before creating a new run record.
(b) `completeRun`: returns 409 when run is not `in_progress`; moves files and updates
statuses to `finalized`; calls the summary report writer.
(c) `addFileToRun`: returns 404 when run not found; validates filename naming convention;
returns 409 on duplicate hash; creates `documents` row with `ingestion_run_id`.
(d) `cleanupRun`: deletes staging and permanent files and the run record.
All integration tests pass.

Manual check: run the full CLI ingestion lifecycle against a local Express instance (Task 1
startup, migrations applied). Submit a directory of 3 conforming files; call
`createIngestionRun`, `addFileToRun` × 3, `completeRun`; verify the summary report is
written to `ingestion.reportOutputDirectory` and printed to stdout. Verify 3 documents exist
in the database with status `finalized`.

**Condition type**: both

**Status**: done

**Verification** (2026-03-20):

- Automated checks: confirmed. All four acceptance conditions verified against
  `apps/backend/src/routes/__tests__/ingestion.integration.test.ts` and
  `apps/backend/src/services/ingestion.ts`.
  (a) `createIngestionRun` sweep: test seeds an `in_progress` run with a real staging
  directory, calls `POST /api/ingestion/runs`, asserts the old run is deleted and new run
  exists with `status: 'in_progress'`. Service calls `runStartSweep()` first, which queries
  `db.ingestionRuns.getIncomplete()` and wraps each cleanup in a transaction. Confirmed.
  (b) `completeRun`: three tests cover all sub-conditions — (i) 409 `conflict` when run is
  in `moving` status; (ii) file moved and document status updated to `finalized`, run
  status updated to `completed`; (iii) report file written to `reportDir` with correct
  `runId` and `totalSubmitted`. Service implements the correct three-step pattern: sentinel
  `moving` update (outside transaction), file I/O loop, then a single `db._knex.transaction`
  wrapping all DB writes (storage paths, `stored`, `finalized`, `completed`). Confirmed.
  (c) `addFileToRun`: four tests cover all sub-conditions — 404 on unknown run; 422
  `invalid_filename` for standalone bad name (`bad_name.jpg`); 422 `invalid_filename` for
  grouped bad name (`bad-name.jpg` against `GROUPED_FILENAME_RE`); 409 `duplicate_detected`
  against a seeded finalized document with matching MD5; 201 success with document row
  having correct `ingestionRunId`. Confirmed.
  (d) `cleanupRun`: test seeds a run and document, writes a real staging file, calls DELETE,
  asserts `deleted: true`, run absent, document absent. Confirmed.
- Manual checks: the developer must verify the full CLI ingestion lifecycle against a local
  Express instance. Steps (using `curl` or a REST client with header
  `x-internal-key: <auth.frontendKey from config.json5>`):
  1. Start the backend: `pnpm --filter backend build && pnpm --filter backend start`
  2. `POST /api/ingestion/runs` body `{ "sourceDirectory": "/path/to/dir", "grouped": false }`.
     Save the returned `runId`.
  3. `POST /api/ingestion/runs/:runId/files` (multipart/form-data) three times, attaching
     files named `1992-06-15 - letter from bank.jpg`, `1993-03-20 - birth certificate.pdf`,
     `2001-11-01 - photo album.jpg`. Verify each returns
     `{ "documentId": "<uuid>", "status": "uploaded" }`.
  4. `POST /api/ingestion/runs/:runId/complete`. Verify response:
     `{ "runId": "...", "status": "completed", "totalSubmitted": 3, "totalAccepted": 3, "totalRejected": 0 }`.
  5. Verify the summary report JSON appears in `ingestion.reportOutputDirectory` and contains
     all three filenames in `report.files`.
  6. Verify the three documents in the `documents` table have `status = 'finalized'` and a
     non-null `storagePath`.
- User need: satisfied. The implementation covers the core ingestion user needs:
  US-010 (naming convention enforcement): both `STANDALONE_FILENAME_RE` and
  `GROUPED_FILENAME_RE` validated in `addFileToRun`; rejection tested for both patterns.
  US-012 (rollback on interrupted run): `runStartSweep` cleans up incomplete runs at the
  start of every `createIngestionRun` call; `moving` status acts as a sentinel for
  crash-during-file-I/O detection per ADR-018.
  US-014 (summary report): report written to a timestamped JSON file in
  `ingestion.reportOutputDirectory` (auto-created with `{ recursive: true }`) and logged
  via Pino; includes `totalSubmitted`, `totalAccepted`, `totalRejected`, and a per-file
  `files` array.
  US-015 (auto-create output directory): `fs.mkdir(reportDir, { recursive: true })` called
  before writing the report — directory created automatically if absent.
  US-020 (duplicate detection): MD5 hash computed and checked against finalized documents
  via `db.documents.findAnyFinalizedByHash`; staging file deleted before returning the
  `duplicate_detected` error.
  US-023 (fail-fast group validation): group failure check present in `addFileToRun` —
  if any document in the group has `status === 'failed'`, the new file is rejected with
  `group_validation_failed`.
  Transaction pattern (ADR-018, development-principles.md): all DB writes in `completeRun`
  wrapped in a single `db._knex.transaction`; `_cleanupRunById` accepts and threads `trx`.
  No gap found between acceptance conditions and user needs.
- Outcome: done

---

### Task 15: Implement health check and admin endpoints

**Description**: Implement the health check and reindex embeddings endpoints.

**healthCheck** (GET /api/health):

- No auth required (the auth middleware skips this route — see Task 4)
- Return `{ status: 'ok', timestamp: new Date().toISOString() }`
- Optionally ping the database to confirm connectivity (optional Knex query: `knex.raw('SELECT
  1')`)

**reindexEmbeddings** (POST /api/admin/reindex-embeddings — ADMIN-001):

- Auth required (standard shared-key auth applies)
- Execute `REINDEX INDEX CONCURRENTLY` on the IVFFlat index on `embeddings.embedding` via
  `knex.raw`
- Return `{ reindexed: true }` immediately (per ADMIN-001 contract: `{ reindexed: boolean }`)

Register both endpoints on their respective routers (`/api/health` and `/api/admin`).

**Depends on**: Task 2, Task 3, Task 4

**Complexity**: S

**Acceptance condition**: Route integration tests (supertest → validate → service → real
database, per the two-tier testing rule in `development-principles.md`) confirm:
(a) `healthCheck`: returns `{ status: 'ok', timestamp: <ISO string> }`.
(b) `reindexEmbeddings`: call `POST /api/admin/reindex-embeddings` against a real database
that has the embeddings IVFFlat index (from migration 004); verify the command executes
without error and the index remains queryable via `VectorStore.search()`.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-20):

- Automated checks: confirmed. Both acceptance conditions verified against
  `apps/backend/src/routes/__tests__/admin.integration.test.ts`.
  (a) healthCheck: the `describe('GET /api/health')` test at lines 89–99 sends
  `GET /api/health` with no auth header and asserts status 200, `res.body.status === 'ok'`,
  and `Date.parse(res.body.timestamp)` is not NaN. Condition met.
  (b) reindexEmbeddings: the `describe('POST /api/admin/reindex-embeddings')` test at lines
  106–124 sends the request with valid auth, asserts status 200 and `reindexed: true`, then
  calls `vectorStore.search(zeroVector, 1)` against the real database and asserts
  `outcome === 'success'` and the result is an array. The full call path is supertest → route
  → `AdminService.reindexEmbeddings()` → `db.embeddings.reindexIvfflat()` → `db.raw(...)`.
  A second test at lines 126–130 asserts 401 when the auth header is absent. Condition met.
  Round 1 blocking findings (B-1: SQL in service code; B-2: inline `res.json`) were fixed
  before round 2. Round 2 confirmed: `EmbeddingsRepository.reindexIvfflat()` owns the
  raw SQL; `AdminService` calls `db.embeddings.reindexIvfflat()`; the admin route uses
  `sendServiceError`. Repository Pattern and Error Response Pattern both satisfied.
- Manual checks: none required. Condition type is `automated` only.
- User need: satisfied. Task 15 is an infrastructure maintenance task derived from the
  ADMIN-001 contract (`integration-lead-contracts.md`) and the backend plan. There is no
  single named user story for these endpoints. The health check supports system observability;
  the reindex endpoint supports the vector search capability (US-073, US-074) operating at
  full performance after data load. Both endpoints deliver what the contract and plan specify:
  the health check returns `{ status: 'ok', timestamp: (ISO string) }` without auth; the
  reindex endpoint requires auth, delegates DDL to the repository layer, and returns
  `{ reindexed: true }`. The index is confirmed queryable after REINDEX. No gap found between
  the acceptance conditions and the underlying need.
- Outcome: done

---

### Task 16: Implement startup sweeps

**Description**: Implement the two startup sweep operations that run when Express starts,
before it begins accepting requests. These are invoked from `src/server.ts`.

**Upload cleanup sweep** (ADR-017):

- Function `uploadStartupSweep(knex, storageService)` in `src/startup/uploadSweep.ts`
- Query `documents` with status in `['initiated', 'uploaded', 'stored']` (i.e. not
  `finalized` and not linked to an `ingestion_run_id`)
- For each: delete staging file (if status `initiated` or `uploaded`); delete permanent
  storage file (if status `stored`); delete database record
- Log each cleaned-up document with Pino

**Ingestion run sweep** (ADR-018):

- Function `ingestionStartupSweep(knex, storageService)` in `src/startup/ingestionSweep.ts`
- Query `ingestion_runs` not in `completed` status
- For each: apply the same cleanup logic as `cleanupRun` (Task 14) — delete staging
  directory, delete permanent storage files for `stored` documents, delete non-finalized
  document records, delete run record
- Log each cleaned-up run with Pino

Call both sweep functions in `src/server.ts` during startup, after migrations run and before
the HTTP server starts. Startup fails fast if either sweep throws an unhandled error.

**Depends on**: Task 2, Task 3, Task 4, Task 5

**Complexity**: S

**Acceptance condition**: Integration test confirms: insert documents with status `initiated`,
`uploaded`, and `stored` (not `finalized`) into a real test database; start Express (or call
the sweep function directly); verify all three non-finalized documents are absent from the
database and their storage files have been deleted. Verify that `finalized` documents are
unaffected. Test passes.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-21):

- Automated checks: confirmed. `uploadSweep.integration.test.ts` covers all three non-finalized
  statuses (`initiated`, `uploaded`, `stored`) individually and together in a single sweep call.
  Each test inserts a real document row and a real file, calls `uploadStartupSweep` directly
  against a real test DB and `LocalStorageService`, and asserts both the DB record is absent and
  the file deleted. `finalized` document preservation confirmed (record untouched). The
  `whereNull('ingestionRunId')` guard confirmed by dedicated test — non-finalized documents
  linked to an ingestion run are not swept. Error-continuation confirmed: a failing document's
  DB row survives (file-first ordering); the next document is fully cleaned up.
  `ingestionSweep.integration.test.ts` covers equivalent paths for the ingestion run flow,
  including the run record deletion after all documents processed and error-continuation across
  documents.
- Manual checks: none required. Condition type is `automated` only.
- User need: satisfied. Task 16 implements ADR-017 (upload cleanup sweep) and ADR-018
  (ingestion run sweep). Both sweeps run once at startup before the HTTP server accepts
  requests, ensuring incomplete uploads and partial ingestion runs from a prior crash are
  cleaned up automatically. The per-document file-first ordering with best-effort sequential
  processing (new development principle) ensures a surviving DB row is always queryable and
  recoverable on the next sweep, while a surviving file with no DB row is avoided. This matches
  the user need for reliable self-healing of interrupted operations without manual intervention.
- Outcome: done

---

### Task 17: Implement database seed for initial vocabulary

**Description**: Implement the Knex seed file at `src/db/seeds/001_vocabulary_seed.ts` that
inserts initial vocabulary terms when the `vocabulary_terms` table is empty.

The seed runs only when the table is empty (first run only) — per the backend plan: "Run
`knex seed:run` if `vocabulary_terms` contains zero rows."

The seed should insert a representative starting vocabulary covering indicative term
categories from ADR-028: People, Organisation, Land Parcel / Field, Date / Event, Legal
Reference, Organisation Role. Each term must have `source = 'manual'`, `confidence = null`,
and a `normalised_term` computed from the `term`.

The actual terms to seed should be a handful of illustrative entries (e.g. placeholder terms
for each category). The implementer may use 2–3 terms per category as starters; these will
be replaced with real vocabulary during the curation phase.

Call `knex seed:run` from `src/index.ts` during startup, but only after checking that
`vocabulary_terms` is empty (guards against running on an already-populated database).

**Depends on**: Task 2

**Complexity**: S

**Acceptance condition**: Running `knex seed:run` on a clean database (after migrations)
inserts at least one term per vocabulary category. Running it again on a populated database
is a no-op (the guard condition prevents re-seeding). Confirmed by a manual check against
the test database after running seeds.

**Condition type**: manual

**Status**: done

**Verification** (2026-03-22):

- Automated checks: none required — condition type is `manual` only.
- Manual checks: confirmed by the user. Running `knex seed:run` on a clean database (after
  migrations) inserts at least one term per vocabulary category — all six ADR-028 categories
  are covered (People, Organisation, Land Parcel / Field, Date / Event, Legal Reference,
  Organisation Role) with 2–3 placeholder terms each (13 rows total). Running the seed again
  on a populated database is a no-op — the inner guard in the seed function returns immediately
  when `vocabulary_terms` contains any rows, confirmed by the user.
- User need: satisfied. US-060 requires a non-empty vocabulary on first use so the system is
  immediately useful without manual vocabulary entry. The seed file delivers 13 placeholder
  terms across all six categories and is called automatically from `server.ts` after migrations
  run, before the HTTP server starts. The idempotency guard prevents re-seeding on subsequent
  startups. The non-blocking suggestion S-001 (`source: 'seed'` vs `source: 'manual'`) does
  not affect correctness or the user need in Phase 1 — the vocabulary is immediately usable.
- Outcome: done

---

### Task 18: Integration test suite (end-to-end database tests)

**Description**: The original 8-scenario plan was written before the route integration test
suite was fully established. Review during Task 18 planning found that 6 of the 8 scenarios
are already covered by existing tests:

| Original scenario | Status | Covered by |
| --- | --- | --- |
| 2 — Upload lifecycle end-to-end | Already covered | `documents.integration.test.ts` — `finalize` happy-path test |
| 3 — Processing results write (all 7 tables) | Already covered | `processing.integration.test.ts` — `'writes rows across all seven tables (B-2)'` |
| 4 — Entity deduplication | Already covered | `processing.integration.test.ts` — alias append + idempotency tests |
| 5 — VectorStore round-trip | Already covered | `search.integration.test.ts` — vector search happy-path test |
| 7 — Transaction atomicity | Already covered | `processing.integration.test.ts` — `'rolls back the entire transaction (B-3)'` |
| 8 — REINDEX | Already covered | `admin.integration.test.ts` — reindex + queryable index test |

During implementation, review found that the upload startup sweep scenario was also already
covered — Task 16 created `apps/backend/src/startup/__tests__/uploadSweep.integration.test.ts`
which covers all three required states (initiated, uploaded, finalized). Only one new file
was needed:

**1. Migration correctness** — `apps/backend/src/db/__tests__/migrations.test.ts` (created).
After `globalSetup.ts` has run migrations, queries `information_schema.tables` and
`pg_indexes` to assert:

- All 10 expected tables exist: `documents`, `chunks`, `embeddings`, `pipeline_steps`,
  `processing_runs`, `vocabulary_terms`, `vocabulary_relationships`,
  `entity_document_occurrences`, `ingestion_runs`, `rejected_terms`
- The IVFFlat index `embeddings_embedding_ivfflat_idx` exists on the `embeddings` table

**2. Upload startup sweep** — already covered by `uploadSweep.integration.test.ts` (Task 16).
No new file created. Reviewer should confirm this file covers initiated, uploaded, and
finalized states before accepting that this scenario is satisfied.

No separate `vitest.integration.config.ts` is needed — the new test file uses the existing
`vitest.config.ts` and `globalSetup.ts`.

**Depends on**: Task 2, Task 16

**Complexity**: S

**Acceptance condition**: `apps/backend/src/db/__tests__/migrations.test.ts` passes when run
with `pnpm --filter backend test`, and `uploadSweep.integration.test.ts` (Task 16) confirms
all three sweep states. No test requires manual observation — all assertions are programmatic.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-22):

- Automated checks: confirmed — `apps/backend/src/db/__tests__/migrations.test.ts` contains two
  `it` blocks: (1) queries `information_schema.tables` and asserts `toContain` for each of the
  10 expected table names individually; (2) queries `pg_indexes` and asserts `toContain` for
  `embeddings_embedding_ivfflat_idx`. Both assertions are non-vacuous and will fail individually
  if a table or index is missing. Code reviewer confirmed the file passes `pnpm --filter backend
  test`. `uploadSweep.integration.test.ts` (Task 16) covers `initiated` (line 129), `uploaded`
  (line 141), and `stored` (line 153) states in dedicated tests, plus a multi-status test (line
  171) and finalized-preservation test (line 200).
- Manual checks: none required — condition type is automated.
- User need: satisfied — `migrations.test.ts` will catch any future migration that drops an
  expected table or index, providing programmatic regression protection for the database schema.
  The sweep tests confirm startup cleanup is fully covered. No gap between acceptance condition
  and user need.
- Outcome: done

---

### Task 19: Biome configuration and quality gate

**Description**: Finalise the Biome configuration and integrate it as a quality gate that must
pass before any task is considered `code_complete`.

- Confirm `apps/backend/biome.json` (or root `biome.json`) enforces:
  - Consistent import ordering (sorted imports)
  - No unused variables
  - Consistent formatting (tabs vs spaces per project convention; confirm convention with
    developer)
- Run `biome check --apply apps/backend/src/` to auto-fix any formatting issues introduced
  during implementation tasks
- Confirm `biome check apps/backend/src/` (without `--apply`) exits 0 with no errors after
  the fix pass
- Add a `lint` script to `apps/backend/package.json`: `"lint": "biome check src/"` so that
  the Implementer can run `pnpm lint` before marking any task `code_complete`

This task may be done incrementally alongside other tasks, but must be explicitly verified as
complete once all handler tasks (Tasks 8–16) are done. All code in `apps/backend/src/` must
pass `biome check` at the point this task is marked `code_complete`.

**Depends on**: Task 1

**Complexity**: S

**Acceptance condition**: Running `biome check apps/backend/src/` from the monorepo root exits
with code 0 and produces no lint or formatting errors. Running `pnpm --filter backend lint`
produces the same result. Confirmed manually by the developer after all handler tasks are
implemented.

**Condition type**: manual

**Status**: done

**Verification** (2026-03-22):

- Automated checks: none required — condition type is manual.
- Manual checks: developer confirmed both invocation forms exit 0 with no errors across 80
  files: `biome check apps/backend/src/` and `pnpm --filter backend lint`. Code reviewer
  independently executed both forms during review and recorded "Checked 80 files in ~15ms.
  No fixes applied." `apps/backend/package.json` line 17 confirms the `lint` script is
  present: `"lint": "biome check src/"`. Root `biome.json` confirms all three required rules
  are active: `organizeImports` (recommended ruleset), `noUnusedVariables` set to `"error"`,
  and formatting with `indentStyle: "space"` and `quoteStyle: "single"`. Developer
  confirmation accepted; all manual conditions satisfied.
- User need: satisfied — the quality gate is operative across the entire `src/` tree at the
  point all handler tasks (8–19) are complete. The `lint` script provides a consistent
  shortcut for future task completions. No gap between acceptance condition and user need.
- Outcome: done

---
