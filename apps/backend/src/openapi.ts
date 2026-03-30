/**
 * OpenAPI specification generator.
 *
 * Imports all schemas from packages/shared/src/schemas/ and produces an
 * OpenAPI 3.0 document via @asteasolutions/zod-to-openapi. The spec is
 * served at GET /openapi.json (unauthenticated, same pattern as /api/health
 * per ADR-044 and ADR-048).
 *
 * Routes are registered here as stubs for all contracts (DOC-001 to
 * ADMIN-001). As handlers are added in Tasks 8–19, the corresponding
 * registry entries below already describe the intended shapes, so the
 * spec is always current.
 *
 * Each schema module calls extendZodWithOpenApi(z) at its own module level.
 * ESM static imports are fully evaluated before any code in this module runs,
 * so extendZodWithOpenApi is already active by the time the registerPath calls
 * below execute.
 *
 * The spec is generated once at module load time and cached. Subsequent calls
 * to generateOpenApiSpec() return the cached object.
 */

import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import {
  // Vocabulary
  AcceptCandidateResponse,
  // Ingestion
  AddFileToRunResponse,
  AddVocabularyTermRequest,
  AddVocabularyTermResponse,
  // Documents
  CleanupResponse,
  CleanupRunResponse,
  ClearFlagResponse,
  CompleteIngestionRunResponse,
  CreateIngestionRunRequest,
  CreateIngestionRunResponse,
  DocumentDetailResponse,
  DocumentQueueParams,
  DocumentQueueResponse,
  DuplicateConflictResponse,
  FinalizeUploadResponse,
  // Search
  GraphSearchRequest,
  GraphSearchResponse,
  // Admin
  HealthCheckResponse,
  InitiateUploadRequest,
  InitiateUploadResponse,
  // Processing
  ProcessingResultsRequest,
  ProcessingResultsResponse,
  ReindexEmbeddingsResponse,
  RejectCandidateResponse,
  TriggerProcessingResponse,
  UpdateDocumentMetadataRequest,
  UpdateDocumentMetadataResponse,
  UploadFileResponse,
  VectorSearchRequest,
  VectorSearchResponse,
  VocabularyQueueParams,
  VocabularyQueueResponse,
} from '@institutional-knowledge/shared/schemas';
import { z } from 'zod';

const registry = new OpenAPIRegistry();

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/health',
  summary: 'Health check',
  responses: {
    200: {
      description: 'Service is healthy',
      content: { 'application/json': { schema: HealthCheckResponse } },
    },
  },
});

// ---------------------------------------------------------------------------
// DOC-001: Initiate upload
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/documents/initiate',
  summary: 'Initiate a document upload (DOC-001)',
  request: {
    body: {
      content: { 'application/json': { schema: InitiateUploadRequest } },
    },
  },
  responses: {
    200: {
      description: 'Upload initiated',
      content: { 'application/json': { schema: InitiateUploadResponse } },
    },
    400: {
      description:
        'Invalid request body (missing fields, empty description, invalid date format)',
    },
    422: {
      description: 'Unsupported file extension or file size exceeds limit',
    },
  },
});

// ---------------------------------------------------------------------------
// DOC-002: Upload file bytes
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/documents/{uploadId}/upload',
  summary: 'Upload file bytes for an initiated document (DOC-002)',
  request: {
    params: z.object({
      uploadId: z.uuid().openapi({ description: 'UUID v7 from DOC-001' }),
    }),
  },
  responses: {
    200: {
      description: 'File bytes received and hash computed',
      content: { 'application/json': { schema: UploadFileResponse } },
    },
    400: { description: 'No file in request body' },
    404: { description: 'uploadId not found or not in initiated status' },
    409: {
      description: 'Duplicate hash detected — file already exists',
      content: { 'application/json': { schema: DuplicateConflictResponse } },
    },
    413: { description: 'File exceeds size limit' },
  },
});

// ---------------------------------------------------------------------------
// DOC-003: Finalize upload
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/documents/{uploadId}/finalize',
  summary: 'Finalize a document upload (DOC-003)',
  request: {
    params: z.object({
      uploadId: z.uuid().openapi({ description: 'UUID v7 from DOC-001' }),
    }),
  },
  responses: {
    200: {
      description: 'Upload finalized',
      content: { 'application/json': { schema: FinalizeUploadResponse } },
    },
    404: { description: 'uploadId not found or not in uploaded status' },
  },
});

// ---------------------------------------------------------------------------
// DOC-005: Cleanup incomplete upload
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'delete',
  path: '/api/documents/{uploadId}',
  summary: 'Delete an incomplete upload (DOC-005)',
  request: {
    params: z.object({
      uploadId: z
        .uuid()
        .openapi({ description: 'UUID v7 of the upload to delete' }),
    }),
  },
  responses: {
    200: {
      description: 'Upload cleaned up',
      content: { 'application/json': { schema: CleanupResponse } },
    },
    404: { description: 'uploadId not found' },
    409: { description: 'Document is already finalized' },
  },
});

// ---------------------------------------------------------------------------
// DOC-006: Fetch document curation queue
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/curation/documents',
  summary: 'Fetch the document curation queue (DOC-006)',
  request: { query: DocumentQueueParams },
  responses: {
    200: {
      description: 'Document curation queue',
      content: { 'application/json': { schema: DocumentQueueResponse } },
    },
  },
});

// ---------------------------------------------------------------------------
// DOC-007: Fetch document detail
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/documents/{id}',
  summary: 'Fetch a document detail record (DOC-007)',
  request: {
    params: z.object({
      id: z.uuid().openapi({ description: 'UUID v7 document ID' }),
    }),
  },
  responses: {
    200: {
      description: 'Document detail',
      content: { 'application/json': { schema: DocumentDetailResponse } },
    },
    404: { description: 'Document not found' },
  },
});

// ---------------------------------------------------------------------------
// DOC-008: Clear a flag
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/documents/{id}/clear-flag',
  summary: 'Clear a curation flag on a document (DOC-008)',
  request: {
    params: z.object({
      id: z.uuid().openapi({ description: 'UUID v7 document ID' }),
    }),
  },
  responses: {
    200: {
      description: 'Flag cleared',
      content: { 'application/json': { schema: ClearFlagResponse } },
    },
    404: { description: 'Document not found' },
    409: { description: 'Document has no active flag' },
  },
});

// ---------------------------------------------------------------------------
// DOC-009: Update document metadata
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'patch',
  path: '/api/documents/{id}/metadata',
  summary: 'Update document metadata (DOC-009)',
  request: {
    params: z.object({
      id: z.uuid().openapi({ description: 'UUID v7 document ID' }),
    }),
    body: {
      content: {
        'application/json': { schema: UpdateDocumentMetadataRequest },
      },
    },
  },
  responses: {
    200: {
      description: 'Metadata updated',
      content: {
        'application/json': { schema: UpdateDocumentMetadataResponse },
      },
    },
    400: { description: 'Invalid field values' },
    404: { description: 'Document not found' },
  },
});

// ---------------------------------------------------------------------------
// VOC-001: Fetch vocabulary review queue
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/curation/vocabulary',
  summary: 'Fetch the vocabulary review queue (VOC-001)',
  request: { query: VocabularyQueueParams },
  responses: {
    200: {
      description: 'Vocabulary review queue',
      content: { 'application/json': { schema: VocabularyQueueResponse } },
    },
  },
});

// ---------------------------------------------------------------------------
// VOC-002: Accept a candidate
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/curation/vocabulary/{termId}/accept',
  summary: 'Accept a vocabulary candidate term (VOC-002)',
  request: {
    params: z.object({
      termId: z
        .uuid()
        .openapi({ description: 'UUID of the vocabulary candidate term' }),
    }),
  },
  responses: {
    200: {
      description: 'Candidate accepted',
      content: { 'application/json': { schema: AcceptCandidateResponse } },
    },
    404: { description: 'Term not found' },
  },
});

// ---------------------------------------------------------------------------
// VOC-003: Reject a candidate
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/curation/vocabulary/{termId}/reject',
  summary: 'Reject a vocabulary candidate term (VOC-003)',
  request: {
    params: z.object({
      termId: z
        .uuid()
        .openapi({ description: 'UUID of the vocabulary candidate term' }),
    }),
  },
  responses: {
    200: {
      description: 'Candidate rejected',
      content: { 'application/json': { schema: RejectCandidateResponse } },
    },
    404: { description: 'Term not found' },
  },
});

// ---------------------------------------------------------------------------
// VOC-004: Add a manual term
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/curation/vocabulary/terms',
  summary: 'Add a manual vocabulary term (VOC-004)',
  request: {
    body: {
      content: { 'application/json': { schema: AddVocabularyTermRequest } },
    },
  },
  responses: {
    201: {
      description: 'Term created',
      content: { 'application/json': { schema: AddVocabularyTermResponse } },
    },
    400: { description: 'Invalid request body' },
    409: { description: 'Term with this name already exists in this category' },
  },
});

// ---------------------------------------------------------------------------
// PROC-001: Trigger processing run
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/processing/trigger',
  summary: 'Trigger a processing run (PROC-001)',
  responses: {
    200: {
      description: 'Processing run started',
      content: { 'application/json': { schema: TriggerProcessingResponse } },
    },
  },
});

// ---------------------------------------------------------------------------
// PROC-002: Submit processing results (Python to Express)
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/processing/results',
  summary: 'Submit processing results from Python (PROC-002)',
  request: {
    body: {
      content: { 'application/json': { schema: ProcessingResultsRequest } },
    },
  },
  responses: {
    200: {
      description: 'Results accepted',
      content: {
        'application/json': { schema: ProcessingResultsResponse },
      },
    },
    400: { description: 'Invalid results payload' },
    404: { description: 'Document not found' },
  },
});

// ---------------------------------------------------------------------------
// QUERY-001: Vector search callback (Python to Express)
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/search/vector',
  summary: 'Vector similarity search callback (QUERY-001)',
  request: {
    body: {
      content: { 'application/json': { schema: VectorSearchRequest } },
    },
  },
  responses: {
    200: {
      description: 'Vector search results',
      content: { 'application/json': { schema: VectorSearchResponse } },
    },
    400: { description: 'Invalid search parameters' },
  },
});

// ---------------------------------------------------------------------------
// QUERY-002: Graph traversal callback
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/search/graph',
  summary: 'Graph traversal search callback (QUERY-002)',
  request: {
    body: {
      content: { 'application/json': { schema: GraphSearchRequest } },
    },
  },
  responses: {
    200: {
      description: 'Graph search results',
      content: { 'application/json': { schema: GraphSearchResponse } },
    },
    400: { description: 'Invalid search parameters' },
  },
});

// ---------------------------------------------------------------------------
// ING-001: Create ingestion run
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/ingestion/runs',
  summary: 'Create a CLI ingestion run (ING-001)',
  request: {
    body: {
      content: { 'application/json': { schema: CreateIngestionRunRequest } },
    },
  },
  responses: {
    201: {
      description: 'Ingestion run created',
      content: {
        'application/json': { schema: CreateIngestionRunResponse },
      },
    },
    400: { description: 'Invalid request body' },
  },
});

// ---------------------------------------------------------------------------
// ING-002: Complete ingestion run
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/ingestion/runs/{runId}/complete',
  summary: 'Complete a CLI ingestion run (ING-002)',
  request: {
    params: z.object({
      runId: z.uuid().openapi({ description: 'UUID of the ingestion run' }),
    }),
  },
  responses: {
    200: {
      description: 'Ingestion run completed',
      content: {
        'application/json': { schema: CompleteIngestionRunResponse },
      },
    },
    404: { description: 'Ingestion run not found' },
  },
});

// ---------------------------------------------------------------------------
// ING-003: Add file to ingestion run
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/ingestion/runs/{runId}/files',
  summary: 'Add a file to an ingestion run (ING-003)',
  request: {
    params: z.object({
      runId: z.uuid().openapi({ description: 'UUID of the ingestion run' }),
    }),
  },
  responses: {
    201: {
      description: 'File added to run',
      content: { 'application/json': { schema: AddFileToRunResponse } },
    },
    404: { description: 'Ingestion run not found' },
  },
});

// ---------------------------------------------------------------------------
// ING-004: Cleanup ingestion run
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'delete',
  path: '/api/ingestion/runs/{runId}',
  summary: 'Delete an incomplete ingestion run (ING-004)',
  request: {
    params: z.object({
      runId: z
        .uuid()
        .openapi({ description: 'UUID of the ingestion run to delete' }),
    }),
  },
  responses: {
    200: {
      description: 'Ingestion run deleted',
      content: { 'application/json': { schema: CleanupRunResponse } },
    },
    404: { description: 'Ingestion run not found' },
  },
});

// ---------------------------------------------------------------------------
// ADMIN-001: Rebuild embedding index
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/admin/reindex-embeddings',
  summary: 'Rebuild the IVFFlat embedding index (ADMIN-001)',
  responses: {
    200: {
      description: 'Index rebuilt',
      content: {
        'application/json': { schema: ReindexEmbeddingsResponse },
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Spec generator — cached at module load time
// ---------------------------------------------------------------------------

const generator = new OpenApiGeneratorV3(registry.definitions);
const cachedSpec = generator.generateDocument({
  openapi: '3.0.0',
  info: { title: 'Institutional Knowledge API', version: '1.0.0' },
  servers: [{ url: '/' }],
});

export function generateOpenApiSpec(): ReturnType<
  OpenApiGeneratorV3['generateDocument']
> {
  return cachedSpec;
}
