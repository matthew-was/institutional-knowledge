/**
 * Pino logger factories.
 *
 * createLogger(config) — creates a base Pino logger at the configured level.
 * createRequestLogger(log) — wraps a base logger in pino-http middleware that
 *   logs method, path, status code, and response time for every request,
 *   assigns a UUID v4 request ID for log correlation, and attaches the child
 *   logger to req.log for use in handlers.
 *
 * Both are factories so callers (server.ts, createApp, tests) can inject the
 * logger they need rather than relying on a module-level singleton.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { v4 } from 'uuid';
import type { AppConfig } from '../config/index.js';

export type { Logger };

export function createLogger(loggerConfig: AppConfig['logger']): Logger {
  return pino({ level: loggerConfig.level });
}

export function createRequestLogger(log: Logger) {
  return pinoHttp({
    logger: log,
    genReqId: () => v4(),
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
}
