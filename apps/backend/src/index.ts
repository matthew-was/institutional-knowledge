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

import express from "express";
import { pino } from "pino";
import type { AppConfig } from "./config/index.js";
import type { KnexInstance } from "./db/index.js";
import type { GraphStore } from "./graphstore/types.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createErrorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/logger.js";
import { createRouter } from "./routes/index.js";
import type { StorageService } from "./storage/types.js";
import type { VectorStore } from "./vectorstore/types.js";

export interface AppDependencies {
	config: AppConfig;
	knex: KnexInstance;
	storage: StorageService;
	vectorStore: VectorStore;
	graphStore: GraphStore;
}

export function createApp(deps: AppDependencies): express.Application {
	const log = pino({ level: "info" });
	const app = express();

	// 1. Pino request logger
	app.use(requestLogger);

	// 2. JSON body parser
	app.use(express.json());

	// 3. Health check route — must be registered BEFORE auth middleware
	//    so the /api/health endpoint does not require a shared-key header
	app.get("/api/health", (_req, res): void => {
		res.json({ status: "ok", timestamp: new Date().toISOString() });
	});

	// 4. Shared-key auth for all other routes
	app.use(createAuthMiddleware(deps.config.auth));

	// 5. API routes
	app.use("/api", createRouter());

	// 6. Error handler (must be last)
	app.use(createErrorHandler(log));

	return app;
}
