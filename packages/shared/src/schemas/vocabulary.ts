/**
 * Zod schemas for vocabulary-related API contracts.
 *
 * Covers VOC-001 through VOC-004 as defined in integration-lead-contracts.md.
 * Schemas will be completed when Task 10 (vocabulary handlers) is implemented.
 */

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// VOC-001: Fetch vocabulary review queue
// ---------------------------------------------------------------------------

export const VocabularyQueueParams = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().optional(),
  })
  .openapi('VocabularyQueueParams');

export type VocabularyQueueParams = z.infer<typeof VocabularyQueueParams>;

export const VocabularyCandidateItem = z
  .object({
    termId: z.uuid(),
    term: z.string(),
    category: z.string(),
    confidence: z.number().min(0).max(1).nullable(),
    description: z.string().nullable(),
    sourceDocumentDescription: z.string().nullable(),
    sourceDocumentDate: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('VocabularyCandidateItem');

export type VocabularyCandidateItem = z.infer<typeof VocabularyCandidateItem>;

export const VocabularyQueueResponse = z
  .object({
    candidates: z.array(VocabularyCandidateItem),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  })
  .openapi('VocabularyQueueResponse');

export type VocabularyQueueResponse = z.infer<typeof VocabularyQueueResponse>;

// ---------------------------------------------------------------------------
// VOC-002: Accept a candidate
// ---------------------------------------------------------------------------

export const AcceptCandidateResponse = z
  .object({
    termId: z.uuid(),
    term: z.string(),
    source: z.literal('candidate_accepted'),
  })
  .openapi('AcceptCandidateResponse');

export type AcceptCandidateResponse = z.infer<typeof AcceptCandidateResponse>;

// ---------------------------------------------------------------------------
// VOC-003: Reject a candidate
// ---------------------------------------------------------------------------

export const RejectCandidateResponse = z
  .object({
    termId: z.uuid(),
    rejected: z.boolean(),
  })
  .openapi('RejectCandidateResponse');

export type RejectCandidateResponse = z.infer<typeof RejectCandidateResponse>;

// ---------------------------------------------------------------------------
// VOC-004: Add a manual term
// ---------------------------------------------------------------------------

export const VocabularyRelationshipInput = z.object({
  targetTermId: z.uuid(),
  relationshipType: z.string().min(1),
});

export type VocabularyRelationshipInput = z.infer<
  typeof VocabularyRelationshipInput
>;

export const AddVocabularyTermRequest = z
  .object({
    term: z.string().min(1),
    category: z.string().min(1),
    description: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    relationships: z.array(VocabularyRelationshipInput).optional(),
  })
  .openapi('AddVocabularyTermRequest');

export type AddVocabularyTermRequest = z.infer<typeof AddVocabularyTermRequest>;

export const AddVocabularyTermResponse = z
  .object({
    termId: z.uuid(),
    term: z.string(),
    category: z.string(),
    source: z.literal('manual'),
    normalisedTerm: z.string(),
  })
  .openapi('AddVocabularyTermResponse');

export type AddVocabularyTermResponse = z.infer<
  typeof AddVocabularyTermResponse
>;
