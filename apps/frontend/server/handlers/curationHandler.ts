/**
 * curationHandler — thin wrappers over curation request functions.
 *
 * No framework imports. These operations have no orchestration logic —
 * each handler delegates directly to a single request function.
 */

import type {
  ClearFlagResponse,
  DocumentQueueParams,
  DocumentQueueResponse,
} from '@institutional-knowledge/shared';
import type { CurationRequests } from '../requests/curation';

export async function fetchDocumentQueueHandler(
  requests: CurationRequests,
  params?: DocumentQueueParams,
): Promise<DocumentQueueResponse> {
  return requests.fetchDocumentQueue(params);
}

export async function clearDocumentFlagHandler(
  requests: CurationRequests,
  documentId: string,
): Promise<ClearFlagResponse> {
  return requests.clearDocumentFlag(documentId);
}
