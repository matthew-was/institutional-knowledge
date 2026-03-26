import { createAdaptorServer } from '@hono/node-server';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import pino from 'pino';
import supertest from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parseConfig } from '../config';
import { createExpressClient } from '../requests/client';
import { createHonoApp } from '../server';

const testConfig = parseConfig({
  server: { port: 3000 },
  express: {
    baseUrl: 'http://localhost:4000',
    internalKey: 'test-internal-key',
  },
  upload: { maxFileSizeMb: 50, acceptedExtensions: ['.pdf', '.jpg'] },
});

const silentLog = pino({ level: 'silent' });

const app = createHonoApp({
  config: testConfig,
  expressClient: createExpressClient(testConfig),
  log: silentLog,
});
const httpServer = createAdaptorServer({ fetch: app.fetch });
const request = supertest(httpServer);

const mswServer = setupServer();

beforeAll(() => mswServer.listen());
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

const sampleDocument = {
  documentId: '01927c3a-5b2e-7000-8000-000000000001',
  description: 'Wedding photograph',
  date: '1987-06-15',
  archiveReference: '1987-06-15 — Wedding photograph',
  flagReason: 'OCR quality below threshold',
  flaggedAt: '2026-03-13T10:00:00Z',
  submitterIdentity: 'Primary Archivist',
  pipelineStatus: 'ocr',
};

describe('GET /api/curation/documents', () => {
  it('200: returns document queue from Express', async () => {
    const queueResponse = {
      documents: [sampleDocument],
      total: 1,
      page: 1,
      pageSize: 50,
    };

    mswServer.use(
      http.get('http://localhost:4000/api/curation/documents', () =>
        HttpResponse.json(queueResponse, { status: 200 }),
      ),
    );

    const res = await request.get('/api/curation/documents');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(queueResponse);
  });

  it('200: passes page and pageSize query params to Express', async () => {
    let capturedUrl: string | undefined;

    mswServer.use(
      http.get(
        'http://localhost:4000/api/curation/documents',
        ({ request: req }) => {
          capturedUrl = req.url;
          return HttpResponse.json(
            { documents: [], total: 0, page: 2, pageSize: 10 },
            { status: 200 },
          );
        },
      ),
    );

    const res = await request.get('/api/curation/documents?page=2&pageSize=10');

    expect(res.status).toBe(200);
    expect(capturedUrl).toContain('page=2');
    expect(capturedUrl).toContain('pageSize=10');
  });

  it('400: returns invalid_params when query params fail Zod validation', async () => {
    const res = await request.get('/api/curation/documents?page=abc');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_params' });
  });

  it('500: returns structured error when Express is unreachable', async () => {
    mswServer.use(
      http.get('http://localhost:4000/api/curation/documents', () =>
        HttpResponse.json({ error: 'internal_error' }, { status: 500 }),
      ),
    );

    const res = await request.get('/api/curation/documents');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});

describe('POST /api/curation/documents/:id/clear-flag', () => {
  it('200: returns cleared flag response from Express', async () => {
    const clearResponse = {
      documentId: '01927c3a-5b2e-7000-8000-000000000001',
      status: 'active',
    };

    mswServer.use(
      http.post(
        'http://localhost:4000/api/documents/01927c3a-5b2e-7000-8000-000000000001/clear-flag',
        () => HttpResponse.json(clearResponse, { status: 200 }),
      ),
    );

    const res = await request.post(
      '/api/curation/documents/01927c3a-5b2e-7000-8000-000000000001/clear-flag',
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual(clearResponse);
  });

  it('404: propagates not_found error from Express', async () => {
    mswServer.use(
      http.post(
        'http://localhost:4000/api/documents/nonexistent-id/clear-flag',
        () =>
          HttpResponse.json(
            { error: 'not_found', message: 'Document not found.' },
            { status: 404 },
          ),
      ),
    );

    const res = await request.post(
      '/api/curation/documents/nonexistent-id/clear-flag',
    );

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'not_found' });
  });

  it('409: propagates no_active_flag error from Express', async () => {
    mswServer.use(
      http.post(
        'http://localhost:4000/api/documents/01927c3a-5b2e-7000-8000-000000000001/clear-flag',
        () =>
          HttpResponse.json(
            {
              error: 'no_active_flag',
              message: 'Document has no active flag.',
            },
            { status: 409 },
          ),
      ),
    );

    const res = await request.post(
      '/api/curation/documents/01927c3a-5b2e-7000-8000-000000000001/clear-flag',
    );

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'no_active_flag' });
  });

  it('500: returns structured error body on unexpected Express failure', async () => {
    mswServer.use(
      http.post('http://localhost:4000/api/documents/some-id/clear-flag', () =>
        HttpResponse.json({ error: 'internal_error' }, { status: 500 }),
      ),
    );

    const res = await request.post(
      '/api/curation/documents/some-id/clear-flag',
    );

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});
