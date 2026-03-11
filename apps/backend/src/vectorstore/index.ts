/**
 * VectorStore factory.
 *
 * createVectorStore reads vectorStore.provider from the config block and returns
 * the appropriate VectorStore implementation. Phase 1 supports "pgvector" only.
 * To add a new provider in Phase 2, add a branch here and create the corresponding
 * implementation class — no other files need to change.
 */

import type { Logger } from 'pino';
import type { AppConfig } from '../config/index.js';
import type { DbInstance } from '../db/index.js';
import { PgVectorStore } from './PgVectorStore.js';
import type { VectorStore } from './VectorStore.js';

export type { SearchResult, VectorStore } from './VectorStore.js';

export function createVectorStore(
  vectorStoreConfig: AppConfig['vectorStore'],
  embeddingConfig: AppConfig['embedding'],
  db: DbInstance,
  log: Logger,
): VectorStore {
  if (vectorStoreConfig.provider === 'pgvector') {
    return new PgVectorStore(db, embeddingConfig.dimension, log);
  }
  throw new Error(
    `Unknown vectorStore provider: ${vectorStoreConfig.provider}`,
  );
}
