/**
 * Document upload service.
 *
 * Implements the three-step document upload lifecycle (DOC-001, DOC-002, DOC-003)
 * and the cleanup operation (DOC-005) as pure domain methods. No Express imports —
 * all HTTP concerns (status codes, response serialisation) belong to the route layer.
 *
 * Each method returns ServiceResult<T, E>. The route layer checks result.outcome and
 * maps errorType to the appropriate HTTP response directly via res.json(). next(err)
 * is reserved for truly unexpected errors (DB failures, bugs).
 *
 * Upload lifecycle:
 *   1. initiateUpload  — validate metadata, insert documents row (status: initiated)
 *   2. uploadFile      — receive file bytes, compute hash, duplicate check, write to staging
 *   3. finalizeUpload  — move file to permanent storage, mark finalized
 *
 * cleanupUpload deletes an incomplete upload at any non-finalized status.
 *
 * No document content is logged — only identifiers and status.
 */

import crypto from 'node:crypto';
import type { ServiceResult } from '@institutional-knowledge/shared';
import { archiveReference } from '@institutional-knowledge/shared';
import type { DuplicateConflictResponse } from '@institutional-knowledge/shared/schemas/documents';
import { v7 as uuidv7 } from 'uuid';
import type { AppConfig } from '../config/index.js';
import type { DbInstance } from '../db/index.js';
import type { DocumentInsert } from '../db/tables.js';
import type { Logger } from '../middleware/logger.js';
import type { StorageService } from '../storage/StorageService.js';

// ---------------------------------------------------------------------------
// Deps and service types
// ---------------------------------------------------------------------------

export interface DocumentServiceDeps {
  db: DbInstance;
  storage: StorageService;
  config: AppConfig;
  log: Logger;
}

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface InitiateUploadInput {
  filename: string;
  contentType: string;
  fileSizeBytes: number;
  date: string; // YYYY-MM-DD or ''
  description: string;
}

export interface InitiateUploadResult {
  uploadId: string;
  status: 'initiated';
}

export interface UploadFileInput {
  uploadId: string;
  fileBuffer: Buffer;
  fileSize: number;
  // filename is looked up internally from the document row
}

export interface UploadFileResult {
  uploadId: string;
  status: 'uploaded';
  fileHash: string;
}

export interface FinalizeUploadResult {
  documentId: string;
  description: string;
  date: string;
  archiveReference: string;
  status: 'finalized';
}

export interface CleanupUploadResult {
  deleted: true;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type DocumentErrorType =
  | 'unsupported_extension'
  | 'file_too_large'
  | 'whitespace_description'
  | 'not_found'
  | 'duplicate_detected'
  | 'finalized_document';

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface DocumentService {
  initiateUpload(
    input: InitiateUploadInput,
  ): Promise<ServiceResult<InitiateUploadResult, DocumentErrorType>>;
  uploadFile(
    input: UploadFileInput,
  ): Promise<
    ServiceResult<
      UploadFileResult,
      DocumentErrorType,
      DuplicateConflictResponse
    >
  >;
  finalizeUpload(
    uploadId: string,
  ): Promise<ServiceResult<FinalizeUploadResult, DocumentErrorType>>;
  cleanupUpload(
    uploadId: string,
  ): Promise<ServiceResult<CleanupUploadResult, DocumentErrorType>>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDocumentService(
  deps: DocumentServiceDeps,
): DocumentService {
  const { db, storage, config, log } = deps;

  // -------------------------------------------------------------------------
  // DOC-001: Initiate upload
  // -------------------------------------------------------------------------

  async function initiateUpload(
    input: InitiateUploadInput,
  ): Promise<ServiceResult<InitiateUploadResult, DocumentErrorType>> {
    const { filename, contentType, fileSizeBytes, date, description } = input;

    // File extension check (config-driven accepted list)
    const dotIndex = filename.lastIndexOf('.');
    const ext = dotIndex === -1 ? '' : filename.slice(dotIndex).toLowerCase();
    const accepted = config.upload.acceptedExtensions.map((e) =>
      e.toLowerCase(),
    );
    if (ext === '' || !accepted.includes(ext)) {
      return {
        outcome: 'error',
        errorType: 'unsupported_extension',
        errorMessage: `File extension '${ext}' is not in the accepted list: ${accepted.join(', ')}`,
      };
    }

    // File size check (config-driven limit)
    const maxBytes = config.upload.maxFileSizeMb * 1024 * 1024;
    if (fileSizeBytes > maxBytes) {
      return {
        outcome: 'error',
        errorType: 'file_too_large',
        errorMessage: `File size ${fileSizeBytes} bytes exceeds maximum of ${config.upload.maxFileSizeMb} MB`,
      };
    }

    // Whitespace-only description check — schema min(1) catches empty string but
    // not strings consisting entirely of whitespace
    if (description.trim().length === 0) {
      return {
        outcome: 'error',
        errorType: 'whitespace_description',
        errorMessage: "Field 'description' must not be whitespace-only",
      };
    }

    const id = uuidv7();

    const doc: DocumentInsert = {
      id,
      status: 'initiated',
      filename,
      contentType,
      fileSizeBytes: null,
      fileHash: null,
      storagePath: null,
      date: date.length > 0 ? date : null,
      description,
      documentType: null,
      people: null,
      organisations: null,
      landReferences: null,
      flagReason: null,
      flaggedAt: null,
      // Phase 1 placeholder — real submitter identity added in a later phase
      submitterIdentity: 'Primary Archivist',
      ingestionRunId: null,
    };

    await db.documents.insert(doc);

    log.info({ uploadId: id }, 'initiateUpload: document row created');

    return { outcome: 'success', data: { uploadId: id, status: 'initiated' } };
  }

  // -------------------------------------------------------------------------
  // DOC-002: Upload file bytes
  // -------------------------------------------------------------------------

  async function uploadFile(
    input: UploadFileInput,
  ): Promise<
    ServiceResult<
      UploadFileResult,
      DocumentErrorType,
      DuplicateConflictResponse
    >
  > {
    const { uploadId, fileBuffer, fileSize } = input;

    const doc = await db.documents.getById(uploadId);

    if (doc === undefined || doc.status !== 'initiated') {
      return {
        outcome: 'error',
        errorType: 'not_found',
        errorMessage: `Document '${uploadId}' not found or not in 'initiated' status`,
      };
    }

    // Write to staging before hash computation so the file is available even
    // if the duplicate check triggers cleanup
    await storage.writeStagingFile(uploadId, fileBuffer, doc.filename);

    const md5 = crypto.createHash('md5').update(fileBuffer).digest('hex');

    // Duplicate detection: check against finalized documents only (partial unique
    // index ensures only one finalized doc per hash)
    const existing = await db.documents.findFinalizedByHash(md5, uploadId);

    if (existing !== undefined) {
      // Remove the staging file immediately — startup sweep is a safety fallback,
      // not the primary cleanup mechanism
      await storage.deleteStagingFile(uploadId, doc.filename);

      const errorData: DuplicateConflictResponse = {
        error: 'duplicate_detected',
        existingRecord: {
          documentId: existing.id,
          description: existing.description,
          date: existing.date ?? '',
          archiveReference: archiveReference(
            existing.date,
            existing.description,
          ),
        },
      };
      return {
        outcome: 'error',
        errorType: 'duplicate_detected',
        errorMessage: 'A document with this file hash already exists',
        errorData,
      };
    }

    await db.documents.updateAfterUpload(uploadId, md5, fileSize);

    log.info(
      { uploadId, fileHash: md5 },
      'uploadFile: file written to staging',
    );

    return {
      outcome: 'success',
      data: { uploadId, status: 'uploaded', fileHash: md5 },
    };
  }

  // -------------------------------------------------------------------------
  // DOC-003: Finalize upload
  // -------------------------------------------------------------------------

  async function finalizeUpload(
    uploadId: string,
  ): Promise<ServiceResult<FinalizeUploadResult, DocumentErrorType>> {
    const doc = await db.documents.getById(uploadId);

    if (doc === undefined || doc.status !== 'uploaded') {
      return {
        outcome: 'error',
        errorType: 'not_found',
        errorMessage: `Document '${uploadId}' not found or not in 'uploaded' status`,
      };
    }

    const storagePath = await storage.moveStagingToPermanent(
      uploadId,
      doc.filename,
    );

    await db.documents.updateAfterFinalize(uploadId, storagePath);

    log.info({ uploadId, storagePath }, 'finalizeUpload: document finalized');

    const ref = archiveReference(doc.date, doc.description);

    return {
      outcome: 'success',
      data: {
        documentId: uploadId,
        description: doc.description,
        date: doc.date ?? '',
        archiveReference: ref,
        status: 'finalized',
      },
    };
  }

  // -------------------------------------------------------------------------
  // DOC-005: Cleanup incomplete upload
  // -------------------------------------------------------------------------

  async function cleanupUpload(
    uploadId: string,
  ): Promise<ServiceResult<CleanupUploadResult, DocumentErrorType>> {
    const doc = await db.documents.getById(uploadId);

    if (doc === undefined) {
      return {
        outcome: 'error',
        errorType: 'not_found',
        errorMessage: `Document '${uploadId}' not found`,
      };
    }

    if (doc.status === 'finalized') {
      return {
        outcome: 'error',
        errorType: 'finalized_document',
        errorMessage: `Document '${uploadId}' is finalized and cannot be deleted`,
      };
    }

    // Delete storage files based on current status
    if (doc.status === 'uploaded' || doc.status === 'initiated') {
      await storage.deleteStagingFile(uploadId, doc.filename);
    } else if (doc.status === 'stored' && doc.storagePath !== null) {
      // 'stored' is a transitional state; storagePath is set when the file has
      // been moved to permanent storage
      await storage.deletePermanentFile(doc.storagePath);
    }

    await db.documents.delete(uploadId);

    log.info(
      { uploadId, status: doc.status },
      'cleanupUpload: document deleted',
    );

    return { outcome: 'success', data: { deleted: true } };
  }

  return { initiateUpload, uploadFile, finalizeUpload, cleanupUpload };
}
