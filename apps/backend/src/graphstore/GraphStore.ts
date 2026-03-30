/**
 * GraphStore interface (ADR-037).
 *
 * Phase 1 implementation: PostgresGraphStore (vocabulary_terms and
 * vocabulary_relationships tables). The concrete provider is selected at
 * runtime via config (graph.provider).
 *
 * In Phase 1, entity writes happen as part of the processing results
 * transaction (PROC-002), not through writeEntity/writeRelationship directly.
 * These methods are defined for completeness and called only by graph query
 * routes (QUERY-002).
 */

export interface GraphEntity {
  entityId: string;
  term: string;
  category: string;
  confidence: number | null;
}

export interface GraphRelationship {
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: string;
  confidence: number | null;
}

export interface TraversalResult {
  entities: GraphEntity[];
  relationships: GraphRelationship[];
  depth: number;
}

export interface DocumentReference {
  documentId: string;
  description: string;
  date: string | null;
}

export interface GraphStore {
  writeEntity(entity: GraphEntity): Promise<void>;
  writeRelationship(relationship: GraphRelationship): Promise<void>;
  getEntity(entityId: string): Promise<GraphEntity | null>;
  getRelationships(
    entityId: string,
    direction?: 'outgoing' | 'incoming' | 'both',
  ): Promise<GraphRelationship[]>;
  traverse(
    startEntityId: string,
    maxDepth: number,
    relationshipTypes?: string[],
  ): Promise<TraversalResult>;
  findEntitiesByType(entityType: string): Promise<GraphEntity[]>;
  findDocumentsByEntity(entityId: string): Promise<DocumentReference[]>;
}
