# Integration Lead Backend Plan

## Status

Approved — 2026-03-03

---

## Route structure

All routes are prefixed with `/api` and grouped by resource. Every route validates the
`x-internal-key` header via shared-key auth middleware (ADR-044).

### Documents

| Method | Path | Handler | Contract |
| --- | --- | --- | --- |
| POST | /api/documents/initiate | initiateUpload | DOC-001 |
| POST | /api/documents/:uploadId/upload | uploadFile | DOC-002 |
| POST | /api/documents/:uploadId/finalize | finalizeUpload | DOC-003 |
| DELETE | /api/documents/:uploadId | cleanupUpload | DOC-005 |
| GET | /api/documents/:id | getDocument | DOC-007 |
| PATCH | /api/documents/:id/metadata | updateDocumentMetadata | DOC-009 |

### Curation

| Method | Path | Handler | Contract |
| --- | --- | --- | --- |
| GET | /api/curation/documents | getDocumentQueue | DOC-006 |
| POST | /api/documents/:id/clear-flag | clearFlag | DOC-008 |
| GET | /api/curation/vocabulary | getVocabularyQueue | VOC-001 |
| POST | /api/curation/vocabulary/:termId/accept | acceptCandidate | VOC-002 |
| POST | /api/curation/vocabulary/:termId/reject | rejectCandidate | VOC-003 |
| POST | /api/curation/vocabulary/terms | addManualTerm | VOC-004 |

### Processing

| Method | Path | Handler | Contract |
| --- | --- | --- | --- |
| POST | /api/processing/trigger | triggerProcessing | PROC-001 |
| POST | /api/processing/results | receiveProcessingResults | PROC-002 |

### Search (VectorStore and GraphStore callbacks)

| Method | Path | Handler | Contract |
| --- | --- | --- | --- |
| POST | /api/search/vector | vectorSearch | QUERY-001 |
| POST | /api/search/graph | graphSearch | QUERY-002 |

### Ingestion (CLI bulk ingestion)

These routes are called by the CLI during bulk ingestion runs. They were not in the
inter-service contracts document because they are Express-owned routes called directly by the
CLI (which has direct network access to Express — same trust model as ADR-045 CLI-to-Python).

| Method | Path | Handler | Contract |
| --- | --- | --- | --- |
| POST | /api/ingestion/runs | createIngestionRun | ING-001 |
| POST | /api/ingestion/runs/:runId/complete | completeRun | ING-002 |
| POST | /api/ingestion/runs/:runId/files | addFileToRun | ING-003 (backend-plan-only) |
| DELETE | /api/ingestion/runs/:runId | cleanupRun | ING-004 (backend-plan-only) |

ING-001 and ING-002 are defined in the contracts document. ING-003 and ING-004 are
Express-internal routes called by the CLI; they are not inter-service contracts.

Ingestion endpoint details:

**ING-001** `POST /api/ingestion/runs`: Creates an ingestion run record with status
`in_progress`. Request body: `{ sourceDirectory: string, grouped: boolean }`. Response:
`{ runId: string, status: 'in_progress' }`. Performs the run-start sweep (ADR-018) before
creating the new run -- cleans up any prior incomplete run.

**ING-002** `POST /api/ingestion/runs/:runId/complete`: Moves all uploaded files from run
staging to permanent storage (status `uploaded` to `stored` to `finalized`), writes the
summary report, and marks the run as `completed`. Response: `{ runId: string, status:
'completed', totalSubmitted: number, totalAccepted: number, totalRejected: number }`.

**ING-003** (backend-plan-only) `POST /api/ingestion/runs/:runId/files`: Adds a single file
to the run. Request is `multipart/form-data` with `file` field plus metadata fields (`date`,
`description`, `groupName?`, `sequenceNumber?`). Express validates the file, writes it to the
run's staging directory, creates a `documents` row tagged with `ingestion_run_id`, computes
the hash, and checks for duplicates. Response: `{ documentId: string, status: 'uploaded' }`.
For grouped runs, the `groupName` identifies the virtual document group and `sequenceNumber`
determines page order.

**ING-004** (backend-plan-only) `DELETE /api/ingestion/runs/:runId`: Cleanup endpoint for a
failed or interrupted run. Removes staging files, deletes non-finalized document records, and
deletes the run record. Same cleanup logic as the run-start sweep but callable on demand.

### Health

| Method | Path | Handler | Contract |
| --- | --- | --- | --- |
| GET | /api/health | healthCheck | (internal) |

Returns `{ status: 'ok', timestamp: string }`. No auth required on this endpoint.

### Admin

| Method | Path | Handler | Contract |
| --- | --- | --- | --- |
| POST | /api/admin/reindex-embeddings | reindexEmbeddings | ADMIN-001 |

---

## Middleware

Middleware is applied in the following order on every request:

1. **Pino request logger** -- logs method, path, status code, and response time for every
   request using Pino; assigns a request ID (UUID v4) to each request for log correlation;
   attaches the logger instance to the request object for use in handlers

2. **Shared-key auth** -- validates the `x-internal-key` header against the configured key
   for the caller (ADR-044). Returns 401 if the header is missing or invalid. Skipped for
   `GET /api/health`. The middleware checks the key against a set of valid keys (one per
   caller pair: `auth.frontendKey` for Next.js calls, `auth.pythonKey` for Python calls).
   Both keys are checked -- the middleware does not distinguish callers by key, only validates
   that the presented key is in the allowed set.

3. **Zod request validation** -- per-route Zod schemas validate request body, URL parameters,
   and query parameters. Returns 400 with structured error details on validation failure.
   Schemas are defined alongside route handlers and imported from a `schemas/` directory.

4. **Route handlers** -- execute the service-layer logic

5. **Error handler** -- catches all unhandled errors from route handlers. Logs the full error
   with Pino. Returns a structured error response:
   - Known application errors (validation, not found, conflict): appropriate 4xx status with
     `{ error: string, message: string, details?: object }`
   - Unknown errors: 500 with `{ error: 'internal_error', message: 'An unexpected error
     occurred' }` (no stack trace in response body)

---

## Service layer

Each handler delegates to a service-layer function that contains the business logic. Handlers
are thin: they parse the validated request, call the service function, and format the response.
Service functions are injectable via the dependency-composition-pattern skill -- each receives
its dependencies (database connection, StorageService, VectorStore, GraphStore, config) as
constructor arguments or function parameters, not as global imports.

### initiateUpload

**Route**: POST /api/documents/initiate
**Dependencies**: Knex instance, Config
**Logic summary**: Validate file extension against `upload.acceptedExtensions`. Validate file
size against `upload.maxFileSizeMb`. Validate date format (YYYY-MM-DD or empty). Validate
description is non-empty and non-whitespace. Generate UUID v7. Insert `documents` row with
status `initiated`. Return the upload ID.

### uploadFile

**Route**: POST /api/documents/:uploadId/upload
**Dependencies**: Knex instance, StorageService, Config
**Logic summary**: Look up document by uploadId; confirm status is `initiated`. Write file to
staging area via StorageService. Compute MD5 hash. Check hash against `documents.file_hash`
unique constraint. If duplicate, return 409 with existing document details. Update document
row: set `file_hash`, `file_size_bytes` (from actual bytes), status to `uploaded`.

### finalizeUpload

**Route**: POST /api/documents/:uploadId/finalize
**Dependencies**: Knex instance, StorageService
**Logic summary**: Look up document by uploadId; confirm status is `uploaded`. Move file from
staging to permanent storage via StorageService. Update status to `stored`. Set `storage_path`.
Update status to `finalized`. Return complete document record with archive reference derived
per ADR-023.

### cleanupUpload

**Route**: DELETE /api/documents/:uploadId
**Dependencies**: Knex instance, StorageService
**Logic summary**: Look up document by uploadId. Reject if status is `finalized` (409). Delete
staging file if present. Delete permanent storage file if status is `stored`. Delete database
record. Return `{ deleted: true }`.

### getDocument

**Route**: GET /api/documents/:id
**Dependencies**: Knex instance
**Logic summary**: Query documents table by ID. Derive archive reference. Return full document
record including all metadata fields.

### getDocumentQueue

**Route**: GET /api/curation/documents
**Dependencies**: Knex instance
**Logic summary**: Query documents where `flag_reason IS NOT NULL`, ordered by `flagged_at`
ASC. Join with `pipeline_steps` to compute pipeline status summary. Paginate. Derive archive
reference per row.

### clearFlag

**Route**: POST /api/documents/:id/clear-flag
**Dependencies**: Knex instance
**Logic summary**: Look up document. Confirm flag exists (409 if not). Set `flag_reason` and
`flagged_at` to null. Do not reset pipeline steps -- the document resumes from the next
incomplete step on the next processing trigger (UR-078).

### updateDocumentMetadata

**Route**: PATCH /api/documents/:id/metadata
**Dependencies**: Knex instance
**Logic summary**: Look up document. Apply partial update for provided fields only. Validate
description non-emptiness if provided. Validate date format if provided. Update `updated_at`.
Return updated document record with re-derived archive reference.

### getVocabularyQueue

**Route**: GET /api/curation/vocabulary
**Dependencies**: Knex instance
**Logic summary**: Query `vocabulary_terms` where `source = 'llm_extracted'`, ordered by
`created_at` ASC. Left join `entity_document_occurrences` and `documents` to get source
document description and date for each term (earliest occurrence). Paginate.

### acceptCandidate

**Route**: POST /api/curation/vocabulary/:termId/accept
**Dependencies**: Knex instance
**Logic summary**: Look up term. Confirm `source = 'llm_extracted'` (409 if not). Update
`source` to `candidate_accepted`. Return updated term.

### rejectCandidate

**Route**: POST /api/curation/vocabulary/:termId/reject
**Dependencies**: Knex instance
**Logic summary**: Within a transaction: look up term. Confirm
`source = 'llm_extracted'`. Insert into `rejected_terms` (normalised_term, original_term).
Delete from `vocabulary_terms` (cascading deletes remove `vocabulary_relationships` and
`entity_document_occurrences` rows). Return confirmation.

### addManualTerm

**Route**: POST /api/curation/vocabulary/terms
**Dependencies**: Knex instance
**Logic summary**: Compute `normalised_term` from input `term`. Check against
`vocabulary_terms.normalised_term` and `rejected_terms.normalised_term` for duplicates (409).
Generate UUID v7. Within a transaction: insert `vocabulary_terms` row with
`source = 'manual'`, `confidence = null`. Insert `vocabulary_relationships` rows for each
provided relationship (validating that target term IDs exist). Return new term.

### triggerProcessing

**Route**: POST /api/processing/trigger
**Dependencies**: Knex instance, Config, HTTP client (for Python calls)
**Logic summary**:

Synchronous part (executes before returning the HTTP response):

1. Check for an existing in-progress `processing_runs` record; return 409 if one exists
2. Reset stale `running` pipeline steps older than `pipeline.runningStepTimeoutMinutes`
   to `failed`
3. Query documents with at least one incomplete pipeline step
4. Create a `processing_runs` record with status `in_progress`
5. Return `TriggerProcessingResponse` (`{ runId, documentsQueued }`) to the caller

Asynchronous part (detached async function started after the response is returned via
`void asyncProcessingLoop(runId, documents, deps)` — fire-and-forget, not awaited):

1. For each document: determine `incompleteSteps`; mark those steps as `running`; call
   Python `POST /process` with document data (PROC-003); call `receiveProcessingResults`
   service logic to write results
2. Update `processing_runs` record to `completed` (or `failed` if all documents errored)

The detached loop does not interact with the HTTP response. Any errors in the loop are
logged via Pino but do not surface to the caller. The caller can check run status by
querying `GET /api/processing/runs/:runId` (Phase 2) or by observing document pipeline
step states.

### receiveProcessingResults

**Route**: POST /api/processing/results
**Dependencies**: Knex instance, VectorStore, Config
**Logic summary**: Within a single database transaction (ADR-031 processing results
transaction):

1. Validate request body against Zod schema
2. Update `pipeline_steps` rows from `running` to reported status; increment `attempt_count`
   for failed steps; write `error_message` and `completed_at`
3. Update document metadata if `metadata` is present; apply conditional description overwrite
   (UR-053): overwrite only if new description is non-null and non-empty
4. For each chunk: insert `chunks` row; call `VectorStore.write()` with chunk ID and embedding
5. For each entity: compute `normalised_name` equivalent; check against
   `vocabulary_terms.normalised_term` -- if no match, insert new row with
   `source: 'llm_extracted'` and `confidence`; if match exists, append original entity name
   to `aliases` if not already present (UR-094); check against
   `rejected_terms.normalised_term` -- if match, suppress (do not insert)
6. For each entity (new or matched): insert `entity_document_occurrences` row (ignore if
   duplicate composite key)
7. For each relationship: resolve source and target entity normalised names to
   `vocabulary_terms` IDs; insert into `vocabulary_relationships` (ignore if duplicate
   composite key)
8. If flags present: set `flag_reason` and `flagged_at` on document

If any write fails, the entire transaction rolls back.

### vectorSearch

**Route**: POST /api/search/vector
**Dependencies**: VectorStore
**Logic summary**: Validate embedding dimension matches config. Call `VectorStore.search()`.
Join document metadata (description, date, document_type) to each result. Return results.

### graphSearch

**Route**: POST /api/search/graph
**Dependencies**: GraphStore
**Logic summary**: For each entity name: look up in `vocabulary_terms` by normalised form.
Call `GraphStore.traverse()` from each matched entity. Call
`GraphStore.findDocumentsByEntity()` for each entity in the traversal result. Return entities,
relationships, and related document IDs.

### healthCheck

**Route**: GET /api/health
**Dependencies**: None (or Knex instance for DB connectivity check)
**Logic summary**: Return `{ status: 'ok', timestamp: new Date().toISOString() }`. Optionally
ping the database to confirm connectivity.

### reindexEmbeddings

**Route**: POST /api/admin/reindex-embeddings
**Dependencies**: Knex instance
**Logic summary**: Execute `REINDEX INDEX CONCURRENTLY` on the IVFFlat index on
`embeddings.embedding`. This rebuilds the index with the current data, making it effective
after initial data load or after a significant number of inserts. Returns
`{ status: 'reindexing' }` immediately -- the REINDEX runs synchronously inside the handler
but is expected to be a long-running operation, so the endpoint should be called as a
one-off maintenance operation. The auth middleware applies (shared-key auth required).

### createIngestionRun

**Route**: POST /api/ingestion/runs
**Dependencies**: Knex instance, StorageService, Config
**Logic summary**: Perform run-start sweep: query for any `ingestion_runs` not in `completed`
status; for each, clean up staged files, delete non-finalized document records, delete run
record. Create new run record with `in_progress` status. Create run-specific staging directory
via StorageService. Return run ID.

### completeRun

**Route**: POST /api/ingestion/runs/:runId/complete
**Dependencies**: Knex instance, StorageService
**Logic summary**: Validate run is `in_progress`. Update run status to `moving`. Move each
uploaded file from run staging to permanent storage, updating status to `stored` per file.
Once all files are `stored`, update each to `finalized`. Update run status to `completed`.
Write summary report. Return run summary.

### addFileToRun

**Route**: POST /api/ingestion/runs/:runId/files
**Dependencies**: Knex instance, StorageService, Config
**Logic summary**: Validate run exists and is `in_progress`. Validate file against extension,
size, and naming convention (YYYY-MM-DD - description for standalone; NNN or NNN - annotation
for grouped). Write to run staging directory. Compute MD5 hash. Check for duplicates. Create
document record tagged with `ingestion_run_id`. For grouped runs, validate group constraints
(UR-037, UR-038): if any file in a group fails, reject the entire group (fail-fast in Phase
1).

**Note**: This is the CLI's file submission endpoint during bulk ingestion. The CLI does NOT
reuse DOC-001/002/003 per file. DOC-001/002/003 is the three-step web UI upload flow
(initiate → upload → finalize); `addFileToRun` is a single-step endpoint tailored to bulk
ingestion, with naming convention validation and staging behaviour specific to the ingestion
run lifecycle. Request format is `multipart/form-data`.

### cleanupRun

**Route**: DELETE /api/ingestion/runs/:runId
**Dependencies**: Knex instance, StorageService
**Logic summary**: Same as run-start sweep for a specific run. Delete staged files, permanent
storage files for `stored` documents, non-finalized document records, and run record.

---

## Startup operations

When the Express server starts:

1. **Config validation**: Load and validate nconf config with Zod. Fail-fast on invalid config.
2. **Database connectivity**: Confirm PostgreSQL connection. Fail-fast if unavailable.
3. **Run migrations**: Execute `knex migrate:latest` to bring the schema up to date.
4. **Upload cleanup sweep** (ADR-017): Query for documents with status `initiated`, `uploaded`,
   or `stored` (not `finalized`). For each: delete staging file, delete permanent storage file
   (if `stored`), delete database record.
5. **Ingestion run sweep** (ADR-018): Query for `ingestion_runs` not in `completed` status.
   For each: clean up staged files, delete non-finalized document records, delete run record.
6. **Seed data** (first run only): Run `knex seed:run` if `vocabulary_terms` contains zero rows.
7. **Start HTTP server**: Begin accepting requests.

---

## VectorStore implementation (Phase 1 -- pgvector)

### Interface

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

**Coupling note**: `search()` joins chunk metadata (`text`, `chunk_index`, `token_count`)
from the `chunks` table. The `chunks` rows are written by the handler (`receiveProcessingResults`),
not by `VectorStore.write()`. This coupling is acceptable for the PostgreSQL Phase 1
implementation because both tables live in the same database. Any non-PostgreSQL VectorStore
implementation must also have access to chunk text data to satisfy the `SearchResult` interface.

### PgVectorStore implementation

**write()**: Inserts a row into the `embeddings` table with the chunk_id, document_id, and
embedding vector. The `chunks` table row must already exist (inserted by the handler before
calling `VectorStore.write()`).

**search()**: Executes a SQL query using the pgvector `<=>` (cosine distance) operator:

```sql
SELECT e.id, e.chunk_id, e.document_id, c.text, c.chunk_index, c.token_count,
       1 - (e.embedding <=> $1) as similarity_score
FROM embeddings e
JOIN chunks c ON c.id = e.chunk_id
ORDER BY e.embedding <=> $1
LIMIT $2
```

Returns results ordered by similarity (highest first). No threshold filtering in Phase 1.

**Index**: IVFFlat index on the `embedding` column using `vector_cosine_ops`. The index is
created in migration 004. For an empty database, IVFFlat requires at least some data for
effective index building. The migration creates the index with `lists = 1` initially; a
maintenance script or config-driven rebuild with an appropriate `lists` value (e.g.
`sqrt(row_count)`) can be run after initial data load. This is a performance optimisation, not
a correctness concern -- the index works with `lists = 1`, just less efficiently.

**Embedding dimension**: The `vector(N)` column type is set at migration time. The dimension
value is read from config (`embedding.dimension`). The migration file must accept this as a
parameter. Implementation approach: the Knex migration reads the nconf config at migration
runtime to determine N. This is non-standard for Knex migrations but necessary because the
dimension is config-driven (ADR-024). An alternative is to accept the dimension as a
migration-time environment variable (`EMBEDDING_DIMENSION`).

**Factory**: `createVectorStore(vectorStoreConfig, embeddingConfig, knex, log)` reads
`vectorStoreConfig.provider` and returns a `PgVectorStore` instance for `"pgvector"`.
The factory accepts typed config slices (`AppConfig['vectorStore']` and
`AppConfig['embedding']`) and a `Logger` rather than a raw provider string, matching the
`createStorageService(storageConfig, log)` pattern from Task 5. All future factory functions
should follow this same pattern: accept the relevant config slice(s) and a `Logger`.

---

## GraphStore implementation (Phase 1 -- PostgreSQL)

### Interface

```typescript
interface GraphStore {
  writeEntity(entity: GraphEntity): Promise<void>;
  writeRelationship(relationship: GraphRelationship): Promise<void>;
  getEntity(entityId: string): Promise<GraphEntity | null>;
  getRelationships(
    entityId: string,
    direction?: 'outgoing' | 'incoming' | 'both'
  ): Promise<GraphRelationship[]>;
  traverse(
    startEntityId: string,
    maxDepth: number,
    relationshipTypes?: string[]
  ): Promise<TraversalResult>;
  findEntitiesByType(entityType: string): Promise<GraphEntity[]>;
  findDocumentsByEntity(entityId: string): Promise<DocumentReference[]>;
}

interface GraphEntity {
  entityId: string;
  term: string;
  category: string;
  confidence: number | null;
}

interface GraphRelationship {
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: string;
  confidence: number | null;
}

interface TraversalResult {
  entities: GraphEntity[];
  relationships: GraphRelationship[];
  depth: number;
}

interface DocumentReference {
  documentId: string;
  description: string;
  date: string;
}
```

### PostgresGraphStore implementation

**writeEntity()**: Inserts or updates a `vocabulary_terms` row. In Phase 1, entity writes
happen as part of the processing results transaction (PROC-002), not through the GraphStore
interface directly. The GraphStore interface is defined and implemented but called only by
graph query routes (QUERY-002), not by the processing handler.

**writeRelationship()**: Inserts a `vocabulary_relationships` row. Same transaction note as
writeEntity.

**getEntity()**: Queries `vocabulary_terms` by ID, filtered to entities with at least one
`entity_document_occurrences` row (ADR-037: graph contains only document-evidenced entities).

**getRelationships()**: Queries `vocabulary_relationships` by entity ID with optional direction
filter (source_term_id for outgoing, target_term_id for incoming, both for bidirectional).

**traverse()**: Uses a recursive CTE (Common Table Expression) to walk the relationship graph
from a starting entity up to `maxDepth` hops. Optional `relationshipTypes` filter limits
traversal to specific relationship types. Returns all visited entities and the relationships
that connect them.

```sql
WITH RECURSIVE graph AS (
  SELECT vr.source_term_id, vr.target_term_id, vr.relationship_type, 1 as depth
  FROM vocabulary_relationships vr
  WHERE vr.source_term_id = $1
  UNION ALL
  SELECT vr.source_term_id, vr.target_term_id, vr.relationship_type, g.depth + 1
  FROM vocabulary_relationships vr
  JOIN graph g ON vr.source_term_id = g.target_term_id
  WHERE g.depth < $2
)
SELECT DISTINCT * FROM graph
```

**findEntitiesByType()**: Queries `vocabulary_terms` by category, filtered to entities with
at least one `entity_document_occurrences` row.

**findDocumentsByEntity()**: Joins `entity_document_occurrences` to `documents` for a given
entity ID. Returns document references (ID, description, date).

**Factory**: `createGraphStore(graphConfig, knex, log)` reads `graphConfig.provider` and
returns a `PostgresGraphStore` instance for `"postgresql"`. Accepts the `AppConfig['graph']`
config slice and a `Logger`, consistent with the factory pattern established by
`createStorageService` and `createVectorStore`.

---

## Knex migrations

### 20260303000001_create_documents

**Creates**: `documents` table with all columns specified in migration outline 001 from the
contracts document.
**Notes**: First migration; no dependencies. The `file_hash` partial unique index is
important for deduplication correctness.

### 20260303000002_create_vocabulary

**Creates**: `vocabulary_terms`, `vocabulary_relationships`, `rejected_terms`,
`entity_document_occurrences` tables with all columns and indexes specified in migration
outline 002.
**Dependencies**: Migration 001 (entity_document_occurrences references documents).

### 20260303000003_create_processing_runs

**Creates**: `processing_runs` table.
**Dependencies**: Migration 001.

### 20260303000004_create_chunks_and_embeddings

**Creates**: `chunks` and `embeddings` tables. Requires pgvector extension
(`CREATE EXTENSION IF NOT EXISTS vector`).
**Dependencies**: Migration 001 (foreign keys to documents). pgvector must be available in the
PostgreSQL instance (included in the Docker image).
**Special**: The embedding vector dimension is parameterised. The migration reads the
`EMBEDDING_DIMENSION` environment variable (defaulting to 384 for e5-small) to set
`vector(N)`. The IVFFlat index is created with `lists = 1` initially; a post-load index
rebuild with tuned `lists` value is documented as a maintenance task.

### 20260303000005_create_pipeline_steps

**Creates**: `pipeline_steps` table.
**Dependencies**: Migration 001.

### 20260303000006_create_ingestion_runs

**Creates**: `ingestion_runs` table. Adds `ingestion_run_id` nullable column to `documents`.
**Dependencies**: Migration 001.
**Note**: This migration alters the `documents` table (adds a column). This is an additive
change consistent with ADR-029.

**Migration ordering conflict**: Migration 003 creates `processing_runs` and migration 006
creates `ingestion_runs`. Both add foreign key columns to `documents`. Migration 006 adds
`ingestion_run_id` to `documents`, but migration 003 was described as also adding this.
**Resolution**: Migration 003 creates only `processing_runs`. Migration 006 creates
`ingestion_runs` and adds `ingestion_run_id` to `documents`. The contracts document migration
outlines are corrected by this backend plan -- migration 003 does NOT add the
`ingestion_run_id` column; migration 006 does.

---

## Configuration

### nconf keys required by the backend

**Server**

- `server.port` (number) -- Express listen port; default 4000

**Database**

- `db.host` (string) -- PostgreSQL host
- `db.port` (number) -- PostgreSQL port; default 5432
- `db.database` (string) -- database name
- `db.user` (string) -- database user
- `db.password` (string) -- database password

**Auth (ADR-044)**

- `auth.frontendKey` (string) -- shared key for Next.js to Express calls
- `auth.pythonKey` (string) -- shared key for Python to Express calls
- `auth.pythonServiceKey` (string) -- shared key for Express to Python calls

**Storage (ADR-008)**

- `storage.provider` (string) -- `"local"` for Phase 1
- `storage.local.basePath` (string) -- root directory for permanent file storage
- `storage.local.stagingPath` (string) -- root directory for staging area

**Upload**

- `upload.maxFileSizeMb` (number) -- maximum file size in megabytes
- `upload.acceptedExtensions` (string[]) -- accepted file extensions

**Pipeline (ADR-027)**

- `pipeline.runningStepTimeoutMinutes` (number) -- stale running step threshold
- `pipeline.maxRetries` (number) -- maximum retry attempts per step (UR-069)

**Python service**

- `python.baseUrl` (string) -- Python processing service URL

**VectorStore (ADR-033)**

- `vectorStore.provider` (string) -- `"pgvector"` for Phase 1

**GraphStore (ADR-037)**

- `graph.provider` (string) -- `"postgresql"` for Phase 1

**Embedding**

- `embedding.dimension` (number) -- embedding vector dimension; must match Python config

**Ingestion (ADR-018, ADR-019)**

- `ingestion.partialAuditReport` (boolean) -- enable streaming append for development
- `ingestion.reportOutputDirectory` (string) -- directory for summary report files

### Environment override strategy

Per ADR-001 and ADR-016, environment variables override config file values. The nconf
hierarchy is:

1. CLI arguments (highest priority)
2. Environment variables (prefixed with `IK_` to avoid collisions)
3. Config override file (`config.override.json5`, volume-mounted)
4. Base config file (`config.json5`, built into Docker image)
5. Defaults (lowest priority)

The `config.json5` file provides sane defaults for local development. The
`config.override.json5` file is for Docker Compose runtime overrides. Environment variables
with `IK_` prefix provide per-key overrides (e.g. `IK_DB__HOST=postgres` overrides
`db.host`). nconf supports nested key notation with `__` as separator.

---

## Tooling

Biome (ADR-046): linter and formatter for `apps/backend/`. No ESLint or Prettier. All code
must pass `biome check` before a task is `code_complete`.

Biome configuration file at `apps/backend/biome.json` (or inherit from root `biome.json` if
a monorepo-level config is preferred). The configuration must enforce:

- Consistent import ordering
- No unused variables
- Consistent formatting (tabs vs spaces -- follow project convention)

The `biome check` command runs both linting and formatting checks. It is the single quality
gate for TypeScript code in the backend.

---

## Testing approach

### Unit tests (Vitest, mocked services)

Every service-layer handler is unit tested with mocked dependencies. The
dependency-composition-pattern skill makes injection straightforward: pass mock Knex instance,
mock StorageService, mock VectorStore, and mock GraphStore.

**Priority handlers for unit testing**:

- `receiveProcessingResults` -- most complex handler; tests must cover: successful full
  pipeline write, entity deduplication (new entity, existing entity with alias append,
  rejected entity suppression), relationship deduplication, flag writing, transaction rollback
  on failure
- `initiateUpload` / `uploadFile` / `finalizeUpload` -- upload lifecycle; tests must cover:
  happy path, duplicate detection at upload step, cleanup on failure
- `triggerProcessing` -- tests must cover: stale running step reset, document selection,
  concurrent run rejection (409)
- `rejectCandidate` -- tests must cover: cascading deletes, rejected_terms insertion
- `addManualTerm` -- tests must cover: normalisation, duplicate detection against both tables,
  relationship validation
- `vectorSearch` -- tests must cover: embedding dimension validation, result ordering
- `graphSearch` -- tests must cover: traversal depth limiting, entity name resolution

**Handlers with lighter testing needs**:

- `getDocument`, `getDocumentQueue`, `getVocabularyQueue` -- read-only; test query
  construction and response mapping
- `clearFlag`, `updateDocumentMetadata` -- simple update operations
- `acceptCandidate` -- single field update
- `healthCheck` -- trivial
- `reindexEmbeddings` -- unit test: mock Knex raw query; verify `REINDEX INDEX CONCURRENTLY`
  is called on the correct index name

### Integration tests (Vitest, real database)

Integration tests run against a real PostgreSQL instance (Docker container with pgvector
extension). They test:

- **Migration correctness**: Run all migrations on a clean database; verify table structures
- **Upload lifecycle end-to-end**: Initiate, upload, finalize; verify document record and file
  in storage
- **Processing results write**: Submit a full processing results payload; verify all tables
  are populated (documents, chunks, embeddings, vocabulary_terms, vocabulary_relationships,
  entity_document_occurrences, pipeline_steps)
- **Entity deduplication**: Submit two processing results with overlapping entity names; verify
  single vocabulary_terms row with updated aliases
- **VectorStore.search()**: Write embeddings; search with a known vector; verify results are
  returned in similarity order
- **Startup sweep**: Create incomplete uploads; run startup sweep; verify cleanup
- **Transaction atomicity**: Submit processing results with a deliberately invalid entity;
  verify the entire transaction rolled back (no partial writes)
- **REINDEX**: Call `POST /api/admin/reindex-embeddings` against the real database; verify the
  command executes without error and the index remains queryable

Integration tests use a separate test database that is created and destroyed per test suite
run. The test database connection string is configured via environment variable.

### VectorStore and GraphStore interface tests

Both interfaces have dedicated test suites that exercise the interface contract against the
real PostgreSQL implementation:

- **VectorStore**: write + search round-trip; dimension mismatch rejection; topK limiting;
  empty database search returns empty results
- **GraphStore**: writeEntity + getEntity round-trip; writeRelationship + getRelationships;
  traverse with depth 1, 2, 3; findEntitiesByType filtering; findDocumentsByEntity join;
  entity without document_occurrences excluded from graph queries

---

## Open questions

1. **ESM vs CommonJS**: The CLAUDE.md notes a deferred decision on ESM vs CommonJS module
   format. This must be resolved before scaffolding. The backend plan is module-format-agnostic
   -- all patterns described here work with either format. Recommend ESM (`"type": "module"` in
   `package.json`) per the CLAUDE.md recommendation.

2. **Knex config format**: Knex traditionally uses a `knexfile.js` for configuration. With
   ESM and nconf, the Knex config should be derived from the nconf config singleton at runtime
   rather than maintained as a separate file. The exact wiring (Knex programmatic
   configuration via `knex({ client: 'pg', connection: ... })`) is an implementer decision.

3. **IVFFlat index rebuild**: The initial IVFFlat index with `lists = 1` is functional but not
   optimal. A maintenance script or CLI command to rebuild the index with tuned parameters
   after initial data load should be documented as a post-setup task. This is not a Phase 1
   blocker but should be noted in the Project Manager's task list.

4. **Archive reference derivation**: The derivation function
   (`YYYY-MM-DD — [description]` or `[undated] — [description]`) lives in `packages/shared/`.
   The Express backend imports this function when constructing API responses that include
   `archiveReference`. The function must be available as a TypeScript import in both
   `apps/frontend/` and `apps/backend/`. The `packages/shared/` package must be configured
   in the pnpm workspace for cross-package imports.

5. **Phase 2 — ingestion run status endpoint**: In Phase 1 the startup sweep handles
   incomplete ingestion runs automatically on Express restart. A CLI that crashes mid-run
   after submitting files but before calling ING-002 (`completeRun`) will have its run
   cleaned up the next time Express starts. For Phase 2, a `GET /api/ingestion/runs/:runId`
   status check endpoint would allow the CLI to detect and resume interrupted runs without
   relying solely on the startup sweep. No action required in Phase 1.
