/**
 * Zod schemas for processing-related API contracts.
 *
 * Covers PROC-001 and PROC-002 as defined in integration-lead-contracts.md.
 * Schemas will be completed when Tasks 11–12 (processing handlers) are implemented.
 */

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// PROC-001: Trigger processing run
// ---------------------------------------------------------------------------

export const TriggerProcessingRequest = z
  .object({})
  .openapi('TriggerProcessingRequest');

export type TriggerProcessingRequest = z.infer<typeof TriggerProcessingRequest>;

export const TriggerProcessingResponse = z
  .object({
    runId: z.uuid(),
    documentsQueued: z.number().int().nonnegative(),
  })
  .openapi('TriggerProcessingResponse');

export type TriggerProcessingResponse = z.infer<
  typeof TriggerProcessingResponse
>;

// ---------------------------------------------------------------------------
// PROC-002: Submit processing results (Python to Express)
// ---------------------------------------------------------------------------

export const StepResult = z.object({
  status: z.enum(['completed', 'failed']),
  errorMessage: z.string().nullable(),
});

export type StepResult = z.infer<typeof StepResult>;

export const DocumentFlag = z.object({
  type: z.string().min(1),
  reason: z.string().min(1),
});

export type DocumentFlag = z.infer<typeof DocumentFlag>;

export const ChunkData = z.object({
  chunkIndex: z.number().int().nonnegative(),
  text: z.string().min(1),
  tokenCount: z.number().int().positive(),
  embedding: z.array(z.number()),
});

export type ChunkData = z.infer<typeof ChunkData>;

export const EntityData = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  confidence: z.number().min(0).max(1),
  normalisedName: z.string().min(1),
});

export type EntityData = z.infer<typeof EntityData>;

export const RelationshipData = z.object({
  sourceEntityName: z.string().min(1),
  targetEntityName: z.string().min(1),
  relationshipType: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export type RelationshipData = z.infer<typeof RelationshipData>;

export const ProcessingMetadata = z.object({
  documentType: z.string().nullable(),
  dates: z.array(z.string()),
  people: z.array(z.string()),
  organisations: z.array(z.string()),
  landReferences: z.array(z.string()),
  description: z.string().nullable(),
});

export type ProcessingMetadata = z.infer<typeof ProcessingMetadata>;

export const ProcessingResultsRequest = z
  .object({
    documentId: z.uuid(),
    stepResults: z.record(z.string(), StepResult),
    flags: z.array(DocumentFlag),
    metadata: ProcessingMetadata.nullable(),
    chunks: z.array(ChunkData).nullable(),
    entities: z.array(EntityData).nullable(),
    relationships: z.array(RelationshipData).nullable(),
  })
  .openapi('ProcessingResultsRequest');

export type ProcessingResultsRequest = z.infer<typeof ProcessingResultsRequest>;

export const ProcessingResultsResponse = z
  .object({
    documentId: z.uuid(),
    accepted: z.boolean(),
  })
  .openapi('ProcessingResultsResponse');

export type ProcessingResultsResponse = z.infer<
  typeof ProcessingResultsResponse
>;
