/**
 * StorageService interface (ADR-008).
 *
 * Abstracts all file I/O so that a different storage provider (e.g. S3) can
 * be substituted in Phase 2 by replacing the concrete implementation only.
 * The concrete provider is selected at runtime via config (storage.provider).
 * Phase 1 uses LocalStorageService.
 */

export interface StorageService {
  /**
   * Write a buffer to the staging area at {stagingPath}/{uploadId}/{filename}.
   * Creates the directory if it does not exist.
   * Returns the absolute path of the written file.
   */
  writeStagingFile(
    uploadId: string,
    fileBuffer: Buffer,
    filename: string,
  ): Promise<string>;

  /**
   * Move a file from {stagingPath}/{uploadId}/{filename} to
   * {basePath}/{uploadId}/{filename}. Creates the destination parent directory
   * if it does not exist. Returns the absolute destination path.
   */
  moveStagingToPermanent(uploadId: string, filename: string): Promise<string>;

  /**
   * Delete {stagingPath}/{uploadId}/{filename}. No error if the file does not
   * exist (idempotent).
   */
  deleteStagingFile(uploadId: string, filename: string): Promise<void>;

  /**
   * Delete the file at the given absolute storage path. No error if the file
   * does not exist (idempotent). Accepts the path as returned by
   * moveStagingToPermanent.
   */
  deletePermanentFile(storagePath: string): Promise<void>;

  /**
   * Create the directory {stagingPath}/{runId}/. Returns the absolute path of
   * the created directory.
   */
  createStagingDirectory(runId: string): Promise<string>;

  /**
   * Recursively delete {stagingPath}/{runId}/. No error if the directory does
   * not exist (idempotent).
   */
  deleteStagingDirectory(runId: string): Promise<void>;

  /**
   * Return true if the file at the given path exists and is readable.
   */
  fileExists(path: string): Promise<boolean>;
}
