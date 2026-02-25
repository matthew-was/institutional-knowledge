# Unresolved Questions

Questions that must be answered before or during implementation. Use this document to track open decisions, mark them resolved, and record the decision made.

**Format**: Each entry shows: Question | Blocking? | Who decides | Current status

---

## Questions Blocking All Implementation

These must be resolved before any component coding begins. Work through them with the Head of Development agent (after the Product Owner has produced the user requirements document).

---

### UQ-001: Data Flow & Read/Write Ownership Between Components

**Question**: Which components write to the database? Which are read-only? What are the transaction and consistency requirements at each component boundary?

**Why it blocks**: Integration Lead agent cannot validate data access contracts without this. Senior Developer agents cannot plan implementations without knowing their write scope.

**Who decides**: Head of Development + Integration Lead

**Notes from working-with-claude.md**: "Which components write to database? Which read-only? Both? What are transaction/consistency requirements?"

**Status**: Open

---

### UQ-002: Configuration Abstraction Point Map

**Question**: What is the complete list of every service that needs runtime-swappable abstraction? How does each get swapped (environment variable, config file, factory)?

**Why it blocks**: Every Senior Developer agent needs this before writing any abstraction layer. The `configuration-patterns.md` skill cannot be written without it.

**Who decides**: Head of Development

**Known abstraction points (from project context)**:

- Storage backend (local filesystem ↔ S3)
- Database connections (local PostgreSQL ↔ RDS)
- OCR engines (Docling ↔ Tesseract ↔ fallback)
- LLM providers (Claude ↔ GPT ↔ local model)
- Embedding services (OpenAI ↔ Anthropic ↔ local)
- Vector DB (pgvector settings, future graph DB)
- Compute (Docker local ↔ ECS)

**What still needs defining**: Exact runtime mechanism for each (env var name? config section? factory class?)

**Status**: Open

---

### UQ-003: Formal Metadata Schema

**Question**: What is the canonical list of metadata fields used across all components? Which are required vs optional per document type? How can one component extend metadata without breaking others?

**Why it blocks**: Integration Lead cannot own the schema without a formal definition. Every component has metadata needs that must align.

**Known fields (from Component 2 spec)**:

- Document: id, originalFilename, fileSizeBytes, contentType, uploadedAt, storageLocation, md5Hash, documentDate, documentType, notes
- Processing: extractionMethod, qualityScore, ocrConfidence, processedAt
- Enriched: refinedCategory, extractedDates, detectedEntities, structuralMarkers
- Chunk: chunkId, parentDocumentId, chunkPosition, chunkType, treatmentTags, semanticTopic

**What still needs defining**: Formal schema with field names, types, required/optional rules, enum values, schema evolution strategy

**Status**: Open

---

### UQ-004: Testing Strategy Per Component Type

**Question**: Pipeline components (text extraction) test differently than query components (similarity search). What are the reusable patterns for each?

**Why it blocks**: Must exist before any code is written. Determines test DB setup, fixture strategy, what gets mocked vs real.

**Known answers (from Component 1 spec)**:

- Framework: Vitest (TypeScript), pytest (Python)
- Scope: Integration tests within package boundaries (not E2E)
- Test database: Separate real PostgreSQL instance (`estate_archive_test`)
- Fixtures: Small sample files (~50KB each), real format
- NOT included: Browser E2E, cross-package boundary tests, performance tests

**What still needs defining**: Python pipeline component testing patterns, fixture document strategy for OCR testing, how to test embedding generation in isolation

**Status**: Partially answered for Component 1; open for Components 2–4

---

### UQ-005: PostgreSQL Integration Points for All Components

**Question**: For each component, what are the read vs write semantics, transaction boundaries, and consistency guarantees when accessing PostgreSQL?

**Why it blocks**: Integration Lead needs this to manage schema evolution and prevent coupling.

**What still needs defining**: Component-by-component breakdown of DB access (e.g., Component 1 writes intake records; Component 2 writes processing records and updates existing; Component 2 embedding stage writes vectors; Component 3 reads vectors for search)

**Status**: Open

---

### UQ-006: Python Component Placement and Configuration Reach in the Monorepo

**Question**: Component 2 uses Python. The monorepo is structured around pnpm workspaces (TypeScript/Node.js). How does Python code live alongside TypeScript code, and critically — how does the shared configuration system reach the Python service?

**Why it blocks**: The `configuration-patterns.md` skill cannot be complete if it only covers TypeScript patterns. The Integration Lead cannot define cross-language contracts without knowing the boundary. The Head of Development cannot answer UQ-002 (configuration abstraction map) without this resolved.

**Who decides**: Head of Development

**Options**:

1. Python is a separate Docker service under `services/processing/` — managed independently (own virtualenv, own test runner, own CI steps). Config passed at container startup via environment variables.
2. Python lives entirely outside the monorepo (separate repo, separate deployment artifact). Stronger isolation but breaks co-located documentation and shared Docker Compose.
3. Minimise Python surface area — wrap Python tools via CLI calls from Node.js orchestration, keeping the monorepo TypeScript-first. Python becomes a thin tool layer, not a service.

**Configuration question** (must answer regardless of option chosen): Does the Python service read from the same config files as the TypeScript services? Or does it receive config via environment variables only? This determines whether `configuration-patterns.md` needs a Python config section or just TypeScript.

**Source**: Conversations 5/6 — "TypeScript/Node.js for orchestration. Python for OCR and AI/ML components" with explicit note: "Action required: Decide Python's role relative to monorepo structure"

**Status**: Open — resolve with Head of Development before writing `configuration-patterns.md` skill

---

## Questions Blocking Specific Components

These block a specific component's implementation but don't prevent other components from starting.

---

### UQ-C2-001: Semantic Chunking Heuristics (Blocks Component 2 Phase 1)

**Question**: What exact rules define a paragraph boundary for each document type? How do you respect sentence boundaries within a chunk? What's the fallback if heuristics produce incoherent chunks?

**Agreed decisions**:

- Phase 1 uses heuristics (not ML-based)
- Target chunk size: 500–1000 tokens
- Preserve sentence boundaries
- ML-based upgrade in Phase 2

**What still needs defining**: Exact rules for each document type category (deeds have different paragraph structures than letters; operational logs may use numbered items; invoices use line items)

**Who decides**: Development team during Phase 1 implementation, informed by real document inspection

**Status**: Open — decide during Phase 1

---

### UQ-C2-002: Category Detection Patterns (Blocks Component 2 Phase 1)

**Question**: What patterns reliably distinguish each document type? What confidence threshold triggers a suggestion vs certainty? What's the fallback when patterns don't match clearly?

**Agreed decisions**:

- Phase 1 uses pattern-based heuristics (not LLM)
- Categories: letter, deed, map, plan, invoice, operational log, email, survey

**What still needs defining**: Pattern list per category (emails have from/to headers; invoices have currency symbols; deeds have legal phrases; letters have salutation/date patterns)

**Who decides**: Development team, informed by first real documents processed

**Status**: Open — decide during Phase 1

---

## Questions That Can Defer to Phase 2

These are not blocking but should be documented for planning Phase 2.

---

### UQ-POST-001: Deduplication Boundary Between Components

**Question**: Component 1 handles exact-match deduplication (MD5 hash). Embedding similarity deduplication (Phase 3+) — does it belong in Component 2 or the query layer?

**Current state**: Component 1 owns hash-based dedup at upload. Embedding similarity deferred to Phase 3+. No decision made yet on which component owns it.

**Status**: Deferred to Phase 3 planning

---

### UQ-POST-002: Error Handling & Retry Contract Generalisation

**Question**: Component 1 has a defined error handling contract (aggressive cleanup, no automatic retries, fail-fast). How should this generalise to Component 2 (graceful degradation, proceed with flags)?

**Current state**: Partially answered per component; needs a consistent cross-component error contract.

**Status**: Resolve during Component 2 implementation

---

### UQ-POST-003: Domain Context Flagging Threshold

**Question**: How many occurrences of an unknown term/entity should trigger a review flag for the developer? (Estimate: 3–5, exact number TBD by experience)

**Current state**: Phase 1 collects candidates without flagging. Phase 2 adds automated flagging with a configurable threshold.

**Who decides**: Developer during Phase 1 based on feedback volume

**Status**: Deferred to Phase 2

---

### UQ-POST-004: Batch vs. Streaming for Component 2

**Question**: Should Component 2 process documents in batches (scheduled runs) or as they arrive (streaming/event-driven)?

**Current state**: Phase 1 is manual trigger. Phase 2+ will add automation. This is an architectural choice for the continuous ingestion component (Component 4).

**Status**: Deferred to Component 4 design

---

### UQ-POST-005: Query Latency Requirements (Component 3)

**Question**: What is acceptable query response time for the retrieval interface?

**Current state**: Not established. Phase 1 is CLI-only, latency less critical. Becomes important for Phase 2 web UI.

**Status**: Establish baseline during Phase 1, optimise in Phase 4

---

### UQ-POST-007: Security Boundary for Component 2 Outputs

**Question**: Component 2 is Python-based backend processing that sits behind the Express API. How are C2's outputs (extracted text, embeddings, chunks) secured as they move through the pipeline? Does C2 call the Express API directly, or does orchestration call C2?

**Current state**: The three-layer security model (Browser → Next.js → Express) is established for user-facing requests. C2 is internal processing — but the data flow and auth mechanism between Express/orchestration and the Python processing service is not defined.

**Options**:

1. Express orchestrates C2 via internal function call (same process/container, no network hop)
2. Express calls C2 via internal HTTP (separate container, API key auth on internal network)
3. Message queue between Express and C2 (async, decoupled)

**Source**: Conversations 5/6 — "Action required: Clarify how Component 2's outputs are secured as they move through pipeline"

**Status**: Deferred — decide before Component 2 implementation begins

---

## Resolved Questions

Move resolved questions here with the decision recorded.

---

### ✅ RQ-001: Component Numbering (5 components vs 4)

**Decision made**: Merge original Components 2 (text extraction) and 3 (embedding/storage) into a single Component 2. Renumber: old C4 → C3 (Query & Retrieval), old C5 → C4 (Continuous Ingestion).

**Rationale**: The combined C2+C3 overview document already treats them as a unified pipeline unit. Text extraction and embedding are tightly coupled and designed together. Merging simplifies the architecture without losing any capability.

**Date**: Documentation reorganization phase, before implementation began.

---

### ✅ RQ-002: Deduplication at Intake (Component 1)

**Decision made**: Component 1 owns exact-match deduplication via MD5 hash with database unique constraint. Returns 409 Conflict on duplicate.

**Source**: Component 1 specification.

---

### ✅ RQ-003: Human vs Autonomous Domain Context

**Decision made**: Developer maintains authoritative domain context. Component 2 flags candidates for review. System does not autonomously add terms.

**Rationale**: Prevents system from confidently making wrong assumptions about estate-specific terminology.

**Source**: Component 2 design rationale.
