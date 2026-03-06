/**
 * Global error handler middleware.
 *
 * Catches all unhandled errors forwarded via next(error) from route handlers.
 * Logs the full error via Pino. Returns a structured error response:
 *
 *   Known application errors (AppError subclasses): appropriate 4xx status
 *   Unknown errors: 500 with a generic message (no stack trace in response)
 *
 * No document content or credentials are logged — only identifiers and status.
 */

import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";

export class AppError extends Error {
	constructor(
		public readonly statusCode: number,
		public readonly errorCode: string,
		message: string,
		public readonly details?: Record<string, unknown>,
	) {
		super(message);
		this.name = "AppError";
	}
}

export class NotFoundError extends AppError {
	constructor(message = "Resource not found") {
		super(404, "not_found", message);
	}
}

export class ConflictError extends AppError {
	constructor(message: string, details?: Record<string, unknown>) {
		super(409, "conflict", message, details);
	}
}

export class ValidationError extends AppError {
	constructor(message: string, details?: Record<string, unknown>) {
		super(400, "validation_error", message, details);
	}
}

export function createErrorHandler(log: Logger) {
	// Express error handlers must have exactly 4 parameters — the unused _next is required
	// for Express to recognise this as an error handler. The _ prefix suppresses the
	// noUnusedVariables lint rule.
	return function errorHandler(
		err: unknown,
		req: Request,
		res: Response,
		_next: NextFunction,
	): void {
		if (err instanceof AppError) {
			log.warn(
				{ reqId: req.id, errorCode: err.errorCode, statusCode: err.statusCode },
				err.message,
			);
			res.status(err.statusCode).json({
				error: err.errorCode,
				message: err.message,
				...(err.details !== undefined ? { details: err.details } : {}),
			});
			return;
		}

		// Unknown error — log fully but return generic response
		log.error({ reqId: req.id, err }, "Unhandled error");
		res.status(500).json({
			error: "internal_error",
			message: "An unexpected error occurred",
		});
	};
}
