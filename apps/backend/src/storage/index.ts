/**
 * Storage factory.
 *
 * createStorageService reads storage.provider from the config block and returns
 * the appropriate StorageService implementation. Phase 1 supports "local" only.
 * To add a new provider (e.g. "s3") in Phase 2, add a branch here and create
 * the corresponding implementation class — no other files need to change.
 */

import type { Logger } from 'pino';
import type { AppConfig } from '../config/index.js';
import { LocalStorageService } from './LocalStorageService.js';
import type { StorageService } from './StorageService.js';

export type { StorageService } from './StorageService.js';

export function createStorageService(
  storageConfig: AppConfig['storage'],
  log: Logger,
): StorageService {
  if (storageConfig.provider === 'local') {
    return new LocalStorageService(
      storageConfig.local.basePath,
      storageConfig.local.stagingPath,
      log,
    );
  }
  throw new Error(`Unknown storage provider: ${storageConfig.provider}`);
}
