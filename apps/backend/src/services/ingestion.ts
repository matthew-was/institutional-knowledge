/**
 * IngestionService — CLI bulk ingestion handlers (ING-001 to ING-004).
 *
 * Implements the service layer for the four ingestion run endpoints. Each
 * method returns ServiceResult<T, K> — the route layer owns all HTTP concerns.
 * No Express imports here.
 *
 * ADR-018: run-start sweep cleans up any incomplete ingestion runs before
 * creating a new one, so a crashed CLI never leaves orphaned data.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ServiceResult } from '@institutional-knowledge/shared';
import type {
  AddFileToRunResponse,
  CleanupRunResponse,
  CompleteIngestionRunResponse,
  CreateIngestionRunResponse,
} from '@institutional-knowledge/shared/schemas/ingestion';
import { v7 as uuidv7 } from 'uuid';
import type { AppConfig } from '../config/index.js';
import type { DbInstance } from '../db/index.js';
import type { Logger } from '../middleware/logger.js';
import type { StorageService } from '../storage/StorageService.js';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type CreateIngestionRunError = never;
export type CompleteRunError = 'not_found' | 'conflict';
export type AddFileToRunError =
  | 'not_found'
  | 'conflict'
  | 'duplicate_detected'
  | 'invalid_filename'
  | 'file_validation_failed'
  | 'group_validation_failed';
export type CleanupRunError = 'not_found';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface AddFileToRunFields {
  originalFilename: string;
  date?: string;
  description?: string;
  groupName?: string;
  sequenceNumber?: string;
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface IngestionService {
  /**
   * Sweep and clean up any incomplete ingestion runs. Called by createIngestionRun
   * and exposed as a standalone method for the server startup sweep (ADR-018).
   */
  runStartSweep(): Promise<void>;

  createIngestionRun(input: {
    sourceDirectory: string;
    grouped: boolean;
  }): Promise<ServiceResult<CreateIngestionRunResponse, never>>;

  completeRun(
    runId: string,
  ): Promise<ServiceResult<CompleteIngestionRunResponse, CompleteRunError>>;

  addFileToRun(
    runId: string,
    buffer: Buffer,
    fields: AddFileToRunFields,
  ): Promise<ServiceResult<AddFileToRunResponse, AddFileToRunError>>;

  cleanupRun(
    runId: string,
  ): Promise<ServiceResult<CleanupRunResponse, CleanupRunError>>;
}

export interface IngestionServiceDeps {
  db: DbInstance;
  storage: StorageService;
  config: Pick<AppConfig, 'upload' | 'ingestion'>;
  log: Logger;
}

// ---------------------------------------------------------------------------
// Filename convention regexes
// ---------------------------------------------------------------------------

/** Standalone: `YYYY-MM-DD - description` */
const STANDALONE_FILENAME_RE = /^\d{4}-\d{2}-\d{2} - .+$/;

/** Grouped: `NNN` or `NNN - annotation` (three-digit sequence) */
const GROUPED_FILENAME_RE = /^\d{3}( - .+)?$/;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createIngestionService(
  deps: IngestionServiceDeps,
): IngestionService {
  const { db, storage, config, log } = deps;

  // ── Private helper: clean up a single run and all its non-finalized docs ──

  async function _cleanupRunById(
    runId: string,
    trx: import('knex').Knex.Transaction,
  ): Promise<void> {
    const docs = await db.ingestionRuns.getDocumentsByRunId(runId, trx);

    for (const doc of docs) {
      // Delete staging file for every doc in the run (idempotent)
      // eslint-disable-next-line no-await-in-loop
      await storage.deleteStagingFile(runId, doc.filename);

      // Delete permanent storage file for any doc that reached 'stored'
      if (doc.status === 'stored' && doc.storagePath !== null) {
        // eslint-disable-next-line no-await-in-loop
        await storage.deletePermanentFile(doc.storagePath);
      }
    }

    // Delete non-finalized document records within the transaction
    const nonFinalized = docs.filter((d) => d.status !== 'finalized');
    for (const doc of nonFinalized) {
      // eslint-disable-next-line no-await-in-loop
      await db.documents.delete(doc.id, trx);
    }

    // Delete the staging directory (idempotent)
    await storage.deleteStagingDirectory(runId);
  }

  // ── runStartSweep (ADR-018) ──────────────────────────────────────────────

  async function runStartSweep(): Promise<void> {
    const incompleteRuns = await db.ingestionRuns.getIncomplete();
    if (incompleteRuns.length === 0) return;

    log.info(
      { count: incompleteRuns.length },
      'Ingestion run sweep: cleaning up incomplete runs',
    );

    for (const run of incompleteRuns) {
      // eslint-disable-next-line no-await-in-loop
      await db._knex.transaction(async (trx) => {
        await _cleanupRunById(run.id, trx);
        await db.ingestionRuns.delete(run.id, trx);
      });
      log.info({ runId: run.id }, 'Ingestion run sweep: run cleaned up');
    }
  }

  // ── createIngestionRun (ING-001) ─────────────────────────────────────────

  async function createIngestionRun(input: {
    sourceDirectory: string;
    grouped: boolean;
  }): Promise<ServiceResult<CreateIngestionRunResponse, never>> {
    await runStartSweep();

    const runId = uuidv7();
    await db.ingestionRuns.insert({
      id: runId,
      status: 'in_progress',
      sourceDirectory: input.sourceDirectory,
      grouped: input.grouped,
      completedAt: null,
    });

    await storage.createStagingDirectory(runId);

    log.info({ runId }, 'Ingestion run created');

    return {
      outcome: 'success',
      data: { runId, status: 'in_progress' },
    };
  }

  // ── completeRun (ING-002) ────────────────────────────────────────────────

  async function completeRun(
    runId: string,
  ): Promise<ServiceResult<CompleteIngestionRunResponse, CompleteRunError>> {
    const run = await db.ingestionRuns.getById(runId);
    if (run === undefined) {
      return {
        outcome: 'error',
        errorType: 'not_found',
        errorMessage: `Ingestion run ${runId} not found`,
      };
    }
    if (run.status !== 'in_progress') {
      return {
        outcome: 'error',
        errorType: 'conflict',
        errorMessage: `Ingestion run ${runId} is not in_progress (status: ${run.status})`,
      };
    }

    // Step 1: Mark run as 'moving' — sentinel outside the transaction so a
    // crash during I/O is detectable by the run-start sweep (ADR-018).
    await db.ingestionRuns.update(runId, { status: 'moving' });

    const allDocs = await db.ingestionRuns.getDocumentsByRunId(runId);
    const uploadedDocs = allDocs.filter((d) => d.status === 'uploaded');

    // Step 2: Move each uploaded file to permanent storage — I/O outside the
    // transaction (storage is not transactional). Best-effort sequential.
    const movedPaths = new Map<string, string>();
    for (const doc of uploadedDocs) {
      // eslint-disable-next-line no-await-in-loop
      const storagePath = await storage.moveStagingToPermanent(
        runId,
        doc.filename,
      );
      movedPaths.set(doc.id, storagePath);
    }

    // Step 3: Wrap all DB writes in a single transaction — storagePath updates,
    // status transitions to 'stored' and 'finalized', and run completion.
    const completedAt = new Date();
    await db._knex.transaction(async (trx) => {
      for (const doc of uploadedDocs) {
        const storagePath = movedPaths.get(doc.id);
        if (storagePath === undefined) continue;
        // eslint-disable-next-line no-await-in-loop
        await db.documents.updateStoragePath(doc.id, storagePath, trx);
        // eslint-disable-next-line no-await-in-loop
        await db.documents.updateStatus(doc.id, 'stored', trx);
      }
      for (const doc of uploadedDocs) {
        // eslint-disable-next-line no-await-in-loop
        await db.documents.updateStatus(doc.id, 'finalized', trx);
      }
      await db.ingestionRuns.update(
        runId,
        { status: 'completed', completedAt },
        trx,
      );
    });

    // ── Summary report ───────────────────────────────────────────────────
    const totalSubmitted = allDocs.length;
    const totalAccepted = uploadedDocs.length;
    const totalRejected = totalSubmitted - totalAccepted;
    const acceptedIds = new Set(uploadedDocs.map((d) => d.id));

    const report = {
      runId,
      completedAt: completedAt.toISOString(),
      totalSubmitted,
      totalAccepted,
      totalRejected,
      files: allDocs.map((d) => ({
        filename: d.filename,
        documentId: d.id,
        outcome: acceptedIds.has(d.id) ? 'accepted' : 'rejected',
      })),
    };

    log.info(
      { runId, totalSubmitted, totalAccepted, totalRejected },
      'Ingestion run completed',
    );

    // Write timestamped report file
    const reportDir = config.ingestion.reportOutputDirectory;
    await fs.mkdir(reportDir, { recursive: true });
    const reportFilename = `ingestion-report-${runId}-${completedAt.toISOString().replace(/[:.]/g, '-')}.json`;
    const reportPath = path.join(reportDir, reportFilename);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    log.info({ reportPath }, 'Ingestion summary report written');

    return {
      outcome: 'success',
      data: {
        runId,
        status: 'completed',
        totalSubmitted,
        totalAccepted,
        totalRejected,
      },
    };
  }

  // ── addFileToRun (ING-003) ────────────────────────────────────────────────

  async function addFileToRun(
    runId: string,
    buffer: Buffer,
    fields: AddFileToRunFields,
  ): Promise<ServiceResult<AddFileToRunResponse, AddFileToRunError>> {
    const run = await db.ingestionRuns.getById(runId);
    if (run === undefined) {
      return {
        outcome: 'error',
        errorType: 'not_found',
        errorMessage: `Ingestion run ${runId} not found`,
      };
    }
    if (run.status !== 'in_progress') {
      return {
        outcome: 'error',
        errorType: 'conflict',
        errorMessage: `Ingestion run ${runId} is not in_progress (status: ${run.status})`,
      };
    }

    const { originalFilename } = fields;
    const ext = path.extname(originalFilename).toLowerCase();

    // Validate extension
    if (!config.upload.acceptedExtensions.includes(ext)) {
      return {
        outcome: 'error',
        errorType: 'file_validation_failed',
        errorMessage: `File extension '${ext}' is not accepted`,
      };
    }

    // Validate size
    const maxBytes = config.upload.maxFileSizeMb * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return {
        outcome: 'error',
        errorType: 'file_validation_failed',
        errorMessage: `File size ${buffer.length} bytes exceeds maximum ${maxBytes} bytes`,
      };
    }

    // Validate filename naming convention (stem without extension)
    const stem = path.basename(originalFilename, ext);

    if (run.grouped) {
      if (!GROUPED_FILENAME_RE.test(stem)) {
        return {
          outcome: 'error',
          errorType: 'invalid_filename',
          errorMessage: `Grouped filename must match NNN or NNN - annotation, got: '${stem}'`,
        };
      }
    } else {
      if (!STANDALONE_FILENAME_RE.test(stem)) {
        return {
          outcome: 'error',
          errorType: 'invalid_filename',
          errorMessage: `Standalone filename must match YYYY-MM-DD - description, got: '${stem}'`,
        };
      }
    }

    // Write to staging
    await storage.writeStagingFile(runId, buffer, originalFilename);

    // Compute MD5 hash
    const hash = crypto.createHash('md5').update(buffer).digest('hex');

    // Check for duplicate against finalized documents
    const duplicate = await db.documents.findAnyFinalizedByHash(hash);
    if (duplicate !== undefined) {
      // Clean up the staging file we just wrote before returning the error
      await storage.deleteStagingFile(runId, originalFilename);
      return {
        outcome: 'error',
        errorType: 'duplicate_detected',
        errorMessage: `A finalized document with hash ${hash} already exists (id: ${duplicate.id})`,
      };
    }

    // For grouped runs: check if any document in the same group already failed
    if (run.grouped && fields.groupName !== undefined) {
      const groupDocs = await db.ingestionRuns.getDocumentsByRunId(runId);
      const hasGroupFailure = groupDocs.some(
        (d) =>
          d.status === 'failed' &&
          // Group membership is stored in the description field convention:
          // the CLI passes groupName as the description prefix
          d.description.startsWith(fields.groupName as string),
      );
      if (hasGroupFailure) {
        await storage.deleteStagingFile(runId, originalFilename);
        return {
          outcome: 'error',
          errorType: 'group_validation_failed',
          errorMessage: `Group '${fields.groupName}' already has a failed file; rejecting new file`,
        };
      }
    }

    // Derive date and description from filename or form fields
    let date: string | null = null;
    let description = fields.description ?? '';

    if (!run.grouped) {
      // Standalone: parse date and description from filename stem
      // Format: YYYY-MM-DD - description
      const dashIdx = stem.indexOf(' - ');
      date = stem.substring(0, dashIdx);
      description =
        description !== '' ? description : stem.substring(dashIdx + 3);
    } else if (fields.date !== undefined && fields.date !== '') {
      date = fields.date;
    }

    const contentType = _guessContentType(ext);
    const documentId = uuidv7();

    await db.documents.insert({
      id: documentId,
      status: 'uploaded',
      filename: originalFilename,
      contentType,
      fileSizeBytes: String(buffer.length),
      fileHash: hash,
      storagePath: null,
      date,
      description,
      documentType: null,
      people: null,
      organisations: null,
      landReferences: null,
      flagReason: null,
      flaggedAt: null,
      submitterIdentity: 'CLI Ingestion',
      ingestionRunId: runId,
    });

    log.debug({ documentId, runId }, 'File added to ingestion run');

    return {
      outcome: 'success',
      data: { documentId, status: 'uploaded' },
    };
  }

  // ── cleanupRun (ING-004) ─────────────────────────────────────────────────

  async function cleanupRun(
    runId: string,
  ): Promise<ServiceResult<CleanupRunResponse, CleanupRunError>> {
    const run = await db.ingestionRuns.getById(runId);
    if (run === undefined) {
      return {
        outcome: 'error',
        errorType: 'not_found',
        errorMessage: `Ingestion run ${runId} not found`,
      };
    }

    await db._knex.transaction(async (trx) => {
      await _cleanupRunById(runId, trx);
      await db.ingestionRuns.delete(runId, trx);
    });

    log.info({ runId }, 'Ingestion run cleaned up');

    return {
      outcome: 'success',
      data: { deleted: true },
    };
  }

  return {
    runStartSweep,
    createIngestionRun,
    completeRun,
    addFileToRun,
    cleanupRun,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _guessContentType(ext: string): string {
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.pdf':
      return 'application/pdf';
    case '.tiff':
    case '.tif':
      return 'image/tiff';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}
