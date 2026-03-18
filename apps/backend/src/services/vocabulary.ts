/**
 * VocabularyService — vocabulary curation handlers (VOC-001, VOC-002, VOC-003, VOC-004).
 *
 * Implements the service layer for the vocabulary curation workflow. Each method
 * returns ServiceResult<T, K> — the route layer owns all HTTP concerns.
 * No Express imports here.
 *
 * normaliseTermText (from utils/normalise.ts) is the canonical normalisation
 * function per ADR-028. It must be used here to guarantee that deduplication
 * lookups against vocabulary_terms.normalised_term always produce consistent values.
 */

import type { ServiceResult } from '@institutional-knowledge/shared';
import type {
  AcceptCandidateResponse,
  AddVocabularyTermRequest,
  AddVocabularyTermResponse,
  RejectCandidateResponse,
  VocabularyQueueResponse,
} from '@institutional-knowledge/shared/schemas/vocabulary';
import { v7 as uuidv7 } from 'uuid';
import type { DbInstance } from '../db/index.js';
import type { Logger } from '../middleware/logger.js';
import { normaliseTermText } from '../utils/normalise.js';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type VocabularyErrorType =
  | 'not_found'
  | 'wrong_source'
  | 'duplicate_term'
  | 'target_not_found';

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface VocabularyService {
  getVocabularyQueue(
    page: number,
    pageSize: number,
  ): Promise<ServiceResult<VocabularyQueueResponse, VocabularyErrorType>>;
  acceptCandidate(
    termId: string,
  ): Promise<ServiceResult<AcceptCandidateResponse, VocabularyErrorType>>;
  rejectCandidate(
    termId: string,
  ): Promise<ServiceResult<RejectCandidateResponse, VocabularyErrorType>>;
  addManualTerm(
    body: AddVocabularyTermRequest,
  ): Promise<ServiceResult<AddVocabularyTermResponse, VocabularyErrorType>>;
}

export interface VocabularyServiceDeps {
  db: DbInstance;
  log: Logger;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createVocabularyService(
  deps: VocabularyServiceDeps,
): VocabularyService {
  const { db, log } = deps;

  async function getVocabularyQueue(
    page: number,
    pageSize: number,
  ): Promise<ServiceResult<VocabularyQueueResponse, VocabularyErrorType>> {
    const { rows, total } = await db.graph.getFlaggedVocabTerms(page, pageSize);

    log.debug({ page, pageSize, total }, 'Vocabulary queue fetched');

    return {
      outcome: 'success',
      data: { candidates: rows, total, page, pageSize },
    };
  }

  async function acceptCandidate(
    termId: string,
  ): Promise<ServiceResult<AcceptCandidateResponse, VocabularyErrorType>> {
    const term = await db.graph.findVocabTermById(termId);
    if (term === undefined) {
      return {
        outcome: 'error',
        errorType: 'not_found',
        errorMessage: `Vocabulary term ${termId} not found`,
      };
    }
    if (term.source !== 'llm_extracted') {
      return {
        outcome: 'error',
        errorType: 'wrong_source',
        errorMessage: `Term ${termId} has source '${term.source}', expected 'llm_extracted'`,
      };
    }

    await db.graph.updateTermSource(termId, 'candidate_accepted');
    log.info({ termId }, 'Vocabulary term accepted');

    return {
      outcome: 'success',
      data: { termId, term: term.term, source: 'candidate_accepted' },
    };
  }

  async function rejectCandidate(
    termId: string,
  ): Promise<ServiceResult<RejectCandidateResponse, VocabularyErrorType>> {
    const term = await db.graph.findVocabTermById(termId);
    if (term === undefined) {
      return {
        outcome: 'error',
        errorType: 'not_found',
        errorMessage: `Vocabulary term ${termId} not found`,
      };
    }
    if (term.source !== 'llm_extracted') {
      return {
        outcome: 'error',
        errorType: 'wrong_source',
        errorMessage: `Term ${termId} has source '${term.source}', expected 'llm_extracted'`,
      };
    }

    await db.graph.rejectTerm(termId, {
      id: uuidv7(),
      normalisedTerm: term.normalisedTerm,
      originalTerm: term.term,
      rejectedAt: new Date(),
    });

    log.info({ termId }, 'Vocabulary term rejected');

    return {
      outcome: 'success',
      data: { termId, rejected: true },
    };
  }

  async function addManualTerm(
    body: AddVocabularyTermRequest,
  ): Promise<ServiceResult<AddVocabularyTermResponse, VocabularyErrorType>> {
    const normalisedTerm = normaliseTermText(body.term);

    const inVocabulary =
      await db.graph.findNormalisedTermInVocabulary(normalisedTerm);
    if (inVocabulary) {
      return {
        outcome: 'error',
        errorType: 'duplicate_term',
        errorMessage: `A term with normalised form '${normalisedTerm}' already exists in the vocabulary`,
      };
    }

    const inRejected =
      await db.graph.findNormalisedTermInRejected(normalisedTerm);
    if (inRejected) {
      return {
        outcome: 'error',
        errorType: 'duplicate_term',
        errorMessage: `A term with normalised form '${normalisedTerm}' was previously rejected`,
      };
    }

    if (body.relationships && body.relationships.length > 0) {
      const targetIds = body.relationships.map((r) => r.targetTermId);
      const existingIds = await db.graph.termIdsExist(targetIds);
      const missingIds = targetIds.filter((id) => !existingIds.includes(id));
      if (missingIds.length > 0) {
        return {
          outcome: 'error',
          errorType: 'target_not_found',
          errorMessage: `Target term(s) not found: ${missingIds.join(', ')}`,
        };
      }
    }

    const newTermId = uuidv7();

    const relationshipRows = (body.relationships ?? []).map((r) => ({
      id: uuidv7(),
      sourceTermId: newTermId,
      targetTermId: r.targetTermId,
      relationshipType: r.relationshipType,
      confidence: null,
    }));

    await db.graph.addTermWithRelationships(
      {
        id: newTermId,
        term: body.term,
        normalisedTerm,
        category: body.category,
        description: body.description ?? null,
        aliases: body.aliases ?? [],
        source: 'manual',
        confidence: null,
      },
      relationshipRows,
    );

    log.info({ termId: newTermId }, 'Manual vocabulary term added');

    return {
      outcome: 'success',
      data: {
        termId: newTermId,
        term: body.term,
        category: body.category,
        source: 'manual',
        normalisedTerm,
      },
    };
  }

  return {
    getVocabularyQueue,
    acceptCandidate,
    rejectCandidate,
    addManualTerm,
  };
}
