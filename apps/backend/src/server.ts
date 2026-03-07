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
import { createKnex } from './db/index.js';
import { createGraphStore } from './graphstore/PostgresGraphStore.js';
import { createApp } from './index.js';
import { logger } from './middleware/logger.js';
import { createStorageService } from './storage/LocalStorageService.js';
import { createVectorStore } from './vectorstore/PgVectorStore.js';

async function start(): Promise<void> {
  logger.info('Starting institutional-knowledge backend');

  // ── 1. Config is already validated at module load time (config/index.ts) ──

  // ── 2. Initialise Knex + confirm connectivity ─────────────────────────────
  const knex = createKnex(config.db);
  try {
    await knex.raw('SELECT 1');
    logger.info('Database connection confirmed');
  } catch (err) {
    logger.error({ err }, 'Failed to connect to database — exiting');
    process.exit(1);
  }

  // ── 3. Run migrations ──────────────────────────────────────────────────────
  try {
    const [batchNo, migrations] = await knex.migrate.latest();
    if (migrations.length > 0) {
      logger.info({ batchNo, migrations }, 'Migrations applied');
    } else {
      logger.info('Database schema is up to date');
    }
  } catch (err) {
    logger.error({ err }, 'Migration failed — exiting');
    await knex.destroy();
    process.exit(1);
  }

  // ── 4. Upload cleanup sweep (ADR-017) ─────────────────────────────────────
  // Stub — implemented in Task 8.
  // On startup, any documents with status initiated/uploaded/stored that are
  // not finalized are cleaned up (staging files deleted, records removed).
  logger.info('Upload cleanup sweep: stub (implemented in Task 8)');

  // ── 5. Ingestion run sweep (ADR-018) ──────────────────────────────────────
  // Stub — implemented in Task 8.
  // On startup, any incomplete ingestion runs are cleaned up.
  logger.info('Ingestion run sweep: stub (implemented in Task 8)');

  // ── 6. Seed data ───────────────────────────────────────────────────────────
  // Stub — implemented in Task 7.
  // Run seeds only if vocabulary_terms contains zero rows.
  logger.info('Seed data check: stub (implemented in Task 7)');

  // ── 7. Start HTTP server ───────────────────────────────────────────────────
  const storage = createStorageService(config.storage);
  const vectorStore = createVectorStore(
    config.vectorStore.provider,
    knex,
    config.embedding.dimension,
  );
  const graphStore = createGraphStore(config.graph.provider, knex);

  const app = createApp({ config, knex, storage, vectorStore, graphStore });

  const server = app.listen(config.server.port, () => {
    logger.info({ port: config.server.port }, 'Server listening');
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(async () => {
      await knex.destroy();
      logger.info('Server shut down cleanly');
      process.exit(0);
    });

    setTimeout(() => {
      logger.warn('Could not close connections in 2000ms, force closing.');
      server.closeAllConnections();
    }, 2000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err: unknown) => {
  logger.error({ err }, 'Unhandled error during startup — exiting');
  process.exit(1);
});
