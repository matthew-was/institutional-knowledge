import { Hono } from 'hono';
import type { AppConfig } from '../config';
import type { ExpressClient } from '../requests/client';
import { createCurationRouter } from './curation';
import { createDocumentsRouter } from './documents';

export interface ServerDeps {
  config: AppConfig;
  expressClient: ExpressClient;
}

export function createRoutes(deps: ServerDeps): Hono {
  const routes = new Hono();

  routes.route('/documents', createDocumentsRouter(deps));
  routes.route('/curation', createCurationRouter(deps));

  return routes;
}
