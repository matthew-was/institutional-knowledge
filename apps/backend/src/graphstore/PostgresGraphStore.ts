/**
 * PostgresGraphStore — Phase 1 PostgreSQL implementation of GraphStore (implements ADR-037).
 *
 * All database access is delegated to db.graph (the graph repository).
 * No SQL is written in this file.
 *
 * The GraphStore contains only document-evidenced entities (ADR-037). Any
 * method that returns entities filters to those with at least one
 * entity_document_occurrences row — enforced inside the repository.
 */

import { v7 as uuidv7 } from 'uuid';
import type { DbInstance } from '../db/index.js';
import type { Logger } from '../middleware/logger.js';
import { normaliseTermText } from '../utils/normalise.js';
import type {
  DocumentReference,
  GraphEntity,
  GraphRelationship,
  GraphStore,
  TraversalResult,
} from './GraphStore.js';

export class PostgresGraphStore implements GraphStore {
  private readonly db: DbInstance;
  private readonly log: Logger;

  constructor(db: DbInstance, log: Logger) {
    this.db = db;
    this.log = log.child({ component: 'PostgresGraphStore' });
  }

  async writeEntity(entity: GraphEntity): Promise<void> {
    this.log.debug({ entityId: entity.entityId }, 'writeEntity: upserting');

    await this.db.graph.upsertTerm({
      id: entity.entityId,
      term: entity.term,
      normalisedTerm: normaliseTermText(entity.term),
      category: entity.category,
      description: null,
      confidence: entity.confidence,
      aliases: [],
      source: 'llm_extracted',
    });

    this.log.debug({ entityId: entity.entityId }, 'writeEntity: complete');
  }

  async writeRelationship(relationship: GraphRelationship): Promise<void> {
    this.log.debug(
      {
        sourceEntityId: relationship.sourceEntityId,
        targetEntityId: relationship.targetEntityId,
        relationshipType: relationship.relationshipType,
      },
      'writeRelationship: inserting',
    );

    await this.db.graph.insertRelationship({
      id: uuidv7(),
      sourceTermId: relationship.sourceEntityId,
      targetTermId: relationship.targetEntityId,
      relationshipType: relationship.relationshipType,
      confidence: relationship.confidence,
    });

    this.log.debug(
      {
        sourceEntityId: relationship.sourceEntityId,
        targetEntityId: relationship.targetEntityId,
      },
      'writeRelationship: complete',
    );
  }

  async getEntity(entityId: string): Promise<GraphEntity | null> {
    this.log.debug({ entityId }, 'getEntity: querying');

    const row = await this.db.graph.findTermById(entityId);

    if (!row) {
      this.log.debug({ entityId }, 'getEntity: not found or no occurrences');
      return null;
    }

    return {
      entityId: row.id,
      term: row.term,
      category: row.category,
      confidence: row.confidence,
    };
  }

  async getRelationships(
    entityId: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both',
  ): Promise<GraphRelationship[]> {
    this.log.debug({ entityId, direction }, 'getRelationships: querying');

    const rows = await this.db.graph.findRelationships(entityId, direction);

    this.log.debug(
      { entityId, direction, count: rows.length },
      'getRelationships: complete',
    );

    return rows.map((r) => ({
      sourceEntityId: r.sourceTermId,
      targetEntityId: r.targetTermId,
      relationshipType: r.relationshipType,
      confidence: r.confidence,
    }));
  }

  async traverse(
    startEntityId: string,
    maxDepth: number,
    relationshipTypes?: string[],
  ): Promise<TraversalResult> {
    this.log.debug(
      { startEntityId, maxDepth, relationshipTypes },
      'traverse: starting',
    );

    const rawRows = await this.db.graph.traverse(
      startEntityId,
      maxDepth,
      relationshipTypes,
    );

    // knex.raw bypasses postProcessResponse — map snake_case columns explicitly.
    // confidence is not projected by the CTE (only traversal topology is returned);
    // callers that need relationship confidence should fetch via getRelationships().
    const relationships: GraphRelationship[] = rawRows.map((r) => ({
      sourceEntityId: r.source_term_id,
      targetEntityId: r.target_term_id,
      relationshipType: r.relationship_type,
      confidence: null,
    }));

    const entityIds = new Set<string>();
    for (const r of rawRows) {
      entityIds.add(r.source_term_id);
      entityIds.add(r.target_term_id);
    }

    // ADR-037 document-evidenced filter is intentionally NOT applied here.
    // traverse() follows relationship edges — filtering mid-traversal would
    // produce incoherent results (relationships pointing to entity IDs absent
    // from the entities list). The filter applies at entry-point queries
    // (getEntity, findEntitiesByType) where callers ask "what entities exist?".
    // Future hardening: enforce evidenced constraint at write time in
    // writeRelationship so non-evidenced entities never acquire relationships.
    let entities: GraphEntity[] = [];
    if (entityIds.size > 0) {
      const entityRows = await this.db.graph.findTermsByIds(
        Array.from(entityIds),
      );
      entities = entityRows.map((r) => ({
        entityId: r.id,
        term: r.term,
        category: r.category,
        confidence: r.confidence,
      }));
    }

    const actualDepth =
      rawRows.length > 0 ? Math.max(...rawRows.map((r) => r.depth)) : 0;

    this.log.debug(
      {
        startEntityId,
        maxDepth,
        actualDepth,
        entityCount: entities.length,
        relationshipCount: relationships.length,
      },
      'traverse: complete',
    );

    return { entities, relationships, depth: actualDepth };
  }

  async findEntitiesByType(entityType: string): Promise<GraphEntity[]> {
    this.log.debug({ entityType }, 'findEntitiesByType: querying');

    const rows = await this.db.graph.findTermsByCategory(entityType);

    this.log.debug(
      { entityType, count: rows.length },
      'findEntitiesByType: complete',
    );

    return rows.map((r) => ({
      entityId: r.id,
      term: r.term,
      category: r.category,
      confidence: r.confidence,
    }));
  }

  async findDocumentsByEntity(entityId: string): Promise<DocumentReference[]> {
    this.log.debug({ entityId }, 'findDocumentsByEntity: querying');

    const rows = await this.db.graph.findDocumentsByTermId(entityId);

    this.log.debug(
      { entityId, count: rows.length },
      'findDocumentsByEntity: complete',
    );

    return rows.map((r) => ({
      documentId: r.id,
      description: r.description,
      date: r.date ?? null,
    }));
  }
}
