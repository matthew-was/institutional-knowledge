/**
 * Pino HTTP request logger middleware.
 *
 * Logs method, path, status code, and response time for every request.
 * Assigns a UUID v4 request ID to each request for log correlation.
 * Attaches the child logger instance to req.log for use in handlers.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { pino } from "pino";
import { pinoHttp } from "pino-http";
import { v4 as uuidv4 } from "uuid";

export const logger = pino({ level: "info" });

export const requestLogger = pinoHttp({
	logger,
	genReqId: () => uuidv4(),
	// Do not log request/response bodies — they may contain document content
	serializers: {
		req(req: IncomingMessage & { id?: string }) {
			return {
				id: req.id,
				method: req.method,
				url: req.url,
			};
		},
		res(res: ServerResponse) {
			return {
				statusCode: res.statusCode,
			};
		},
	},
});
