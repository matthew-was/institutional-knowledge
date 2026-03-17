/**
 * Server startup entry point.
 *
 * This module performs all startup side-effects in order (per backend plan):
 *   1. Load and validate config (fail-fast on invalid config)
 *   2. Initialise Knex and confirm PostgreSQL connectivity
 *   3. Run knex migrate:latest
 *   4. Upload cleanup sweep — stub until Task 8 (ADR-017)
 *   5. Ingestion run sweep — stub until Task 8 (ADR-018)
 *   6. Seed data if vocabulary_terms is empty — stub until Task 7
 *   7. Start the HTTP server
 *
 * The compiled output of this file is dist/server.js — referenced in the
 * Dockerfile CMD and the package.json "start" script.
 */

import { config } from './config/index.js';
import { createDb, type DbInstance } from './db/index.js';
import { createGraphStore } from './graphstore/index.js';
import { createApp } from './index.js';
import { createLogger } from './middleware/logger.js';
import { createCurationService } from './services/curation.js';
import { createDocumentService } from './services/documents.js';
import { createStorageService } from './storage/index.js';
import { createVectorStore } from './vectorstore/index.js';

async function start(): Promise<void> {
  const log = createLogger(config.logger);
  log.info('Starting institutional-knowledge backend');

  // ── 1. Config is already validated at module load time (config/index.ts) ──

  // ── 2. Initialise database — confirms connectivity and runs migrations ──────
  let db: DbInstance;
  try {
    db = await createDb(config.db);
    log.info('Database ready');
  } catch (err) {
    log.error({ err }, 'Database initialisation failed — exiting');
    process.exit(1);
  }

  // ── 4. Upload cleanup sweep (ADR-017) ─────────────────────────────────────
  // Stub — implemented in Task 8.
  // On startup, any documents with status initiated/uploaded/stored that are
  // not finalized are cleaned up (staging files deleted, records removed).
  log.info('Upload cleanup sweep: stub (implemented in Task 8)');

  // ── 5. Ingestion run sweep (ADR-018) ──────────────────────────────────────
  // Stub — implemented in Task 8.
  // On startup, any incomplete ingestion runs are cleaned up.
  log.info('Ingestion run sweep: stub (implemented in Task 8)');

  // ── 6. Seed data ───────────────────────────────────────────────────────────
  // Stub — implemented in Task 7.
  // Run seeds only if vocabulary_terms contains zero rows.
  log.info('Seed data check: stub (implemented in Task 7)');

  // ── 7. Start HTTP server ───────────────────────────────────────────────────
  const storage = createStorageService(config.storage, log);
  const vectorStore = createVectorStore(
    config.vectorStore,
    config.embedding,
    db,
    log,
  );
  const graphStore = createGraphStore(config.graph, db, log);
  const documentService = createDocumentService({ db, storage, config, log });
  const curationService = createCurationService({ db, log });

  const app = createApp({
    config,
    db,
    storage,
    vectorStore,
    graphStore,
    documentService,
    curationService,
    log,
  });

  const server = app.listen(config.server.port, () => {
    log.info({ port: config.server.port }, 'Server listening');
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'Shutdown signal received');
    server.close(async () => {
      await db.destroy();
      log.info('Server shut down cleanly');
      process.exit(0);
    });

    setTimeout(() => {
      log.warn('Could not close connections in 2000ms, force closing.');
      server.closeAllConnections();
    }, 2000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err: unknown) => {
  // log is scoped to start() — use a minimal fallback logger for this catch
  createLogger(config.logger).error(
    { err },
    'Unhandled error during startup — exiting',
  );
  process.exit(1);
});
