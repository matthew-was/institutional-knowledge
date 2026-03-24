/**
 * Documents request functions — Ky calls to the Express backend.
 *
 * Each function is a thin wrapper: URL construction, HTTP call, and response
 * parsing only. No framework imports; no business logic.
 *
 * Paths must not start with '/' — Ky prefixUrl constraint.
 *
 * Covers DOC-001 through DOC-009 as defined in integration-lead-contracts.md.
 */

import type {
  ClearFlagResponse,
  DocumentDetailResponse,
  FinalizeUploadResponse,
  InitiateUploadRequest,
  InitiateUploadResponse,
  UpdateDocumentMetadataRequest,
  UpdateDocumentMetadataResponse,
  UploadFileResponse,
} from '@institutional-knowledge/shared';
import type { KyInstance } from 'ky';

export interface DocumentsRequests {
  /**
   * DOC-001: Initiate a new upload lifecycle.
   * POST api/documents/initiate
   */
  initiateUpload(body: InitiateUploadRequest): Promise<InitiateUploadResponse>;

  /**
   * DOC-002: Upload file bytes for an in-progress upload.
   * POST api/documents/:uploadId/upload
   */
  uploadFile(uploadId: string, formData: FormData): Promise<UploadFileResponse>;

  /**
   * DOC-003: Finalize a completed upload.
   * POST api/documents/:uploadId/finalize
   */
  finalizeUpload(uploadId: string): Promise<FinalizeUploadResponse>;

  /**
   * DOC-005: Delete an incomplete upload.
   * DELETE api/documents/:uploadId
   */
  delete(uploadId: string): Promise<void>;

  /**
   * DOC-007: Fetch a document by ID.
   * GET api/documents/:id
   */
  findById(id: string): Promise<DocumentDetailResponse>;

  /**
   * DOC-008: Clear the review flag on a document.
   * POST api/documents/:id/clear-flag
   */
  clearFlag(id: string): Promise<ClearFlagResponse>;

  /**
   * DOC-009: Patch document metadata fields.
   * PATCH api/documents/:id/metadata
   */
  patchMetadata(
    id: string,
    body: UpdateDocumentMetadataRequest,
  ): Promise<UpdateDocumentMetadataResponse>;
}

export function createDocumentsRequests(_http: KyInstance): DocumentsRequests {
  return {
    initiateUpload(
      _body: InitiateUploadRequest,
    ): Promise<InitiateUploadResponse> {
      throw new Error('not_implemented');
    },

    uploadFile(
      _uploadId: string,
      _formData: FormData,
    ): Promise<UploadFileResponse> {
      throw new Error('not_implemented');
    },

    finalizeUpload(_uploadId: string): Promise<FinalizeUploadResponse> {
      throw new Error('not_implemented');
    },

    delete(_uploadId: string): Promise<void> {
      throw new Error('not_implemented');
    },

    findById(_id: string): Promise<DocumentDetailResponse> {
      throw new Error('not_implemented');
    },

    clearFlag(_id: string): Promise<ClearFlagResponse> {
      throw new Error('not_implemented');
    },

    patchMetadata(
      _id: string,
      _body: UpdateDocumentMetadataRequest,
    ): Promise<UpdateDocumentMetadataResponse> {
      throw new Error('not_implemented');
    },
  };
}
