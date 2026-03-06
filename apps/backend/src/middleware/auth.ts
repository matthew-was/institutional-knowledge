/**
 * Shared-key authentication middleware (ADR-044).
 *
 * Validates the x-internal-key header against the set of valid keys for all
 * authorised callers (frontend and Python service). Returns 401 if the header
 * is missing or does not match any valid key. The middleware does not
 * distinguish callers by key — it validates that the presented key is in the
 * allowed set.
 *
 * This middleware is applied to all routes except GET /api/health.
 */

import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config/index.js";

export function createAuthMiddleware(authConfig: AppConfig["auth"]) {
	const validKeys = new Set([authConfig.frontendKey, authConfig.pythonKey]);

	return function authMiddleware(
		req: Request,
		res: Response,
		next: NextFunction,
	): void {
		const key = req.headers["x-internal-key"];
		if (typeof key !== "string" || !validKeys.has(key)) {
			res.status(401).json({
				error: "unauthorized",
				message: "Missing or invalid x-internal-key header",
			});
			return;
		}
		next();
	};
}
