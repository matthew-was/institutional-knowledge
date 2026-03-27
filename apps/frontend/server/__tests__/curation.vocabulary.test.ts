/**
 * Tier 2 custom server route tests — vocabulary review queue.
 *
 * MSW intercepts at the Express boundary (http://localhost:4000).
 * Supertest drives the Hono app.
 *
 * Covers:
 *   GET /api/curation/vocabulary                    — VOC-001
 *   POST /api/curation/vocabulary/:termId/accept    — VOC-002
 *   POST /api/curation/vocabulary/:termId/reject    — VOC-003
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

const termId = '01927c3a-5b2e-7000-8000-000000000001';

const sampleCandidate = {
  termId,
  term: 'Smith Estate',
  category: 'Organisation',
  confidence: 0.87,
  description: null,
  sourceDocumentDescription: 'Estate inventory 1952',
  sourceDocumentDate: '1952-01-01',
  createdAt: '2026-03-13T10:00:00Z',
};

// ---------------------------------------------------------------------------
// GET /api/curation/vocabulary
// ---------------------------------------------------------------------------

describe('GET /api/curation/vocabulary', () => {
  it('200: returns vocabulary queue data from Express', async () => {
    const queueResponse = {
      candidates: [sampleCandidate],
      total: 1,
      page: 1,
      pageSize: 50,
    };

    mswServer.use(
      http.get('http://localhost:4000/api/curation/vocabulary', () =>
        HttpResponse.json(queueResponse, { status: 200 }),
      ),
    );

    const res = await request.get('/api/curation/vocabulary');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(queueResponse);
  });

  it('400: returns invalid_params when query params fail Zod validation', async () => {
    const res = await request.get('/api/curation/vocabulary?page=abc');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_params' });
  });

  it('500: returns structured error when Express fails', async () => {
    mswServer.use(
      http.get('http://localhost:4000/api/curation/vocabulary', () =>
        HttpResponse.json({ error: 'internal_error' }, { status: 500 }),
      ),
    );

    const res = await request.get('/api/curation/vocabulary');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});

// ---------------------------------------------------------------------------
// POST /api/curation/vocabulary/:termId/accept
// ---------------------------------------------------------------------------

describe('POST /api/curation/vocabulary/:termId/accept', () => {
  it('200: returns accept response from Express', async () => {
    const acceptResponse = {
      termId,
      term: 'Smith Estate',
      source: 'candidate_accepted',
    };

    mswServer.use(
      http.post(
        `http://localhost:4000/api/curation/vocabulary/${termId}/accept`,
        () => HttpResponse.json(acceptResponse, { status: 200 }),
      ),
    );

    const res = await request.post(`/api/curation/vocabulary/${termId}/accept`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(acceptResponse);
  });

  it('404: propagates not_found from Express', async () => {
    mswServer.use(
      http.post(
        'http://localhost:4000/api/curation/vocabulary/nonexistent-id/accept',
        () =>
          HttpResponse.json(
            { error: 'not_found', message: 'Term not found.' },
            { status: 404 },
          ),
      ),
    );

    const res = await request.post(
      '/api/curation/vocabulary/nonexistent-id/accept',
    );

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'not_found' });
  });

  it('409: propagates invalid_state from Express', async () => {
    mswServer.use(
      http.post(
        `http://localhost:4000/api/curation/vocabulary/${termId}/accept`,
        () =>
          HttpResponse.json(
            {
              error: 'invalid_state',
              message: 'Term is not in a state that can be accepted.',
            },
            { status: 409 },
          ),
      ),
    );

    const res = await request.post(`/api/curation/vocabulary/${termId}/accept`);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'invalid_state' });
  });
});

// ---------------------------------------------------------------------------
// POST /api/curation/vocabulary/:termId/reject
// ---------------------------------------------------------------------------

describe('POST /api/curation/vocabulary/:termId/reject', () => {
  it('200: returns reject response from Express', async () => {
    const rejectResponse = { termId, rejected: true };

    mswServer.use(
      http.post(
        `http://localhost:4000/api/curation/vocabulary/${termId}/reject`,
        () => HttpResponse.json(rejectResponse, { status: 200 }),
      ),
    );

    const res = await request.post(`/api/curation/vocabulary/${termId}/reject`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rejectResponse);
  });

  it('404: propagates not_found from Express', async () => {
    mswServer.use(
      http.post(
        'http://localhost:4000/api/curation/vocabulary/nonexistent-id/reject',
        () =>
          HttpResponse.json(
            { error: 'not_found', message: 'Term not found.' },
            { status: 404 },
          ),
      ),
    );

    const res = await request.post(
      '/api/curation/vocabulary/nonexistent-id/reject',
    );

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'not_found' });
  });

  it('409: propagates invalid_state from Express', async () => {
    mswServer.use(
      http.post(
        `http://localhost:4000/api/curation/vocabulary/${termId}/reject`,
        () =>
          HttpResponse.json(
            {
              error: 'invalid_state',
              message: 'Term is not in a state that can be rejected.',
            },
            { status: 409 },
          ),
      ),
    );

    const res = await request.post(`/api/curation/vocabulary/${termId}/reject`);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'invalid_state' });
  });
});
