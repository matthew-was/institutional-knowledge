/**
 * Route registration.
 *
 * Routes are implemented in subsequent tasks (Tasks 8–19). This file registers
 * the Express Router with all route groups mounted under /api. Each route group
 * receives its service dependency following the dependency-composition-pattern skill.
 *
 * The health check is registered directly in index.ts (before auth middleware)
 * and is not part of this router.
 */

import { Router } from 'express';
import type { AppDependencies } from '../index.js';
import { createCurationRouter } from './curation.js';
import { createDocumentsRouter } from './documents.js';
import { createIngestionRouter } from './ingestion.js';
import { createProcessingRouter } from './processing.js';
import { createSearchRouter } from './search.js';
import { createVocabularyRouter } from './vocabulary.js';

export function createRouter(deps: AppDependencies): Router {
  const router = Router();

  router.use(createDocumentsRouter(deps.documentService));
  router.use(createCurationRouter(deps.curationService));
  router.use(createVocabularyRouter(deps.vocabularyService));
  router.use(createProcessingRouter(deps.processingService));
  router.use(createSearchRouter(deps.searchService));
  router.use(createIngestionRouter(deps.ingestionService));

  return router;
}
