/**
 * Express client factory.
 *
 * Creates a structured ExpressClient whose namespaced properties correspond
 * to the backend resource groups (documents, curation). This mirrors the
 * backend DbInstance / repository pattern.
 *
 * Usage:
 *   const expressClient = createExpressClient(config);
 *   expressClient.documents.findById(id);
 *   expressClient.curation.fetchQueue();
 *
 * Note: paths passed to Ky must NOT start with '/' — Ky prefixUrl constraint.
 */

import ky from 'ky';
import type { AppConfig } from '../config';
import { type CurationRequests, createCurationRequests } from './curation';
import { createDocumentsRequests, type DocumentsRequests } from './documents';

export interface ExpressClient {
  documents: DocumentsRequests;
  curation: CurationRequests;
}

export function createExpressClient(config: AppConfig): ExpressClient {
  const http = ky.create({
    prefixUrl: config.express.baseUrl,
    headers: { 'x-internal-key': config.express.internalKey },
  });

  return {
    documents: createDocumentsRequests(http),
    curation: createCurationRequests(http),
  };
}
