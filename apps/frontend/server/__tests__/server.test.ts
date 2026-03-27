import { createAdaptorServer } from '@hono/node-server';
import pino from 'pino';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
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

// No Next.js handler — creates the Hono app in isolation for Tier 2 tests.
const app = createHonoApp({
  config: testConfig,
  expressClient: createExpressClient(testConfig),
  log: silentLog,
});
const server = createAdaptorServer({ fetch: app.fetch });
const request = supertest(server);

describe('Hono server', () => {
  it('smoke: POST /api/documents/upload returns 400 when body is empty', async () => {
    const res = await request.post('/api/documents/upload');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_input' });
  });

  it('security: x-internal-key value does not appear in any response header', async () => {
    const res = await request.post('/api/documents/upload');
    const headerValues = Object.values(res.headers).join('\n');
    expect(headerValues).not.toContain(testConfig.express.internalKey);
  });

  it('auth no-op: requests without an auth header are not rejected', async () => {
    const res = await request
      .post('/api/documents/upload')
      // No x-internal-key or Authorization header
      .set({});
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
