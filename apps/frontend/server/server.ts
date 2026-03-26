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

const nextApp = next({ dev, customServer: true });

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
