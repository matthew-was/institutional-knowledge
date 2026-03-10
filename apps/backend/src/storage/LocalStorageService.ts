/**
 * LocalStorageService — Phase 1 filesystem-backed StorageService implementation.
 *
 * Stores files on the local filesystem using two root directories:
 *   - basePath:    permanent storage for finalised documents
 *   - stagingPath: temporary area for uploads in progress
 *
 * Both paths are resolved to absolute paths in the constructor. Relative paths
 * are resolved against the working directory of the Node process.
 *
 * deleteStagingFile, deletePermanentFile, and deleteStagingDirectory are all
 * idempotent — they do not throw if the target does not exist.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from 'pino';
import type { StorageService } from './StorageService.js';

export class LocalStorageService implements StorageService {
  private readonly basePath: string;
  private readonly stagingPath: string;
  private readonly log: Logger;

  constructor(basePath: string, stagingPath: string, log: Logger) {
    this.basePath = path.resolve(basePath);
    this.stagingPath = path.resolve(stagingPath);
    this.log = log.child({ component: 'LocalStorageService' });
  }

  async writeStagingFile(
    uploadId: string,
    fileBuffer: Buffer,
    filename: string,
  ): Promise<string> {
    const dir = path.join(this.stagingPath, uploadId);
    const fullPath = path.join(dir, filename);
    this.log.debug({ uploadId, filename, fullPath }, 'writing staging file');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, fileBuffer);
    return fullPath;
  }

  async moveStagingToPermanent(
    uploadId: string,
    filename: string,
  ): Promise<string> {
    const src = path.join(this.stagingPath, uploadId, filename);
    const destDir = path.join(this.basePath, uploadId);
    const dest = path.join(destDir, filename);
    this.log.debug({ uploadId, filename, src, dest }, 'moving staging file to permanent storage');
    await fs.mkdir(destDir, { recursive: true });
    await fs.rename(src, dest);
    return dest;
  }

  async deleteStagingFile(uploadId: string, filename: string): Promise<void> {
    const fullPath = path.join(this.stagingPath, uploadId, filename);
    this.log.debug({ uploadId, filename, fullPath }, 'deleting staging file');
    await fs.unlink(fullPath).catch((err: unknown) => {
      const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
      if (code === 'ENOENT') {
        this.log.debug({ uploadId, filename, fullPath }, 'delete staging file: file already absent');
      } else {
        this.log.error({ uploadId, filename, fullPath, err }, 'delete staging file: unexpected error');
      }
    });
  }

  async deletePermanentFile(storagePath: string): Promise<void> {
    this.log.debug({ storagePath }, 'deleting permanent file');
    await fs.unlink(storagePath).catch((err: unknown) => {
      const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
      if (code === 'ENOENT') {
        this.log.debug({ storagePath }, 'delete permanent file: file already absent');
      } else {
        this.log.error({ storagePath, err }, 'delete permanent file: unexpected error');
      }
    });
  }

  async createStagingDirectory(runId: string): Promise<string> {
    const fullPath = path.join(this.stagingPath, runId);
    this.log.debug({ runId, fullPath }, 'creating staging directory');
    await fs.mkdir(fullPath, { recursive: true });
    return fullPath;
  }

  async deleteStagingDirectory(runId: string): Promise<void> {
    const fullPath = path.join(this.stagingPath, runId);
    this.log.debug({ runId, fullPath }, 'deleting staging directory');
    // force: true suppresses ENOENT — idempotent when directory does not exist
    await fs.rm(fullPath, { recursive: true, force: true }).catch((err: unknown) => {
      this.log.error({ runId, fullPath, err }, 'delete staging directory: unexpected error');
    });
  }

  async fileExists(filePath: string): Promise<boolean> {
    return fs.access(filePath).then(
      () => true,
      () => false,
    );
  }
}
