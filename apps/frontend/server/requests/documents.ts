/**
 * Documents request functions — Ky calls to the Express backend.
 *
 * Each function is a thin wrapper: URL construction, HTTP call, and response
 * parsing only. No framework imports; no business logic.
 *
 * Paths must not start with '/' — Ky prefixUrl constraint.
 *
 * The three upload methods (initiateUpload, uploadFile, finalizeUpload) return
 * ServiceResult rather than throwing, so the handler layer can branch on outcome
 * without try/catch. 4xx errors are caught and returned as error branches; 5xx
 * errors re-throw so the route handler can log them and return 500.
 *
 * Covers DOC-001 through DOC-005 as defined in integration-lead-contracts.md.
 * DOC-007/008/009 are implemented in requests/curation.ts.
 */

import type {
  DuplicateConflictResponse,
  FinalizeUploadResponse,
  InitiateUploadRequest,
  InitiateUploadResponse,
  ServiceResult,
  UploadFileResponse,
} from '@institutional-knowledge/shared';
import { HTTPError, type KyInstance } from 'ky';

/**
 * Error type union for the three-step upload lifecycle.
 * Defined locally here; a future chore will move DocumentErrorType to shared.
 */
export type UploadErrorType =
  | 'unsupported_extension'
  | 'file_too_large'
  | 'whitespace_description'
  | 'not_found'
  | 'duplicate_detected'
  | 'missing_file'
  | 'upload_failed';

export interface DocumentsRequests {
  /**
   * DOC-001: Initiate a new upload lifecycle.
   * POST api/documents/initiate
   */
  initiateUpload(
    body: InitiateUploadRequest,
  ): Promise<ServiceResult<InitiateUploadResponse, UploadErrorType>>;

  /**
   * DOC-002: Upload file bytes for an in-progress upload.
   * POST api/documents/:uploadId/upload
   *
   * On 409, returns a ServiceResult error branch with errorType 'duplicate_detected'
   * and errorData populated from response.data.existingRecord.
   */
  uploadFile(
    uploadId: string,
    formData: FormData,
  ): Promise<
    ServiceResult<
      UploadFileResponse,
      UploadErrorType,
      DuplicateConflictResponse['existingRecord']
    >
  >;

  /**
   * DOC-003: Finalize a completed upload.
   * POST api/documents/:uploadId/finalize
   */
  finalizeUpload(
    uploadId: string,
  ): Promise<ServiceResult<FinalizeUploadResponse, UploadErrorType>>;

  /**
   * DOC-005: Delete an incomplete upload.
   * DELETE api/documents/:uploadId
   *
   * Best-effort — callers should not propagate errors from this method.
   */
  deleteUpload(uploadId: string): Promise<void>;
}

export function createDocumentsRequests(http: KyInstance): DocumentsRequests {
  return {
    async initiateUpload(
      body: InitiateUploadRequest,
    ): Promise<ServiceResult<InitiateUploadResponse, UploadErrorType>> {
      try {
        const data = await http
          .post('api/documents/initiate', { json: body })
          .json<InitiateUploadResponse>();
        return { outcome: 'success', data };
      } catch (err) {
        if (err instanceof HTTPError && err.response.status < 500) {
          const responseBody = await err.response
            .json<{ error: string; message?: string }>()
            .catch((): { error: string; message?: string } => ({
              error: 'upload_failed',
            }));
          return {
            outcome: 'error',
            errorType: responseBody.error as UploadErrorType,
            errorMessage: responseBody.message ?? responseBody.error,
          };
        }
        throw err;
      }
    },

    async uploadFile(
      uploadId: string,
      formData: FormData,
    ): Promise<
      ServiceResult<
        UploadFileResponse,
        UploadErrorType,
        DuplicateConflictResponse['existingRecord']
      >
    > {
      try {
        // Do not set content-type — let Ky (and the underlying fetch) set the
        // multipart boundary automatically when FormData is passed as body.
        const data = await http
          .post(`api/documents/${uploadId}/upload`, { body: formData })
          .json<UploadFileResponse>();
        return { outcome: 'success', data };
      } catch (err) {
        if (err instanceof HTTPError && err.response.status < 500) {
          if (err.response.status === 409) {
            const responseBody = await err.response
              .json<{ data: DuplicateConflictResponse }>()
              .catch(() => null);
            if (responseBody !== null) {
              return {
                outcome: 'error',
                errorType: 'duplicate_detected',
                errorMessage: 'A document with this file already exists.',
                errorData: responseBody.data.existingRecord,
              };
            }
          }
          const responseBody = await err.response
            .json<{ error: string; message?: string }>()
            .catch((): { error: string; message?: string } => ({
              error: 'upload_failed',
            }));
          return {
            outcome: 'error',
            errorType: responseBody.error as UploadErrorType,
            errorMessage: responseBody.message ?? responseBody.error,
          };
        }
        throw err;
      }
    },

    async finalizeUpload(
      uploadId: string,
    ): Promise<ServiceResult<FinalizeUploadResponse, UploadErrorType>> {
      try {
        const data = await http
          .post(`api/documents/${uploadId}/finalize`)
          .json<FinalizeUploadResponse>();
        return { outcome: 'success', data };
      } catch (err) {
        if (err instanceof HTTPError && err.response.status < 500) {
          const responseBody = await err.response
            .json<{ error: string; message?: string }>()
            .catch((): { error: string; message?: string } => ({
              error: 'upload_failed',
            }));
          return {
            outcome: 'error',
            errorType: responseBody.error as UploadErrorType,
            errorMessage: responseBody.message ?? responseBody.error,
          };
        }
        throw err;
      }
    },

    async deleteUpload(uploadId: string): Promise<void> {
      await http.delete(`api/documents/${uploadId}`);
    },
  };
}
