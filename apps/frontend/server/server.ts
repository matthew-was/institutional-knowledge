import { parse } from 'node:url';
import type { HttpBindings } from '@hono/node-server';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import next from 'next';
import pino from 'pino';
import { config } from './config';
import { createExpressClient } from './requests/client';
import { createRoutes, type ServerDeps } from './routes';

const log = pino({ name: 'frontend-server' });

const dev = process.env.NODE_ENV !== 'production';

const nextApp = next({ dev, customServer: true });
const nextHandler = nextApp.getRequestHandler();

// ---------------------------------------------------------------------------
// createHonoApp — factory exported for test isolation.
//
// The nextHandler parameter is omitted in tests so Next.js is never initialised
// during the Vitest run. In production the prepared handler is passed in after
// nextApp.prepare() resolves.
// ---------------------------------------------------------------------------

export function createHonoApp(
  deps: ServerDeps,
  handler?: (
    req: Parameters<typeof nextHandler>[0],
    res: Parameters<typeof nextHandler>[1],
    parsedUrl?: Parameters<typeof nextHandler>[2],
  ) => Promise<void>,
): Hono {
  const app = new Hono();

  // Auth middleware — no-op in Phase 1; wired now for Phase 2 readiness.
  // All requests on /api/* pass through without modification.
  app.use('/api/*', async (_c, proceed) => {
    await proceed();
  });

  app.route('/api', createRoutes(deps));

  // ---------------------------------------------------------------------------
  // Next.js catch-all — handles all non-API page traffic.
  // Only mounted when a handler is provided (not in tests).
  // ---------------------------------------------------------------------------

  if (handler) {
    app.all('*', async (c) => {
      const { incoming, outgoing } = c.env as HttpBindings;
      await handler(incoming, outgoing, parse(c.req.url, true));
      return new Response();
    });
  }

  return app;
}

// ---------------------------------------------------------------------------
// Server startup — top-level await is valid in ESM modules.
// ---------------------------------------------------------------------------

await nextApp.prepare();

const deps: ServerDeps = { config, expressClient: createExpressClient(config) };
const app = createHonoApp(deps, nextHandler);

serve({ fetch: app.fetch, port: config.server.port }, (info) => {
  log.info({ port: info.port }, 'Frontend server listening');
});
