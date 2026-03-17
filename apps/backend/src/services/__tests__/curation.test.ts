/**
 * Unit tests for CurationService pure-function logic.
 *
 * Only logic that can be extracted to a pure function is tested here.
 * All paths that touch the database are covered by the route integration
 * tests in routes/__tests__/curation.integration.test.ts.
 *
 * Covers:
 * - archiveReference derivation in getDocumentQueue
 * - archiveReference derivation in getDocument
 * - archiveReference derivation in updateDocumentMetadata
 */

import { describe, expect, it, vi } from 'vitest';
import { makeLog } from '../../testing/testHelpers.js';
import type { CurationServiceDeps } from '../curation.js';
import { createCurationService } from '../curation.js';

function makeDocumentsRepo(
  overrides?: Partial<CurationServiceDeps['db']['documents']>,
) {
  return {
    insert: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(undefined),
    updateAfterUpload: vi.fn().mockResolvedValue(undefined),
    updateAfterFinalize: vi.fn().mockResolvedValue(undefined),
    findFinalizedByHash: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getFlagged: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    clearFlag: vi.fn().mockResolvedValue(undefined),
    updateMetadata: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as CurationServiceDeps['db']['documents'];
}

function makePipelineStepsRepo(
  overrides?: Partial<CurationServiceDeps['db']['pipelineSteps']>,
) {
  return {
    getLatestFailedStepName: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as CurationServiceDeps['db']['pipelineSteps'];
}

function makeDocumentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-id-1',
    status: 'finalized',
    filename: 'photo.jpg',
    contentType: 'image/jpeg',
    fileSizeBytes: '204800',
    fileHash: 'abc123',
    storagePath: '/storage/photo.jpg',
    date: '1987-06-15',
    description: 'Wedding photograph',
    documentType: null,
    people: ['Alice Smith'],
    organisations: ['Estate of John Smith'],
    landReferences: ['North Field'],
    flagReason: 'OCR quality below threshold',
    flaggedAt: new Date('2026-03-13T10:00:00Z'),
    submitterIdentity: 'Primary Archivist',
    ingestionRunId: null,
    createdAt: new Date('2026-03-13T09:00:00Z'),
    updatedAt: new Date('2026-03-13T09:05:00Z'),
    ...overrides,
  };
}

function makeDeps(
  docOverrides?: Partial<CurationServiceDeps['db']['documents']>,
): CurationServiceDeps {
  return {
    db: {
      documents: makeDocumentsRepo(docOverrides),
      pipelineSteps: makePipelineStepsRepo(),
    } as unknown as CurationServiceDeps['db'],
    log: makeLog() as unknown as CurationServiceDeps['log'],
  };
}

// ---------------------------------------------------------------------------
// archiveReference derivation
// ---------------------------------------------------------------------------

describe('archiveReference derivation', () => {
  it('derives archiveReference in getDocumentQueue from date and description', async () => {
    const row = makeDocumentRow({
      date: '1987-06-15',
      description: 'Wedding photograph',
    });
    const deps = makeDeps({
      getFlagged: vi.fn().mockResolvedValue({ rows: [row], total: 1 }),
    });

    const result = await createCurationService(deps).getDocumentQueue(1, 50);

    expect(result.outcome).toBe('success');
    if (result.outcome === 'success') {
      expect(result.data.documents[0].archiveReference).toBe(
        '1987-06-15 — Wedding photograph',
      );
    }
  });

  it('derives archiveReference in getDocument from date and description', async () => {
    const row = makeDocumentRow({
      date: '1987-06-15',
      description: 'Wedding photograph',
    });
    const deps = makeDeps({ getById: vi.fn().mockResolvedValue(row) });

    const result = await createCurationService(deps).getDocument('doc-id-1');

    expect(result.outcome).toBe('success');
    if (result.outcome === 'success') {
      expect(result.data.archiveReference).toBe(
        '1987-06-15 — Wedding photograph',
      );
    }
  });

  it('re-derives archiveReference in updateDocumentMetadata from the updated row', async () => {
    const original = makeDocumentRow();
    const updated = makeDocumentRow({
      date: '2000-01-01',
      description: 'New title',
    });
    const deps = makeDeps({
      getById: vi.fn().mockResolvedValue(original),
      updateMetadata: vi.fn().mockResolvedValue(updated),
    });

    const result = await createCurationService(deps).updateDocumentMetadata(
      'doc-id-1',
      {
        date: '2000-01-01',
        description: 'New title',
      },
    );

    expect(result.outcome).toBe('success');
    if (result.outcome === 'success') {
      expect(result.data.archiveReference).toBe('2000-01-01 — New title');
    }
  });
});
