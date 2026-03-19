/**
 * SearchService — vector and graph search handlers (QUERY-001, QUERY-002).
 *
 * Implements the service layer for search callbacks from the Python query
 * handler. Each method returns ServiceResult<T, K> — the route layer owns
 * all HTTP concerns. No Express imports here.
 *
 * vectorSearch delegates to VectorStore.search() and maps SearchResult[] to
 * the VectorSearchResponse contract. graphSearch resolves entity names via
 * normalised_term lookup, traverses the graph via GraphStore, and aggregates
 * results across all resolved entities.
 */

import type { ServiceResult } from '@institutional-knowledge/shared';
import type {
  GraphSearchRequest,
  GraphSearchResponse,
  VectorSearchRequest,
  VectorSearchResponse,
} from '@institutional-knowledge/shared/schemas/search';
import type { AppConfig } from '../config/index.js';
import type { DbInstance } from '../db/index.js';
import type { GraphStore } from '../graphstore/GraphStore.js';
import type { Logger } from '../middleware/logger.js';
import { normaliseTermText } from '../utils/normalise.js';
import type { VectorStore } from '../vectorstore/VectorStore.js';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type SearchErrorType = 'dimension_mismatch' | 'depth_exceeded';

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface SearchService {
  vectorSearch(
    input: VectorSearchRequest,
  ): Promise<ServiceResult<VectorSearchResponse, SearchErrorType>>;
  graphSearch(
    input: GraphSearchRequest,
  ): Promise<ServiceResult<GraphSearchResponse, SearchErrorType>>;
}

export interface SearchServiceDeps {
  db: DbInstance;
  vectorStore: VectorStore;
  graphStore: GraphStore;
  config: AppConfig;
  log: Logger;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSearchService(deps: SearchServiceDeps): SearchService {
  const { db, vectorStore, graphStore, config, log } = deps;

  async function vectorSearch(
    input: VectorSearchRequest,
  ): Promise<ServiceResult<VectorSearchResponse, SearchErrorType>> {
    const { embedding, topK } = input;

    if (embedding.length !== config.embedding.dimension) {
      return {
        outcome: 'error',
        errorType: 'dimension_mismatch',
        errorMessage: `Embedding dimension mismatch — expected ${config.embedding.dimension}, received ${embedding.length}`,
      };
    }

    log.debug({ topK, dimension: embedding.length }, 'vectorSearch: executing');

    const searchResult = await vectorStore.search(embedding, topK);
    if (searchResult.outcome === 'error') {
      // Propagate dimension_mismatch from the store (defensive; dimension
      // check above should prevent this from being reached in practice)
      return searchResult;
    }

    const results = searchResult.data.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      text: r.text,
      chunkIndex: r.chunkIndex,
      tokenCount: r.tokenCount,
      similarityScore: r.similarityScore,
      document: {
        description: r.document.description,
        date: r.document.date,
        documentType: r.document.documentType,
      },
    }));

    log.debug({ resultCount: results.length }, 'vectorSearch: complete');

    return { outcome: 'success', data: { results } };
  }

  async function graphSearch(
    input: GraphSearchRequest,
  ): Promise<ServiceResult<GraphSearchResponse, SearchErrorType>> {
    const { entityNames, maxDepth, relationshipTypes } = input;

    if (maxDepth > config.graph.maxTraversalDepth) {
      return {
        outcome: 'error',
        errorType: 'depth_exceeded',
        errorMessage: `maxDepth ${maxDepth} exceeds the configured limit of ${config.graph.maxTraversalDepth}`,
      };
    }

    log.debug(
      { entityCount: entityNames.length, maxDepth },
      'graphSearch: executing',
    );

    // Accumulate entities and relationships across all resolved entity names.
    // Deduplication is by entityId / sourceEntityId+targetEntityId+type.
    const entityMap = new Map<
      string,
      {
        entityId: string;
        term: string;
        category: string;
        relatedDocumentIds: Set<string>;
      }
    >();
    const relationshipSet = new Set<string>();
    const relationships: Array<{
      sourceEntityId: string;
      targetEntityId: string;
      relationshipType: string;
    }> = [];

    for (const name of entityNames) {
      const normalisedName = normaliseTermText(name);
      const term = await db.graph.findTermByNormalisedTerm(normalisedName);

      if (term === undefined) {
        log.debug(
          { name, normalisedName },
          'graphSearch: entity not found, skipping',
        );
        continue;
      }

      const traversalResult = await graphStore.traverse(
        term.id,
        maxDepth,
        relationshipTypes,
      );

      // Collect all entity IDs from traversal (start entity + traversal entities)
      const allEntityIds = new Set<string>([term.id]);
      for (const e of traversalResult.entities) {
        allEntityIds.add(e.entityId);
      }

      // Collect relationships
      for (const rel of traversalResult.relationships) {
        const key = `${rel.sourceEntityId}:${rel.targetEntityId}:${rel.relationshipType}`;
        if (!relationshipSet.has(key)) {
          relationshipSet.add(key);
          relationships.push({
            sourceEntityId: rel.sourceEntityId,
            targetEntityId: rel.targetEntityId,
            relationshipType: rel.relationshipType,
          });
        }
      }

      // For each entity in traversal, gather related documents and accumulate
      for (const entityId of allEntityIds) {
        const docs = await graphStore.findDocumentsByEntity(entityId);
        const docIds = docs.map((d) => d.documentId);

        if (!entityMap.has(entityId)) {
          // Find entity details — from traversal entities or the start term
          const traversalEntity = traversalResult.entities.find(
            (e) => e.entityId === entityId,
          );
          const entityTerm = traversalEntity?.term ?? term.term;
          const entityCategory = traversalEntity?.category ?? term.category;

          entityMap.set(entityId, {
            entityId,
            term: entityTerm,
            category: entityCategory,
            relatedDocumentIds: new Set(docIds),
          });
        } else {
          // Merge document IDs into existing entry
          const existing = entityMap.get(entityId);
          if (existing !== undefined) {
            for (const docId of docIds) {
              existing.relatedDocumentIds.add(docId);
            }
          }
        }
      }
    }

    const entities = Array.from(entityMap.values()).map((e) => ({
      entityId: e.entityId,
      term: e.term,
      category: e.category,
      relatedDocumentIds: Array.from(e.relatedDocumentIds),
    }));

    log.debug(
      { entityCount: entities.length, relationshipCount: relationships.length },
      'graphSearch: complete',
    );

    return { outcome: 'success', data: { entities, relationships } };
  }

  return { vectorSearch, graphSearch };
}
