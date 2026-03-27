/**
 * Tier 2 custom server route tests — curation document detail and metadata update.
 *
 * MSW intercepts at the Express boundary (http://localhost:4000).
 * Supertest drives the Hono app.
 *
 * Covers:
 *   GET /api/curation/documents/:id   — DOC-007
 *   PATCH /api/curation/documents/:id/metadata — DOC-009
 */

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

const docId = '01927c3a-5b2e-7000-8000-000000000001';

const sampleDetail = {
  documentId: docId,
  description: 'Wedding photograph',
  date: '1987-06-15',
  archiveReference: '1987-06-15 — Wedding photograph',
  documentType: 'photograph',
  people: ['Alice Smith', 'Bob Jones'],
  organisations: ['Estate of John Smith'],
  landReferences: ['North Field'],
  submitterIdentity: 'Primary Archivist',
  status: 'finalized',
  flagReason: null,
  flaggedAt: null,
  createdAt: '2026-03-13T09:00:00Z',
  updatedAt: '2026-03-13T09:05:00Z',
};

const sampleUpdateResponse = {
  documentId: docId,
  description: 'Wedding photograph (revised)',
  date: '1987-06-15',
  archiveReference: '1987-06-15 — Wedding photograph (revised)',
  documentType: 'photograph',
  people: ['Alice Smith'],
  organisations: ['Estate of John Smith'],
  landReferences: ['North Field'],
  updatedAt: '2026-03-27T10:00:00Z',
};

// ---------------------------------------------------------------------------
// GET /api/curation/documents/:id
// ---------------------------------------------------------------------------

describe('GET /api/curation/documents/:id', () => {
  it('200: returns document detail from Express', async () => {
    mswServer.use(
      http.get(`http://localhost:4000/api/documents/${docId}`, () =>
        HttpResponse.json(sampleDetail, { status: 200 }),
      ),
    );

    const res = await request.get(`/api/curation/documents/${docId}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(sampleDetail);
  });

  it('404: propagates not_found from Express', async () => {
    mswServer.use(
      http.get('http://localhost:4000/api/documents/nonexistent-id', () =>
        HttpResponse.json(
          { error: 'not_found', message: 'Document not found.' },
          { status: 404 },
        ),
      ),
    );

    const res = await request.get('/api/curation/documents/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'not_found' });
  });

  it('500: returns structured error when Express fails unexpectedly', async () => {
    mswServer.use(
      http.get(`http://localhost:4000/api/documents/${docId}`, () =>
        HttpResponse.json({ error: 'internal_error' }, { status: 500 }),
      ),
    );

    const res = await request.get(`/api/curation/documents/${docId}`);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/curation/documents/:id/metadata
// ---------------------------------------------------------------------------

describe('PATCH /api/curation/documents/:id/metadata', () => {
  const validPatch = {
    description: 'Wedding photograph (revised)',
    people: ['Alice Smith'],
  };

  it('200: returns updated metadata from Express', async () => {
    mswServer.use(
      http.patch(`http://localhost:4000/api/documents/${docId}/metadata`, () =>
        HttpResponse.json(sampleUpdateResponse, { status: 200 }),
      ),
    );

    const res = await request
      .patch(`/api/curation/documents/${docId}/metadata`)
      .send(validPatch)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(sampleUpdateResponse);
  });

  it('400: propagates invalid_params from Express', async () => {
    mswServer.use(
      http.patch(`http://localhost:4000/api/documents/${docId}/metadata`, () =>
        HttpResponse.json(
          {
            error: 'invalid_params',
            message: 'description must not be empty.',
          },
          { status: 400 },
        ),
      ),
    );

    // Send a valid-to-Hono patch; Express rejects it.
    const res = await request
      .patch(`/api/curation/documents/${docId}/metadata`)
      .send(validPatch)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_params' });
  });

  it('400: returns invalid_params when Hono-level Zod validation fails', async () => {
    // Send an invalid description (empty string fails trim().min(1)).
    const res = await request
      .patch(`/api/curation/documents/${docId}/metadata`)
      .send({ description: '' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_params' });
  });

  it('404: propagates not_found from Express', async () => {
    mswServer.use(
      http.patch(
        'http://localhost:4000/api/documents/nonexistent-id/metadata',
        () =>
          HttpResponse.json(
            { error: 'not_found', message: 'Document not found.' },
            { status: 404 },
          ),
      ),
    );

    const res = await request
      .patch('/api/curation/documents/nonexistent-id/metadata')
      .send(validPatch)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'not_found' });
  });
});
