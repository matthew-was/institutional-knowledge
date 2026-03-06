/**
 * PgVectorStore — Phase 1 pgvector implementation of VectorStore.
 *
 * Implemented in Task 5. This stub satisfies the interface contract so that
 * the application compiles in Task 1.
 */

import type { KnexInstance } from "../db/index.js";
import type { SearchResult, VectorStore } from "./types.js";

export class PgVectorStore implements VectorStore {
	constructor(
		private readonly knex: KnexInstance,
		private readonly embeddingDimension: number,
	) {}

	async write(
		_documentId: string,
		_chunkId: string,
		_embedding: number[],
	): Promise<void> {
		throw new Error("PgVectorStore.write: not yet implemented (Task 5)");
	}

	async search(
		_queryEmbedding: number[],
		_topK: number,
		_filters?: Record<string, unknown>,
	): Promise<SearchResult[]> {
		throw new Error("PgVectorStore.search: not yet implemented (Task 5)");
	}
}

/**
 * Factory: create a VectorStore from the vectorStore and embedding config blocks.
 */
export function createVectorStore(
	provider: string,
	knex: KnexInstance,
	embeddingDimension: number,
): VectorStore {
	if (provider === "pgvector") {
		return new PgVectorStore(knex, embeddingDimension);
	}
	throw new Error(`Unknown vectorStore provider: ${provider}`);
}
