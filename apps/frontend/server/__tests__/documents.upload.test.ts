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
  server: { host: 'localhost', port: 3000 },
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

describe('POST /api/documents/upload — integration', () => {
  it('201 success path: returns finalized document body from Express', async () => {
    mswServer.use(
      http.post('http://localhost:4000/api/documents/initiate', () =>
        HttpResponse.json(
          { uploadId: 'test-upload-id', status: 'initiated' },
          { status: 201 },
        ),
      ),
      http.post(
        'http://localhost:4000/api/documents/test-upload-id/upload',
        () =>
          HttpResponse.json(
            {
              uploadId: 'test-upload-id',
              status: 'uploaded',
              fileHash: 'abc123',
            },
            { status: 200 },
          ),
      ),
      http.post(
        'http://localhost:4000/api/documents/test-upload-id/finalize',
        () =>
          HttpResponse.json(
            {
              documentId: 'doc-123',
              description: 'Test doc',
              date: '2024-06-15',
              archiveReference: '2024-06-15 — Test doc',
              status: 'finalized',
            },
            { status: 200 },
          ),
      ),
    );

    const res = await request
      .post('/api/documents/upload')
      .attach('file', Buffer.from('pdf content'), {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      })
      .field('date', '2024-06-15')
      .field('description', 'Test doc');

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      documentId: 'doc-123',
      description: 'Test doc',
      date: '2024-06-15',
      archiveReference: '2024-06-15 — Test doc',
      status: 'finalized',
    });
  });

  it('409 duplicate path: returns duplicate error with existingRecord nested under data', async () => {
    const existingRecord = {
      documentId: 'existing-id',
      description: 'Existing doc',
      date: '2020-01-01',
      archiveReference: '2020-01-01 — Existing doc',
    };

    mswServer.use(
      http.post('http://localhost:4000/api/documents/initiate', () =>
        HttpResponse.json(
          { uploadId: 'test-upload-id', status: 'initiated' },
          { status: 201 },
        ),
      ),
      http.post(
        'http://localhost:4000/api/documents/test-upload-id/upload',
        () =>
          HttpResponse.json(
            {
              error: 'duplicate_detected',
              data: { existingRecord },
            },
            { status: 409 },
          ),
      ),
      // Best-effort delete will be called after duplicate — return 200 to keep it quiet
      http.delete(
        'http://localhost:4000/api/documents/test-upload-id',
        () => new HttpResponse(null, { status: 200 }),
      ),
    );

    const res = await request
      .post('/api/documents/upload')
      .attach('file', Buffer.from('pdf content'), {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      })
      .field('date', '2024-06-15')
      .field('description', 'Test doc');

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: 'duplicate_detected',
      data: { existingRecord },
    });
    // Confirm existingRecord is nested under data, not at the top level
    expect(res.body.existingRecord).toBeUndefined();
  });

  it('5xx from Express: returns 500 with a structured error body', async () => {
    mswServer.use(
      http.post('http://localhost:4000/api/documents/initiate', () =>
        HttpResponse.json({ error: 'internal_error' }, { status: 500 }),
      ),
    );

    const res = await request
      .post('/api/documents/upload')
      .attach('file', Buffer.from('pdf content'), {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      })
      .field('date', '2024-06-15')
      .field('description', 'Test doc');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});
