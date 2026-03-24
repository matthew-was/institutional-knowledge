import { Hono } from 'hono';
import type { AppConfig } from '../config';
import type { ExpressClient } from '../requests/client';

export interface CurationDeps {
  config: AppConfig;
  expressClient: ExpressClient;
}

export function createCurationRouter(_deps: CurationDeps): Hono {
  const router = new Hono();

  router.get('/documents', (c) => c.json({ error: 'not_implemented' }, 501));
  router.get('/vocabulary', (c) => c.json({ error: 'not_implemented' }, 501));
  // /vocabulary/terms must be registered before /vocabulary/:termId/* to prevent
  // the literal segment "terms" being captured as a :termId parameter.
  router.post('/vocabulary/terms', (c) =>
    c.json({ error: 'not_implemented' }, 501),
  );
  router.post('/vocabulary/:termId/accept', (c) =>
    c.json({ error: 'not_implemented' }, 501),
  );
  router.post('/vocabulary/:termId/reject', (c) =>
    c.json({ error: 'not_implemented' }, 501),
  );

  return router;
}
