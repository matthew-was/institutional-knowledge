/**
 * Route registration.
 *
 * Routes are implemented in subsequent tasks (Tasks 8–19). This file registers
 * the Express Router with all route groups mounted under /api. Each route group
 * receives injected services following the dependency-composition-pattern skill.
 *
 * Current state: health check only. All other routes are stubs pending
 * their respective tasks.
 */

import { Router } from "express";
import type { Request, Response } from "express";

export function createRouter(): Router {
	const router = Router();

	// Health check — no auth required (bypassed in index.ts before auth middleware)
	router.get("/health", (_req: Request, res: Response): void => {
		res.json({ status: "ok", timestamp: new Date().toISOString() });
	});

	return router;
}
