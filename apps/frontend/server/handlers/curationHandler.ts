/**
 * curationHandler — thin wrappers over curation request functions.
 *
 * No framework imports. These operations have no orchestration logic —
 * each handler delegates directly to a single request function.
 */

import type {
  ClearFlagResponse,
  DocumentDetailResponse,
  DocumentQueueParams,
  DocumentQueueResponse,
  UpdateDocumentMetadataRequest,
  UpdateDocumentMetadataResponse,
} from '@institutional-knowledge/shared';
import type { CurationRequests } from '../requests/curation';

export async function fetchDocumentQueueHandler(
  requests: CurationRequests,
  params?: DocumentQueueParams,
): Promise<DocumentQueueResponse> {
  return requests.fetchDocumentQueue(params);
}

export async function fetchDocumentDetailHandler(
  requests: CurationRequests,
  documentId: string,
): Promise<DocumentDetailResponse> {
  return requests.fetchDocumentDetail(documentId);
}

export async function clearDocumentFlagHandler(
  requests: CurationRequests,
  documentId: string,
): Promise<ClearFlagResponse> {
  return requests.clearDocumentFlag(documentId);
}

export async function updateDocumentMetadataHandler(
  requests: CurationRequests,
  documentId: string,
  patch: UpdateDocumentMetadataRequest,
): Promise<UpdateDocumentMetadataResponse> {
  return requests.updateDocumentMetadata(documentId, patch);
}
