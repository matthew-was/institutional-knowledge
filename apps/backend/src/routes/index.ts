/**
 * Route registration.
 *
 * Routes are implemented in subsequent tasks (Tasks 8–19). This file registers
 * the Express Router with all route groups mounted under /api. Each route group
 * receives injected services following the dependency-composition-pattern skill.
 *
 * The health check is registered directly in index.ts (before auth middleware)
 * and is not part of this router.
 */

import { Router } from "express";

export function createRouter(): Router {
	const router = Router();

	// Route groups added in Tasks 8–15

	return router;
}
