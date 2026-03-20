/**
 * Integration tests for admin routes (health check, ADMIN-001).
 *
 * Uses a real PostgreSQL database (docker-compose.test.yml, port 5433) and a
 * real Express app built via createApp(). Requests are sent via supertest so
 * the full stack is exercised: validate middleware → service → repository → DB.
 *
 * Schema is managed by globalSetup.ts (includes migration 004 which creates
 * the embeddings_embedding_ivfflat_idx IVFFlat index used by ADMIN-001).
 * Data is cleaned between tests by cleanAllTables (afterEach).
 *
 * Health check (GET /api/health): no auth header required — registered before
 * auth middleware in index.ts.
 *
 * reindexEmbeddings (POST /api/admin/reindex-embeddings): auth required.
 * Auth header uses the frontend key 'fk' (from makeConfig()).
 *
 * Embedding dimension: 384 (matches migration 004 — vector(384) column).
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pino } from 'pino';
import supertest from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DbInstance } from '../../db/index.js';
import { createTestDb } from '../../db/index.js';
import type { Logger } from '../../middleware/logger.js';
import { createAdminService } from '../../services/admin.js';
import { LocalStorageService } from '../../storage/LocalStorageService.js';
import { cleanAllTables } from '../../testing/dbCleanup.js';
import { TEST_DB_CONFIG } from '../../testing/testDb.js';
import { createTestApp, makeConfig } from '../../testing/testHelpers.js';
import { createVectorStore } from '../../vectorstore/index.js';

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

const DIMENSION = 384;

let db: DbInstance;
let app: ReturnType<typeof createTestApp>;
let request: ReturnType<typeof supertest>;
let tmpDir: string;
let vectorStore: ReturnType<typeof createVectorStore>;

const AUTH = { 'x-internal-key': 'fk' };

beforeAll(async () => {
  db = createTestDb(TEST_DB_CONFIG);

  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ik-admin-integration-'));
  const basePath = path.join(tmpDir, 'permanent');
  const stagingPath = path.join(tmpDir, 'staging');
  await fs.mkdir(basePath, { recursive: true });
  await fs.mkdir(stagingPath, { recursive: true });

  const log = pino({ level: 'silent' }) as unknown as Logger;
  const config = makeConfig();
  const storage = new LocalStorageService(basePath, stagingPath, log);
  vectorStore = createVectorStore(
    config.vectorStore,
    config.embedding,
    db,
    log,
  );
  const adminService = createAdminService({ db, log });

  app = createTestApp(db, storage, config, log, { adminService });

  request = supertest(app);
});

afterAll(async () => {
  await db.destroy();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

afterEach(async () => {
  await cleanAllTables(db._knex);
});

// ---------------------------------------------------------------------------
// Test (a): health check
// ---------------------------------------------------------------------------

describe('GET /api/health', () => {
  it('(a) returns { status: "ok", timestamp: <ISO string> } without auth', async () => {
    const res = await request.get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    // timestamp must be a parseable ISO string
    expect(typeof res.body.timestamp).toBe('string');
    const parsed = Date.parse(res.body.timestamp as string);
    expect(Number.isNaN(parsed)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test (b): reindex embeddings
// ---------------------------------------------------------------------------

describe('POST /api/admin/reindex-embeddings', () => {
  it('(b) executes without error and index remains queryable via VectorStore.search()', async () => {
    const res = await request
      .post('/api/admin/reindex-embeddings')
      .set(AUTH)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.reindexed).toBe(true);

    // Verify the index is still queryable after REINDEX — a zero-vector search
    // against an empty embeddings table should return an empty array, not throw.
    const zeroVector = Array<number>(DIMENSION).fill(0);
    const searchResult = await vectorStore.search(zeroVector, 1);
    expect(searchResult.outcome).toBe('success');
    if (searchResult.outcome === 'success') {
      expect(Array.isArray(searchResult.data)).toBe(true);
    }
  });

  it('returns 401 when auth header is missing', async () => {
    const res = await request.post('/api/admin/reindex-embeddings').send();

    expect(res.status).toBe(401);
  });
});
