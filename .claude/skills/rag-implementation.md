# RAG Implementation

This skill guides the design and implementation of Retrieval-Augmented Generation (RAG) for the Query & Retrieval component (C3). It frames the architectural decisions you'll make and the implementation patterns you should consider, leaving the concrete implementation to your learning process.

---

## When to use

Use this skill when implementing C3 (Query & Retrieval) — a Python-based learning component. The skill provides:

- Architectural principles for each RAG stage
- Design decisions and their tradeoffs
- Pseudo-code and conceptual patterns (not complete templates)
- Questions to guide your implementation choices

**Important**: This skill is intentionally *not* a copy-paste template. You'll implement each component yourself, with guidance on what to think through at each step.

**Language choice**: C3 is implemented in Python (aligning with C2) to leverage Python's superior ecosystem for graph-aware RAG extensions in Phase 2+ (libraries like networkx, gremlin-python, py2neo).

---

## Architecture: Phase 1 and Phase 2 Thinking

### Phase 1: Vector-Only Retrieval

In Phase 1, a single LLM call (`QueryUnderstanding`) analyzes the query and returns both routing information and query analysis. Phase 1 uses the query analysis for vector search and ignores the routing decision.

Flow:

```text
User Query
    ↓
LLM: QueryUnderstanding(query)  [Phase 1: returns routing + analysis; we ignore routing]
    ↓
EmbedQuery() using analysis → query embedding
    ↓
VectorStore.search() → top-K similar chunks
    ↓
AssembleContext() → gather chunks up to token limit
    ↓
LLM: ResponseSynthesis() → response + citations
```

### Phase 2: Intelligent Routing (Principles Only)

In Phase 2, the same `QueryUnderstanding` LLM call now drives the retrieval strategy decision. Its output determines the retrieval path:

- **Vector-only path**: For straightforward factual questions, use vector search
- **Graph path**: For relationship/timeline questions, traverse the knowledge graph
- **Hybrid path**: Combine vector context + graph relationships

The RAG pipeline's core structure (query understanding → retrieval → context assembly → response synthesis) remains identical. What changes is *how* we execute retrieval (which context sources QueryUnderstanding recommends). The response synthesis logic is unchanged.

**Efficiency insight**: By structuring Phase 1 around a single `QueryUnderstanding` LLM call, Phase 2 requires no refactoring — it simply uses the routing decision that was already being computed.

---

## Core Components

### 1. Query Understanding (LLM Analysis)

**Purpose**: Analyze the user's query to extract intent, search hints, and (later, in Phase 2) routing information. This single LLM call returns all information needed for retrieval.

**Design Decision**: Why a single LLM call?

- Efficiency: One LLM call is cheaper than two (query understanding + response synthesis)
- Consistency: Query analysis and Phase 2 routing both come from the same LLM, ensuring coherent decisions
- Phase 2 readiness: The routing information is *already computed* in Phase 1; Phase 2 just uses it

**What should QueryUnderstanding return?**

Think through these questions:

- What intent categories make sense for your domain? (e.g., `find_people`, `find_relationships`, `timeline_search`)
- How do you represent extracted entities? (type + value is a start, but what else?)
- Should the LLM refine search terms, or use the query as-is? (Refined terms improve vector search accuracy)
- For Phase 2, what makes a good routing decision? (Confidence score? Reasoning?)

**Implementation considerations**:

- **Validation**: JSON parsing can fail. How do you handle it? (Retry? Return default? Error out?)
- **Pydantic validation** (Python): Define a `QueryUnderstandingResult` class with Pydantic to catch schema violations early
- **Temperature**: Lower temperature (0.5) for consistency; entity extraction benefits from predictability
- **Token budget**: 500 tokens should cover intent + entities + routing reasoning; test and adjust

---

### 2. Query Embedding

**Purpose**: Convert the analyzed query (or refined search terms) into a vector for similarity search.

**Design question**: Should you use the raw query or the refined search terms from QueryUnderstanding?

- Raw query: Simple, direct
- Refined terms: Improves vector search accuracy by removing noise

Consider the tradeoff: Does QueryUnderstanding's refinement help or hurt search quality in your domain?

**Key principle**: Reuse the same `EmbeddingService` interface as C2 (document embedding). This ensures query and document chunks live in the same vector space, making similarity comparisons meaningful.

**Implementation thought**: How do you handle embedding failures? (Network timeout? Invalid input?) What's your error recovery strategy?

---

### 3. Vector Search via VectorStore

**Purpose**: Retrieve the top-K most similar chunks to the query embedding.

**Design question**: How many chunks should you retrieve initially?

- Too few (K=5): Risk missing relevant context
- Too many (K=50): Risk including noise; costs more tokens

Start with K=20 and measure retrieval quality on real queries.

**Phase 1 decision**: No similarity threshold. Return all top-K results regardless of score. This avoids false negatives when tuning vector space alignment. Phase 2 can add thresholds based on query routing.

**Implementation thought**: What happens if VectorStore returns zero results? Is that an error or a valid state?

---

### 4. Context Assembly

**Purpose**: Gather retrieved chunks into a context payload within a token budget.

**Design questions**:

- **Token budget**: How many tokens should context consume? (4000 is a sensible default, leaving room for response in 8K context)
- **Token estimation**: How do you count tokens? (Simple: char count / 4. Better: actual tokenizer)
- **Metadata inclusion**: Should chunk metadata (title, date, source) count toward the token budget?
- **Result selection**: Do you stop at K chunks, or assemble until token budget? (Budget-based is better)

**Phase 1 decision**: No reranking, no deduplication. Include all chunks in similarity order until you hit the token budget.

**Implementation thought**: How do you signal to the response synthesis layer that context was truncated?

---

### 5. Response Synthesis

**Purpose**: Use an LLM to generate a natural language response grounded in retrieved context.

**Design questions**:

- **LLM provider**: Should the response LLM be the same as the query understanding LLM? (Not necessarily. Decoupling allows Phase 2 to optimize separately.)
- **Temperature**: Higher (0.7) for natural language; lower (0.5) for consistency
- **Citations**: Which metadata fields do you cite? (title, date, source, page number?) What if they're missing?

**Citation handling**: Only include fields that are configured AND present in metadata. No placeholder text for missing fields.

**Implementation pattern** (pseudo-code):

```python
function synthesizeResponse(query, context, llmService):
  systemPrompt = "Answer this query using only the provided context. Cite using [Citation N]."
  contextString = format_chunks_with_citation_markers(context.chunks)

  response = llmService.generate(systemPrompt, query, contextString)
  citations = extract_citations_from_response(response)

  return { text: response, citations }
```

**Implementation thought**: How do you extract which chunks were cited? (Regex for `[Citation N]` markers? Then map back to chunks?)

---

### 6. Complete RAG Handler

**Purpose**: Orchestrate all five components into a single query-to-response flow.

**Design question**: What's the dependency order?

1. Query Understanding (extract intent, refine terms)
2. Query Embedding (convert terms to vector)
3. Vector Search (retrieve chunks)
4. Context Assembly (gather within token budget)
5. Response Synthesis (generate answer with citations)

Each step feeds into the next. Failure at any step should be handled gracefully.

**Error recovery**: What happens if step 3 returns zero results? If step 5 fails to extract citations?

---

## Testing Strategy

**Unit tests**: Test individual components in isolation

- `understandQuery()`: Mock LLM, verify JSON schema
- `embedQuery()`: Mock embedding service, verify vector format
- `assembleContext()`: Synthetic search results, verify token budgeting logic
- `extractCitations()`: Regex parsing with edge cases

**Integration tests**: Test the full RAG flow

- Set up test database with fixture documents and embeddings
- Query end-to-end, verify response structure
- Verify citations map correctly to chunks

**See `pipeline-testing-strategy.md` for patterns on fixtures and mocking.**

---

## Configuration & Composition

All five components need configuration (LLM providers, token budgets, citation fields, etc.). Use Infrastructure as Configuration (see `configuration-patterns.md`).

**Key design**: Config should be loaded at startup and validated with Pydantic (Python) or Zod (TypeScript). Fail fast if config is invalid.

---

## Phase 2 Extensions

When QueryRouter becomes intelligent:

1. `QueryUnderstanding` now influences retrieval strategy (not just search refinement)
2. Context assembly may include graph entities + relationships, not just vector chunks
3. Response synthesis remains unchanged

No refactoring needed — the architecture is already ready for this evolution.

---

## Key References

- `embedding-chunking-strategy.md` — EmbeddingService interface and vector storage patterns
- `configuration-patterns.md` — Infrastructure as Configuration for LLM provider selection
- `pipeline-testing-strategy.md` — Testing patterns for RAG components
- ADR-016 (Provider-agnostic interface pattern for all external services)
- ADR-033 (VectorStore interface)
- ADR-040 (QueryRouter, Phase 2)
- ADR-041 (Graph-RAG phases)
