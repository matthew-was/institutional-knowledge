/**
 * Curation request functions — Ky calls to the Express backend.
 *
 * Each function is a thin wrapper: URL construction, HTTP call, and response
 * parsing only. No framework imports; no business logic.
 *
 * Paths must not start with '/' — Ky prefixUrl constraint.
 *
 * Covers DOC-006 through DOC-009 and VOC-001 through VOC-004 as defined in
 * integration-lead-contracts.md.
 */

import type {
  AcceptCandidateResponse,
  AddVocabularyTermRequest,
  AddVocabularyTermResponse,
  ClearFlagResponse,
  DocumentDetailResponse,
  DocumentQueueParams,
  DocumentQueueResponse,
  RejectCandidateResponse,
  UpdateDocumentMetadataRequest,
  UpdateDocumentMetadataResponse,
  VocabularyQueueParams,
  VocabularyQueueResponse,
} from '@institutional-knowledge/shared';
import type { KyInstance } from 'ky';

export interface CurationRequests {
  /**
   * DOC-006: Fetch the document curation queue.
   * GET api/curation/documents
   */
  fetchDocumentQueue(
    params?: DocumentQueueParams,
  ): Promise<DocumentQueueResponse>;

  /**
   * DOC-007: Fetch document detail.
   * GET api/documents/:id
   */
  fetchDocumentDetail(documentId: string): Promise<DocumentDetailResponse>;

  /**
   * DOC-008: Clear the review flag on a document.
   * POST api/documents/:id/clear-flag
   */
  clearDocumentFlag(documentId: string): Promise<ClearFlagResponse>;

  /**
   * DOC-009: Update document metadata.
   * PATCH api/documents/:id/metadata
   */
  updateDocumentMetadata(
    documentId: string,
    patch: UpdateDocumentMetadataRequest,
  ): Promise<UpdateDocumentMetadataResponse>;

  /**
   * VOC-001: Fetch the vocabulary review queue.
   * GET api/curation/vocabulary
   */
  fetchVocabulary(
    params?: VocabularyQueueParams,
  ): Promise<VocabularyQueueResponse>;

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

export function createCurationRequests(http: KyInstance): CurationRequests {
  return {
    async fetchDocumentQueue(
      params?: DocumentQueueParams,
    ): Promise<DocumentQueueResponse> {
      return http
        .get('api/curation/documents', {
          searchParams: params as Record<string, string | number | boolean>,
        })
        .json<DocumentQueueResponse>();
    },

    async fetchDocumentDetail(
      documentId: string,
    ): Promise<DocumentDetailResponse> {
      return http
        .get(`api/documents/${documentId}`)
        .json<DocumentDetailResponse>();
    },

    async clearDocumentFlag(documentId: string): Promise<ClearFlagResponse> {
      return http
        .post(`api/documents/${documentId}/clear-flag`)
        .json<ClearFlagResponse>();
    },

    async updateDocumentMetadata(
      documentId: string,
      patch: UpdateDocumentMetadataRequest,
    ): Promise<UpdateDocumentMetadataResponse> {
      return http
        .patch(`api/documents/${documentId}/metadata`, { json: patch })
        .json<UpdateDocumentMetadataResponse>();
    },

    async fetchVocabulary(
      params?: VocabularyQueueParams,
    ): Promise<VocabularyQueueResponse> {
      return http
        .get('api/curation/vocabulary', {
          searchParams: params as Record<string, string | number | boolean>,
        })
        .json<VocabularyQueueResponse>();
    },

    async acceptTerm(termId: string): Promise<AcceptCandidateResponse> {
      return http
        .post(`api/curation/vocabulary/${termId}/accept`)
        .json<AcceptCandidateResponse>();
    },

    async rejectTerm(termId: string): Promise<RejectCandidateResponse> {
      return http
        .post(`api/curation/vocabulary/${termId}/reject`)
        .json<RejectCandidateResponse>();
    },

    async addTerm(
      body: AddVocabularyTermRequest,
    ): Promise<AddVocabularyTermResponse> {
      return http
        .post('api/curation/vocabulary/terms', { json: body })
        .json<AddVocabularyTermResponse>();
    },
  };
}
