/**
 * Zod schemas for search/query-related API contracts.
 *
 * Covers QUERY-001 and QUERY-002 as defined in integration-lead-contracts.md.
 * Schemas will be completed when Task 13 (search handlers) is implemented.
 * QUERY-001 is the vector search callback (Python to Express).
 * QUERY-002 is the graph traversal callback (Phase 2 stub).
 */

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// QUERY-001: Vector search callback (Python to Express)
// ---------------------------------------------------------------------------

export const VectorSearchRequest = z
  .object({
    embedding: z.array(z.number()).min(1),
    topK: z.number().int().positive(),
  })
  .openapi('VectorSearchRequest');

export type VectorSearchRequest = z.infer<typeof VectorSearchRequest>;

export const VectorSearchResultDocument = z.object({
  description: z.string(),
  date: z.string().nullable(),
  documentType: z.string().nullable(),
});

export type VectorSearchResultDocument = z.infer<
  typeof VectorSearchResultDocument
>;

export const VectorSearchResult = z.object({
  chunkId: z.uuid(),
  documentId: z.uuid(),
  text: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  tokenCount: z.number().int().positive(),
  similarityScore: z.number(),
  document: VectorSearchResultDocument,
});

export type VectorSearchResult = z.infer<typeof VectorSearchResult>;

export const VectorSearchResponse = z
  .object({
    results: z.array(VectorSearchResult),
  })
  .openapi('VectorSearchResponse');

export type VectorSearchResponse = z.infer<typeof VectorSearchResponse>;

// ---------------------------------------------------------------------------
// QUERY-002: Graph traversal callback (Phase 2 stub)
// ---------------------------------------------------------------------------

export const GraphSearchRequest = z
  .object({
    entityNames: z.array(z.string()).min(1),
    maxDepth: z.number().int().min(1),
    relationshipTypes: z.array(z.string()).optional(),
  })
  .openapi('GraphSearchRequest');

export type GraphSearchRequest = z.infer<typeof GraphSearchRequest>;

export const GraphSearchEntity = z.object({
  entityId: z.uuid(),
  term: z.string(),
  category: z.string(),
  relatedDocumentIds: z.array(z.uuid()),
});

export type GraphSearchEntity = z.infer<typeof GraphSearchEntity>;

export const GraphSearchRelationship = z.object({
  sourceEntityId: z.uuid(),
  targetEntityId: z.uuid(),
  relationshipType: z.string(),
});

export type GraphSearchRelationship = z.infer<typeof GraphSearchRelationship>;

export const GraphSearchResponse = z
  .object({
    entities: z.array(GraphSearchEntity),
    relationships: z.array(GraphSearchRelationship),
  })
  .openapi('GraphSearchResponse');

export type GraphSearchResponse = z.infer<typeof GraphSearchResponse>;
