/**
 * PostgresGraphStore — Phase 1 PostgreSQL implementation of GraphStore.
 *
 * Implemented in Task 6. This stub satisfies the interface contract so that
 * the application compiles in Task 1.
 */

import type { Logger } from 'pino';
import type { AppConfig } from '../config/index.js';
import type { DbInstance } from '../db/index.js';
import type {
  DocumentReference,
  GraphEntity,
  GraphRelationship,
  GraphStore,
  TraversalResult,
} from './types.js';

export class PostgresGraphStore implements GraphStore {
  constructor(
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: stub — implemented in Task 6
    private readonly _db: DbInstance,
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: stub — implemented in Task 6
    private readonly _log: Logger,
  ) {}

  async writeEntity(_entity: GraphEntity): Promise<void> {
    throw new Error(
      'PostgresGraphStore.writeEntity: not yet implemented (Task 6)',
    );
  }

  async writeRelationship(_relationship: GraphRelationship): Promise<void> {
    throw new Error(
      'PostgresGraphStore.writeRelationship: not yet implemented (Task 6)',
    );
  }

  async getEntity(_entityId: string): Promise<GraphEntity | null> {
    throw new Error(
      'PostgresGraphStore.getEntity: not yet implemented (Task 6)',
    );
  }

  async getRelationships(
    _entityId: string,
    _direction?: 'outgoing' | 'incoming' | 'both',
  ): Promise<GraphRelationship[]> {
    throw new Error(
      'PostgresGraphStore.getRelationships: not yet implemented (Task 6)',
    );
  }

  async traverse(
    _startEntityId: string,
    _maxDepth: number,
    _relationshipTypes?: string[],
  ): Promise<TraversalResult> {
    throw new Error(
      'PostgresGraphStore.traverse: not yet implemented (Task 6)',
    );
  }

  async findEntitiesByType(_entityType: string): Promise<GraphEntity[]> {
    throw new Error(
      'PostgresGraphStore.findEntitiesByType: not yet implemented (Task 6)',
    );
  }

  async findDocumentsByEntity(_entityId: string): Promise<DocumentReference[]> {
    throw new Error(
      'PostgresGraphStore.findDocumentsByEntity: not yet implemented (Task 6)',
    );
  }
}

/**
 * Factory: create a GraphStore from the graph config block.
 * Accepts the AppConfig['graph'] slice and a Logger, consistent with the
 * factory pattern established by createStorageService and createVectorStore.
 */
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
