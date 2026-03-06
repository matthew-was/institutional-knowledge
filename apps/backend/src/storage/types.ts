/**
 * StorageService interface (ADR-008).
 *
 * All implementations must satisfy this contract. The concrete provider is
 * selected at runtime via config (storage.provider). Phase 1 uses
 * LocalStorageService.
 */

export interface StorageService {
	/**
	 * Write a file to the staging area and return the storage key.
	 * @param key - relative path within the staging root
	 * @param buffer - file content
	 */
	writeStaging(key: string, buffer: Buffer): Promise<string>;

	/**
	 * Move a file from staging to permanent storage.
	 * @param stagingKey - relative path within the staging root
	 * @param permanentKey - relative path within the permanent storage root
	 * @returns the permanent storage path
	 */
	moveToStorage(stagingKey: string, permanentKey: string): Promise<string>;

	/**
	 * Delete a file from the staging area.
	 * @param key - relative path within the staging root
	 */
	deleteStaging(key: string): Promise<void>;

	/**
	 * Delete a file from permanent storage.
	 * @param key - relative path within the permanent storage root
	 */
	deleteStorage(key: string): Promise<void>;

	/**
	 * Read a file from staging.
	 * @param key - relative path within the staging root
	 */
	readStaging(key: string): Promise<Buffer>;

	/**
	 * Check whether a staging file exists.
	 * @param key - relative path within the staging root
	 */
	stagingExists(key: string): Promise<boolean>;

	/**
	 * Create a directory within the staging root.
	 * @param dirKey - relative path within the staging root
	 */
	createStagingDir(dirKey: string): Promise<void>;
}
