# Architecture

This document is a synthesis of all decisions recorded in
[decisions/architecture-decisions.md](../decisions/architecture-decisions.md) (ADR-001 through
ADR-032). It describes the confirmed system architecture for the Estate Intelligence project.

---

## System Overview

Estate Intelligence is a document archiving and retrieval system for a family farming estate
(1950s to present). Documents enter the system through two intake routes (web UI form and bulk
ingestion CLI), pass through an extraction and embedding pipeline, and become searchable via
natural language queries with source citations.

The system is built as a 4-component pipeline (ADR-005):

| Component | Name | Responsibility |
| --- | --- | --- |
| C1 | Document Intake | Accept documents via web UI or CLI; validate, deduplicate, store |
| C2 | Text Extraction, Processing and Embedding | OCR, metadata extraction, LLM chunking, embedding generation |
| C3 | Query and Retrieval | Natural language search via RAG with source citations |
| C4 | Continuous Ingestion | Automated ingestion triggers (Phase 2+) |

C1 and C3 are implemented in Phase 1. C2 is the core processing pipeline, also Phase 1. C4 is
a Phase 2+ addition.

---

## Technology Stack

| Layer | Technology | ADR |
| --- | --- | --- |
| Frontend | Next.js | ADR-003 |
| Backend API | Express (Node.js) | ADR-003, ADR-031 |
| Processing service | Python (Docker container) | ADR-015 |
| Database | PostgreSQL 16 + pgvector | ADR-004 |
| OCR | Docling (primary), Tesseract (fallback) | ADR-011 |
| Semantic chunking | LLM-based (local via Ollama or API) | ADR-025 |
| Embeddings | Local model (interface-driven, model chosen at implementation) | ADR-024 |
| Migration and seeding | Knex.js | ADR-028, ADR-029 |
| TypeScript test runner | Vitest | ADR-015 |
| Python test runner | pytest | ADR-032 |
| Package manager | pnpm (workspaces) | ADR-002 |
| Orchestration | Docker Compose (Phase 1); AWS ECS candidate (Phase 3+) | ADR-001 |

---

## Monorepo Structure

Confirmed in ADR-002 and ADR-015:

```text
estate-intelligence/
  apps/
    frontend/              # Next.js — structural boundary (ADR-003)
    backend/               # Express — sole database writer (ADR-031)
  packages/
    shared/                # Shared TypeScript types, Zod schemas, utility functions
  services/
    processing/            # Python processing service (own virtualenv, Dockerfile)
      fixtures/            # Representative estate documents for testing (ADR-032)
  documentation/           # All design docs, decisions, requirements
  .claude/                 # Agent and skill definitions
```

The Python service at `services/processing/` runs as a separate Docker container and communicates
with the Express backend via internal HTTP (ADR-015). It has no direct database connection
(ADR-031).

---

## Component Ownership

Express is the sole database writer (ADR-031). All other components interact with data
exclusively through the Express API.

| Component | DB Access | Role |
| --- | --- | --- |
| Express backend (`apps/backend/`) | Read + Write | Sole writer; owns all schema knowledge via Knex.js |
| Python processing service (`services/processing/`) | None | Stateless processor; returns results via HTTP/RPC |
| Next.js frontend (`apps/frontend/`) | None | Read-only via Express API |
| C3 Query and Retrieval | None | Read-only via Express API |
| C4 Continuous Ingestion | None | Writes via Express API (same pattern as C1) |

**Transaction boundaries** (ADR-031):

- **Intake transaction**: document record + file metadata + hash check (ADR-017 finalize step)
- **Processing results transaction**: chunks + embeddings + pipeline step status + vocabulary
  candidates + quality scores for a single document — all written atomically
- **Vocabulary curation transaction**: term acceptance/rejection + alias updates + rejected list

No cross-service transactions are needed because only one service writes.

---

## Configuration Architecture

The core principle is Infrastructure as Configuration (ADR-001): every external service is
accessed through an abstraction interface, with the concrete implementation selected at runtime
via configuration.

**Mechanism** (ADR-016):

- A shared runtime configuration file is the single source of truth for provider selection
- Each service has a config key (e.g., `storage.provider: "local"`, `ocr.provider: "docling"`)
- Factory functions in each language read the key and return the concrete implementation
- TypeScript: interfaces + factory functions
- Python: abstract base classes + factory functions

**Configuration hierarchy** (ADR-001):

1. CLI arguments (highest priority)
2. Environment variables
3. Docker runtime config
4. Local runtime config file
5. Package defaults (lowest priority)

Environment variables can override specific config values, but the config file is the base layer
(ADR-016). The application never branches on environment name (ADR-001).

**Abstraction points**:

| Service | Config Key | Phase 1 Implementation | Phase 2+ Candidate |
| --- | --- | --- | --- |
| Document storage | `storage.provider` | Local filesystem (ADR-008) | S3 |
| Database | Connection string | Docker PostgreSQL (ADR-004) | AWS RDS |
| OCR engine | `ocr.provider` | Docling + Tesseract fallback (ADR-011) | Alternative engines |
| LLM (chunking) | `llm.provider` | Local via Ollama (ADR-025) | API providers |
| Embedding model | `embedding.provider` | Local model (ADR-024) | API providers |
| Vector storage | pgvector config | pgvector on local PostgreSQL (ADR-004) | Dedicated vector DB |

The embedding vector dimension is config-driven, not hardcoded in the schema (ADR-024). Changing
the embedding model requires a config update and a re-embedding pass, not a schema migration.

---

## Data Flow

### End-to-End: Document Upload to Query Result

**1. Document Intake (C1)**

The Primary Archivist submits a document via the web UI form or bulk ingestion CLI.

- **Web UI**: Next.js validates input at the boundary (ADR-003), then forwards to Express.
  The three-step upload flow (Initiate, Upload to staging area, Finalize to permanent storage)
  ensures atomicity (ADR-007, ADR-017). MD5 hash is checked against a database unique constraint
  for deduplication (ADR-009). On any failure, aggressive immediate cleanup removes all partial
  state (ADR-010).

- **Bulk ingestion CLI**: Files in the source directory are validated against the naming
  convention. A run ID tracks all files in the batch (ADR-018). Files are staged in a
  run-specific directory and batch-moved to permanent storage on completion. The summary report
  is opened at run start with streaming append (ADR-019). Virtual document grouping uses
  subdirectories with the `--grouped` flag (ADR-020).

Both routes populate the same metadata model. The document receives a UUID v7 identifier
(ADR-022) and the archive reference is derived from date and description at display time
(ADR-023).

**2. Processing (C2)**

Processing is triggered manually via an Express API endpoint callable from either the web UI
button or a CLI command (ADR-026). The trigger is fire-and-forget — the caller receives a
run ID and moves on. The system processes all documents with incomplete pipeline steps.

Express sends the document to the Python processing service via internal HTTP (ADR-015,
ADR-031). Python performs:

1. **Text extraction**: Docling (primary) or Tesseract (fallback) via the OCR interface (ADR-011)
2. **Quality scoring**: per-page and whole-document confidence scores (0-100)
3. **Metadata extraction**: document type via pattern-based detection (ADR-012), dates, people,
   land references, description
4. **Metadata completeness scoring**: pluggable weighted field presence (ADR-021)
5. **Vocabulary candidate identification**: proposed terms for the review queue (ADR-014)
6. **Semantic chunking**: LLM reads the extracted text and identifies meaningful chunk boundaries
   (ADR-025); each chunk stores a reference to its parent document (ADR-013)
7. **Embedding generation**: each chunk is embedded via a local model behind the embedding
   interface (ADR-024)

Python returns all processing outputs to Express in a single structured response. Express writes
everything to PostgreSQL in a single transaction (ADR-031).

Pipeline state is tracked via a per-document step status table (`pipeline_steps`) with a pipeline
version marker for future enrichment reprocessing (ADR-027). Failed steps are retried up to a
configurable limit. Documents are absent from the search index until embedding completes
successfully.

Documents failing quality or completeness thresholds are flagged and surfaced in the curation
queue. The archivist clears flags to resume processing from the next incomplete step.

**3. Query (C3)**

The Primary Archivist asks a natural language question via the CLI (Phase 1) or web UI (Phase 2).

1. The query text is embedded using the same embedding model as document chunks
2. pgvector similarity search finds relevant chunks (ADR-004)
3. Retrieved chunks and their parent documents provide context for RAG
4. An LLM synthesises a response with source citations
5. Citations include document description, date, and archive reference (ADR-023)

**4. Curation**

The web UI provides two distinct queues:

- **Document curation queue**: documents awaiting review or flagged with issues; the archivist
  can clear flags and correct metadata
- **Vocabulary review queue**: candidate terms proposed during processing; the archivist accepts
  (adds to vocabulary) or rejects (adds to rejected list) (ADR-014)

Vocabulary is stored in three tables with referential integrity: `vocabulary_terms`,
`vocabulary_relationships`, and `rejected_terms` (ADR-028). The database is seeded with initial
vocabulary via Knex.js seed files.

---

## Phased Build Approach

### Phase 1 — Prove the Pipeline

- Complete end-to-end pipeline running locally via Docker Compose
- Single user (Primary Archivist), no authentication
- Web UI for intake and curation (unpolished but functional)
- CLI for query and bulk ingestion
- Local filesystem storage, local PostgreSQL + pgvector
- Local OCR (Docling), local LLM (Ollama), local embedding model
- Manual processing trigger only
- Pattern-based category detection

### Phase 2 — Expand and Share

- Web UI for query; enhanced intake, curation, and vocabulary management UI
- User authentication; Family Member access
- DOCX and EML file format support
- Supplementary context for unflaggable documents
- Re-embedding on metadata correction
- Original documents returned alongside query answers
- Document browsing
- Candidate: PostgreSQL LISTEN/NOTIFY for automated processing triggers (ADR-026)
- Candidate: try-all validation mode for grouped ingestion (UR-038)

### Phase 3 — Open to Others

- AWS hosting (S3, RDS — configuration change only, ADR-001)
- User account management; Occasional Contributor access
- Document deletion and replacement
- Document visibility scoping
- Filter and facet search
- System Administrator role

### Phase 4+ — Future

- Enrichment reprocessing via pipeline version mechanism (ADR-027)
- Near-duplicate detection
- Knowledge graph
- Cross-document contradiction detection
- Standalone photographs

---

## Cross-Cutting Decisions Summary

| Concern | Decision | ADR |
| --- | --- | --- |
| Provider abstraction | Config key + factory pattern per service | ADR-001, ADR-016 |
| Python placement | Separate Docker service at `services/processing/` | ADR-015 |
| Upload atomicity | Staging area + DB status column + startup sweep | ADR-017 |
| Bulk ingestion atomicity | Run-level staging + run ID + run-start sweep | ADR-018 |
| Report behaviour | Created at run start, streaming append, fail-fast on directory error | ADR-019 |
| Virtual document grouping | `--grouped` flag + subdirectories | ADR-020 |
| Metadata completeness | Pluggable interface + weighted field presence | ADR-021 |
| Document identifiers | UUID v7, PostgreSQL native `uuid` type | ADR-022 |
| Archive reference | `YYYY-MM-DD — [description]`, derived at display time | ADR-023 |
| Embedding interface | Config-driven dimensions, local-first model | ADR-024 |
| Semantic chunking | LLM-based, no heuristic fallback | ADR-025 |
| Processing trigger | Backend API, fire-and-forget, manual in Phase 1 | ADR-026 |
| Pipeline re-entrancy | Per-document step status table + pipeline version | ADR-027 |
| Vocabulary schema | Normalised relationships join table + Knex.js seeding | ADR-028 |
| Migration policy | Additive-only via Knex.js | ADR-029 |
| Database backup | Docker volume snapshots + recommended pg_dump | ADR-030 |
| Data ownership | Express sole writer; Python stateless via RPC | ADR-031 |
| Python testing | Interface-driven mocking + fixture documents + pytest | ADR-032 |

---

## Diagram Reference

See [pipeline-diagram.mermaid](pipeline-diagram.mermaid) for a visual representation of the
component pipeline, data flows, and phase boundaries.
