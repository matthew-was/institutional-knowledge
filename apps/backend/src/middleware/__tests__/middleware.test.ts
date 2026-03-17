import type { Request, Response } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../index.js';
import { createAuthMiddleware } from '../auth.js';
import {
  ConflictError,
  createErrorHandler,
  NotFoundError,
} from '../errorHandler.js';
import { createLogger } from '../logger.js';
import { validate } from '../validate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    body: {},
    params: {},
    query: {},
    method: 'GET',
    url: '/',
    id: 'test-req-id',
    ...overrides,
  } as unknown as Request;
}

interface MockRes {
  statusCode: number;
  body: unknown;
  status: (code: number) => Response;
  json: (body: unknown) => Response;
}

function mockRes(): MockRes {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
  } as MockRes;

  res.status = (code: number) => {
    res.statusCode = code;
    return res as unknown as Response;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res as unknown as Response;
  };

  return res;
}

// ---------------------------------------------------------------------------
// Auth middleware — unit tests
// ---------------------------------------------------------------------------

const authConfig = {
  frontendKey: 'frontend-secret',
  pythonKey: 'python-secret',
  pythonServiceKey: 'python-service-secret',
};

const silentLogger = createLogger({ level: 'error' });

describe('createAuthMiddleware', () => {
  it('returns 401 when x-internal-key header is absent', () => {
    const middleware = createAuthMiddleware(authConfig, silentLogger);
    const req = mockReq({ headers: {} });
    const res = mockRes();
    const nextFn = vi.fn();

    middleware(req, res as unknown as Response, nextFn);

    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toBe('unauthorized');
  });

  it('returns 401 when x-internal-key does not match either key', () => {
    const middleware = createAuthMiddleware(authConfig, silentLogger);
    const req = mockReq({ headers: { 'x-internal-key': 'wrong-key' } });
    const res = mockRes();
    const nextFn = vi.fn();

    middleware(req, res as unknown as Response, nextFn);

    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toBe('unauthorized');
  });

  it('calls next() when x-internal-key matches frontendKey', () => {
    const middleware = createAuthMiddleware(authConfig, silentLogger);
    const nextFn = vi.fn();
    const req = mockReq({ headers: { 'x-internal-key': 'frontend-secret' } });
    const res = mockRes();

    middleware(req, res as unknown as Response, nextFn);

    expect(nextFn).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it('calls next() when x-internal-key matches pythonKey', () => {
    const middleware = createAuthMiddleware(authConfig, silentLogger);
    const nextFn = vi.fn();
    const req = mockReq({ headers: { 'x-internal-key': 'python-secret' } });
    const res = mockRes();

    middleware(req, res as unknown as Response, nextFn);

    expect(nextFn).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Auth bypass — integration test against assembled app
//
// The health route is registered in index.ts BEFORE the auth middleware,
// which is how the bypass is implemented (structural placement, not a branch
// inside auth.ts). This test confirms that arrangement works end-to-end.
// ---------------------------------------------------------------------------

const stubDeps = {
  config: {
    auth: {
      frontendKey: 'test-frontend-key',
      pythonKey: 'test-python-key',
      pythonServiceKey: 'test-python-service-key',
    },
    server: { port: 4000 },
    db: {
      host: 'localhost',
      port: 5432,
      database: 'ik',
      user: 'ik',
      password: 'ik',
    },
    storage: {
      provider: 'local',
      local: { basePath: './data', stagingPath: './staging' },
    },
    upload: { maxFileSizeMb: 50, acceptedExtensions: ['.pdf'] },
    pipeline: { runningStepTimeoutMinutes: 30, maxRetries: 3 },
    python: { baseUrl: 'http://localhost:8000' },
    vectorStore: { provider: 'pgvector' },
    graph: { provider: 'postgresql' },
    embedding: { dimension: 384 },
    ingestion: {
      partialAuditReport: false,
      reportOutputDirectory: './reports',
    },
    logger: { level: 'error' as const },
  },
  db: {} as never,
  storage: {} as never,
  vectorStore: {} as never,
  graphStore: {} as never,
  documentService: {} as never,
  log: createLogger({ level: 'error' }),
};

describe('GET /api/health auth bypass', () => {
  it('returns 200 for GET /api/health with no x-internal-key', async () => {
    const app = createApp(stubDeps);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('returns 401 for another route with no x-internal-key', async () => {
    const app = createApp(stubDeps);
    const res = await request(app).get('/api/anything');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// validate middleware
// ---------------------------------------------------------------------------

describe('validate', () => {
  const BodySchema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  it('returns 400 with Zod error details when a required body field is missing', () => {
    const middleware = validate({ body: BodySchema });
    const req = mockReq({ body: { name: 'Alice' } }); // missing age
    const res = mockRes();
    const nextFn = vi.fn();

    middleware(req, res as unknown as Response, nextFn);

    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string; details: unknown[] };
    expect(body.error).toBe('validation_error');
    expect(Array.isArray(body.details)).toBe(true);
    expect(
      (body.details as Array<{ path: string[] }>).some((i) =>
        i.path.includes('age'),
      ),
    ).toBe(true);
    expect(nextFn).not.toHaveBeenCalled();
  });

  it('calls next() and attaches parsed values when body is valid', () => {
    const middleware = validate({ body: BodySchema });
    const req = mockReq({ body: { name: 'Alice', age: 30 } });
    const res = mockRes();
    const nextFn = vi.fn();

    middleware(req, res as unknown as Response, nextFn);

    expect(nextFn).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ name: 'Alice', age: 30 });
  });
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

describe('createErrorHandler', () => {
  it('returns 500 with no stack trace for an unknown error', () => {
    const handler = createErrorHandler(silentLogger);
    const req = mockReq();
    const res = mockRes();
    const nextFn = vi.fn();

    handler(new Error('boom'), req, res as unknown as Response, nextFn);

    expect(res.statusCode).toBe(500);
    const body = res.body as { error: string; message: string };
    expect(body.error).toBe('internal_error');
    expect(body.message).toBe('An unexpected error occurred');
    expect(JSON.stringify(body)).not.toContain('stack');
  });

  it('returns 404 for NotFoundError', () => {
    const handler = createErrorHandler(silentLogger);
    const req = mockReq();
    const res = mockRes();
    const nextFn = vi.fn();

    handler(new NotFoundError(), req, res as unknown as Response, nextFn);

    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toBe('not_found');
  });

  it('returns 409 for ConflictError', () => {
    const handler = createErrorHandler(silentLogger);
    const req = mockReq();
    const res = mockRes();
    const nextFn = vi.fn();

    handler(
      new ConflictError('already exists'),
      req,
      res as unknown as Response,
      nextFn,
    );

    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toBe('conflict');
  });
});
