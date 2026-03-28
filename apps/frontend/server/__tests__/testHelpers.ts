/**
 * Shared Tier 2 test setup helpers.
 *
 * Centralising the repeated boilerplate means a new config field or server
 * dependency only needs updating in one place rather than every test file.
 *
 * Usage:
 *   const { request } = createTestRequest();
 *   const mswServer = createMswServer();
 */

import { createAdaptorServer } from '@hono/node-server';
import { setupServer } from 'msw/node';
import pino from 'pino';
import supertest from 'supertest';
import { afterAll, afterEach, beforeAll } from 'vitest';
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

/**
 * Returns a supertest instance backed by the Hono app.
 *
 * The same config and express client are used across all test files to keep
 * MSW handler URLs consistent (http://localhost:4000).
 */
export function createTestRequest(): { request: ReturnType<typeof supertest> } {
  const app = createHonoApp({
    config: testConfig,
    expressClient: createExpressClient(testConfig),
    log: silentLog,
  });
  const httpServer = createAdaptorServer({ fetch: app.fetch });
  return { request: supertest(httpServer) };
}

/**
 * Returns an MSW SetupServerApi instance with lifecycle hooks registered.
 *
 * Call this at the top level of a test file. The beforeAll/afterEach/afterAll
 * hooks are registered automatically.
 */
export function createMswServer(): ReturnType<typeof setupServer> {
  const mswServer = setupServer();
  beforeAll(() => mswServer.listen());
  afterEach(() => mswServer.resetHandlers());
  afterAll(() => mswServer.close());
  return mswServer;
}

export { testConfig };
