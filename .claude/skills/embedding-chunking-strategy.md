# Embedding and Chunking Strategy

## Overview

Steps 5–6 of the C2 pipeline — **Semantic Chunking (part of LLM Combined Pass)** and **Embedding Generation** — form the final phase that prepares documents for retrieval. Chunking and entity extraction happen together in step 5 (via a single LLM call); embedding generation happens in step 6. Results are stored in Express backend's PostgreSQL with pgvector.

This skill explains the design rationale and implementation patterns for semantic chunking, embedding generation, and vector storage. It is written for developers learning document processing patterns and vector database integration.

---

## The 6-Step C2 Pipeline

```text
1. Text extraction (OCR)
2. Quality scoring
3. Metadata extraction (pattern-based)
4. Completeness scoring
5. LLM combined pass (chunking + entity extraction)  ← This skill (chunking section)
6. Embedding generation                             ← This skill (embedding section)
```

Documents only reach the LLM combined pass (step 5) if they pass steps 1–4. Steps 1 and 2 are detailed in the [ocr-extraction-workflow.md](ocr-extraction-workflow.md) skill.

---

## Step 5: Semantic Chunking via LLM Combined Pass

### The Goal

Divide a document into **semantically meaningful chunks** where each chunk is a coherent unit suitable for embedding and retrieval. Unlike fixed-size splitting (which breaks mid-sentence or mid-paragraph), semantic chunking respects document structure and meaning.

Chunking is **part of step 5** (the LLM combined pass), not a separate pipeline step. The same LLM call that extracts entities also determines chunk boundaries.

**Core requirement** (UR-064): "Chunk boundaries must be determined by an AI agent that reads the document content and identifies semantically meaningful units, rather than by fixed-size splitting."

### Semantic Chunking Heuristics

Chunking is performed by the same LLM call that extracts entities and relationships (the "combined pass"). The LLM reads the full document text and returns:

- A list of **chunk boundaries** — where each new chunk starts
- The **text of each chunk**
- **Entities extracted from each chunk** (see [metadata-schema.md](metadata-schema.md) for entity types)
- **Relationships between extracted entities** (local within the chunk)

**Heuristics for boundary placement** (Phase 1):

For estate archive documents (deeds, letters, operational logs), chunks align to:

1. **Logical units in the document**:
   - A paragraph or group of related paragraphs
   - A single date and its associated entries (in logs/journals)
   - A signature block or witness section
   - A distinct section with a heading

2. **Content type signals**:

   - **Deed documents**: One chunk per distinct transfer of title, one chunk per signature block
   - **Operational logs**: One chunk per date or dated event group
   - **Letters**: One chunk per letter (often a single coherent unit)
   - **Mixed documents**: One chunk per logical section

3. **Minimum chunk size** (Phase 1): 100 tokens minimum. Chunks smaller than this are merged with adjacent chunks.

4. **Maximum chunk size** (Phase 1): 1000 tokens maximum. Chunks larger than this are split on paragraph boundaries first; if a single paragraph exceeds the limit, fall back to splitting on sentence boundaries.

### LLM Prompt Pattern

The LLM receives a prompt like:

```text
You are analyzing a document for an estate archive. Read the full document and:

1. Identify semantically meaningful chunk boundaries
2. For each chunk, extract the following entities:
   - People (names of individuals)
   - Organisations (companies, solicitors, councils)
   - Land Parcels/Fields (named fields or properties)
   - Dates/Events (significant dated events)
   - Legal References (deed numbers, registration references)

3. For each extracted entity, identify relationships:
   - If person A transferred land X to person B, add a "transferred_to" relationship
   - If person A witnessed a document, add a "witnessed_by" relationship
   - If an organisation provided a service, add an "employed_by" or "performed_by" relationship

Output format (JSON):
{
  "chunks": [
    {
      "text": "The full text of this chunk",
      "chunk_index": 0,
      "token_count": 250,
      "entities": [
        {"name": "John Smith", "type": "People", "confidence": 0.95, "normalised_name": "john smith"}
      ],
      "relationships": [
        {"source": "John Smith", "target": "East Meadow", "type": "owned_by", "confidence": 0.88}
      ]
    }
  ]
}
```

**Implementation note**: This is the same LLM call used in step 5 (ADR-038, ADR-036). The prompt includes both chunking and entity extraction, and the response includes both outputs.

### Phase 2 Semantic Refinement

In Phase 2, chunking heuristics can be refined based on:

- Actual retrieval performance (chunks that retrieve poorly can be recombined or split)
- Domain-specific patterns identified during curation (e.g. "all signature blocks should be in one chunk")
- Cumulative feedback from document curation sessions

Chunking decisions are not baked in; they can be revisited during the "regenerate graph" step in Phase 2 (ADR-039).

---

## Step 6: Embedding Generation

### The Goal

For each chunk returned by step 5 (LLM combined pass), generate a dense vector embedding using a configured embedding model. The embedding enables semantic similarity search — documents with related meaning will have similar embeddings, regardless of exact word overlap.

**Core requirement** (UR-063): "The system must generate embeddings for each document chunk."

### The EmbeddingService Interface

Embedding engines (OpenAI, Ollama, local models via Hugging Face, etc.) are accessed through a Python abstract base class (`EmbeddingService`). This abstraction means:

- The pipeline code never mentions a specific embedding provider directly
- Swapping embedding providers requires only a configuration change (`embedding.provider: "openai"` or `"ollama"`)
- Testing uses mock implementations; production uses the real service

For the complete interface definition, concrete adapters, and factory function, see [configuration-patterns.md](configuration-patterns.md) — this skill assumes you have read it.

**Key interface method**:

```python
async def embed(self, text: str) -> EmbeddingResult:
    """
    Generate an embedding for a text chunk.

    Returns EmbeddingResult with:
      - embedding: list of floats (vector)
      - dimension: length of the vector (e.g. 1536 for OpenAI)
      - model: which model was used (e.g. "text-embedding-3-small")
      - tokens_used: number of tokens consumed (for cost tracking)
    """
```

### Phase 1 Embedding Provider

**Phase 1 selection** (ADR-024): Local embedding service (e.g., Ollama) running open-source embedding model. Rationale:

- Free, runs locally, no API costs or network dependencies during development
- Sufficiently good retrieval quality for Phase 1 validation
- Easy to swap for commercial providers at Phase 2 if retrieval quality needs improvement
- Configuration change only — no code changes

**Scaling consideration**: If production retrieval quality requires higher-quality embeddings, Phase 2 can swap to commercial embedding APIs or higher-capacity local models via configuration. Model selection depends on hardware available and retrieval performance requirements.

### Embedding Generation Workflow

For each chunk returned by the LLM combined pass:

1. **Get chunk text** from the LLM response
2. **Call EmbeddingService.embed(chunk_text)** with configured provider
3. **Receive embedding vector** (dimension determined by configured embedding model)
4. **Store in PostgreSQL pgvector column** via the VectorStore interface (see below)
5. **Record metadata** — chunk_index, document_id, parent document reference, token count

**Chunk Reference Pattern** (ADR-013):

Every chunk stores a reference to its parent document:

```python
chunk = {
    "id": "chunk_<uuid>",
    "document_id": "<parent_document_uuid>",
    "chunk_index": 0,  # 0-indexed position within document
    "text": "The full text of this chunk",
    "embedding": [0.1234, -0.5678, ...],  # Float array, dimension per embedding model
    "token_count": 250,
    "created_at": "2026-02-27T10:46:04Z",
    "step_status": "embedding_generated"
}
```

This enables queries like "find all chunks from document X" and "what document does this chunk belong to?"

---

## Embedding Storage via VectorStore Interface

After generating embeddings in step 6, chunks and embeddings are stored in the database via the VectorStore interface.

### The Goal

Store the embedding vector and metadata in the database such that:

1. **Similarity search is efficient** — the system can quickly find chunks with similar embeddings
2. **The backing store is swappable** — Phase 1 uses pgvector (PostgreSQL); Phase 2+ can use OpenSearch, Pinecone, or other vector databases
3. **No direct SQL queries** — all storage access goes through the VectorStore interface

### The VectorStore Interface in Express

All vector store operations (write embeddings, similarity search) are accessed through the `VectorStore` interface defined in the Express backend (ADR-033). The pgvector implementation is the Phase 1 concrete implementation.

**Interface contract**:

```typescript
interface VectorStore {
  // Write a single chunk embedding
  write(
    documentId: string,
    chunkId: string,
    embedding: number[],
    metadata: ChunkMetadata
  ): Promise<void>;

  // Search for similar embeddings
  search(
    queryEmbedding: number[],
    topK: number,
    filters?: { documentId?: string }
  ): Promise<SearchResult[]>;
}

interface ChunkMetadata {
  chunk_index: number;
  text: string;
  token_count: number;
  created_at: string;
}

interface SearchResult {
  chunkId: string;
  documentId: string;
  text: string;
  similarity_score: number;
  chunk_metadata: ChunkMetadata;
}
```

### pgvector Schema (Phase 1)

```sql
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding pgvector NOT NULL,  -- Dimension matches configured embedding model
  token_count INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX chunks_embedding_idx ON chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);  -- Approximate nearest neighbor search
```

The index is tuned for cosine similarity search — standard for semantic embeddings.

### Data Flow: Python → Express → PostgreSQL

1. **Python processing service**:
   - LLM combined pass produces chunks with entities and relationships
   - EmbeddingService generates embeddings for each chunk
   - HTTP POST to Express endpoint `/documents/:documentId/chunks/batch` with:

     ```json
     {
       "chunks": [
         {
           "chunk_index": 0,
           "text": "...",
           "embedding": [...],
           "token_count": 250,
           "entities": [...],
           "relationships": [...]
         }
       ]
     }
     ```

2. **Express backend**:
   - Validates request (documentId exists, chunk structure is correct)
   - Writes chunks to VectorStore: `vectorStore.write(documentId, chunkId, embedding, metadata)`
   - Also writes extracted entities to vocabulary_terms and relationships to vocabulary_relationships (see [metadata-schema.md](metadata-schema.md))
   - Marks document as `embedding_generated` in step_status
   - Returns 200 OK on success

3. **PostgreSQL**:
   - pgvector stores embedding and metadata
   - On query (Component 3), C3 calls `vectorStore.search(queryEmbedding, topK)` to retrieve similar chunks
   - Index on embedding enables fast cosine similarity search

### Transactions and Atomicity (UR-065, UR-066)

**Critical requirement**: A document must not appear in the search index until all chunks are successfully embedded.

Implementation:

1. In PostgreSQL, add a document-level `embedding_status` field (part of the documents table):
   - `pending` — document not yet embedded
   - `embedding_in_progress` — embedding is being written
   - `embedding_complete` — all chunks written, document visible in search

2. In the Express route handler:
   - Start a transaction
   - Set `embedding_status = 'embedding_in_progress'`
   - Insert all chunks
   - Insert all entities and relationships
   - Set `embedding_status = 'embedding_complete'`
   - Commit transaction

3. In Component 3 (query phase), search queries filter on `embedding_status = 'embedding_complete'` — this ensures partial documents are never returned.

4. **For mixed documents** (UR-066): If any chunk fails to embed, roll back the transaction. The entire document remains in `pending` state and is flagged for manual review.

---

## Testing Chunking and Embedding

### Unit Tests

**Focus**: Pure functions — normalisation, boundary heuristics, embedding dimension checks.

```python
# Test: Chunk merging respects minimum size
def test_merge_small_chunks():
    chunks = [
        {"text": "Short.", "token_count": 50},
        {"text": "Also short.", "token_count": 60},
        {"text": "Long chunk with substantial content.", "token_count": 200},
    ]
    merged = merge_below_min_size(chunks, min_tokens=100)
    assert len(merged) == 2
    assert merged[0]["token_count"] == 110  # First two merged
    assert merged[1]["token_count"] == 200

# Test: Chunk splitting respects maximum size
def test_split_large_chunks():
    chunk = {
        "text": " ".join(["word"] * 2000),  # ~2000 tokens
        "token_count": 2000,
    }
    split = split_above_max_size([chunk], max_tokens=1000)
    assert len(split) >= 2
    assert all(c["token_count"] <= 1000 for c in split)
```

### Integration Tests

**Focus**: Real LLM, real embeddings, real database. Test the full pipeline on fixture documents.

```python
# Test: Full chunking → embedding → storage flow
@pytest.mark.integration
async def test_chunk_and_embed_document():
    # Fixture: a single-page estate deed (PDF)
    doc_path = "tests/fixtures/deed-1974.pdf"
    document_id = "test_doc_001"

    # Step 1-2: Extract and score quality (reuse from ocr-extraction-workflow tests)
    extraction = await ocr_service.extract_text(doc_path)
    quality = quality_scorer.score(extraction)
    assert quality.score > 0.7  # Passes quality threshold

    # Step 3-5: Semantic chunking + entity extraction (LLM combined pass)
    chunking_result = await llm_service.chunk_and_extract(
        text=extraction.text,
        document_type="deed",
    )
    assert len(chunking_result.chunks) > 0
    assert all(100 <= c["token_count"] <= 1000 for c in chunking_result.chunks)

    # Step 6: Embedding generation
    for chunk in chunking_result.chunks:
        embedding_result = await embedding_service.embed(chunk["text"])
        assert len(embedding_result.embedding) == 1536  # nomic-embed-text dimension

        # Step 7: Store in VectorStore (via HTTP to Express)
        await vector_store_client.write(
            document_id=document_id,
            chunk_id=f"chunk_{chunk['chunk_index']}",
            embedding=embedding_result.embedding,
            metadata={
                "chunk_index": chunk["chunk_index"],
                "text": chunk["text"],
                "token_count": chunk["token_count"],
                "created_at": datetime.now().isoformat(),
            }
        )

    # Verify: Document is now searchable
    query_embedding = await embedding_service.embed("estate transfer")
    results = await vector_store_client.search(query_embedding, topK=5)
    assert any(r["documentId"] == document_id for r in results)
```

### Fixture Documents

For integration tests, maintain a small library of fixture documents:

- `deed-1974.pdf` — A complete deed of transfer (multi-page, complex)
- `operational-log-1960s.pdf` — Estate operational log with multiple dated entries
- `letter-1980.pdf` — Solicitor's letter with signature block
- `mixed-document.pdf` — Deed + attached letter + witness list (tests multi-type chunking)

Each fixture is a real document from the archive (sanitised of sensitive personal information if needed).

---

## Configuration and Runtime Provider Selection

### Embedding Provider Configuration

Config key: `embedding.provider` (see [configuration-patterns.md](configuration-patterns.md) for the full config structure).

**Phase 1 example** (local embedding service):

```yaml
embedding:
  provider: "local"  # or "ollama", "huggingface", etc.
  model: "<model-name>"  # Model to use with selected provider
  base_url: "http://localhost:8000"  # Local service endpoint (if applicable)
  dimension: null  # Auto-detect from model, or specify explicitly
```

**Phase 2 example** (if retrieval quality needs improvement, swap provider):

```yaml
embedding:
  provider: "api"  # or "openai", "cohere", etc.
  model: "<model-name>"  # Provider-specific model identifier
  api_key: "${EMBEDDING_API_KEY}"  # Via environment variable
  dimension: null  # Auto-detect from API response
```

The factory function in Express and Python automatically selects the correct EmbeddingService implementation based on the `provider` key. No code changes required.

---

## Key Tradeoffs and Rationale

### Why LLM-Based Chunking Over Heuristics?

- **Heuristic chunking** (e.g. "split on blank lines") is fragile across document types
- **LLM-based chunking** reads content and understands what belongs together
- **Tradeoff**: Slightly slower (one LLM call per document), but produces semantically coherent chunks that improve retrieval quality
- **Mitigated by**: LLM call batching in Phase 2; cost is amortised across batch operations

### Why pgvector in Phase 1?

- **Advantage**: Runs in existing PostgreSQL; no additional infrastructure
- **Disadvantage**: Approximate nearest neighbor search is less mature than dedicated vector DBs (OpenSearch, Pinecone)
- **Accepted risk**: Phase 1 is evaluation; retrieval quality is validated against real documents; Phase 2 can migrate to specialised vector DB if needed
- **Swappable**: VectorStore interface makes migration straightforward

### Why Vector Search First, Graph Query in Phase 2?

- **Vector search** is established technology; LLM embeddings are production-ready
- **Graph queries** (traversing entity relationships) are more complex; require entity extraction to be reliable first
- **Phase 1 scope**: Validate that chunking and embedding work well on real documents
- **Phase 2 scope**: Add graph traversal for structured entity queries (e.g. "show me all land parcels adjacent to East Meadow")

---

## Cross-References

- [ocr-extraction-workflow.md](ocr-extraction-workflow.md) — Steps 1–2 (text extraction, quality scoring)
- [metadata-schema.md](metadata-schema.md) — Entity and relationship types, vocabulary curation
- [configuration-patterns.md](configuration-patterns.md) — EmbeddingService and VectorStore factory patterns
- [pipeline-testing-strategy.md](pipeline-testing-strategy.md) — Testing the full pipeline end-to-end
- ADR-011 (text extraction choice), ADR-013 (chunk parent references), ADR-024 (embedding provider), ADR-033 (VectorStore interface), ADR-036 (LLM combined pass)
- UR-063 (embeddings required), UR-064 (semantic chunking), UR-065 (atomic embedding), UR-066 (mixed documents held pending)
