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
import type { KnexInstance } from './db/index.js';
import type { GraphStore } from './graphstore/types.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createErrorHandler } from './middleware/errorHandler.js';
import { createRequestLogger, type Logger } from './middleware/logger.js';
import { createRouter } from './routes/index.js';
import type { StorageService } from './storage/index.js';
import type { VectorStore } from './vectorstore/index.js';

export interface AppDependencies {
  config: AppConfig;
  knex: KnexInstance;
  storage: StorageService;
  vectorStore: VectorStore;
  graphStore: GraphStore;
  log: Logger;
}

export function createApp(deps: AppDependencies): express.Application {
  const app = express();

  // 1. Pino request logger
  app.use(createRequestLogger(deps.log));

  // 2. JSON body parser
  app.use(express.json());

  // 3. Health check route — registered BEFORE auth middleware intentionally.
  //    This is how the auth bypass is implemented: the route is matched and
  //    responded to before the auth middleware ever runs. Do not move this
  //    registration after app.use(createAuthMiddleware(...)).
  app.get('/api/health', (_req, res): void => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 4. Shared-key auth for all other routes
  app.use(createAuthMiddleware(deps.config.auth, deps.log));

  // 5. API routes
  app.use('/api', createRouter());

  // 6. Error handler (must be last)
  app.use(createErrorHandler(deps.log));

  return app;
}
