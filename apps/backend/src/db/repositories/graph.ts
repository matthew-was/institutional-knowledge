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

import type { VocabularyCandidateItem } from '@institutional-knowledge/shared/schemas/vocabulary';
import type { Knex } from 'knex';
import type {
  DocumentRow,
  EntityDocumentOccurrenceInsert,
  RejectedTermRow,
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

      // The filtered and unfiltered branches below duplicate the CTE structure
      // intentionally. Knex uses positional bindings (?), so merging them via a
      // conditional clause would require fragile conditional binding arrays where
      // a miscount produces a silent wrong query. The duplication keeps each
      // variant self-contained and independently testable.
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

    // -----------------------------------------------------------------------
    // Vocabulary curation methods (VOC-001 to VOC-004)
    // -----------------------------------------------------------------------

    /**
     * Retrieve a full vocabulary_terms row by ID, with no occurrence filter.
     * Used for curation operations (accept/reject) unlike findTermById which
     * is for ADR-037 graph queries and requires document evidence.
     */
    async findVocabTermById(
      id: string,
    ): Promise<VocabularyTermRow | undefined> {
      return db<VocabularyTermRow>('vocabularyTerms').where('id', id).first();
    },

    /**
     * Update the source field of a vocabulary_terms row and set updatedAt.
     */
    async updateTermSource(id: string, source: string): Promise<void> {
      await db<VocabularyTermRow>('vocabularyTerms')
        .where('id', id)
        .update({ source, updatedAt: db.fn.now() });
    },

    /**
     * Delete a vocabulary_terms row by ID. Foreign key cascades remove
     * associated vocabulary_relationships and entity_document_occurrences rows.
     */
    async deleteTermById(id: string): Promise<void> {
      await db<VocabularyTermRow>('vocabularyTerms').where('id', id).delete();
    },

    /**
     * Insert a row into rejected_terms.
     * rejectedAt must be supplied by the caller — no DB default exists.
     */
    async insertRejectedTerm(row: RejectedTermRow): Promise<void> {
      await db<RejectedTermRow>('rejectedTerms').insert(row);
    },

    /**
     * Return true if the given normalisedTerm already exists in vocabulary_terms.
     */
    async findNormalisedTermInVocabulary(
      normalisedTerm: string,
    ): Promise<boolean> {
      const row = await db<VocabularyTermRow>('vocabularyTerms')
        .where('normalisedTerm', normalisedTerm)
        .first();
      return row !== undefined;
    },

    /**
     * Return true if the given normalisedTerm already exists in rejected_terms.
     */
    async findNormalisedTermInRejected(
      normalisedTerm: string,
    ): Promise<boolean> {
      const row = await db<RejectedTermRow>('rejectedTerms')
        .where('normalisedTerm', normalisedTerm)
        .first();
      return row !== undefined;
    },

    /**
     * Return the subset of the provided IDs that actually exist in vocabulary_terms.
     * Used to validate targetTermId values before inserting relationships (VOC-004).
     */
    async termIdsExist(ids: string[]): Promise<string[]> {
      if (ids.length === 0) return [];
      const rows = await db<VocabularyTermRow>('vocabularyTerms')
        .select('id')
        .whereIn('id', ids);
      return rows.map((r) => r.id);
    },

    /**
     * Atomically insert a rejected_terms row and delete the vocabulary_terms
     * row (which cascades to vocabulary_relationships and
     * entity_document_occurrences via FK). Both tables are within the graph
     * domain so this transaction does not cross a repository boundary.
     */
    async rejectTerm(termId: string, rejected: RejectedTermRow): Promise<void> {
      await db.transaction(async (trx) => {
        await trx<RejectedTermRow>('rejectedTerms').insert(rejected);
        await trx<VocabularyTermRow>('vocabularyTerms')
          .where('id', termId)
          .delete();
      });
    },

    /**
     * Atomically insert a vocabulary_terms row and its associated
     * vocabulary_relationships rows. Both tables are within the graph domain
     * so this transaction does not cross a repository boundary.
     */
    async addTermWithRelationships(
      term: VocabularyTermInsert,
      relationships: VocabularyRelationshipInsert[],
    ): Promise<void> {
      await db.transaction(async (trx) => {
        await trx<VocabularyTermRow>('vocabularyTerms').insert(term);
        if (relationships.length > 0) {
          await trx<VocabularyRelationshipRow>(
            'vocabularyRelationships',
          ).insert(relationships);
        }
      });
    },

    async getFlaggedVocabTerms(
      page: number,
      pageSize: number,
    ): Promise<{ rows: VocabularyCandidateItem[]; total: number }> {
      const offset = (page - 1) * pageSize;

      // Subquery: earliest document occurrence per term (earliest by
      // entity_document_occurrences.created_at). knex.raw is used here because
      // DISTINCT ON is a PostgreSQL extension not expressible with the query
      // builder. Column names inside raw SQL are in snake_case because
      // wrapIdentifier does not apply to knex.raw strings.
      const earliestOccurrence = db
        .select(db.raw('DISTINCT ON (term_id) term_id'), 'documentId')
        .from('entityDocumentOccurrences')
        .orderByRaw('term_id, created_at ASC')
        .as('earliest');

      const rowsQuery = db<VocabularyTermRow>('vocabularyTerms as vt')
        .select(
          'vt.id as termId',
          'vt.term',
          'vt.category',
          'vt.confidence',
          'vt.description',
          'd.description as sourceDocumentDescription',
          'd.date as sourceDocumentDate',
          'vt.createdAt',
        )
        .leftJoin(earliestOccurrence, 'earliest.termId', 'vt.id')
        .leftJoin('documents as d', 'd.id', 'earliest.documentId')
        .where('vt.source', 'llm_extracted')
        .orderBy('vt.createdAt', 'asc')
        .limit(pageSize)
        .offset(offset);

      const countQuery = db<VocabularyTermRow>('vocabularyTerms')
        .where('source', 'llm_extracted')
        .count<[{ count: string }]>('id as count')
        .first();

      const [rawRows, countRow] = await Promise.all([rowsQuery, countQuery]);
      const total = Number(countRow?.count ?? 0);

      // postProcessResponse converts snake_case → camelCase for query-builder
      // results, so the selected aliases already arrive as camelCase.
      const rows: VocabularyCandidateItem[] = (
        rawRows as Array<{
          termId: string;
          term: string;
          category: string;
          confidence: number | null;
          description: string | null;
          sourceDocumentDescription: string | null;
          sourceDocumentDate: string | null;
          createdAt: Date;
        }>
      ).map((r) => ({
        termId: r.termId,
        term: r.term,
        category: r.category,
        confidence: r.confidence,
        description: r.description,
        sourceDocumentDescription: r.sourceDocumentDescription,
        sourceDocumentDate: r.sourceDocumentDate,
        createdAt: r.createdAt.toISOString(),
      }));

      return { rows, total };
    },
  };
}

export type GraphRepository = ReturnType<typeof createGraphRepository>;
