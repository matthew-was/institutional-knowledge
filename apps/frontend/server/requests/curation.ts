/**
 * Curation request functions — Ky calls to the Express backend.
 *
 * Each function is a thin wrapper: URL construction, HTTP call, and response
 * parsing only. No framework imports; no business logic.
 *
 * Paths must not start with '/' — Ky prefixUrl constraint.
 *
 * Covers DOC-006 and VOC-001 through VOC-004 as defined in
 * integration-lead-contracts.md.
 */

import type {
  AcceptCandidateResponse,
  AddVocabularyTermRequest,
  AddVocabularyTermResponse,
  DocumentQueueResponse,
  RejectCandidateResponse,
  VocabularyQueueResponse,
} from '@institutional-knowledge/shared';
import type { KyInstance } from 'ky';

export interface CurationRequests {
  /**
   * DOC-006: Fetch the document curation queue.
   * GET api/curation/documents
   */
  fetchQueue(params?: {
    cursor?: string;
    limit?: number;
  }): Promise<DocumentQueueResponse>;

  /**
   * VOC-001: Fetch the vocabulary review queue.
   * GET api/curation/vocabulary
   */
  fetchVocabulary(params?: {
    cursor?: string;
    limit?: number;
  }): Promise<VocabularyQueueResponse>;

  /**
   * VOC-002: Accept a vocabulary candidate.
   * POST api/curation/vocabulary/:termId/accept
   */
  acceptTerm(termId: string): Promise<AcceptCandidateResponse>;

  /**
   * VOC-003: Reject a vocabulary candidate.
   * POST api/curation/vocabulary/:termId/reject
   */
  rejectTerm(termId: string): Promise<RejectCandidateResponse>;

  /**
   * VOC-004: Add a manual vocabulary term.
   * POST api/curation/vocabulary/terms
   */
  addTerm(body: AddVocabularyTermRequest): Promise<AddVocabularyTermResponse>;
}

export function createCurationRequests(_http: KyInstance): CurationRequests {
  return {
    fetchQueue(_params?: {
      cursor?: string;
      limit?: number;
    }): Promise<DocumentQueueResponse> {
      throw new Error('not_implemented');
    },

    fetchVocabulary(_params?: {
      cursor?: string;
      limit?: number;
    }): Promise<VocabularyQueueResponse> {
      throw new Error('not_implemented');
    },

    acceptTerm(_termId: string): Promise<AcceptCandidateResponse> {
      throw new Error('not_implemented');
    },

    rejectTerm(_termId: string): Promise<RejectCandidateResponse> {
      throw new Error('not_implemented');
    },

    addTerm(
      _body: AddVocabularyTermRequest,
    ): Promise<AddVocabularyTermResponse> {
      throw new Error('not_implemented');
    },
  };
}
