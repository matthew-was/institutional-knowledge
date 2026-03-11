/**
 * VectorStore interface (ADR-033).
 *
 * Phase 1 implementation: PgVectorStore (pgvector extension).
 * The concrete provider is selected at runtime via config (vectorStore.provider).
 *
 * Note on coupling: search() joins chunk metadata (text, chunk_index, token_count)
 * from the chunks table. Chunk rows are written by the handler before VectorStore.write()
 * is called. Any non-PostgreSQL VectorStore implementation must also have access to
 * chunk text data to satisfy this interface.
 */

export interface SearchResult {
  chunkId: string;
  documentId: string;
  text: string;
  chunkIndex: number;
  tokenCount: number;
  similarityScore: number;
}

export interface VectorStore {
  /**
   * Write an embedding for a chunk to the vector store.
   * The chunk row must already exist in the chunks table.
   * @param documentId - the document the chunk belongs to
   * @param chunkId - the chunk the embedding belongs to
   * @param embedding - the embedding vector
   */
  write(
    documentId: string,
    chunkId: string,
    embedding: number[],
  ): Promise<void>;

  /**
   * Search for chunks similar to the given query embedding.
   * @param queryEmbedding - the query vector
   * @param topK - maximum number of results to return
   * @param filters - optional key/value filters (Phase 2)
   */
  search(
    queryEmbedding: number[],
    topK: number,
    filters?: Record<string, unknown>,
  ): Promise<SearchResult[]>;
}
