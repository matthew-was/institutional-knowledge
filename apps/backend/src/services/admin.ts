/**
 * AdminService — admin operation handlers (ADMIN-001).
 *
 * Implements the service layer for admin maintenance operations. Each method
 * returns ServiceResult<T, K> — the route layer owns all HTTP concerns.
 * No Express imports here.
 *
 * reindexEmbeddings: rebuilds the IVFFlat index on embeddings.embedding via
 * REINDEX INDEX CONCURRENTLY. Delegates to db.embeddings.reindexIvfflat().
 */

import type { ServiceResult } from '@institutional-knowledge/shared';
import type { DbInstance } from '../db/index.js';
import type { Logger } from '../middleware/logger.js';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

// No expected domain errors for admin operations — unexpected failures are
// propagated as thrown exceptions and handled by the global error handler.
export type ReindexError = never;

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface AdminService {
  reindexEmbeddings(): Promise<
    ServiceResult<{ reindexed: true }, ReindexError>
  >;
}

export interface AdminServiceDeps {
  db: DbInstance;
  log: Logger;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAdminService(deps: AdminServiceDeps): AdminService {
  const { db, log } = deps;

  async function reindexEmbeddings(): Promise<
    ServiceResult<{ reindexed: true }, ReindexError>
  > {
    await db.embeddings.reindexIvfflat();

    log.info('Reindexed embeddings IVFFlat index');

    return { outcome: 'success', data: { reindexed: true } };
  }

  return { reindexEmbeddings };
}
