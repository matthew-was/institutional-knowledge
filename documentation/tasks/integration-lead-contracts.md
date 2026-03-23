# Integration Lead Contracts

## Status

Approved — 2026-03-03

**Schema source of truth (ADR-048)**: All request and response schemas defined in this
document are implemented as Zod schemas in `packages/shared/src/schemas/`. The backend
auto-generates an OpenAPI 3.x spec from these schemas at `/openapi.json`. Contract IDs
(DOC-001 etc.) and HTTP paths are unchanged.

Both Senior Developer plans reviewed for data access compliance:

- `documentation/tasks/senior-developer-frontend-plan.md` (Approved 2026-03-03) -- all 12 API
  calls validated; all access via Express API through Next.js proxy routes; no direct database
  access; compliant with ADR-031 and ADR-044
- `documentation/tasks/senior-developer-python-plan.md` (Approved 2026-03-03) -- all 4 Express
  HTTP calls validated; Python has no direct database connection; all writes go through Express;
  compliant with ADR-031, ADR-033, ADR-037, ADR-044

All contracts approved. All frontend open questions (OQ-001 through OQ-004) and Python open
questions (OQ-1, OQ-6) resolved below.

---

## Open question resolutions

### Frontend OQ-001: Upload lifecycle browser-to-Next.js call pattern

**Resolution**: The browser sends a single `multipart/form-data` POST to the Next.js API route
`/api/documents/upload`. The Next.js API route handler decomposes this into the three Express
calls internally (initiate, upload file bytes, finalize). The browser does not call three
separate Next.js routes.

**Rationale**: The four-status lifecycle (ADR-007, ADR-017) is an Express-internal concern. The
frontend should not be aware of intermediate statuses. A single browser POST keeps the client
simple and moves orchestration to the server where retry and cleanup logic already live. If any
Express step fails, the Next.js handler returns an appropriate error to the browser without
exposing internal lifecycle details. The Next.js handler is responsible for calling the Express
cleanup endpoint if the initiate succeeds but a later step fails.

This means the frontend plan's three-call browser sequence is replaced by a single call. The
`DocumentUploadForm` component submits once; the response is either success (HTTP 201) or
error (4xx/5xx). The upload lifecycle contracts below reflect the Express-side endpoints that
the Next.js handler calls internally.

### Frontend OQ-002: Storage shape for people and land references

**Resolution**: Both `people` and `land_references` are stored as PostgreSQL `text[]` (text
arrays) on the `documents` table. The Express API accepts and returns them as JSON string
arrays. The frontend renders them as comma-separated text inputs that the form handler splits
into arrays before submission and joins for display.

**Rationale**: Text arrays are the simplest representation that supports multiple values per
field without introducing a separate table for what are fundamentally flat lists of names or
references. PostgreSQL natively supports array indexing and containment queries if needed. No
structured sub-records are required in Phase 1.

### Frontend OQ-003: Document type field values

**Resolution**: `document_type` is a free-text string field in Phase 1. It is not a controlled
enumeration. The pattern-based metadata extraction step (Python step 3) produces a detected
document type as a string; the curator can correct it to any value via the metadata edit form.
Phase 2 may introduce a controlled enumeration based on types observed during Phase 1
processing.

**Rationale**: The document type list is not yet known -- it depends on what types of documents
exist in the estate archive. Locking it to an enumeration in Phase 1 would either be
incomplete or require frequent schema changes. Free text allows the extraction pipeline and
curator to use any value. The `category` field on `vocabulary_terms` serves a similar
open-ended purpose (ADR-028).

### Frontend OQ-004: Vocabulary term schema

**Resolution**: The vocabulary term schema follows ADR-028 exactly:

- `term` (string, required) -- the term name
- `category` (string, required) -- free-text category (e.g. "People", "Organisation", "Land
  Parcel / Field", "Date / Event", "Legal Reference", "Organisation Role"); not a controlled
  enumeration in Phase 1
- `description` (string, optional) -- human-readable description
- `aliases` (string array, optional, defaults to empty array) -- alternative names
- `relationships` (array of `{ targetTermId: string, relationshipType: string }`, optional) --
  relationships to existing terms; relationship types are free text matching the indicative
  types from ADR-038 (owned_by, transferred_to, witnessed_by, adjacent_to, employed_by,
  referenced_in, performed_by, succeeded_by)

### Python OQ-1: Express HTTP calls

Resolved below in the approved contracts (DOC-001 through DOC-012).

### Python OQ-6: Per-pair shared keys

**Resolution**: The Python service config requires two keys:

- `auth.inboundKey` -- validates inbound requests from Next.js and Express (both use this key
  when calling Python); this is the key Python checks on incoming `x-internal-key` headers
- `auth.expressKey` -- used by Python on outbound calls to Express (processing results, vector
  search, graph search); this is a different per-pair key that Express validates

ADR-044 specifies per-pair keys for independent rotation. Two keys in the Python config is
the minimum: one for inbound validation, one for outbound calls to Express. Express similarly
has two keys: one it checks on inbound calls from Next.js and Python
(`auth.frontendKey` for Next.js calls, `auth.pythonKey` for Python calls), and one it uses
when calling Python (`auth.pythonServiceKey`).

The full key matrix:

| Caller | Callee | Key name in caller config | Key name in callee config |
| --- | --- | --- | --- |
| Next.js | Express | `express.internalKey` | `auth.frontendKey` |
| Next.js | Python | `python.internalKey` (Phase 2) | `auth.inboundKey` |
| Express | Python | `auth.pythonServiceKey` | `auth.inboundKey` |
| Python | Express | `auth.expressKey` | `auth.pythonKey` |
| CLI | Python | CLI flag or env var | `auth.inboundKey` |

---

## Approved contracts

### Document Intake -- Initiate upload

**Contract ID**: DOC-001

**Endpoint**: `POST /api/documents/initiate`

**Caller**: Next.js API route handler (internal; not called by browser directly)

**Request**:

```typescript
interface InitiateUploadRequest {
  filename: string;
  contentType: string;
  fileSizeBytes: number;
  date: string;          // ISO 8601 date string YYYY-MM-DD, or empty string for undated
  description: string;   // non-empty, non-whitespace-only
}
```

**Response**:

```typescript
interface InitiateUploadResponse {
  uploadId: string;      // UUID v7 — this becomes the document ID
  status: 'initiated';
}
```

**Error responses**:

- 400: Invalid request body (missing fields, empty description, invalid date format)
- 409: Duplicate file hash detected (if hash is provided at initiate; see DOC-002 note)
- 422: Unsupported file extension; file size exceeds limit

**Migration required**: Yes -- see migration `001_create_documents`

**Notes**: Express creates the `documents` row with status `initiated`. The `uploadId` returned
is the document's UUID v7 primary key. Server-side validation of date format, description
non-emptiness, file extension, and file size limit happens here. File hash is not checked at
this stage (file bytes have not arrived yet).

---

### Document Intake -- Upload file bytes

**Contract ID**: DOC-002

**Endpoint**: `POST /api/documents/:uploadId/upload`

**Caller**: Next.js API route handler (internal; not called by browser directly)

**Request**: `multipart/form-data` with a single `file` field containing the binary file content.

```typescript
// No TypeScript interface — multipart binary upload
// Content-Type: multipart/form-data
// URL parameter: uploadId (UUID v7 from DOC-001)
```

**Response**:

```typescript
interface UploadFileResponse {
  uploadId: string;
  status: 'uploaded';
  fileHash: string;      // MD5 hash computed from uploaded bytes
}
```

**Error responses**:

- 400: No file in request body
- 404: uploadId not found or not in `initiated` status
- 409: Duplicate hash detected (MD5 hash matches existing finalized document — ADR-009)
- 413: File exceeds size limit (defence in depth; also checked at initiate)

**Migration required**: No (uses `documents` table from DOC-001 migration)

**Notes**: Express writes the file to the staging area (ADR-017), computes the MD5 hash,
checks against the `file_hash` unique constraint on the `documents` table, and updates status
to `uploaded`. On duplicate detection (409), the response body uses the standard error
envelope with `errorData` nested under `data`:

```json
{
  "error": "duplicate_detected",
  "data": {
    "existingRecord": {
      "documentId": "string (UUID v7)",
      "description": "string",
      "date": "string | null",
      "archiveReference": "string"
    }
  }
}
```

The `DuplicateConflictResponse` schema in `packages/shared/src/schemas/documents.ts`
represents only the `data` payload (`{ existingRecord: { ... } }`). The `error` field
belongs to the envelope produced by `sendServiceError` in `routes/routeUtils.ts`, not
the payload. Frontend code must read `response.data.existingRecord`, not
`response.existingRecord`.

---

### Document Intake -- Finalize upload

**Contract ID**: DOC-003

**Endpoint**: `POST /api/documents/:uploadId/finalize`

**Caller**: Next.js API route handler (internal; not called by browser directly)

**Request**:

```typescript
// No body required — the uploadId URL parameter identifies the document
// URL parameter: uploadId (UUID v7)
```

**Response**:

```typescript
interface FinalizeUploadResponse {
  documentId: string;
  description: string;
  date: string;
  archiveReference: string;   // derived at response time per ADR-023
  status: 'finalized';
}
```

**Error responses**:

- 404: uploadId not found or not in `uploaded` status
- 500: File move from staging to permanent storage failed

**Migration required**: No (uses `documents` table from DOC-001 migration)

**Notes**: Express moves the file from staging to permanent storage (ADR-017), updates status
to `stored`, then to `finalized`. Returns the complete document record including the archive
reference derived per ADR-023 (`YYYY-MM-DD — [description]` or `[undated] — [description]`).
The Next.js handler returns this to the browser as the success response.

---

### Document Intake -- Browser upload (composite)

**Contract ID**: DOC-004

**Endpoint**: `POST /api/documents/upload` (Next.js API route, browser-facing)

**Caller**: Browser (`DocumentUploadForm` component)

**Request**: `multipart/form-data` with fields:

```typescript
// multipart/form-data
// Fields:
//   file: File                    (binary)
//   date: string                  (YYYY-MM-DD or empty)
//   description: string           (non-empty)
```

**Response**: Same as `FinalizeUploadResponse` from DOC-003 on success.

**Error responses**: Proxied from whichever Express step fails (DOC-001, DOC-002, or DOC-003).

**Migration required**: No (this is a Next.js route, not an Express endpoint)

**Notes**: This is the browser-facing contract. The Next.js API route handler receives the
browser POST, extracts metadata, calls DOC-001 (initiate), DOC-002 (upload file), and DOC-003
(finalize) in sequence against Express. If any step fails, the handler calls the cleanup
endpoint to remove partial state and returns the error to the browser. The browser never sees
the intermediate lifecycle steps.

Where multiple Express steps can return the same HTTP status code (e.g. both DOC-001 and
DOC-002 return 400 for validation errors), the Next.js handler must inspect the error response
body to determine the cause before surfacing the error to the browser. Status code alone is
not sufficient to distinguish errors from different steps.

---

### Document Intake -- Cleanup incomplete upload

**Contract ID**: DOC-005

**Endpoint**: `DELETE /api/documents/:uploadId`

**Caller**: Next.js API route handler (called when upload orchestration fails partway through)

**Request**:

```typescript
// No body required
// URL parameter: uploadId (UUID v7)
```

**Response**:

```typescript
interface CleanupResponse {
  deleted: boolean;
}
```

**Error responses**:

- 404: uploadId not found
- 409: Document is already finalized (cannot delete a finalized document in Phase 1)

**Migration required**: No

**Notes**: Express deletes the staging file (if present), permanent storage file (if status
is `stored`), and the database record. This implements the aggressive immediate cleanup policy
(ADR-010). Only callable for documents not in `finalized` status. Finalized documents cannot
be deleted in Phase 1 (UR-115).

---

### Document Curation -- Fetch document queue

**Contract ID**: DOC-006

**Endpoint**: `GET /api/curation/documents`

**Caller**: Next.js API route handler (forwarded from browser `useSWR` fetch)

**Request**: No body. Optional query parameters:

```typescript
interface DocumentQueueParams {
  page?: number;         // pagination — default 1
  pageSize?: number;     // default 50
}
```

**Response**:

```typescript
interface DocumentQueueResponse {
  documents: DocumentQueueItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface DocumentQueueItem {
  documentId: string;
  description: string;
  date: string;                  // YYYY-MM-DD or empty
  archiveReference: string;      // derived per ADR-023
  flagReason: string;            // full flag reason text including failing pages
  flaggedAt: string;             // ISO 8601 timestamp
  submitterIdentity: string;     // always "Primary Archivist" in Phase 1
  pipelineStatus: string;        // summary of pipeline progress
}
```

**Error responses**:

- 500: Database query failure

**Migration required**: No (queries existing `documents` and `pipeline_steps` tables)

**Notes**: Returns documents that have at least one active flag, ordered by `flaggedAt`
ascending (UR-081). The flag reason includes the full list of failing pages (UR-051, UR-055).
`submitterIdentity` is visible in the curation queue only (UR-126). The archive reference is
derived at response time.

---

### Document Curation -- Fetch document detail

**Contract ID**: DOC-007

**Endpoint**: `GET /api/documents/:id`

**Caller**: Next.js API route handler (Server Component fetch for metadata edit page)

**Request**: No body.

```typescript
// URL parameter: id (UUID v7 document ID)
```

**Response**:

```typescript
interface DocumentDetailResponse {
  documentId: string;
  description: string;
  date: string;
  archiveReference: string;
  documentType: string | null;
  people: string[];
  organisations: string[];
  landReferences: string[];
  submitterIdentity: string;
  status: 'initiated' | 'uploaded' | 'stored' | 'finalized';
  flagReason: string | null;
  flaggedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Error responses**:

- 404: Document not found

**Migration required**: No

**Notes**: Returns the full document record for the metadata edit form. All metadata fields
are included. `organisations` is a separate array from `people` (both are text arrays on the
documents table).

---

### Document Curation -- Clear a flag

**Contract ID**: DOC-008

**Endpoint**: `POST /api/documents/:id/clear-flag`

**Caller**: Next.js API route handler (from `ClearFlagButton`)

**Request**: No body.

**Response**:

```typescript
interface ClearFlagResponse {
  documentId: string;
  flagCleared: boolean;
}
```

**Error responses**:

- 404: Document not found
- 409: Document has no active flag

**Migration required**: No

**Notes**: Clears the flag reason and flagged_at fields on the document (UR-079). Marks the
document as ready to resume from the next incomplete pipeline step on the next processing
trigger (UR-078). Does not trigger processing automatically.

---

### Document Curation -- Update document metadata

**Contract ID**: DOC-009

**Endpoint**: `PATCH /api/documents/:id/metadata`

**Caller**: Next.js API route handler (from `DocumentMetadataForm`)

**Request**:

```typescript
interface UpdateDocumentMetadataRequest {
  date?: string;                // YYYY-MM-DD or empty string for undated
  description?: string;         // non-empty, non-whitespace-only if provided
  documentType?: string | null;
  people?: string[];
  organisations?: string[];
  landReferences?: string[];
}
```

**Response**:

```typescript
interface UpdateDocumentMetadataResponse {
  documentId: string;
  description: string;
  date: string;
  archiveReference: string;      // re-derived after update
  documentType: string | null;
  people: string[];
  organisations: string[];
  landReferences: string[];
  updatedAt: string;
}
```

**Error responses**:

- 400: Invalid field values (empty description, invalid date format)
- 404: Document not found

**Migration required**: No

**Notes**: Partial update -- only fields present in the request body are updated. Does not
trigger re-embedding (UR-062). The archive reference is re-derived from the updated date and
description. Updates `updated_at` timestamp.

---

### Vocabulary Curation -- Fetch vocabulary review queue

**Contract ID**: VOC-001

**Endpoint**: `GET /api/curation/vocabulary`

**Caller**: Next.js API route handler (forwarded from browser `useSWR` fetch)

**Request**: Optional query parameters:

```typescript
interface VocabularyQueueParams {
  page?: number;
  pageSize?: number;
}
```

**Response**:

```typescript
interface VocabularyQueueResponse {
  candidates: VocabularyCandidateItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface VocabularyCandidateItem {
  termId: string;                    // UUID v7
  term: string;
  category: string;
  confidence: number | null;         // 0.0–1.0; null for manual terms
  description: string | null;
  sourceDocumentDescription: string | null;  // from first entity_document_occurrence
  sourceDocumentDate: string | null;
  createdAt: string;                 // ISO 8601
}
```

**Error responses**:

- 500: Database query failure

**Migration required**: No (queries existing `vocabulary_terms` and
`entity_document_occurrences` tables)

**Notes**: Returns vocabulary terms with `source = 'llm_extracted'` ordered by `created_at`
ascending (UR-090). The source document information comes from the earliest
`entity_document_occurrences` row for each term. Pagination is included for large queues.

---

### Vocabulary Curation -- Accept a candidate

**Contract ID**: VOC-002

**Endpoint**: `POST /api/curation/vocabulary/:termId/accept`

**Caller**: Next.js API route handler (from `AcceptCandidateButton`)

**Request**: No body.

**Response**:

```typescript
interface AcceptCandidateResponse {
  termId: string;
  term: string;
  source: 'candidate_accepted';
}
```

**Error responses**:

- 404: Term not found
- 409: Term is not in `llm_extracted` status (already accepted or rejected)

**Migration required**: No

**Notes**: Updates the term's `source` from `llm_extracted` to `candidate_accepted`. This is
part of a vocabulary curation transaction (ADR-031). The term remains in `vocabulary_terms`
with its existing relationships and `entity_document_occurrences`.

---

### Vocabulary Curation -- Reject a candidate

**Contract ID**: VOC-003

**Endpoint**: `POST /api/curation/vocabulary/:termId/reject`

**Caller**: Next.js API route handler (from `RejectCandidateButton`)

**Request**: No body.

**Response**:

```typescript
interface RejectCandidateResponse {
  termId: string;
  rejected: boolean;
}
```

**Error responses**:

- 404: Term not found
- 409: Term is not in `llm_extracted` status

**Migration required**: No

**Notes**: Moves the term to the `rejected_terms` table (normalised_term, original_term,
rejected_at). Deletes the term from `vocabulary_terms`. Cascading deletes remove associated
`vocabulary_relationships` rows. `entity_document_occurrences` rows for this term are also
deleted. Future LLM extractions matching this normalised term are suppressed (UR-093).

---

### Vocabulary Curation -- Add a manual term

**Contract ID**: VOC-004

**Endpoint**: `POST /api/curation/vocabulary/terms`

**Caller**: Next.js API route handler (from `AddVocabularyTermForm`)

**Request**:

```typescript
interface AddVocabularyTermRequest {
  term: string;                      // required, non-empty
  category: string;                  // required, non-empty
  description?: string;              // optional
  aliases?: string[];                // optional, defaults to []
  relationships?: Array<{
    targetTermId: string;            // UUID v7 of existing term
    relationshipType: string;        // free text
  }>;
}
```

**Response**:

```typescript
interface AddVocabularyTermResponse {
  termId: string;                    // UUID v7 of the new term
  term: string;
  category: string;
  source: 'manual';
  normalisedTerm: string;
}
```

**Error responses**:

- 400: Missing required fields (term, category)
- 409: Normalised term already exists in `vocabulary_terms` or `rejected_terms` (UR-093)
- 404: A referenced `targetTermId` in relationships does not exist

**Migration required**: No

**Notes**: Express generates the UUID v7, computes `normalised_term`, checks for duplicates
against both `vocabulary_terms.normalised_term` and `rejected_terms.normalised_term`, and
writes the term with `source: 'manual'`. Relationships are written to
`vocabulary_relationships` in the same transaction. `confidence` is null for manual terms.

---

### Processing -- Trigger processing run

**Contract ID**: PROC-001

**Endpoint**: `POST /api/processing/trigger`

**Caller**: Next.js API route handler (curation UI button) or CLI

**Request**:

```typescript
interface TriggerProcessingRequest {
  // empty body — processes all documents with incomplete pipeline steps
}
```

**Response**:

```typescript
interface TriggerProcessingResponse {
  runId: string;                     // UUID v7 for this processing run
  documentsQueued: number;           // count of documents that will be processed
}
```

**Error responses**:

- 409: A processing run is already in progress
- 500: Failed to query for pending documents

**Migration required**: Yes -- see migration `003_create_processing_runs`

**Notes**: Fire-and-forget (ADR-026). Express queries for documents with incomplete pipeline
steps (including stale `running` steps reset to `failed`), creates a processing run record,
and begins processing asynchronously. The response returns immediately with the run ID and
count. Express calls Python's `POST /process` endpoint once per document. The caller does not
wait for processing to complete.

---

### Processing -- Submit processing results (Python to Express)

**Contract ID**: PROC-002

**Endpoint**: `POST /api/processing/results`

**Caller**: Python `pipeline/orchestrator.py` via `shared/http_client.py`

**Request**:

```typescript
interface ProcessingResultsRequest {
  documentId: string;

  stepResults: Record<string, StepResult>;

  flags: DocumentFlag[];

  metadata: {
    documentType: string | null;
    dates: string[];
    people: string[];
    organisations: string[];
    landReferences: string[];
    description: string | null;
  } | null;

  chunks: ChunkData[] | null;

  entities: EntityData[] | null;

  relationships: RelationshipData[] | null;
}

interface StepResult {
  status: 'completed' | 'failed';
  errorMessage: string | null;
}

interface DocumentFlag {
  type: string;            // e.g. 'quality_threshold_failure', 'extraction_failure'
  reason: string;          // actionable description including failing pages
}

interface ChunkData {
  chunkIndex: number;
  text: string;
  tokenCount: number;
  embedding: number[];     // float array, dimension matches embedding.dimension config
}

interface EntityData {
  name: string;
  type: string;            // entity type category
  confidence: number;      // 0.0–1.0
  normalisedName: string;
}

interface RelationshipData {
  sourceEntityName: string;
  targetEntityName: string;
  relationshipType: string;
  confidence: number;
}
```

**Response**:

```typescript
interface ProcessingResultsResponse {
  documentId: string;
  accepted: boolean;
}
```

**Error responses**:

- 400: Invalid request body (missing documentId, malformed step results)
- 404: Document not found
- 500: Transaction write failure

**Migration required**: Yes -- see migrations `001_create_documents`, `002_create_vocabulary`,
`004_create_chunks_and_embeddings`, `005_create_pipeline_steps`

**Notes**: This is the core processing results transaction (ADR-031). Express writes everything
atomically in a single database transaction:

1. Update `pipeline_steps` rows from `running` to the reported status
2. Update document metadata fields if `metadata` is present (conditional overwrite per UR-053:
   description is overwritten only if a new description is detected)
3. Insert `chunks` rows and `embeddings` rows (via VectorStore.write)
4. For each entity: check `normalised_name` against `vocabulary_terms.normalised_term` and
   `rejected_terms.normalised_term`; if no match, insert into `vocabulary_terms` with
   `source: 'llm_extracted'`; if match exists in `vocabulary_terms`, append `EntityData.name`
   (the original non-normalised name from the LLM) as an alias if not already present in the
   `aliases` array (UR-094); if match in `rejected_terms`, suppress
5. For each entity (whether new or matched): insert `entity_document_occurrences` row
6. For each relationship: resolve source and target entity names to `vocabulary_terms` IDs
   via `normalised_term`; insert into `vocabulary_relationships` if not already present
7. Write flags to the document record if present

If any write fails, the entire transaction rolls back. Python receives a 500 and may retry
on the next processing trigger.

---

### Processing -- Express calls Python to process a document

**Contract ID**: PROC-003

**Endpoint**: `POST /process` (Python FastAPI endpoint)

**Caller**: Express backend (during a processing run)

**Request**:

```typescript
interface ProcessDocumentRequest {
  documentId: string;
  fileReference: string;         // storage-provider-specific locator; filesystem path in Phase 1
  incompleteSteps: string[];     // step names that need to run
  previousOutputs: {
    extractedText?: string;      // from prior step 1 if not re-running
    textPerPage?: string[];
    confidencePerPage?: number[];
    metadata?: {
      documentType: string | null;
      dates: string[];
      people: string[];
      organisations: string[];
      landReferences: string[];
      description: string | null;
    };
  } | null;
}
```

**Response**: The JSON response body matches the `ProcessingResultsRequest` schema defined in
PROC-002. Express deserialises the response and passes it directly to the same service-layer
logic as the PROC-002 handler. `ProcessingResultsRequest` is the schema definition for both
sides; Python serialises its dataclass output to this JSON shape.

**Error responses**:

- 401: Invalid or missing `x-internal-key` header
- 400: Invalid request body
- 500: Processing failure (Python-side exception)

**Migration required**: No (this is a Python endpoint)

**Notes**: Express sends the document file reference (filesystem path in Phase 1 via shared
Docker Compose volume mount -- ADR-031). Python reads the file directly from the shared
volume; no file bytes are sent over HTTP. `previousOutputs` contains data from previously
completed steps so Python can resume from `incompleteSteps[0]` without re-running earlier
steps. Express marks all `incompleteSteps` as `running` in `pipeline_steps` before making
this call.

This resolves Python plan C2-E1 (file delivery question): Python has read access to the
document storage area via a shared Docker Compose volume mount. Express sends the filesystem
path; Python reads the file. No binary transfer over HTTP.

---

### Query -- Vector search callback (Python to Express)

**Contract ID**: QUERY-001

**Endpoint**: `POST /api/search/vector`

**Caller**: Python `query/query_handler.py` via `shared/http_client.py`

**Request**:

```typescript
interface VectorSearchRequest {
  embedding: number[];           // query embedding, same dimension as document embeddings
  topK: number;                  // max results to return
}
```

**Response**:

```typescript
interface VectorSearchResponse {
  results: VectorSearchResult[];
}

interface VectorSearchResult {
  chunkId: string;
  documentId: string;
  text: string;
  chunkIndex: number;
  tokenCount: number;
  similarityScore: number;
  document: {
    description: string;
    date: string;
    documentType: string | null;
  };
}
```

**Error responses**:

- 400: Invalid embedding (wrong dimension, empty)
- 401: Invalid or missing `x-internal-key` header
- 500: Database query failure

**Migration required**: No (queries existing `chunks`, `embeddings`, and `documents` tables)

**Notes**: Express executes `VectorStore.search()` (ADR-033) with the provided embedding and
topK. The pgvector implementation performs a cosine similarity search using the IVFFlat index.
Document metadata fields (description, date, documentType) are joined from the `documents`
table so Python can assemble citations without a separate metadata lookup. No similarity
threshold is applied in Phase 1 -- all topK results are returned.

---

### Query -- Graph traversal callback (Phase 2 stub)

**Contract ID**: QUERY-002

**Endpoint**: `POST /api/search/graph`

**Caller**: Python `query/query_handler.py` (Phase 2 only; stubbed in Phase 1)

**Request**:

```typescript
interface GraphSearchRequest {
  entityNames: string[];         // entity names extracted from the query
  maxDepth: number;              // traversal depth (1-3 hops typical)
  relationshipTypes?: string[];  // optional filter
}
```

**Response**:

```typescript
interface GraphSearchResponse {
  entities: Array<{
    entityId: string;
    term: string;
    category: string;
    relatedDocumentIds: string[];
  }>;
  relationships: Array<{
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: string;
  }>;
}
```

**Error responses**:

- 400: Empty entity names list
- 401: Invalid or missing `x-internal-key` header
- 500: Database query failure

**Migration required**: No (the endpoint exists; the GraphStore implementation is Phase 1
code, but the endpoint is not called in Phase 1 production)

**Notes**: Express executes `GraphStore.traverse()` and `GraphStore.findDocumentsByEntity()`
(ADR-037). In Phase 1, the `PassthroughQueryRouter` always returns `vector`, so this endpoint
is never called. It is defined here so the Python stub method and Express route can be
implemented and tested together. The Express route and GraphStore PostgreSQL implementation
are written in Phase 1 (ADR-041); they are simply not called by the production query path
until Phase 2 introduces the LLM query classifier.

---

### Query -- Python query endpoint (external callers)

**Contract ID**: QUERY-003

**Endpoint**: `POST /query` (Python FastAPI endpoint)

**Caller**: Next.js custom server (Phase 2 web UI query) or CLI (Phase 1)

**Request**:

```typescript
interface QueryRequest {
  queryText: string;
}
```

**Response**:

```typescript
interface QueryResponse {
  responseText: string;
  citations: Citation[];
  noResults: boolean;            // true when no relevant documents found (UR-099)
}

interface Citation {
  chunkId: string;
  documentId: string;
  documentDescription: string;
  documentDate: string;
  // archive reference is derived by the caller (CLI or frontend)
  // using the packages/shared/ TypeScript utility or equivalent
}
```

**Error responses**:

- 401: Invalid or missing `x-internal-key` header
- 400: Empty query text
- 503: LLM service unavailable
- 500: Internal processing error

**Migration required**: No (Python endpoint)

**Notes**: This is the C3 entry point. The CLI and Next.js custom server (Phase 2) call this
directly. Python runs the full query pipeline (QueryRouter, query understanding, vector
search callback to Express, context assembly, response synthesis) and returns the complete
response. The caller derives the archive reference from `documentDescription` and
`documentDate` using the derivation rule from ADR-023.

---

### Ingestion -- Create ingestion run

**Contract ID**: ING-001

**Endpoint**: `POST /api/ingestion/runs`

**Caller**: CLI (bulk ingestion command)

**Request**:

```typescript
interface CreateIngestionRunRequest {
  sourceDirectory: string;   // absolute path of the directory being ingested
  grouped: boolean;          // true if files represent pages of virtual documents (ADR-020)
}
```

**Response**:

```typescript
interface CreateIngestionRunResponse {
  runId: string;             // UUID v7 — passed back to all subsequent DOC-001 calls
  status: 'in_progress';
}
```

**Error responses**:

- 400: Missing or empty sourceDirectory
- 401: Invalid or missing `x-internal-key` header
- 409: An ingestion run is already in progress

**Migration required**: Yes -- see migration `006_create_ingestion_runs`

**Notes**: The CLI calls this once before beginning a bulk session. The returned `runId` is
passed as context on each individual document upload (DOC-001 through DOC-003) so documents
are tagged with their `ingestion_run_id`. Express enforces a single active ingestion run at a
time (ADR-018). The startup sweep (ADR-018) detects incomplete prior runs by checking for
`in_progress` or `moving` runs at Express startup.

---

### Ingestion -- Complete ingestion run

**Contract ID**: ING-002

**Endpoint**: `POST /api/ingestion/runs/:runId/complete`

**Caller**: CLI (bulk ingestion command, after all documents submitted)

**Request**: No body.

**Response**:

```typescript
interface CompleteIngestionRunResponse {
  runId: string;
  status: 'completed';
  totalSubmitted: number;
  totalAccepted: number;
  totalRejected: number;
}
```

**Error responses**:

- 401: Invalid or missing `x-internal-key` header
- 404: runId not found
- 409: Run is not in `in_progress` status

**Migration required**: No (uses `ingestion_runs` table from migration 006)

**Notes**: The CLI calls this once all documents have been submitted. Express updates the run
status to `completed` and sets `completed_at`. The counts reflect the totals accumulated
during the run. Documents tagged with this `runId` remain in whatever processing state they
are in -- completion of the ingestion run does not trigger processing.

---

### Admin -- Rebuild embedding index

**Contract ID**: ADMIN-001

**Endpoint**: `POST /api/admin/reindex-embeddings`

**Caller**: CLI or developer tooling (not called by the web UI)

**Request**: No body.

**Response**:

```typescript
interface ReindexEmbeddingsResponse {
  reindexed: boolean;
}
```

**Error responses**:

- 401: Invalid or missing `x-internal-key` header
- 500: REINDEX failed

**Migration required**: No

**Notes**: Runs `REINDEX INDEX` on the IVFFlat embedding index. Should be called after the
initial data load and after any development database rebuild. Not intended for regular
production use. The endpoint is authenticated with the same shared-key auth as all other
internal endpoints (ADR-044).

---

## Flagged issues

No blocking issues found. Both plans are compliant with ADR-031 (Express sole writer),
ADR-044 (shared-key auth), and ADR-033/ADR-037 (VectorStore/GraphStore in Express).

---

## Outstanding reviews

None. Both Senior Developer plans have been reviewed.

---

## Migration outlines

### Migration 001: create_documents

**File**: `20260303000001_create_documents.ts`

**Creates**:

- Table `documents`:
  - `id` UUID v7 primary key
  - `status` text not null (enum: initiated, uploaded, stored, finalized)
  - `filename` text not null
  - `content_type` text not null
  - `file_size_bytes` integer not null
  - `file_hash` text unique (MD5 hash; null until upload step computes it)
  - `storage_path` text (null until file reaches permanent storage)
  - `date` text (YYYY-MM-DD or null for undated)
  - `description` text not null
  - `document_type` text (null until detected by processing)
  - `people` text[] default '{}'
  - `organisations` text[] default '{}'
  - `land_references` text[] default '{}'
  - `flag_reason` text (null when no flag)
  - `flagged_at` timestamptz (null when no flag)
  - `submitter_identity` text not null default 'Primary Archivist'
  - `pipeline_version` integer not null default 1
  - `created_at` timestamptz not null default now()
  - `updated_at` timestamptz not null default now()
- Index on `file_hash` (unique, partial: WHERE file_hash IS NOT NULL)
- Index on `status`
- Index on `flagged_at` (for curation queue ordering)

**Notes**: The `file_hash` unique constraint is partial (only non-null values) because the
hash is not known at the `initiated` stage. The `pipeline_version` column supports future
enrichment reprocessing (ADR-027).

### Migration 002: create_vocabulary

**File**: `20260303000002_create_vocabulary.ts`

**Creates**:

- Table `vocabulary_terms`:
  - `id` UUID v7 primary key
  - `term` text not null
  - `category` text not null
  - `description` text
  - `aliases` text[] default '{}'
  - `normalised_term` text not null generated always as
    (lower(regexp_replace(term, '[^a-zA-Z0-9\\s]', '', 'g'))) stored
  - `source` text not null (enum: seed, manual, candidate_accepted, llm_extracted)
  - `confidence` float (nullable; null for seed/manual terms)
  - `created_at` timestamptz not null default now()
  - `updated_at` timestamptz not null default now()
- Unique index on `normalised_term`
- Index on `source` (for filtering by review status)
- Index on `category`

- Table `vocabulary_relationships`:
  - `id` UUID v7 primary key
  - `source_term_id` UUID not null references vocabulary_terms(id) on delete cascade
  - `target_term_id` UUID not null references vocabulary_terms(id) on delete cascade
  - `relationship_type` text not null
  - `confidence` float (nullable; from LLM extraction)
  - `created_at` timestamptz not null default now()
- Unique index on (source_term_id, target_term_id, relationship_type)

- Table `rejected_terms`:
  - `id` UUID v7 primary key
  - `normalised_term` text not null unique
  - `original_term` text not null
  - `rejected_at` timestamptz not null default now()

- Table `entity_document_occurrences`:
  - `entity_id` UUID not null references vocabulary_terms(id) on delete cascade
  - `document_id` UUID not null references documents(id) on delete cascade
  - `created_at` timestamptz not null default now()
- Primary key on (entity_id, document_id)
- Index on `document_id` (for reverse lookups)

**Notes**: The `normalised_term` generated column and unique index enforce deduplication
(UR-093). The `entity_document_occurrences` composite primary key prevents duplicate
entity-document links. Cascade deletes on foreign keys ensure referential integrity when
terms are rejected. `confidence` on `vocabulary_relationships` is added because LLM-extracted
relationships have confidence scores (ADR-038).

### Migration 003: create_processing_runs

**File**: `20260303000003_create_processing_runs.ts`

**Creates**:

- Table `processing_runs`:
  - `id` UUID v7 primary key
  - `status` text not null (enum: in_progress, completed, failed)
  - `documents_queued` integer not null default 0
  - `documents_completed` integer not null default 0
  - `documents_failed` integer not null default 0
  - `started_at` timestamptz not null default now()
  - `completed_at` timestamptz

**Notes**: Tracks processing trigger runs (ADR-026). The run record is updated as documents
complete processing.

### Migration 004: create_chunks_and_embeddings

**File**: `20260303000004_create_chunks_and_embeddings.ts`

**Creates**:

- Table `chunks`:
  - `id` UUID v7 primary key
  - `document_id` UUID not null references documents(id) on delete cascade
  - `chunk_index` integer not null
  - `text` text not null
  - `token_count` integer not null
  - `created_at` timestamptz not null default now()
- Unique index on (document_id, chunk_index)
- Index on `document_id`

- Table `embeddings`:
  - `id` UUID v7 primary key
  - `chunk_id` UUID not null references chunks(id) on delete cascade unique
  - `document_id` UUID not null references documents(id) on delete cascade
  - `embedding` vector(N) not null (N is config-driven per ADR-024)
  - `created_at` timestamptz not null default now()
- IVFFlat index on `embedding` using vector_cosine_ops (for similarity search)
- Index on `document_id`

**Notes**: The vector dimension is hardcoded in this migration (e.g. 768 for nomic-embed-text).
This value must match the `embedding.dimension` config value used by the Python embedding
service. If the embedding model is changed, a new migration is required to alter the column.
The IVFFlat index is created in the migration but will be built on an empty table; it should
be rebuilt via `REINDEX` once data exists for optimal performance. The `POST
/api/admin/reindex-embeddings` endpoint (ADMIN-001) supports this — it should be called after
the initial data load and after any development database rebuild. `nlist` tuning is deferred
to Phase 2. The `VectorStore.write()` method inserts into both `chunks` and `embeddings`. The
`VectorStore.search()` method queries `embeddings` with a cosine similarity operator and joins
to `chunks` and `documents`.

### Migration 005: create_pipeline_steps

**File**: `20260303000005_create_pipeline_steps.ts`

**Creates**:

- Table `pipeline_steps`:
  - `id` UUID v7 primary key
  - `document_id` UUID not null references documents(id) on delete cascade
  - `step_name` text not null (enum: text_extraction, text_quality_scoring,
    pattern_metadata_extraction, metadata_completeness_scoring, llm_combined_pass,
    embedding_generation)
  - `status` text not null default 'pending' (enum: pending, running, completed, failed)
  - `attempt_count` integer not null default 0
  - `error_message` text
  - `started_at` timestamptz
  - `completed_at` timestamptz
  - `created_at` timestamptz not null default now()
- Unique index on (document_id, step_name)
- Index on `status` (for querying incomplete steps)
- Index on (status, started_at) (for stale running step detection)

**Notes**: One row per document per step (ADR-027). The step_name enum matches the six
pipeline steps from ADR-038. Express creates all six rows at `pending` when a document enters
processing, marks them `running` before calling Python, and updates to `completed` or `failed`
on response.

### Migration 006: create_ingestion_runs

**File**: `20260303000006_create_ingestion_runs.ts`

**Creates**:

- Table `ingestion_runs`:
  - `id` UUID v7 primary key
  - `status` text not null (enum: in_progress, moving, completed)
  - `source_directory` text not null
  - `total_submitted` integer not null default 0
  - `total_accepted` integer not null default 0
  - `total_rejected` integer not null default 0
  - `started_at` timestamptz not null default now()
  - `completed_at` timestamptz

- Add column `ingestion_run_id` (UUID, nullable, references ingestion_runs(id)) to
  `documents` table

**Notes**: Tracks bulk ingestion runs (ADR-018). Documents created during a bulk run are
tagged with the `ingestion_run_id`. Web UI uploads have null `ingestion_run_id`. The run-start
sweep (ADR-018) uses the `status` column to identify incomplete prior runs.

---

## Schema summary

All tables created by the six migrations above:

| Table | Migration | Purpose |
| --- | --- | --- |
| `documents` | 001 | Document records with metadata, status, flags |
| `vocabulary_terms` | 002 | Vocabulary and graph entity storage (unified) |
| `vocabulary_relationships` | 002 | Term/entity relationships |
| `rejected_terms` | 002 | Rejected vocabulary candidates |
| `entity_document_occurrences` | 002 | Entity-to-document provenance links |
| `processing_runs` | 003 | Processing trigger run tracking |
| `chunks` | 004 | Document chunk text storage |
| `embeddings` | 004 | Chunk embedding vectors (pgvector) |
| `pipeline_steps` | 005 | Per-document per-step pipeline tracking |
| `ingestion_runs` | 006 | Bulk ingestion run tracking |

All tables use UUID v7 primary keys (ADR-022). All timestamp columns use `timestamptz`.
