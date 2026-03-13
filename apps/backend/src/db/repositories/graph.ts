/**
 * Graph repository.
 *
 * Encapsulates all database access for the vocabulary_terms,
 * vocabulary_relationships, entity_document_occurrences, and documents
 * tables as used by the GraphStore (ADR-037).
 *
 * All queries use the Knex query builder except traverse(), which requires
 * a recursive CTE that the query builder cannot express. Column names inside
 * raw SQL are written in snake_case because knex.raw bypasses wrapIdentifier;
 * postProcessResponse is also bypassed for raw results, so those rows are
 * mapped to camelCase explicitly.
 */

import type { Knex } from 'knex';
import type {
  DocumentRow,
  EntityDocumentOccurrenceInsert,
  VocabularyRelationshipInsert,
  VocabularyRelationshipRow,
  VocabularyTermInsert,
  VocabularyTermRow,
} from '../tables.js';

// ---------------------------------------------------------------------------
// Exported result types
// ---------------------------------------------------------------------------

export type GraphVocabTermRow = Pick<
  VocabularyTermRow,
  'id' | 'term' | 'category' | 'confidence'
>;

export type GraphRelationshipRow = Pick<
  VocabularyRelationshipRow,
  'sourceTermId' | 'targetTermId' | 'relationshipType' | 'confidence'
>;

export type GraphDocumentRow = Pick<DocumentRow, 'id' | 'description' | 'date'>;

export interface TraversalRawRow {
  source_term_id: string;
  target_term_id: string;
  relationship_type: string;
  depth: number;
}

// ---------------------------------------------------------------------------
// Repository factory
// ---------------------------------------------------------------------------

export function createGraphRepository(db: Knex) {
  return {
    /**
     * Upsert a vocabulary_terms row on id conflict.
     */
    async upsertTerm(row: VocabularyTermInsert): Promise<void> {
      await db<VocabularyTermRow>('vocabularyTerms')
        .insert(row)
        .onConflict('id')
        .merge({
          term: row.term,
          normalisedTerm: row.normalisedTerm,
          category: row.category,
          confidence: row.confidence,
          updatedAt: db.fn.now(),
        });
    },

    /**
     * Insert a vocabulary_relationships row; ignore on duplicate composite key.
     */
    async insertRelationship(row: VocabularyRelationshipInsert): Promise<void> {
      await db<VocabularyRelationshipRow>('vocabularyRelationships')
        .insert(row)
        .onConflict(['sourceTermId', 'targetTermId', 'relationshipType'])
        .ignore();
    },

    /**
     * Retrieve a vocabulary_terms row by ID, filtered to entities with at
     * least one entity_document_occurrences row (ADR-037).
     * Returns undefined if not found or not document-evidenced.
     */
    async findTermById(id: string): Promise<GraphVocabTermRow | undefined> {
      return db<VocabularyTermRow>('vocabularyTerms as vt')
        .select('vt.id', 'vt.term', 'vt.category', 'vt.confidence')
        .whereExists(
          db('entityDocumentOccurrences')
            .select(db.raw('1'))
            .where('termId', db.ref('vt.id')),
        )
        .where('vt.id', id)
        .first();
    },

    /**
     * Retrieve relationships for an entity, optionally filtered by direction.
     */
    async findRelationships(
      entityId: string,
      direction: 'outgoing' | 'incoming' | 'both' = 'both',
    ): Promise<GraphRelationshipRow[]> {
      // Knex query builder methods mutate and return `this`, so the conditional
      // branches below update `query` in place before it is awaited.
      const query = db<VocabularyRelationshipRow>(
        'vocabularyRelationships',
      ).select(
        'sourceTermId',
        'targetTermId',
        'relationshipType',
        'confidence',
      );

      if (direction === 'outgoing') {
        query.where('sourceTermId', entityId);
      } else if (direction === 'incoming') {
        query.where('targetTermId', entityId);
      } else {
        query.where('sourceTermId', entityId).orWhere('targetTermId', entityId);
      }

      return query;
    },

    /**
     * Walk the relationship graph from startEntityId up to maxDepth hops
     * using a recursive CTE.
     *
     * knex.raw bypasses postProcessResponse — result rows are in snake_case
     * and must be mapped by the caller.
     */
    async traverse(
      startEntityId: string,
      maxDepth: number,
      relationshipTypes?: string[],
    ): Promise<TraversalRawRow[]> {
      const hasTypeFilter =
        relationshipTypes !== undefined && relationshipTypes.length > 0;

      let rawSql: string;
      let bindings: unknown[];

      if (hasTypeFilter) {
        rawSql = `
          WITH RECURSIVE graph AS (
            SELECT vr.source_term_id, vr.target_term_id, vr.relationship_type, 1 AS depth
            FROM vocabulary_relationships vr
            WHERE vr.source_term_id = ?
              AND vr.relationship_type = ANY(?)
            UNION ALL
            SELECT vr.source_term_id, vr.target_term_id, vr.relationship_type, g.depth + 1
            FROM vocabulary_relationships vr
            JOIN graph g ON vr.source_term_id = g.target_term_id
            WHERE g.depth < ?
              AND vr.relationship_type = ANY(?)
          )
          SELECT source_term_id, target_term_id, relationship_type, MIN(depth) AS depth
          FROM graph
          GROUP BY source_term_id, target_term_id, relationship_type
        `;
        bindings = [
          startEntityId,
          relationshipTypes,
          maxDepth,
          relationshipTypes,
        ];
      } else {
        rawSql = `
          WITH RECURSIVE graph AS (
            SELECT vr.source_term_id, vr.target_term_id, vr.relationship_type, 1 AS depth
            FROM vocabulary_relationships vr
            WHERE vr.source_term_id = ?
            UNION ALL
            SELECT vr.source_term_id, vr.target_term_id, vr.relationship_type, g.depth + 1
            FROM vocabulary_relationships vr
            JOIN graph g ON vr.source_term_id = g.target_term_id
            WHERE g.depth < ?
          )
          SELECT source_term_id, target_term_id, relationship_type, MIN(depth) AS depth
          FROM graph
          GROUP BY source_term_id, target_term_id, relationship_type
        `;
        bindings = [startEntityId, maxDepth];
      }

      const result = await db.raw<{ rows: TraversalRawRow[] }>(
        rawSql,
        bindings,
      );
      return result.rows;
    },

    /**
     * Find all vocabulary_terms rows of a given category that have at least
     * one entity_document_occurrences row (ADR-037).
     */
    async findTermsByCategory(category: string): Promise<GraphVocabTermRow[]> {
      return db<VocabularyTermRow>('vocabularyTerms as vt')
        .select('vt.id', 'vt.term', 'vt.category', 'vt.confidence')
        .whereExists(
          db('entityDocumentOccurrences')
            .select(db.raw('1'))
            .where('termId', db.ref('vt.id')),
        )
        .where('vt.category', category);
    },

    /**
     * Retrieve vocabulary_terms rows by a set of IDs.
     */
    async findTermsByIds(ids: string[]): Promise<GraphVocabTermRow[]> {
      return db<VocabularyTermRow>('vocabularyTerms')
        .select('id', 'term', 'category', 'confidence')
        .whereIn('id', ids);
    },

    /**
     * Find documents that reference a given entity via entity_document_occurrences.
     */
    async findDocumentsByTermId(termId: string): Promise<GraphDocumentRow[]> {
      return db('entityDocumentOccurrences as edo')
        .join('documents as d', 'd.id', 'edo.documentId')
        .select('d.id', 'd.description', 'd.date')
        .where('edo.termId', termId);
    },

    /**
     * Insert an entity_document_occurrences row.
     */
    async insertOccurrence(row: EntityDocumentOccurrenceInsert): Promise<void> {
      await db('entityDocumentOccurrences').insert(row);
    },
  };
}

export type GraphRepository = ReturnType<typeof createGraphRepository>;
