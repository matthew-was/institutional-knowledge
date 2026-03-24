import { Hono } from 'hono';
import type { AppConfig } from '../config';
import type { ExpressClient } from '../requests/client';

export interface DocumentsDeps {
  config: AppConfig;
  expressClient: ExpressClient;
}

export function createDocumentsRouter(_deps: DocumentsDeps): Hono {
  const router = new Hono();

  router.post('/upload', (c) => c.json({ error: 'not_implemented' }, 501));
  router.delete('/:uploadId', (c) => c.json({ error: 'not_implemented' }, 501));
  router.get('/:id', (c) => c.json({ error: 'not_implemented' }, 501));
  router.post('/:id/clear-flag', (c) =>
    c.json({ error: 'not_implemented' }, 501),
  );
  router.patch('/:id/metadata', (c) =>
    c.json({ error: 'not_implemented' }, 501),
  );

  return router;
}
