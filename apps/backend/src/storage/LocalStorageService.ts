/**
 * LocalStorageService — Phase 1 filesystem-backed StorageService implementation.
 *
 * Stores files on the local filesystem using two root directories:
 *   - stagingPath: temporary staging area for uploads in progress
 *   - basePath: permanent storage for finalized documents
 *
 * Both paths are resolved relative to the working directory of the Node process
 * unless absolute paths are provided in config.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageService } from './types.js';

export class LocalStorageService implements StorageService {
  private readonly basePath: string;
  private readonly stagingPath: string;

  constructor(basePath: string, stagingPath: string) {
    this.basePath = path.resolve(basePath);
    this.stagingPath = path.resolve(stagingPath);
  }

  async writeStaging(key: string, buffer: Buffer): Promise<string> {
    const fullPath = path.join(this.stagingPath, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return key;
  }

  async moveToStorage(
    stagingKey: string,
    permanentKey: string,
  ): Promise<string> {
    const srcPath = path.join(this.stagingPath, stagingKey);
    const destPath = path.join(this.basePath, permanentKey);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.rename(srcPath, destPath);
    return permanentKey;
  }

  async deleteStaging(key: string): Promise<void> {
    const fullPath = path.join(this.stagingPath, key);
    await fs.unlink(fullPath).catch(() => {
      // Silently ignore if the file does not exist — cleanup is best-effort
    });
  }

  async deleteStorage(key: string): Promise<void> {
    const fullPath = path.join(this.basePath, key);
    await fs.unlink(fullPath).catch(() => {
      // Silently ignore if the file does not exist — cleanup is best-effort
    });
  }

  async readStaging(key: string): Promise<Buffer> {
    const fullPath = path.join(this.stagingPath, key);
    return fs.readFile(fullPath);
  }

  async stagingExists(key: string): Promise<boolean> {
    const fullPath = path.join(this.stagingPath, key);
    return fs.access(fullPath).then(
      () => true,
      () => false,
    );
  }

  async createStagingDir(dirKey: string): Promise<void> {
    const fullPath = path.join(this.stagingPath, dirKey);
    await fs.mkdir(fullPath, { recursive: true });
  }
}

/**
 * Factory: create a StorageService from the storage config block.
 */
export function createStorageService(storageConfig: {
  provider: string;
  local: { basePath: string; stagingPath: string };
}): StorageService {
  if (storageConfig.provider === 'local') {
    return new LocalStorageService(
      storageConfig.local.basePath,
      storageConfig.local.stagingPath,
    );
  }
  throw new Error(`Unknown storage provider: ${storageConfig.provider}`);
}
