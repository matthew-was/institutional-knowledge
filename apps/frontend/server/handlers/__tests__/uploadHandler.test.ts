import { describe, expect, it, vi } from 'vitest';
import type { DocumentsRequests } from '../../requests/documents';
import { type UploadErrorType, uploadHandler } from '../uploadHandler';

function makeRequests(
  overrides: Partial<{
    initiateUpload: DocumentsRequests['initiateUpload'];
    uploadFile: DocumentsRequests['uploadFile'];
    finalizeUpload: DocumentsRequests['finalizeUpload'];
    deleteUpload: DocumentsRequests['deleteUpload'];
  }> = {},
): DocumentsRequests {
  return {
    initiateUpload:
      overrides.initiateUpload ??
      vi.fn().mockResolvedValue({
        outcome: 'success',
        data: { uploadId: 'test-upload-id', status: 'initiated' },
      }),
    uploadFile:
      overrides.uploadFile ??
      vi.fn().mockResolvedValue({
        outcome: 'success',
        data: {
          uploadId: 'test-upload-id',
          status: 'uploaded',
          fileHash: 'abc123',
        },
      }),
    finalizeUpload:
      overrides.finalizeUpload ??
      vi.fn().mockResolvedValue({
        outcome: 'success',
        data: {
          documentId: 'doc-123',
          description: 'Test doc',
          date: '2024-06-15',
          archiveReference: '2024-06-15 — Test doc',
          status: 'finalized',
        },
      }),
    deleteUpload:
      overrides.deleteUpload ?? vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
    clearFlag: vi.fn(),
    patchMetadata: vi.fn(),
  } as DocumentsRequests;
}

const payload = {
  file: new File(['content'], 'test.pdf', { type: 'application/pdf' }),
  date: '2024-06-15',
  description: 'Test doc',
};

describe('uploadHandler', () => {
  describe('happy path — all three steps succeed', () => {
    it('calls initiateUpload, uploadFile, finalizeUpload in order and returns success', async () => {
      const requests = makeRequests();
      const result = await uploadHandler(requests, payload);

      expect(requests.initiateUpload).toHaveBeenCalledOnce();
      expect(requests.uploadFile).toHaveBeenCalledWith(
        'test-upload-id',
        expect.any(FormData),
      );
      expect(requests.finalizeUpload).toHaveBeenCalledWith('test-upload-id');
      expect(requests.deleteUpload).not.toHaveBeenCalled();

      expect(result).toEqual({
        outcome: 'success',
        data: {
          documentId: 'doc-123',
          description: 'Test doc',
          date: '2024-06-15',
          archiveReference: '2024-06-15 — Test doc',
          status: 'finalized',
        },
      });
    });
  });

  describe('initiateUpload returns error', () => {
    it('returns the error immediately without calling deleteUpload', async () => {
      const requests = makeRequests({
        initiateUpload: vi.fn().mockResolvedValue({
          outcome: 'error',
          errorType: 'unsupported_extension',
          errorMessage: 'Unsupported file extension.',
        }),
      });

      const result = await uploadHandler(requests, payload);

      expect(result).toEqual({
        outcome: 'error',
        errorType: 'unsupported_extension',
        errorMessage: 'Unsupported file extension.',
      });
      expect(requests.uploadFile).not.toHaveBeenCalled();
      expect(requests.finalizeUpload).not.toHaveBeenCalled();
      expect(requests.deleteUpload).not.toHaveBeenCalled();
    });
  });

  describe('uploadFile returns a non-duplicate error', () => {
    it('calls deleteUpload with the uploadId from step 1 and returns the error', async () => {
      const requests = makeRequests({
        uploadFile: vi.fn().mockResolvedValue({
          outcome: 'error',
          errorType: 'missing_file',
          errorMessage: 'No file provided.',
        }),
      });

      const result = await uploadHandler(requests, payload);

      expect(requests.deleteUpload).toHaveBeenCalledWith('test-upload-id');
      expect(requests.finalizeUpload).not.toHaveBeenCalled();
      expect(result).toEqual({
        outcome: 'error',
        errorType: 'missing_file',
        errorMessage: 'No file provided.',
      });
    });
  });

  describe('uploadFile returns duplicate_detected', () => {
    it('calls deleteUpload and returns the duplicate error with errorData', async () => {
      const existingRecord = {
        description: 'Existing doc',
        date: '2020-01-01',
        archiveReference: '2020-01-01 — Existing doc',
      };
      const requests = makeRequests({
        uploadFile: vi.fn().mockResolvedValue({
          outcome: 'error',
          errorType: 'duplicate_detected' satisfies UploadErrorType,
          errorMessage: 'A document with this file already exists.',
          errorData: existingRecord,
        }),
      });

      const result = await uploadHandler(requests, payload);

      expect(requests.deleteUpload).toHaveBeenCalledWith('test-upload-id');
      expect(result).toEqual({
        outcome: 'error',
        errorType: 'duplicate_detected',
        errorMessage: 'A document with this file already exists.',
        errorData: existingRecord,
      });
    });
  });

  describe('finalizeUpload returns error', () => {
    it('calls deleteUpload with the uploadId and returns the error', async () => {
      const requests = makeRequests({
        finalizeUpload: vi.fn().mockResolvedValue({
          outcome: 'error',
          errorType: 'upload_failed',
          errorMessage: 'Storage unavailable.',
        }),
      });

      const result = await uploadHandler(requests, payload);

      expect(requests.deleteUpload).toHaveBeenCalledWith('test-upload-id');
      expect(result).toEqual({
        outcome: 'error',
        errorType: 'upload_failed',
        errorMessage: 'Storage unavailable.',
      });
    });
  });

  describe('unexpected throw from uploadFile after initiateUpload succeeded', () => {
    it('calls deleteUpload with the uploadId from step 1 and re-throws', async () => {
      const networkError = new Error('network error');
      const requests = makeRequests({
        uploadFile: vi.fn().mockRejectedValue(networkError),
      });

      await expect(uploadHandler(requests, payload)).rejects.toThrow(
        'network error',
      );

      expect(requests.deleteUpload).toHaveBeenCalledWith('test-upload-id');
    });
  });
});
