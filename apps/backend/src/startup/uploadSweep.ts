/**
 * Upload cleanup sweep (ADR-017).
 *
 * Called once during startup, after migrations, before the HTTP server starts.
 * Removes any documents that were left in a non-finalized state (initiated,
 * uploaded, or stored) and are not linked to an ingestion run. These are
 * orphaned from the web upload flow — either the upload never completed or
 * the server crashed mid-upload.
 *
 * Deletion strategy per status:
 *   - initiated / uploaded: delete the staging file (permanent file not yet written)
 *   - stored:               delete the permanent file (staging file already removed)
 *
 * StorageService delete methods are idempotent — ENOENT is silently swallowed.
 */

import type { DbInstance } from '../db/index.js';
import type { Logger } from '../middleware/logger.js';
import type { StorageService } from '../storage/StorageService.js';

export async function uploadStartupSweep(
  db: DbInstance,
  storage: StorageService,
  log: Logger,
): Promise<void> {
  const docs = await db.documents.getNonFinalizedUploads();

  if (docs.length === 0) {
    log.info('Upload startup sweep: no non-finalized uploads found');
    return;
  }

  log.info(
    { count: docs.length },
    'Upload startup sweep: cleaning up non-finalized uploads',
  );

  for (const doc of docs) {
    try {
      if (doc.status === 'initiated' || doc.status === 'uploaded') {
        // Staging file: uploadId is the document id for web uploads
        // eslint-disable-next-line no-await-in-loop
        await storage.deleteStagingFile(doc.id, doc.filename);
      } else if (doc.status === 'stored' && doc.storagePath !== null) {
        // Permanent file written, staging file already removed
        // eslint-disable-next-line no-await-in-loop
        await storage.deletePermanentFile(doc.storagePath);
      }
      // eslint-disable-next-line no-await-in-loop
      await db.documents.delete(doc.id);
      log.info(
        { documentId: doc.id, status: doc.status },
        'Upload sweep: document cleaned up',
      );
    } catch (err) {
      log.error(
        { documentId: doc.id, err },
        'Upload sweep: failed to clean up document, skipping',
      );
    }
  }
}
