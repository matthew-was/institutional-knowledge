/**
 * Express application factory.
 *
 * This module exports createApp() which builds and returns a configured
 * Express application. Startup side-effects (database connectivity check,
 * migrations, sweeps, seed data) are performed in server.ts, not here.
 * Separating app construction from server startup makes the app testable
 * without actually listening on a port or requiring a live database.
 *
 * Middleware order (per backend plan):
 *   1. Pino request logger
 *   2. JSON body parser
 *   3. Shared-key auth (bypassed for GET /api/health)
 *   4. Route handlers
 *   5. Error handler
 */

import express from 'express';
import type { AppConfig } from './config/index.js';
import type { DbInstance } from './db/index.js';
import type { GraphStore } from './graphstore/index.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createErrorHandler } from './middleware/errorHandler.js';
import { createRequestLogger, type Logger } from './middleware/logger.js';
import { generateOpenApiSpec } from './openapi.js';
import { createRouter } from './routes/index.js';
import type { DocumentService } from './services/documents.js';
import type { StorageService } from './storage/index.js';
import type { VectorStore } from './vectorstore/index.js';

export interface AppDependencies {
  config: AppConfig;
  db: DbInstance;
  storage: StorageService;
  vectorStore: VectorStore;
  graphStore: GraphStore;
  documentService: DocumentService;
  log: Logger;
}

export function createApp(deps: AppDependencies): express.Application {
  const app = express();

  // 1. Pino request logger
  app.use(createRequestLogger(deps.log));

  // 2. JSON body parser
  app.use(express.json());

  // 3. Unauthenticated routes — registered BEFORE auth middleware intentionally.
  //    Routes here are matched and responded to before auth middleware runs.
  //    Do not move these registrations after app.use(createAuthMiddleware(...)).

  app.get('/api/health', (_req, res): void => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // OpenAPI spec endpoint (ADR-048). Unauthenticated by the same pattern as
  // /api/health — registered before auth middleware so the Python code-gen
  // step and developer tooling can fetch the spec without a shared key.
  app.get('/openapi.json', (_req, res): void => {
    res.json(generateOpenApiSpec());
  });

  // 4. Shared-key auth for all other routes
  app.use(createAuthMiddleware(deps.config.auth, deps.log));

  // 5. API routes
  app.use('/api', createRouter(deps));

  // 6. Error handler (must be last)
  app.use(createErrorHandler(deps.log));

  return app;
}
