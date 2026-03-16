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
import { createDocumentsRouter } from './documents.js';

export function createRouter(deps: AppDependencies): Router {
  const router = Router();

  router.use(createDocumentsRouter(deps.documentService));

  // Additional route groups added in Tasks 9–15

  return router;
}
