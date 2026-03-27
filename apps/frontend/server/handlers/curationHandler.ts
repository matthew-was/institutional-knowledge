/**
 * createCurationHandlers — factory that closes over curation request functions.
 *
 * No framework imports. The factory accepts injected request functions so the
 * returned handlers are testable in isolation without an HTTP server.
 *
 * Each returned method takes only its own operation-specific params; the
 * requests object is closed over at construction time.
 */

import type {
  AcceptCandidateResponse,
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
import type { CurationErrorType, CurationRequests } from '../requests/curation';

export function createCurationHandlers(requests: CurationRequests) {
  return {
    fetchDocumentQueue(
      params?: DocumentQueueParams,
    ): Promise<DocumentQueueResponse> {
      return requests.fetchDocumentQueue(params);
    },

    fetchDocumentDetail(
      documentId: string,
    ): Promise<ServiceResult<DocumentDetailResponse, CurationErrorType>> {
      return requests.fetchDocumentDetail(documentId);
    },

    clearDocumentFlag(
      documentId: string,
    ): Promise<ServiceResult<ClearFlagResponse, CurationErrorType>> {
      return requests.clearDocumentFlag(documentId);
    },

    updateDocumentMetadata(
      documentId: string,
      patch: UpdateDocumentMetadataRequest,
    ): Promise<
      ServiceResult<UpdateDocumentMetadataResponse, CurationErrorType>
    > {
      return requests.updateDocumentMetadata(documentId, patch);
    },

    fetchVocabularyQueue(
      params?: VocabularyQueueParams,
    ): Promise<VocabularyQueueResponse> {
      return requests.fetchVocabulary(params);
    },

    acceptVocabularyCandidate(
      termId: string,
    ): Promise<ServiceResult<AcceptCandidateResponse, CurationErrorType>> {
      return requests.acceptTerm(termId);
    },

    rejectVocabularyCandidate(
      termId: string,
    ): Promise<ServiceResult<RejectCandidateResponse, CurationErrorType>> {
      return requests.rejectTerm(termId);
    },
  };
}
