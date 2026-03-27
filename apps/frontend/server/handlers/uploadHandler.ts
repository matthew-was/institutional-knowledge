/**
 * createUploadHandlers — factory that closes over upload request functions.
 *
 * No framework imports. The factory accepts injected request functions so the
 * returned handler is testable in isolation without an HTTP server.
 *
 * The upload method orchestrates three sequential Express calls:
 *   1. initiateUpload  — reserves an upload slot and receives an uploadId
 *   2. uploadFile      — streams the file bytes to Express storage
 *   3. finalizeUpload  — commits the upload and returns the document record
 *
 * Each request function returns a ServiceResult. On an error outcome, the
 * handler returns it immediately (with best-effort cleanup where an uploadId
 * exists). On unexpected throws (5xx re-throws, network errors), the handler
 * attempts cleanup if an uploadId is available, then re-throws.
 */

import type {
  DuplicateConflictResponse,
  FinalizeUploadResponse,
  ServiceResult,
} from '@institutional-knowledge/shared';
import type { DocumentsRequests, UploadErrorType } from '../requests/documents';

export type { UploadErrorType };

export type UploadHandlerResult = ServiceResult<
  FinalizeUploadResponse,
  UploadErrorType,
  DuplicateConflictResponse['existingRecord']
>;

export function createUploadHandlers(requests: DocumentsRequests) {
  return {
    async upload(payload: {
      file: File;
      date: string;
      description: string;
    }): Promise<UploadHandlerResult> {
      const { file, date, description } = payload;
      let uploadId: string | undefined;

      try {
        // Step 1: initiate — obtain an uploadId.
        // If this throws (unexpected error), no uploadId exists yet — no cleanup needed.
        const initiateResult = await requests.initiateUpload({
          filename: file.name,
          contentType: file.type,
          fileSizeBytes: file.size,
          date,
          description,
        });

        if (initiateResult.outcome === 'error') {
          return initiateResult;
        }

        uploadId = initiateResult.data.uploadId;

        // Step 2: upload file bytes
        const formData = new FormData();
        formData.append('file', file);
        const uploadResult = await requests.uploadFile(uploadId, formData);

        if (uploadResult.outcome === 'error') {
          await requests.deleteUpload(uploadId).catch(() => undefined); // best-effort cleanup
          return uploadResult;
        }

        // Step 3: finalize
        const finalizeResult = await requests.finalizeUpload(uploadId);

        if (finalizeResult.outcome === 'error') {
          await requests.deleteUpload(uploadId).catch(() => undefined); // best-effort cleanup
          return finalizeResult;
        }

        return { outcome: 'success', data: finalizeResult.data };
      } catch (err) {
        if (uploadId !== undefined) {
          await requests.deleteUpload(uploadId).catch(() => undefined);
        }
        throw err;
      }
    },
  };
}
