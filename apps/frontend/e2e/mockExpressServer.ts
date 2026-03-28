/**
 * Mock Express server for E2E tests.
 *
 * Runs a lightweight Node.js HTTP server on port 4000 that handles all Express
 * API routes exercised by the five E2E scenarios. The Hono custom server's Ky
 * client is pre-configured to call http://localhost:4000, so this mock
 * intercepts at the network boundary without MSW service workers.
 *
 * Call start() in globalSetup and stop() in globalTeardown.
 */

import { createServer, type Server } from 'node:http';

const MOCK_PORT = 4000;

// IDs used consistently across all scenarios so tests can reference them.
export const MOCK_UPLOAD_ID = '01927c3a-5b2e-7000-8000-000000000001';
export const MOCK_DOCUMENT_ID = '01927c3a-5b2e-7000-8000-000000000002';
export const MOCK_TERM_ID_1 = '01927c3a-5b2e-7000-8000-000000000003';
export const MOCK_TERM_ID_2 = '01927c3a-5b2e-7000-8000-000000000004';
export const MOCK_QUEUE_DOC_ID = '01927c3a-5b2e-7000-8000-000000000005';

// Per-scenario state — reset between tests via the /test-reset endpoint.
interface MockState {
  // Upload scenarios
  uploadShouldReturnDuplicate: boolean;
  // Tracks IDs that have been removed from any queue (cleared documents,
  // accepted/rejected vocabulary candidates). Reset between tests.
  removedIds: Set<string>;
}

let state: MockState = {
  uploadShouldReturnDuplicate: false,
  removedIds: new Set(),
};

function resetState(): void {
  state = {
    uploadShouldReturnDuplicate: false,
    removedIds: new Set(),
  };
}

function json(
  res: import('node:http').ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  const data = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

async function readBody(
  req: import('node:http').IncomingMessage,
): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

let server: Server | null = null;

export function start(): Promise<void> {
  return new Promise((resolve, reject) => {
    server = createServer(async (req, res) => {
      const url = req.url ?? '/';
      const method = req.method ?? 'GET';

      // Test control endpoint — allows test-level state resets without
      // restarting the server between scenarios.
      if (method === 'POST' && url === '/test-reset') {
        resetState();
        json(res, 200, { ok: true });
        return;
      }

      // Test control endpoint — set duplicate mode for upload scenarios.
      if (method === 'POST' && url === '/test-set-duplicate') {
        state.uploadShouldReturnDuplicate = true;
        json(res, 200, { ok: true });
        return;
      }

      // -----------------------------------------------------------------------
      // DOC-001: POST /api/documents/initiate
      // -----------------------------------------------------------------------
      if (method === 'POST' && url === '/api/documents/initiate') {
        json(res, 201, { uploadId: MOCK_UPLOAD_ID, status: 'initiated' });
        return;
      }

      // -----------------------------------------------------------------------
      // DOC-002: POST /api/documents/:uploadId/upload
      // -----------------------------------------------------------------------
      if (
        method === 'POST' &&
        url === `/api/documents/${MOCK_UPLOAD_ID}/upload`
      ) {
        if (state.uploadShouldReturnDuplicate) {
          json(res, 409, {
            data: {
              existingRecord: {
                documentId: MOCK_DOCUMENT_ID,
                description: 'Duplicate family letter',
                date: '2024-01-15',
                archiveReference: '2024-01-15 — Duplicate family letter',
              },
            },
          });
        } else {
          json(res, 200, {
            uploadId: MOCK_UPLOAD_ID,
            status: 'uploaded',
            fileHash: 'abc123def456',
          });
        }
        return;
      }

      // -----------------------------------------------------------------------
      // DOC-003: POST /api/documents/:uploadId/finalize
      // -----------------------------------------------------------------------
      if (
        method === 'POST' &&
        url === `/api/documents/${MOCK_UPLOAD_ID}/finalize`
      ) {
        json(res, 200, {
          documentId: MOCK_DOCUMENT_ID,
          description: 'Family letter',
          date: '2024-01-15',
          archiveReference: '2024-01-15 — Family letter',
          status: 'finalized',
        });
        return;
      }

      // -----------------------------------------------------------------------
      // DOC-005: DELETE /api/documents/:uploadId (cleanup)
      // -----------------------------------------------------------------------
      if (method === 'DELETE' && url === `/api/documents/${MOCK_UPLOAD_ID}`) {
        json(res, 200, { deleted: true });
        return;
      }

      // -----------------------------------------------------------------------
      // DOC-006: GET /api/curation/documents
      // -----------------------------------------------------------------------
      if (method === 'GET' && url.startsWith('/api/curation/documents')) {
        const remaining = [
          {
            documentId: MOCK_QUEUE_DOC_ID,
            description: 'Family letter from grandmother',
            date: '1985-06-20',
            archiveReference: '1985-06-20 — Family letter from grandmother',
            flagReason: 'OCR quality below threshold',
            flaggedAt: '2026-03-01T10:00:00Z',
            submitterIdentity: 'Primary Archivist',
            pipelineStatus: 'ocr',
          },
        ].filter((doc) => !state.removedIds.has(doc.documentId));

        json(res, 200, {
          documents: remaining,
          total: remaining.length,
          page: 1,
          pageSize: 50,
        });
        return;
      }

      // -----------------------------------------------------------------------
      // DOC-007: GET /api/documents/:id (document detail — Hono calls this)
      // -----------------------------------------------------------------------
      if (method === 'GET' && url === `/api/documents/${MOCK_QUEUE_DOC_ID}`) {
        json(res, 200, {
          documentId: MOCK_QUEUE_DOC_ID,
          description: 'Family letter from grandmother',
          date: '1985-06-20',
          archiveReference: '1985-06-20 — Family letter from grandmother',
          documentType: 'letter',
          people: ['Grandmother Smith'],
          organisations: [],
          landReferences: [],
          submitterIdentity: 'Primary Archivist',
          status: 'finalized',
          flagReason: null,
          flaggedAt: null,
          createdAt: '2026-03-01T09:00:00Z',
          updatedAt: '2026-03-01T09:00:00Z',
        });
        return;
      }

      // -----------------------------------------------------------------------
      // DOC-008: POST /api/documents/:id/clear-flag
      // -----------------------------------------------------------------------
      if (
        method === 'POST' &&
        url === `/api/documents/${MOCK_QUEUE_DOC_ID}/clear-flag`
      ) {
        state.removedIds.add(MOCK_QUEUE_DOC_ID);
        json(res, 200, { documentId: MOCK_QUEUE_DOC_ID, flagCleared: true });
        return;
      }

      // -----------------------------------------------------------------------
      // DOC-009: PATCH /api/documents/:id/metadata
      // -----------------------------------------------------------------------
      if (
        method === 'PATCH' &&
        url === `/api/documents/${MOCK_QUEUE_DOC_ID}/metadata`
      ) {
        const body = await readBody(req);
        const patch = JSON.parse(body) as { description?: string };
        json(res, 200, {
          documentId: MOCK_QUEUE_DOC_ID,
          description: patch.description ?? 'Family letter from grandmother',
          date: '1985-06-20',
          archiveReference: '1985-06-20 — Family letter from grandmother',
          documentType: 'letter',
          people: ['Grandmother Smith'],
          organisations: [],
          landReferences: [],
          updatedAt: '2026-03-01T10:00:00Z',
        });
        return;
      }

      // -----------------------------------------------------------------------
      // VOC-001: GET /api/curation/vocabulary
      // -----------------------------------------------------------------------
      if (method === 'GET' && url.startsWith('/api/curation/vocabulary')) {
        const remaining = [
          {
            termId: MOCK_TERM_ID_1,
            term: 'Home Farm',
            category: 'land',
            confidence: 0.85,
            description: null,
            sourceDocumentDescription: 'Family letter from grandmother',
            sourceDocumentDate: '1985-06-20',
            createdAt: '2026-03-01T09:00:00Z',
          },
          {
            termId: MOCK_TERM_ID_2,
            term: 'Grandmother Smith',
            category: 'person',
            confidence: 0.92,
            description: null,
            sourceDocumentDescription: 'Family letter from grandmother',
            sourceDocumentDate: '1985-06-20',
            createdAt: '2026-03-01T09:00:00Z',
          },
        ].filter((c) => !state.removedIds.has(c.termId));

        json(res, 200, {
          candidates: remaining,
          total: remaining.length,
          page: 1,
          pageSize: 50,
        });
        return;
      }

      // -----------------------------------------------------------------------
      // VOC-002: POST /api/curation/vocabulary/:termId/accept
      // -----------------------------------------------------------------------
      if (method === 'POST' && url.endsWith('/accept')) {
        const termId = url.split('/')[4] ?? '';
        state.removedIds.add(termId);
        json(res, 200, {
          termId,
          term: 'Home Farm',
          source: 'candidate_accepted',
        });
        return;
      }

      // -----------------------------------------------------------------------
      // VOC-003: POST /api/curation/vocabulary/:termId/reject
      // -----------------------------------------------------------------------
      if (method === 'POST' && url.endsWith('/reject')) {
        const termId = url.split('/')[4] ?? '';
        state.removedIds.add(termId);
        json(res, 200, { termId, rejected: true });
        return;
      }

      // Fallback — 404 for any unrecognised path.
      json(res, 404, {
        error: 'not_found',
        message: `Mock: no handler for ${method} ${url}`,
      });
    });

    server.on('error', reject);
    server.listen(MOCK_PORT, () => resolve());
  });
}

export function stop(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server === null) {
      resolve();
      return;
    }
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        server = null;
        resolve();
      }
    });
  });
}
