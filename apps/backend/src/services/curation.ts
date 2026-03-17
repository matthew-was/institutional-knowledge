/**
 * CurationService — document curation handlers (DOC-006, DOC-007, DOC-008, DOC-009).
 *
 * Implements the service layer for the document curation workflow. Each method
 * returns ServiceResult<T, K> — the route layer owns all HTTP concerns.
 * No Express imports here.
 */

import type { ServiceResult } from '@institutional-knowledge/shared';
import { archiveReference } from '@institutional-knowledge/shared';
import type {
  ClearFlagResponse,
  DocumentDetailResponse,
  DocumentQueueResponse,
  UpdateDocumentMetadataRequest,
  UpdateDocumentMetadataResponse,
} from '@institutional-knowledge/shared/schemas/documents';
import type { DbInstance } from '../db/index.js';
import type { Logger } from '../middleware/logger.js';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type CurationErrorType = 'not_found' | 'no_flag_to_clear';

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface CurationService {
  getDocumentQueue(
    page: number,
    pageSize: number,
  ): Promise<ServiceResult<DocumentQueueResponse, CurationErrorType>>;
  getDocument(
    id: string,
  ): Promise<ServiceResult<DocumentDetailResponse, CurationErrorType>>;
  clearFlag(
    id: string,
  ): Promise<ServiceResult<ClearFlagResponse, CurationErrorType>>;
  updateDocumentMetadata(
    id: string,
    body: UpdateDocumentMetadataRequest,
  ): Promise<ServiceResult<UpdateDocumentMetadataResponse, CurationErrorType>>;
}

export interface CurationServiceDeps {
  db: DbInstance;
  log: Logger;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCurationService(
  deps: CurationServiceDeps,
): CurationService {
  const { db, log } = deps;

  async function getDocumentQueue(
    page: number,
    pageSize: number,
  ): Promise<ServiceResult<DocumentQueueResponse, CurationErrorType>> {
    const { rows, total } = await db.documents.getFlagged(page, pageSize);

    const documents = await Promise.all(
      rows.map(async (doc) => {
        const failedStep = await db.pipelineSteps.getLatestFailedStepName(
          doc.id,
        );
        return {
          documentId: doc.id,
          description: doc.description,
          date: doc.date ?? '',
          archiveReference: archiveReference(doc.date, doc.description),
          flagReason: doc.flagReason ?? '',
          flaggedAt: doc.flaggedAt?.toISOString() ?? '',
          submitterIdentity: doc.submitterIdentity,
          pipelineStatus: failedStep ?? '',
        };
      }),
    );

    log.debug({ page, pageSize, total }, 'Document queue fetched');

    return { outcome: 'success', data: { documents, total, page, pageSize } };
  }

  async function getDocument(
    id: string,
  ): Promise<ServiceResult<DocumentDetailResponse, CurationErrorType>> {
    const doc = await db.documents.getById(id);
    if (doc === undefined) {
      return {
        outcome: 'error',
        errorType: 'not_found',
        errorMessage: `Document ${id} not found`,
      };
    }

    log.debug({ documentId: id }, 'Document detail fetched');

    return {
      outcome: 'success',
      data: {
        documentId: doc.id,
        description: doc.description,
        date: doc.date ?? '',
        archiveReference: archiveReference(doc.date, doc.description),
        documentType: doc.documentType,
        people: doc.people ?? [],
        organisations: doc.organisations ?? [],
        landReferences: doc.landReferences ?? [],
        submitterIdentity: doc.submitterIdentity,
        status: doc.status as DocumentDetailResponse['status'],
        flagReason: doc.flagReason,
        flaggedAt: doc.flaggedAt?.toISOString() ?? null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      },
    };
  }

  async function clearFlag(
    id: string,
  ): Promise<ServiceResult<ClearFlagResponse, CurationErrorType>> {
    const doc = await db.documents.getById(id);
    if (doc === undefined) {
      return {
        outcome: 'error',
        errorType: 'not_found',
        errorMessage: `Document ${id} not found`,
      };
    }
    if (doc.flagReason === null) {
      return {
        outcome: 'error',
        errorType: 'no_flag_to_clear',
        errorMessage: `Document ${id} has no active flag`,
      };
    }

    await db.documents.clearFlag(id);
    log.info({ documentId: id }, 'Document flag cleared');

    return { outcome: 'success', data: { documentId: id, flagCleared: true } };
  }

  async function updateDocumentMetadata(
    id: string,
    body: UpdateDocumentMetadataRequest,
  ): Promise<ServiceResult<UpdateDocumentMetadataResponse, CurationErrorType>> {
    const existing = await db.documents.getById(id);
    if (existing === undefined) {
      return {
        outcome: 'error',
        errorType: 'not_found',
        errorMessage: `Document ${id} not found`,
      };
    }

    const updated = await db.documents.updateMetadata(id, body);
    // updateMetadata always returns the row after update; fall back to existing
    // if the follow-up getById somehow returns undefined (should not happen).
    const doc = updated ?? existing;

    log.info({ documentId: id }, 'Document metadata updated');

    return {
      outcome: 'success',
      data: {
        documentId: doc.id,
        description: doc.description,
        date: doc.date ?? '',
        archiveReference: archiveReference(doc.date, doc.description),
        documentType: doc.documentType,
        people: doc.people ?? [],
        organisations: doc.organisations ?? [],
        landReferences: doc.landReferences ?? [],
        updatedAt: doc.updatedAt.toISOString(),
      },
    };
  }

  return { getDocumentQueue, getDocument, clearFlag, updateDocumentMetadata };
}
