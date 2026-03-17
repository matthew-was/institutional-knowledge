/**
 * Unit tests for DocumentService.
 *
 * All dependencies (db, storage, config, log) are mocked. Service methods are
 * called directly with plain inputs and assertions are made on ServiceResult.
 * No Express req/res/next mocks needed.
 *
 * Covers the acceptance conditions from backend-tasks.md Task 8:
 *
 * (a) initiateUpload: 422 bad extension, 422 file too large,
 *     400 whitespace description, success on valid input
 * (b) uploadFile: not_found, duplicate_detected with DuplicateConflictResponse,
 *     success with fileHash
 * (c) finalizeUpload: not_found, success with archiveReference
 * (d) cleanupUpload: finalized_document, success; correct storage method per status
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeConfig, makeLog } from '../../testing/testHelpers.js';
import type { DocumentServiceDeps } from '../documents.js';
import { createDocumentService } from '../documents.js';

function makeDocumentsRepo(
  overrides?: Partial<DocumentServiceDeps['db']['documents']>,
) {
  return {
    insert: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(undefined),
    updateAfterUpload: vi.fn().mockResolvedValue(undefined),
    updateAfterFinalize: vi.fn().mockResolvedValue(undefined),
    findFinalizedByHash: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as DocumentServiceDeps['db']['documents'];
}

// ---------------------------------------------------------------------------
// (a) initiateUpload
// ---------------------------------------------------------------------------

describe('initiateUpload', () => {
  let deps: DocumentServiceDeps;

  beforeEach(() => {
    deps = {
      db: {
        documents: makeDocumentsRepo(),
      } as unknown as DocumentServiceDeps['db'],
      storage: {} as DocumentServiceDeps['storage'],
      config: makeConfig(),
      log: makeLog() as unknown as DocumentServiceDeps['log'],
    };
  });

  it('returns unsupported_extension error for unsupported file extension', async () => {
    const service = createDocumentService(deps);
    const result = await service.initiateUpload({
      filename: 'document.exe',
      contentType: 'application/octet-stream',
      fileSizeBytes: 1000,
      date: '2024-01-01',
      description: 'Some doc',
    });

    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') {
      expect(result.errorType).toBe('unsupported_extension');
    }
  });

  it('returns file_too_large error for file size over limit', async () => {
    const service = createDocumentService(deps);
    const result = await service.initiateUpload({
      filename: 'large.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: 11 * 1024 * 1024, // 11 MB > 10 MB limit
      date: '2024-01-01',
      description: 'Large file',
    });

    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') {
      expect(result.errorType).toBe('file_too_large');
    }
  });

  it('returns whitespace_description error for whitespace-only description', async () => {
    const service = createDocumentService(deps);
    const result = await service.initiateUpload({
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: 1000,
      date: '2024-01-01',
      description: '   ',
    });

    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') {
      expect(result.errorType).toBe('whitespace_description');
    }
  });

  it('returns success with uploadId on valid request', async () => {
    const service = createDocumentService(deps);
    const result = await service.initiateUpload({
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: 5 * 1024 * 1024,
      date: '2024-06-15',
      description: 'A wedding photo',
    });

    expect(result.outcome).toBe('success');
    if (result.outcome === 'success') {
      expect(typeof result.data.uploadId).toBe('string');
      expect(result.data.uploadId.length).toBeGreaterThan(0);
      expect(result.data.status).toBe('initiated');
    }
  });
});

// ---------------------------------------------------------------------------
// (b) uploadFile
// ---------------------------------------------------------------------------

describe('uploadFile', () => {
  function makeDeps(
    docRow: unknown | undefined,
    duplicateRow: unknown | undefined = undefined,
  ): DocumentServiceDeps {
    return {
      db: {
        documents: makeDocumentsRepo({
          getById: vi.fn().mockResolvedValue(docRow),
          findFinalizedByHash: vi.fn().mockResolvedValue(duplicateRow),
        }),
      } as unknown as DocumentServiceDeps['db'],
      storage: {
        writeStagingFile: vi.fn().mockResolvedValue('/staging/id/file.jpg'),
        deleteStagingFile: vi.fn().mockResolvedValue(undefined),
      } as unknown as DocumentServiceDeps['storage'],
      config: makeConfig(),
      log: makeLog() as unknown as DocumentServiceDeps['log'],
    };
  }

  it('returns not_found when uploadId is not found', async () => {
    const deps = makeDeps(undefined);
    const service = createDocumentService(deps);

    const result = await service.uploadFile({
      uploadId: 'nonexistent',
      fileBuffer: Buffer.from('x'),
      fileSize: 1,
    });

    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') {
      expect(result.errorType).toBe('not_found');
    }
  });

  it('returns not_found when document status is not initiated', async () => {
    const doc = {
      id: 'abc',
      status: 'uploaded',
      filename: 'photo.jpg',
      description: 'test',
      date: null,
    };
    const deps = makeDeps(doc);
    const service = createDocumentService(deps);

    const result = await service.uploadFile({
      uploadId: 'abc',
      fileBuffer: Buffer.from('x'),
      fileSize: 1,
    });

    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') {
      expect(result.errorType).toBe('not_found');
    }
  });

  it('returns duplicate_detected with DuplicateConflictResponse when hash matches finalized document', async () => {
    const existingDoc = {
      id: 'existing-id',
      description: 'Wedding photo',
      date: '1987-06-15',
      status: 'finalized',
    };
    const doc = {
      id: 'abc',
      status: 'initiated',
      filename: 'photo.jpg',
      description: 'test',
      date: null,
    };
    const deps = makeDeps(doc, existingDoc);
    const service = createDocumentService(deps);

    const result = await service.uploadFile({
      uploadId: 'abc',
      fileBuffer: Buffer.from('hello'),
      fileSize: 5,
    });

    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') {
      expect(result.errorType).toBe('duplicate_detected');
      expect(result.errorData?.error).toBe('duplicate_detected');
      expect(result.errorData?.existingRecord.documentId).toBe('existing-id');
      expect(result.errorData?.existingRecord.archiveReference).toBe(
        '1987-06-15 — Wedding photo',
      );
    }
  });

  it('returns success with fileHash on success (no duplicate)', async () => {
    const doc = {
      id: 'abc',
      status: 'initiated',
      filename: 'photo.jpg',
      description: 'test',
      date: null,
    };
    const deps = makeDeps(doc, undefined);
    const service = createDocumentService(deps);

    const result = await service.uploadFile({
      uploadId: 'abc',
      fileBuffer: Buffer.from('file-content'),
      fileSize: 12,
    });

    expect(result.outcome).toBe('success');
    if (result.outcome === 'success') {
      expect(result.data.uploadId).toBe('abc');
      expect(result.data.status).toBe('uploaded');
      expect(typeof result.data.fileHash).toBe('string');
      expect(result.data.fileHash).toHaveLength(32); // MD5 hex
    }
  });
});

// ---------------------------------------------------------------------------
// (c) finalizeUpload
// ---------------------------------------------------------------------------

describe('finalizeUpload', () => {
  function makeDeps(doc: unknown | undefined): DocumentServiceDeps {
    return {
      db: {
        documents: makeDocumentsRepo({
          getById: vi.fn().mockResolvedValue(doc),
        }),
      } as unknown as DocumentServiceDeps['db'],
      storage: {
        moveStagingToPermanent: vi
          .fn()
          .mockResolvedValue('/base/abc/photo.jpg'),
      } as unknown as DocumentServiceDeps['storage'],
      config: makeConfig(),
      log: makeLog() as unknown as DocumentServiceDeps['log'],
    };
  }

  it('returns not_found when document is not in uploaded status', async () => {
    const doc = {
      id: 'abc',
      status: 'initiated',
      filename: 'photo.jpg',
      description: 'test',
      date: null,
    };
    const service = createDocumentService(makeDeps(doc));

    const result = await service.finalizeUpload('abc');

    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') {
      expect(result.errorType).toBe('not_found');
    }
  });

  it('returns success with archiveReference on success', async () => {
    const doc = {
      id: 'abc',
      status: 'uploaded',
      filename: 'photo.jpg',
      description: 'Wedding photo',
      date: '1987-06-15',
    };
    const service = createDocumentService(makeDeps(doc));

    const result = await service.finalizeUpload('abc');

    expect(result.outcome).toBe('success');
    if (result.outcome === 'success') {
      expect(result.data.documentId).toBe('abc');
      expect(result.data.status).toBe('finalized');
      expect(result.data.archiveReference).toBe('1987-06-15 — Wedding photo');
    }
  });

  it('uses [undated] prefix in archiveReference when date is null', async () => {
    const doc = {
      id: 'abc',
      status: 'uploaded',
      filename: 'photo.jpg',
      description: 'Undated photo',
      date: null,
    };
    const service = createDocumentService(makeDeps(doc));

    const result = await service.finalizeUpload('abc');

    expect(result.outcome).toBe('success');
    if (result.outcome === 'success') {
      expect(result.data.archiveReference).toBe('[undated] — Undated photo');
    }
  });
});

// ---------------------------------------------------------------------------
// (d) cleanupUpload
// ---------------------------------------------------------------------------

describe('cleanupUpload', () => {
  function makeDepsForCleanup(doc: unknown | undefined) {
    const storage = {
      deleteStagingFile: vi.fn().mockResolvedValue(undefined),
      deletePermanentFile: vi.fn().mockResolvedValue(undefined),
    } as unknown as DocumentServiceDeps['storage'];

    const deps: DocumentServiceDeps = {
      db: {
        documents: makeDocumentsRepo({
          getById: vi.fn().mockResolvedValue(doc),
        }),
      } as unknown as DocumentServiceDeps['db'],
      storage,
      config: makeConfig(),
      log: makeLog() as unknown as DocumentServiceDeps['log'],
    };

    return { deps, storage };
  }

  it('returns not_found when document is not found', async () => {
    const { deps } = makeDepsForCleanup(undefined);
    const service = createDocumentService(deps);

    const result = await service.cleanupUpload('nonexistent');

    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') {
      expect(result.errorType).toBe('not_found');
    }
  });

  it('returns finalized_document error when document is finalized', async () => {
    const doc = {
      id: 'abc',
      status: 'finalized',
      filename: 'photo.jpg',
      storagePath: '/base/abc/photo.jpg',
    };
    const { deps } = makeDepsForCleanup(doc);
    const service = createDocumentService(deps);

    const result = await service.cleanupUpload('abc');

    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') {
      expect(result.errorType).toBe('finalized_document');
    }
  });

  it('returns success and calls deleteStagingFile for uploaded status', async () => {
    const doc = {
      id: 'abc',
      status: 'uploaded',
      filename: 'photo.jpg',
      storagePath: null,
    };
    const { deps, storage } = makeDepsForCleanup(doc);
    const service = createDocumentService(deps);

    const result = await service.cleanupUpload('abc');

    expect(result.outcome).toBe('success');
    if (result.outcome === 'success') {
      expect(result.data.deleted).toBe(true);
    }
    expect(
      storage.deleteStagingFile as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledWith('abc', 'photo.jpg');
    expect(
      storage.deletePermanentFile as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
  });

  it('calls deleteStagingFile for initiated status', async () => {
    const doc = {
      id: 'abc',
      status: 'initiated',
      filename: 'photo.jpg',
      storagePath: null,
    };
    const { deps, storage } = makeDepsForCleanup(doc);
    const service = createDocumentService(deps);

    await service.cleanupUpload('abc');

    expect(
      storage.deleteStagingFile as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledWith('abc', 'photo.jpg');
    expect(
      storage.deletePermanentFile as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
  });

  it('calls deletePermanentFile for stored status', async () => {
    const doc = {
      id: 'abc',
      status: 'stored',
      filename: 'photo.jpg',
      storagePath: '/base/abc/photo.jpg',
    };
    const { deps, storage } = makeDepsForCleanup(doc);
    const service = createDocumentService(deps);

    await service.cleanupUpload('abc');

    expect(
      storage.deletePermanentFile as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledWith('/base/abc/photo.jpg');
    expect(
      storage.deleteStagingFile as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
  });
});
