import { createServer } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import next from 'next';
import pino from 'pino';
import { config } from './config';
import { createExpressClient } from './requests/client';
import { createRoutes, type ServerDeps } from './routes';

const log = pino({ name: 'frontend-server' });

const dev = process.env.NODE_ENV !== 'production';

// ---------------------------------------------------------------------------
// In production the Dockerfile sets WORKDIR /app and runs this file as
//   tsx apps/frontend/server/server.ts
// so process.cwd() is /app, not apps/frontend/. The NEXT_DIR environment
// variable lets the Dockerfile declare the correct path to apps/frontend/ so
// Next.js can locate the .next/ build output.
//
// In development (tsx watch) and in tests, NEXT_DIR is unset and process.cwd()
// is apps/frontend/ — Next.js finds .next/ without an explicit dir.
// ---------------------------------------------------------------------------

const frontendDir = process.env.NEXT_DIR;

const nextApp = next({
  dev,
  customServer: true,
  ...(frontendDir !== undefined ? { dir: frontendDir } : {}),
});

// ---------------------------------------------------------------------------
// createHonoApp — factory exported for test isolation.
//
// The Next.js handler is not mounted inside Hono. Instead the Node HTTP server
// dispatches at the path level: /api/* goes to Hono, everything else goes
// directly to Next.js. This avoids the double-response problem that occurs when
// Hono's fetch adapter tries to write its own response after Next.js has already
// written to the underlying ServerResponse.
// ---------------------------------------------------------------------------

export function createHonoApp(deps: ServerDeps): Hono {
  const app = new Hono();

  // Auth middleware — no-op in Phase 1; wired now for Phase 2 readiness.
  // All requests on /api/* pass through without modification.
  app.use('/api/*', async (_c, proceed) => {
    await proceed();
  });

  app.route('/api', createRoutes(deps));

  return app;
}

// ---------------------------------------------------------------------------
// Server startup — only runs when this module is the entry point, not when
// imported by tests.
// ---------------------------------------------------------------------------

async function start() {
  await nextApp.prepare();

  const nextHandler = nextApp.getRequestHandler();
  const deps: ServerDeps = {
    config,
    expressClient: createExpressClient(config),
    log,
  };
  const honoListener = getRequestListener(createHonoApp(deps).fetch);

  const server = createServer((req, res) => {
    if (req.url?.startsWith('/api/')) {
      honoListener(req, res);
    } else {
      nextHandler(req, res);
    }
  });

  server.listen(config.server.port, () => {
    log.info({ port: config.server.port }, 'Frontend server listening');
  });
}

start();
