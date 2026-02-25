# Architecture Decisions

All significant architectural and design decisions made during the design phase. Before proposing a change to how the system works, check here first. If a decision appears here, understand the rationale before revisiting it.

**Format**: Decision | Context | Rationale | Risk Accepted | Tradeoffs

---

## Cross-Cutting Decisions

---

### ADR-001: Infrastructure as Configuration

**Decision**: Every external service (storage, database, OCR engine, LLM provider, embedding service, vector DB, compute) must be accessed through an abstraction interface, not hardcoded. The concrete implementation is selected at runtime via configuration.

**Context**: The project will run locally (Docker Compose) during development and on AWS in production. Without abstraction, every environment change requires code changes.

**Rationale**: Enables local→AWS migration with zero code changes. Enables swapping OCR engines, LLM providers, and embedding services as better options emerge. Prevents vendor lock-in during the learning phase.

**Implementation**: TypeScript interfaces + factory/DI patterns (backend); Python abstract base classes + factory functions (processing). Configuration hierarchy: CLI args → env vars → Docker runtime config → local runtime → package defaults.

**Risk accepted**: Slightly more upfront code per service. Mitigated by reusable pattern (`configuration-patterns.md` skill).

**Source**: project/development-principles.md, project/overview.md

---

### ADR-002: Monorepo with pnpm Workspaces

**Decision**: Project uses a single repository with pnpm workspaces: `/apps/frontend`, `/apps/backend`, `/packages/shared`.

**Context**: Frontend (Next.js) and backend (Express) share Zod schemas and TypeScript types.

**Rationale**: Simplifies shared type management; single install; coordinated CI.

**Risk accepted**: Slightly more complex setup than separate repos. Mitigated by setup.sh.

**Source**: Component 1 specification.

---

### ADR-003: Three-Layer Security Architecture (Browser → Next.js → Express)

**Decision**: Express backend is never directly internet-accessible. All external requests flow through Next.js as a validation layer. Next.js validates input before forwarding to Express.

**Context**: Document pipeline accepts uploads from users. Files must be validated before reaching the processing backend.

**Rationale**: Defence in depth. If Express has a vulnerability, the Next.js layer provides a buffer. Validates file type, size, and content at the boundary.

**Risk accepted**: Two-hop latency. Acceptable for document upload workflow (not real-time).

**Source**: Component 1 specification.

---

### ADR-004: PostgreSQL + pgvector (not a dedicated vector database)

**Decision**: Use a single PostgreSQL 16 instance with the pgvector extension for both relational metadata and vector embeddings.

**Context**: The project needs relational storage (documents, chunks, processing records) and vector storage (embeddings for similarity search).

**Rationale**: Developer has extensive PostgreSQL experience. Avoids polyglot persistence complexity. pgvector is production-proven for moderate document volumes (target: tens of thousands). Unified database simplifies backup, migration, and querying.

**Risk accepted**: May hit pgvector performance limits at very high scale. Acceptable for Phase 1–3; can migrate to dedicated vector DB in Phase 4 if needed (abstraction layer makes this possible).

**Source**: project/architecture.md, Component 2 specification.

---

### ADR-005: 4-Component Pipeline (Merged C2+C3)

**Decision**: System uses 4 pipeline components, not 5. Original Components 2 (text extraction) and 3 (embedding/storage) are merged into a single Component 2 with two internal stages.

**New numbering**:

- Component 1: Document Intake
- Component 2: Text Extraction, Processing & Embedding (two internal stages)
- Component 3: Query & Retrieval
- Component 4: Continuous Ingestion

**Rationale**: Text extraction and embedding are tightly coupled — Component 2's output contract (chunks with metadata) is designed specifically for embedding. The combined C2+C3 overview document reflects this as a unified pipeline unit. Merging simplifies the architecture and makes the pipeline easier to reason about. No capability is lost.

**Date**: Documentation reorganization phase, before implementation began.

---

### ADR-006: Human-in-the-Loop Development with Claude Agents

**Decision**: Use a 7-agent Claude workflow with the developer as the final decision-maker. Agents analyse, synthesise, and propose; developer decides.

**Agents**: Product Owner, Head of Development, Integration Lead, Senior Developer (per component), Implementer (Component 1 only), Code Reviewer, Project Manager.

**Rationale**: Project will be paused and resumed many times. Clear agent roles with documented responsibilities ensure context can be re-established. Human decision-making prevents agents from making confident wrong assumptions on novel domain problems.

**Source**: process/agent-workflow.md

---

## Component 1: Document Intake

---

### ADR-C1-001: Three-Step Upload Flow (Initiate → Upload → Finalize)

**Decision**: Document upload uses three separate API calls rather than a single multipart upload.

**Step 1 (Initiate)**: Create database record with metadata, get upload ID.
**Step 2 (Upload)**: Binary file upload to backend via Multer.
**Step 3 (Finalize)**: Hash validation, user metadata, status update.

**Rationale**: Enables resume on partial failure. Explicit MD5 hash check at finalize step. Separates metadata creation from file storage. Three-layer security: Next.js validates each step independently.

**Risk accepted**: More complex client-side logic. Mitigated by clear API contract and tRPC types.

**Source**: Component 1 specification.

---

### ADR-C1-002: Local Filesystem Storage for Phase 1

**Decision**: Phase 1 stores files at `/storage/uploads/YYYY/MM/uuid.ext` on the local filesystem. Storage URI format: `local:/uploads/2024/01/abc-123.pdf`.

**Rationale**: Simpler than S3 for Phase 1. `StorageService` interface ensures S3 migration in Phase 2 requires zero application code changes (only configuration).

**Source**: Component 1 specification.

---

### ADR-C1-003: MD5 Hash via Database Unique Constraint for Deduplication

**Decision**: Exact duplicate detection uses MD5 hash stored with a database unique constraint. Attempting to insert a duplicate returns 409 Conflict.

**Context**: Phase 1 needs deduplication but doesn't need near-duplicate detection.

**Rationale**: Simple, reliable, database-enforced. No extra processing required.

**Limitation**: Cannot detect near-duplicates (e.g., same document scanned twice at different DPI). Embedding similarity deduplication deferred to Phase 3+.

**Source**: Component 1 specification.

---

### ADR-C1-004: API Key Authentication (Not OAuth)

**Decision**: Phase 1 uses simple API key authentication (UUID v4 or hex strings). Keys stored in runtime config. Multiple clients supported (frontend, MCP, future services).

**Rationale**: Sufficient for internal network use in Phase 1. Token-based auth (Phase 2+) adds complexity not warranted before multi-user requirements emerge.

**Source**: Component 1 specification.

---

### ADR-C1-005: Aggressive Immediate Cleanup on Failure

**Decision**: On any error during upload, immediately delete all partial state (temp files, database records, stored files). No partial state persists.

**Rationale**: Prevents orphaned records and storage waste. Simplifies retry logic (just retry from scratch). Fail-fast approach for Phase 1.

**Risk accepted**: Upload must restart completely on failure. Acceptable for document sizes ≤50MB with reliable upload context.

**Source**: Component 1 specification.

---

## Component 2: Text Extraction, Processing & Embedding

---

### ADR-C2-001: Docling as Primary OCR Engine (Tesseract as Fallback)

**Decision**: Use Docling for OCR and PDF extraction (structure-preserving). Tesseract as fallback for Phase 1 where Docling is unavailable.

**Context**: Estate documents are mostly typewritten — OCR should work well. Document structure (headings, paragraphs, signatures) matters for semantic chunking.

**Rationale**: Docling better preserves document structure than Tesseract alone. Structure is important for deeds, letters, and operational logs where paragraph boundaries guide chunking. Tradeoff: slower than Tesseract, but acceptable for learning phase with moderate document volumes.

**Source**: high-level-project-document-component-2-update.md (combined C2+C3 overview).

---

### ADR-C2-002: All Documents Process Regardless of Quality Score (Phase 1)

**Decision**: Phase 1 processes all documents through the full pipeline regardless of OCR quality. Quality scores (0–100) are recorded but do not gate progression.

**Rationale**: Learning phase needs data volume. False negatives (blocking good documents with low scores) are worse than false positives (processing poor documents). Quality scores enable future filtering.

**Phase 3+ change**: Quality gates and manual review queues will be added.

**Source**: Component 2 specification, design rationale.

---

### ADR-C2-003: Human-Maintained Domain Context; System Flags Candidates

**Decision**: Developer maintains the authoritative domain context document (`project/domain-context.md`). Component 2 detects unknown entities and terms, tracks their frequency, and flags candidates for developer review. Component 2 does not autonomously add terms.

**Rationale**: Estate-specific terminology (field names, family names, infrastructure terms, legal references) is highly domain-specific. Autonomous classification risks confident wrong assumptions. Human-in-the-loop learning ensures accuracy.

**Source**: Component 2 specification, design rationale.

---

### ADR-C2-004: Maps and Plans as Single Visual Chunk + Separate Metadata Chunks

**Decision**: Maps and plans are stored as a single chunk to preserve visual coherence for image-based embedding. A separate metadata chunk is created from extracted text (title, date, scale, labels, legend text) to make the map discoverable via text search.

**Rationale**: Fragmenting a map into text chunks loses spatial meaning. The parent document retrieval pattern ensures the full map is available when context is needed. Metadata chunks make maps surface in text searches.

**Source**: Component 2 design rationale.

---

### ADR-C2-005: Heuristic Semantic Chunking for Phase 1 (Not ML-Based)

**Decision**: Phase 1 uses rule-based heuristics for semantic chunking (paragraph breaks, section markers, sentence boundaries). Target: 500–1000 tokens per chunk. ML-based chunking (topic similarity) deferred to Phase 2.

**Rationale**: Heuristics are observable and adjustable. Real-world testing on actual documents will reveal where they fail. Phase 2 ML upgrade can be informed by Phase 1 learnings.

**Open question**: Exact heuristics per document type defined during Phase 1 implementation (see UQ-C2-001).

**Source**: Component 2 specification, readiness checklist.

---

### ADR-C2-006: Pattern-Based Category Detection for Phase 1 (Not LLM)

**Decision**: Phase 1 detects document category (letter, deed, map, invoice, etc.) via rule-based pattern matching. LLM-assisted classification deferred to Phase 2.

**Rationale**: No LLM dependency in Phase 1 pipeline. Rules are fast, deterministic, and explainable. Real-world failure modes will inform Phase 2 LLM prompting.

**Open question**: Exact patterns per category defined during Phase 1 implementation (see UQ-C2-002).

**Source**: Component 2 specification, readiness checklist.

---

### ADR-C2-007: Parent Document References for All Chunks

**Decision**: Every chunk stores a reference to its parent document (original file), including chunk position and boundary information (character offsets or page numbers).

**Rationale**: Enables full-document context retrieval during RAG. When a relevant chunk is found, the system can retrieve the full document for broader context. Solves the coherence problem for maps and long documents. Pattern is proven in production RAG systems.

**Source**: Component 2 specification.

---

### ADR-C2-008: Email Chain Chunking Per-Message, Not Per-Thread

**Decision**: Email chains are chunked at the individual message level (semantic chunking within each message). Thread context is preserved via parent document reference. (Phase 3 feature.)

**Rationale**: Per-thread chunking leads to huge chunk size variability (threads can be 2 or 200 messages). Per-message chunking keeps sizes consistent and focused. Thread context still accessible via parent reference.

**Source**: Component 2 design rationale.

---

### ADR-C2-009: Domain Context Storage as JSON File in Phase 1

**Decision**: Phase 1 stores domain context candidate tracking in a JSON file (not a database table).

**Rationale**: Simple to implement and inspect. No schema migration needed. Phase 2 can migrate to a database table when automated flagging is added.

**Source**: Component 2 specification.

---

### ADR-C2-010: Flag Low-Text Diagrams for Human Supplementary Context

**Decision**: When a diagram or map is processed and insufficient text is extracted to make it discoverable (no title, labels, or surrounding context), the system flags it for human review. The human provides a short descriptive note that is stored as a metadata field.

**Rationale**: Vector search relies on text context to surface diagrams. A diagram without extractable text will never be retrieved. Flagging and prompting for human input is consistent with the "system flags, human decides" principle and prevents silently lost documents.

**Risk accepted**: Requires UI/UX to surface the flag and accept the note. Exact threshold for "insufficient text" is implementation-defined.

**Source**: Conversation 2 extract — "There should probably be a flag when a map or diagram doesn't have much text for a human to provide some additional context."

---

## Cross-Cutting: Phase Planning

---

### ADR-FUTURE-001: Multi-Tenancy Data Preparation in Phase 1 (Logic Deferred to Phase 3–4)

**Decision**: Phase 1 includes lightweight multi-tenancy scaffolding in data and storage structures, but implements no multi-tenant logic. Specifically:

1. `intake_documents` table includes a `tenant_id` column (nullable, unused in Phase 1)
2. Storage paths use a tenant-namespaced format: `tenant-{id}/archives/YYYY/MM/uuid.ext` even in single-tenant Phase 1 (using a fixed default tenant ID)

**Context**: The project may eventually serve multiple family estates. Good structural choices now avoid a full refactor later.

**Rationale**: Adding a nullable column and a path naming convention in Phase 1 has near-zero cost. Retrofitting later requires data migration. The `StorageService` interface already supports this via config — the path format is a convention, not a code change. Phase 1 uses a single hardcoded tenant ID; Phase 3–4 adds routing logic.

**Phase 3–4 plan**: Add tenant_id to API keys (keys embed tenant context), tenant routing middleware, and per-tenant config resolution. Multi-tenancy pattern (shared DB vs separate DBs per tenant) to be decided at Phase 3–4 planning.

**Risk accepted**: Slightly more complex path structure in Phase 1. Mitigated by a fixed default tenant ID constant.

**Source**: Conversation 3 extract — "Add a tenant_id field to intake_documents table (even though you won't use it yet)" and "Instead of uploads/2024/01/uuid.pdf, use tenant-{id}/archives/2024/01/uuid.pdf"
