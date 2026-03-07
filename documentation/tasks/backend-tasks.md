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

**Status**: not_started

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

**Factory** (`src/storage/index.ts`): export `createStorageService(config)` that reads
`storage.provider` and returns a `LocalStorageService` for `"local"`.

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

**Status**: not_started

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

**Status**: not_started

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

**Status**: not_started

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

**Status**: not_started

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

**Status**: not_started

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

**Status**: not_started

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

**Acceptance condition**: Vitest unit tests with mocked Knex and mocked HTTP client confirm:
(a) Returns 409 when a `processing_runs` record with `in_progress` status already exists.
(b) Resets stale `running` steps (older than the timeout) to `failed` before querying
documents.
(c) Returns `{ runId, documentsQueued }` synchronously; does not wait for the async loop.
(d) The async loop: calls the Python HTTP endpoint once per document; calls
`receiveProcessingResults` service logic with the Python response; updates `processing_runs`
to `completed` after all documents finish.
All unit tests pass.

**Condition type**: automated

**Status**: not_started

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

**Acceptance condition**: Vitest unit tests with mocked Knex, mocked VectorStore, and mocked
config confirm:
(a) Full successful pipeline write: all tables updated correctly (pipeline steps, metadata,
chunks, embeddings, entities, relationships, flags).
(b) Entity deduplication — new entity: inserts new `vocabulary_terms` row with
`source = 'llm_extracted'`.
(c) Entity deduplication — existing entity with alias append: finds existing
`vocabulary_terms` row; appends entity name to `aliases` if not already present.
(d) Entity deduplication — rejected entity suppression: entity whose `normalised_name`
matches `rejected_terms.normalised_term` is skipped; no `vocabulary_terms` row inserted.
(e) Relationship deduplication: duplicate composite key insert is silently ignored.
(f) Flag writing: `flag_reason` and `flagged_at` are set when `flags` is non-empty.
(g) Transaction rollback on failure: when a write operation throws, the entire transaction is
rolled back (no partial writes).
(h) Conditional description overwrite: description is overwritten when `metadata.description`
is non-null and non-empty; preserved when null or empty.
All unit tests pass.

Integration test (real database): submit a full `ProcessingResultsRequest` payload; verify
all rows are present across `documents`, `chunks`, `embeddings`, `vocabulary_terms`,
`vocabulary_relationships`, `entity_document_occurrences`, `pipeline_steps`. Submit two
payloads with overlapping entity names; verify a single `vocabulary_terms` row exists with
updated `aliases`. Submit a payload with a deliberately invalid entity reference; verify the
full transaction rolled back with no partial writes in any table. All integration tests pass.

**Condition type**: both

**Status**: not_started

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

**Acceptance condition**: Vitest unit tests with mocked VectorStore and mocked GraphStore
confirm:
(a) `vectorSearch`: returns 400 when `embedding.length` does not match configured dimension;
calls `VectorStore.search` with correct arguments; returns formatted results.
(b) `graphSearch`: returns 400 when `entityNames` is empty; resolves entity names to IDs via
`normalised_term`; calls `GraphStore.traverse` and `GraphStore.findDocumentsByEntity`;
returns aggregated and deduplicated entities, relationships, and document IDs.
All tests pass.

**Condition type**: automated

**Status**: not_started

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

**Acceptance condition**: Vitest unit tests with mocked Knex, StorageService, and config
confirm (lighter testing per the project manager's instruction that ingestion handlers use
the lighter-testing list):
(a) `createIngestionRun`: performs run-start sweep (queries and cleans up incomplete runs)
before creating a new run record.
(b) `completeRun`: returns 409 when run is not `in_progress`; moves files and updates
statuses to `finalized`; calls the summary report writer.
(c) `addFileToRun`: returns 404 when run not found; validates filename naming convention;
returns 409 on duplicate hash; creates `documents` row with `ingestion_run_id`.
(d) `cleanupRun`: deletes staging and permanent files and the run record.
All unit tests pass.

Manual check: run the full CLI ingestion lifecycle against a local Express instance (Task 1
startup, migrations applied). Submit a directory of 3 conforming files; call
`createIngestionRun`, `addFileToRun` × 3, `completeRun`; verify the summary report is
written to `ingestion.reportOutputDirectory` and printed to stdout. Verify 3 documents exist
in the database with status `finalized`.

**Condition type**: both

**Status**: not_started

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

**Acceptance condition**: Vitest unit test confirms:
(a) `healthCheck`: returns `{ status: 'ok', timestamp: <ISO string> }`.
(b) `reindexEmbeddings`: calls `knex.raw` with a query containing `REINDEX INDEX
CONCURRENTLY`; returns `{ reindexed: true }`.

Integration test (real database): call `POST /api/admin/reindex-embeddings` against a real
database that has the embeddings IVFFlat index (from migration 004); verify the command
executes without error and the index remains queryable via `VectorStore.search()`.

**Condition type**: both

**Status**: not_started

---

### Task 16: Implement startup sweeps

**Description**: Implement the two startup sweep operations that run when Express starts,
before it begins accepting requests. These are invoked from `src/index.ts`.

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

Call both sweep functions in `src/index.ts` during startup, after migrations run and before
the HTTP server starts. Startup fails fast if either sweep throws an unhandled error.

**Depends on**: Task 2, Task 3, Task 4, Task 5

**Complexity**: S

**Acceptance condition**: Integration test confirms: insert documents with status `initiated`,
`uploaded`, and `stored` (not `finalized`) into a real test database; start Express (or call
the sweep function directly); verify all three non-finalized documents are absent from the
database and their storage files have been deleted. Verify that `finalized` documents are
unaffected. Test passes.

**Condition type**: automated

**Status**: not_started

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

**Status**: not_started

---

### Task 18: Integration test suite (end-to-end database tests)

**Description**: Write the integration test suite that exercises the full backend against a
real PostgreSQL instance with pgvector. These tests are separate from the unit tests in each
handler task and cover cross-handler and transactional scenarios.

Integration tests to cover (per the backend plan):

1. **Migration correctness**: run all 6 migrations on a fresh database; verify all expected
   tables and indexes exist (this may overlap with Task 2's acceptance condition — include it
   here as the canonical integration test)
2. **Upload lifecycle end-to-end**: initiate → upload → finalize; verify `documents` record
   reaches `finalized` status; verify permanent storage file exists; verify staging file is
   absent
3. **Processing results write**: submit a full `ProcessingResultsRequest`; verify all tables
   are populated: `documents`, `chunks`, `embeddings`, `vocabulary_terms`,
   `vocabulary_relationships`, `entity_document_occurrences`, `pipeline_steps`
4. **Entity deduplication**: submit two `ProcessingResultsRequest` payloads with overlapping
   entity names; verify a single `vocabulary_terms` row with updated `aliases`
5. **VectorStore round-trip**: write embeddings; search with the same vector; verify results
   are returned in similarity order
6. **Startup sweep**: create incomplete uploads; call `uploadStartupSweep` directly; verify
   cleanup (non-finalized documents deleted; finalized documents untouched)
7. **Transaction atomicity**: submit a `ProcessingResultsRequest` with a deliberately invalid
   write (e.g. a chunk referencing a non-existent document); verify the entire transaction
   rolled back with no partial writes in any table
8. **REINDEX**: call the `reindexEmbeddings` handler logic against the real database; verify
   it completes without error and the index remains queryable

The test database connection is configured via environment variable (e.g.
`TEST_DATABASE_URL`). Each test suite creates and tears down its own schema using Knex
migrations.

**Depends on**: Task 2, Task 6, Task 7, Task 8, Task 9, Task 12, Task 15, Task 16

**Complexity**: M

**Acceptance condition**: All 8 integration test scenarios pass when run with Vitest against a
Docker-managed PostgreSQL container with pgvector. The test suite can be run in CI with
`vitest run --config vitest.integration.config.ts` (or equivalent). No test requires manual
observation — all assertions are programmatic.

**Condition type**: automated

**Status**: not_started

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

**Status**: not_started

---
