/**
 * Curation request functions — Ky calls to the Express backend.
 *
 * Each function is a thin wrapper: URL construction, HTTP call, and response
 * parsing only. No framework imports; no business logic.
 *
 * Paths must not start with '/' — Ky prefixUrl constraint.
 *
 * The 5 error-capable methods (fetchDocumentDetail, clearDocumentFlag,
 * updateDocumentMetadata, acceptTerm, rejectTerm) return ServiceResult rather
 * than throwing, so the route layer can branch on outcome without try/catch.
 * 4xx errors are caught and returned as error branches; 5xx errors re-throw
 * so the route handler can log them and return 500.
 *
 * List endpoints (fetchDocumentQueue, fetchVocabulary) remain as plain throws —
 * there is no business-logic error variant for list operations.
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
  ServiceResult,
  UpdateDocumentMetadataRequest,
  UpdateDocumentMetadataResponse,
  VocabularyQueueParams,
  VocabularyQueueResponse,
} from '@institutional-knowledge/shared';
import { HTTPError, type KyInstance } from 'ky';

export type CurationErrorType =
  | 'not_found'
  | 'no_active_flag'
  | 'invalid_params'
  | 'invalid_state'
  | 'duplicate_term';

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
  fetchDocumentDetail(
    documentId: string,
  ): Promise<ServiceResult<DocumentDetailResponse, CurationErrorType>>;

  /**
   * DOC-008: Clear the review flag on a document.
   * POST api/documents/:id/clear-flag
   */
  clearDocumentFlag(
    documentId: string,
  ): Promise<ServiceResult<ClearFlagResponse, CurationErrorType>>;

  /**
   * DOC-009: Update document metadata.
   * PATCH api/documents/:id/metadata
   */
  updateDocumentMetadata(
    documentId: string,
    patch: UpdateDocumentMetadataRequest,
  ): Promise<ServiceResult<UpdateDocumentMetadataResponse, CurationErrorType>>;

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
  acceptTerm(
    termId: string,
  ): Promise<ServiceResult<AcceptCandidateResponse, CurationErrorType>>;

  /**
   * VOC-003: Reject a vocabulary candidate.
   * POST api/curation/vocabulary/:termId/reject
   */
  rejectTerm(
    termId: string,
  ): Promise<ServiceResult<RejectCandidateResponse, CurationErrorType>>;

  /**
   * VOC-004: Add a manual vocabulary term.
   * POST api/curation/vocabulary/terms
   */
  addTerm(
    body: AddVocabularyTermRequest,
  ): Promise<ServiceResult<AddVocabularyTermResponse, CurationErrorType>>;
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
    ): Promise<ServiceResult<DocumentDetailResponse, CurationErrorType>> {
      try {
        const data = await http
          .get(`api/documents/${documentId}`)
          .json<DocumentDetailResponse>();
        return { outcome: 'success', data };
      } catch (err) {
        if (err instanceof HTTPError && err.response.status < 500) {
          const body = await err.response
            .json<{ error: string; message?: string }>()
            .catch((): { error: string; message?: string } => ({
              error: 'not_found',
            }));
          return {
            outcome: 'error',
            errorType: body.error as CurationErrorType,
            errorMessage: body.message ?? body.error,
          };
        }
        throw err;
      }
    },

    async clearDocumentFlag(
      documentId: string,
    ): Promise<ServiceResult<ClearFlagResponse, CurationErrorType>> {
      try {
        const data = await http
          .post(`api/documents/${documentId}/clear-flag`)
          .json<ClearFlagResponse>();
        return { outcome: 'success', data };
      } catch (err) {
        if (err instanceof HTTPError && err.response.status < 500) {
          const body = await err.response
            .json<{ error: string; message?: string }>()
            .catch((): { error: string; message?: string } => ({
              error: 'not_found',
            }));
          return {
            outcome: 'error',
            errorType: body.error as CurationErrorType,
            errorMessage: body.message ?? body.error,
          };
        }
        throw err;
      }
    },

    async updateDocumentMetadata(
      documentId: string,
      patch: UpdateDocumentMetadataRequest,
    ): Promise<
      ServiceResult<UpdateDocumentMetadataResponse, CurationErrorType>
    > {
      try {
        const data = await http
          .patch(`api/documents/${documentId}/metadata`, { json: patch })
          .json<UpdateDocumentMetadataResponse>();
        return { outcome: 'success', data };
      } catch (err) {
        if (err instanceof HTTPError && err.response.status < 500) {
          const body = await err.response
            .json<{ error: string; message?: string }>()
            .catch((): { error: string; message?: string } => ({
              error: 'invalid_params',
            }));
          return {
            outcome: 'error',
            errorType: body.error as CurationErrorType,
            errorMessage: body.message ?? body.error,
          };
        }
        throw err;
      }
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

    async acceptTerm(
      termId: string,
    ): Promise<ServiceResult<AcceptCandidateResponse, CurationErrorType>> {
      try {
        const data = await http
          .post(`api/curation/vocabulary/${termId}/accept`)
          .json<AcceptCandidateResponse>();
        return { outcome: 'success', data };
      } catch (err) {
        if (err instanceof HTTPError && err.response.status < 500) {
          const body = await err.response
            .json<{ error: string; message?: string }>()
            .catch((): { error: string; message?: string } => ({
              error: 'not_found',
            }));
          return {
            outcome: 'error',
            errorType: body.error as CurationErrorType,
            errorMessage: body.message ?? body.error,
          };
        }
        throw err;
      }
    },

    async rejectTerm(
      termId: string,
    ): Promise<ServiceResult<RejectCandidateResponse, CurationErrorType>> {
      try {
        const data = await http
          .post(`api/curation/vocabulary/${termId}/reject`)
          .json<RejectCandidateResponse>();
        return { outcome: 'success', data };
      } catch (err) {
        if (err instanceof HTTPError && err.response.status < 500) {
          const body = await err.response
            .json<{ error: string; message?: string }>()
            .catch((): { error: string; message?: string } => ({
              error: 'not_found',
            }));
          return {
            outcome: 'error',
            errorType: body.error as CurationErrorType,
            errorMessage: body.message ?? body.error,
          };
        }
        throw err;
      }
    },

    async addTerm(
      body: AddVocabularyTermRequest,
    ): Promise<ServiceResult<AddVocabularyTermResponse, CurationErrorType>> {
      try {
        const data = await http
          .post('api/curation/vocabulary/terms', { json: body })
          .json<AddVocabularyTermResponse>();
        return { outcome: 'success', data };
      } catch (err) {
        if (err instanceof HTTPError && err.response.status < 500) {
          const responseBody = await err.response
            .json<{ error: string; message?: string }>()
            .catch((): { error: string; message?: string } => ({
              error: 'invalid_params',
            }));
          return {
            outcome: 'error',
            errorType: responseBody.error as CurationErrorType,
            errorMessage: responseBody.message ?? responseBody.error,
          };
        }
        throw err;
      }
    },
  };
}
