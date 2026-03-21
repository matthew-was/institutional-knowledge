/**
 * Ingestion run startup sweep (ADR-018).
 *
 * Called once during startup, after migrations, before the HTTP server starts.
 * Removes any ingestion runs that were left in a non-completed state.
 *
 * Intentional divergence from _cleanupRunById in IngestionService: storage I/O
 * is interleaved with DB deletes per-document (file first, then row) rather than
 * bulk-storage-then-bulk-DB inside a transaction. This prioritises recoverability
 * over atomicity — see the startup sweep design principle in development-principles.md.
 *
 * Per document (inside the run loop):
 *   1. Delete the staging file (file first — a surviving DB row is recoverable;
 *      a surviving file with no DB row is not)
 *   2. Delete the permanent file if status was 'stored'
 *   3. Delete the document DB record (non-finalized only)
 *   Each document is wrapped in try/catch — one bad document never blocks the rest.
 *
 * Per run (after document loop):
 *   4. Delete the staging directory
 *   5. Delete the ingestion run record
 *   Run cleanup is also wrapped in try/catch for the same reason.
 *
 * Storage delete methods are idempotent — ENOENT is silently swallowed.
 */

import type { DbInstance } from '../db/index.js';
import type { Logger } from '../middleware/logger.js';
import type { StorageService } from '../storage/StorageService.js';

export async function ingestionStartupSweep(
  db: DbInstance,
  storage: StorageService,
  log: Logger,
): Promise<void> {
  const incompleteRuns = await db.ingestionRuns.getIncomplete();

  if (incompleteRuns.length === 0) {
    log.info('Ingestion startup sweep: no incomplete runs found');
    return;
  }

  log.info(
    { count: incompleteRuns.length },
    'Ingestion startup sweep: cleaning up incomplete runs',
  );

  for (const run of incompleteRuns) {
    // eslint-disable-next-line no-await-in-loop
    const docs = await db.ingestionRuns.getDocumentsByRunId(run.id);

    for (const doc of docs) {
      try {
        // File first — a surviving DB row is queryable and recoverable on the
        // next sweep; a surviving file with no DB row is invisible.
        // eslint-disable-next-line no-await-in-loop
        await storage.deleteStagingFile(run.id, doc.filename);
        if (doc.status === 'stored' && doc.storagePath !== null) {
          // eslint-disable-next-line no-await-in-loop
          await storage.deletePermanentFile(doc.storagePath);
        }
        if (doc.status !== 'finalized') {
          // eslint-disable-next-line no-await-in-loop
          await db.documents.delete(doc.id);
        }
        log.info(
          { runId: run.id, documentId: doc.id },
          'Ingestion sweep: document cleaned up',
        );
      } catch (err) {
        log.error(
          { runId: run.id, documentId: doc.id, err },
          'Ingestion sweep: failed to clean up document, skipping',
        );
      }
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await storage.deleteStagingDirectory(run.id);
      // eslint-disable-next-line no-await-in-loop
      await db.ingestionRuns.delete(run.id);
      log.info({ runId: run.id }, 'Ingestion sweep: run cleaned up');
    } catch (err) {
      log.error(
        { runId: run.id, err },
        'Ingestion sweep: failed to clean up run record, skipping',
      );
    }
  }
}
