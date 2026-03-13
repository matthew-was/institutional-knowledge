/**
 * GraphStore factory.
 *
 * createGraphStore reads graph.provider from the config block and returns
 * the appropriate GraphStore implementation. Phase 1 supports "postgresql" only.
 * To add a new provider in Phase 2, add a branch here and create the corresponding
 * implementation class — no other files need to change.
 */

import type { Logger } from 'pino';
import type { AppConfig } from '../config/index.js';
import type { DbInstance } from '../db/index.js';
import type { GraphStore } from './GraphStore.js';
import { PostgresGraphStore } from './PostgresGraphStore.js';

export type {
  DocumentReference,
  GraphEntity,
  GraphRelationship,
  GraphStore,
  TraversalResult,
} from './GraphStore.js';

export function createGraphStore(
  graphConfig: AppConfig['graph'],
  db: DbInstance,
  log: Logger,
): GraphStore {
  if (graphConfig.provider === 'postgresql') {
    return new PostgresGraphStore(db, log);
  }
  throw new Error(`Unknown graph provider: ${graphConfig.provider}`);
}
