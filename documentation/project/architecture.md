# Architecture

This document is a synthesis of all decisions recorded in
[decisions/architecture-decisions.md](../decisions/architecture-decisions.md) (ADR-001 through
ADR-045). It describes the confirmed system architecture for the Institutional Knowledge project.

---

## System Overview

Institutional Knowledge is a document archiving and retrieval system for a family farming estate
(1950s to present). Documents enter the system through two intake routes (web UI form and bulk
ingestion CLI), pass through an extraction and embedding pipeline, and become searchable via
natural language queries with source citations. A knowledge graph of entities (people,
organisations, land parcels, legal references) extracted from documents supports graph-aware
retrieval alongside vector similarity search.

The system is built as a 4-component pipeline (ADR-005):

| Component | Name | Responsibility |
| --- | --- | --- |
| C1 | Document Intake | Accept documents via web UI or CLI; validate, deduplicate, store |
| C2 | Text Extraction, Processing and Embedding | OCR, metadata extraction, LLM combined pass (chunking + entity extraction), embedding generation |
| C3 | Query and Retrieval | Natural language search via RAG with source citations; vector and graph-aware retrieval |
| C4 | Continuous Ingestion | Automated ingestion triggers (Phase 2) |

C1 and C3 are implemented in Phase 1. C2 is the core processing pipeline, also Phase 1. C4 is
a Phase 2 addition.

These components are functional groupings of related features, not service or structural
boundaries. In practice, both the Next.js frontend and Express backend are cross-cutting
systems that serve multiple components. The Python processing service hosts both C2 (pipeline)
and C3 (query) code as separate internal modules within a single Docker container (ADR-005,
ADR-042).

---

## Technology Stack

| Layer | Technology | ADR |
| --- | --- | --- |
| Frontend | Next.js (custom server) | ADR-003, ADR-044 |
| Backend API | Express (Node.js) | ADR-003, ADR-031 |
| Processing service | Python (Docker container) | ADR-015 |
| Database | PostgreSQL 16 + pgvector | ADR-004 |
| OCR | Docling (primary), Tesseract (fallback) | ADR-011 |
| Semantic chunking + entity extraction | LLM-based combined pass (local via Ollama or API) | ADR-025, ADR-038 |
| Embeddings | Local model (interface-driven, model chosen at implementation) | ADR-024 |
| Graph storage | PostgreSQL (behind `GraphStore` interface) | ADR-037 |
| Query routing | `QueryRouter` abstract base class in Python service; pass-through Phase 1, LLM classifier Phase 2 | ADR-040 |
| Migration and seeding | Knex.js | ADR-028, ADR-029 |
| TypeScript test runner | Vitest | ADR-015 |
| Python test runner | pytest | ADR-032 |
| Package manager | pnpm (workspaces) | ADR-002 |
| Orchestration | Docker Compose (Phase 1); AWS ECS candidate (Phase 3) | ADR-001 |

---

## Monorepo Structure

Confirmed in ADR-002, ADR-015, and ADR-042:

```text
institutional-knowledge/
  apps/
    frontend/              # Next.js — structural boundary (ADR-003)
    backend/               # Express — sole database writer (ADR-031)
  packages/
    shared/                # Shared TypeScript types, Zod schemas, utility functions
  services/
    processing/            # Python processing service (own virtualenv, Dockerfile)
      pipeline/            # C2 — text extraction, processing, embedding (ADR-042)
      query/               # C3 — query and retrieval (ADR-042)
      shared/              # Shared utilities: config, EmbeddingService, HTTP client for Express callbacks (ADR-042)
      fixtures/            # Representative estate documents for testing (ADR-032)
  documentation/           # All design docs, decisions, requirements
  .claude/                 # Agent and skill definitions
```

The Python service at `services/processing/` runs as a separate Docker container and communicates
with the Express backend via internal HTTP (ADR-015). It has no direct database connection
(ADR-031). C2 pipeline code and C3 query code are kept in separate internal modules
(`pipeline/` and `query/`) with shared utilities in `shared/`, so the service can be split
into two separate deployments in a future phase without requiring code restructuring (ADR-042).

---

## Component Ownership

Express is the sole database writer (ADR-031). All other components interact with data
exclusively through the Express API.

| Component | DB Access | Role |
| --- | --- | --- |
| Express backend (`apps/backend/`) | Read + Write | Sole writer; owns all schema knowledge via Knex.js |
| Python processing service (`services/processing/`) | None | Stateless processor; hosts C2 pipeline and C3 query modules (ADR-042); returns results via HTTP/RPC |
| Next.js frontend (`apps/frontend/`) | None | Read-only via Express API; proxies C3 queries directly to Python service (ADR-044, ADR-045) |
| C4 Continuous Ingestion | None | Writes via Express API (same pattern as C1) |

**Transaction boundaries** (ADR-031):

- **Intake transaction**: document record + file metadata + hash check (ADR-017 finalize step)
- **Processing results transaction**: chunks + embeddings + pipeline step status + entity
  extractions (`vocabulary_terms` with `source: llm_extracted`) + entity-document occurrences
  (`entity_document_occurrences`) + graph relationships (`vocabulary_relationships`) + quality
  scores for a single document -- all written atomically
- **Vocabulary curation transaction**: term acceptance/rejection + alias updates + rejected list
- **Graph rebuild transaction** (Phase 2): reads all accepted vocabulary terms and relationships;
  writes the graph structure via the `GraphStore` interface (ADR-039)

No cross-service transactions are needed because only one service writes.

---

## Configuration Architecture

The core principle is Infrastructure as Configuration (ADR-001): every external service is
accessed through an abstraction interface, with the concrete implementation selected at runtime
via configuration.

**Mechanism** (ADR-016):

- Each service has a scoped runtime configuration file containing only the values it requires.
  Express receives database credentials, storage config, and backend settings; the Python
  processing service receives only processing-related config (OCR, LLM, embedding providers
  and thresholds). This follows the principle of least privilege (ADR-015).
- Each service has a config key per provider (e.g. `storage.provider: "local"`,
  `ocr.provider: "docling"`)
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

| Service | Config Key | Phase 1 Implementation | Later Phase Candidate |
| --- | --- | --- | --- |
| Document storage | `storage.provider` | Local filesystem (ADR-008) | S3 |
| Database | Connection string | Docker PostgreSQL (ADR-004) | AWS RDS |
| OCR engine | `ocr.provider` | Docling + Tesseract fallback (ADR-011) | Alternative engines |
| LLM (chunking + entities) | `llm.provider` | Local via Ollama (ADR-025, ADR-038) | API providers |
| Embedding model | `embedding.provider` | Local model (ADR-024) | API providers |
| Vector storage | `vectorStore.provider` | pgvector on local PostgreSQL via `VectorStore` interface (ADR-004, ADR-033) | Dedicated vector DB (e.g. OpenSearch) |
| Graph storage | `graph.provider` | PostgreSQL via `GraphStore` interface (ADR-037) | Neo4j (Phase 3+) |
| Query routing | `query.router` | Pass-through returning `vector` for all queries (ADR-040) | LLM classifier (Phase 2) |

The embedding vector dimension is config-driven, not hardcoded in the schema (ADR-024). Changing
the embedding model requires a config update and a re-embedding pass, not a schema migration.

---

## Provider Interfaces

Three provider interfaces live in Express (TypeScript); one lives in the Python processing
service. All follow the same pattern: an interface or abstract base class with concrete
implementations selected by config key via the factory pattern (ADR-016).

**Express provider interfaces** (TypeScript):

| Interface | Config Key | Phase 1 Implementation | Purpose | ADR |
| --- | --- | --- | --- | --- |
| `StorageService` | `storage.provider` | Local filesystem (configurable path) | Document file storage (OCR source, uploads, staging) | ADR-008 |
| `VectorStore` | `vectorStore.provider` | pgvector (PostgreSQL) | Embedding storage and similarity search | ADR-033 |
| `GraphStore` | `graph.provider` | PostgreSQL (SQL JOINs + recursive CTEs) | Entity/relationship storage and graph traversal | ADR-037 |

**Python provider interface** (abstract base class in `services/processing/query/`):

| Interface | Config Key | Phase 1 Implementation | Purpose | ADR |
| --- | --- | --- | --- | --- |
| `QueryRouter` | `query.router` | Pass-through (returns `vector` always) | Classify queries to select retrieval strategy | ADR-040 |

`QueryRouter` lives in Python because it drives the Python query pipeline — placing it in Express would require an extra HTTP round-trip per query for a decision that has no database dependency. `VectorStore` and `GraphStore` remain in Express because they wrap database operations that Express owns (ADR-031).

**GraphStore interface contract** (indicative -- exact methods refined at implementation):

- `writeEntity(entity)` / `writeRelationship(relationship)` -- write graph data
- `getEntity(entityId)` / `getRelationships(entityId, direction?)` -- read graph data
- `traverse(startEntityId, maxDepth, relationshipTypes?)` -- multi-hop graph traversal
- `findEntitiesByType(entityType)` -- list entities by category
- `findDocumentsByEntity(entityId)` -- which documents mention this entity (via `entity_document_occurrences`)

**QueryRouter interface contract** (indicative):

- `route(query_text: str) -> RouteDecision` -- returns `strategy: Literal['vector', 'graph', 'both']` and optional context (e.g. extracted entity names for graph queries)

The `GraphStore` operates on `vocabulary_terms` rows that have at least one corresponding row in
`entity_document_occurrences` -- entities with evidential grounding in the archive. Seeded and
manually added entities without document links are excluded from the graph until they are
encountered during document processing (ADR-037).

---

## Data Flow

### End-to-End: Document Upload to Query Result

**1. Document Intake (C1)**

The Primary Archivist submits a document via the web UI form or bulk ingestion CLI.

- **Web UI**: Next.js validates input at the boundary (ADR-003), then forwards to Express.
  The upload flow implements a four-status lifecycle -- `initiated`, `uploaded`, `stored`,
  `finalized` -- ensuring atomicity (ADR-007, ADR-017). A staging area holds files in-progress;
  files only reach permanent storage at the `stored` step. MD5 hash is checked against a
  database unique constraint for deduplication (ADR-009). On any failure, aggressive immediate
  cleanup removes all partial state (ADR-010).

- **Bulk ingestion CLI**: Files in the source directory are validated against the naming
  convention. A run ID tracks all files in the batch (ADR-018). Files are staged in a
  run-specific directory and moved individually to permanent storage on run completion (each
  file transitions from `uploaded` to `stored` to `finalized`). The summary report file is
  created at run start but remains empty until the run completes -- an empty file signals an
  interrupted run. A config flag (`ingestion.partialAuditReport`) enables streaming append
  for development use (ADR-019). Virtual document grouping uses subdirectories with the
  `--grouped` flag (ADR-020). Files within a group must follow the naming convention
  `NNN` or `NNN - optional-annotation` (e.g. `001.tiff`, `002 - back cover.tiff`) where
  `NNN` is a zero-padded three-digit sequence number determining page order (ADR-035).

Both routes populate the same metadata model. The document receives a UUID v7 identifier
(ADR-022) and the archive reference is derived from date and description at display time
(ADR-023).

**2. Processing (C2)**

Processing is triggered manually via an Express API endpoint callable from either the web UI
button or a CLI command (ADR-026). The trigger is fire-and-forget -- the caller receives a
run ID and moves on. The system processes all documents with incomplete pipeline steps.

Express sends the document to the Python processing service via internal HTTP (ADR-015,
ADR-031). Python performs a 6-step pipeline (ADR-038):

1. **Text extraction**: Docling (primary) or Tesseract (fallback) via the OCR interface (ADR-011)
2. **Text quality scoring**: per-page and whole-document confidence scores (0-100) (ADR-021)
3. **Pattern-based metadata extraction**: document type, dates, people, land references,
   description via pattern detection (ADR-012)
4. **Metadata completeness scoring**: pluggable weighted field presence (ADR-021)
5. **LLM combined pass**: a single LLM call returns a structured response containing:
   - Chunk boundaries and labels (ADR-025)
   - Metadata fields (document type, dates, people, land references, description) -- discarded
     in Phase 1 in favour of pattern-based results (ADR-036)
   - Graph entities (type, name, confidence) -- written to `vocabulary_terms` with
     `source: llm_extracted` (ADR-038)
   - Graph relationships (source entity, target entity, relationship type, confidence) -- written
     to `vocabulary_relationships` (ADR-038)
6. **Embedding generation**: each chunk is embedded via a local model behind the embedding
   interface (ADR-024)

Python returns all processing outputs to Express in a single structured response. Express writes
everything to PostgreSQL in a single transaction (ADR-031), including entity extractions in
`vocabulary_terms`, entity-document links in `entity_document_occurrences`, and graph
relationships in `vocabulary_relationships`.

Pipeline state is tracked via a per-document step status table (`pipeline_steps`) with a
pipeline version marker for future enrichment reprocessing (ADR-027). Before forwarding a
document to Python, Express marks its pending steps as `running`. On receiving Python's
response, Express updates each step to `completed` or `failed`. At the start of each
processing trigger, stale `running` steps (older than `pipeline.runningStepTimeoutMinutes`)
are reset to `failed` and retried. Failed steps are retried up to a configurable limit.
Documents are absent from the search index until embedding completes successfully.

Documents failing quality or completeness thresholds are flagged and surfaced in the curation
queue. The archivist clears flags to resume processing from the next incomplete step.

**Entity types** extracted by the LLM combined pass (starting set -- refined at
implementation):

- People (individuals named in documents)
- Organisation (solicitors, companies, councils, estate agents)
- Organisation Role (e.g. Estate Management, Legal Services)
- Land Parcel / Field (named fields, plots, parcels with boundaries)
- Date / Event (significant dated events: transfers, deaths, boundary changes)
- Legal Reference (deed numbers, conveyance references, planning references)

**Relationship types** (indicative -- refined at implementation):

- `owned_by`, `transferred_to`, `witnessed_by`, `adjacent_to`, `employed_by`, `referenced_in`,
  `performed_by`, `succeeded_by`

LLM-extracted entities appear in the vocabulary review queue (ADR-014). The curator accepts
(changing `source` to `candidate_accepted`), rejects (moving to `rejected_terms`), or leaves
them as `llm_extracted` for later review.

**3. Query (C3)**

The Primary Archivist asks a natural language question via the CLI (Phase 1) or web UI (Phase 2).

**Web UI path (ADR-045)**: The Next.js custom server proxies C3 query requests directly to the Python service, bypassing Express. Python owns the complete query pipeline. Express is not in the primary query path; it serves only the VectorStore and GraphStore callback endpoints called by Python.

**CLI path (ADR-045)**: The CLI calls the Python service directly. The CLI operates with direct network access to all services and does not pass through the Next.js boundary layer — the internet-facing boundary exists to protect services from external callers; the CLI is not an external caller. The CLI uses the shared-key header for Python calls (ADR-044). Express is not in the CLI query path.

C3 query code runs within the Python processing service (`services/processing/query/`) alongside the C2 pipeline code (ADR-042). Query embedding uses the same `EmbeddingService` instance as document processing, available in-process (ADR-042).

The Python query pipeline:

1. The `QueryRouter` interface selects a retrieval strategy (ADR-040)
   - **Phase 1**: the pass-through implementation returns `vector` for all queries
   - **Phase 2**: an LLM classifier analyses the query and returns `vector`, `graph`, or `both`
2. The query text is embedded using the same embedding model as document chunks (ADR-024)
3. Python calls back to Express to retrieve vector search results via the `VectorStore`
   interface (ADR-033); Express performs the pgvector similarity search and returns matching chunks
4. For `graph` and `both` routes (Phase 2): Python calls back to Express to perform graph
   traversal via the `GraphStore` interface (ADR-037)
5. Results are merged (for `both` routes) and assembled with parent document context
6. An LLM synthesises a response with source citations
7. Citations include document description, date, and archive reference (ADR-023)

Python returns the complete response to the caller (Next.js custom server or CLI) unchanged.

**4. Curation**

The web UI provides two distinct queues:

- **Document curation queue**: documents awaiting review or flagged with issues; the archivist
  can clear flags and correct metadata
- **Vocabulary and entity review queue**: LLM-extracted entities and any other vocabulary
  candidates proposed during processing; the archivist accepts (adds to vocabulary with
  `source: candidate_accepted`) or rejects (adds to `rejected_terms`) (ADR-014, ADR-038).
  The `confidence` column provides a natural filtering mechanism -- low-confidence entities
  can be deprioritised or hidden by default.

Vocabulary is stored in three tables with referential integrity: `vocabulary_terms`,
`vocabulary_relationships`, and `rejected_terms` (ADR-028). The database is seeded with initial
vocabulary via Knex.js seed files. A fourth table, `entity_document_occurrences`, tracks which
documents mention each entity (ADR-028 revision, ADR-037).

**5. Graph Rebuild (Phase 2)**

After a curation session, the archivist triggers a graph rebuild via the curation UI button or
CLI command (ADR-039). The rebuild:

1. Reads all `vocabulary_terms` with `source IN ('seed', 'manual', 'candidate_accepted')` and
   all corresponding `vocabulary_relationships`
2. Writes the graph structure via the `GraphStore` interface (ADR-037)
3. Is idempotent -- running it multiple times produces the same result
4. Replaces the current graph state with the state derived from the accepted vocabulary

The graph is stale between rebuild triggers. This is acceptable because the curation workflow
is session-based and graph-aware querying is not a real-time requirement (ADR-039).

---

## Phased Build Approach

### Phase 1 -- Prove the Pipeline

- Complete end-to-end pipeline running locally via Docker Compose
- Single user (Primary Archivist), no authentication
- Web UI for intake and curation (unpolished but functional)
- CLI for query and bulk ingestion
- Web UI for query is deferred to Phase 2
- Local filesystem storage, local PostgreSQL + pgvector
- Local OCR (Docling), local LLM (Ollama), local embedding model
- Manual processing trigger only
- Pattern-based category detection
- Flat storage paths with no tenant namespace (ADR-034)
- LLM combined pass extracts entities and relationships alongside chunks (ADR-038)
- LLM-extracted entities appear in the vocabulary review queue for curation (ADR-014, ADR-038)
- `vocabulary_terms` extended with `confidence` column; `source` enum includes `llm_extracted`
- `entity_document_occurrences` table tracks entity-document provenance (ADR-028)
- `GraphStore` interface defined; PostgreSQL implementation written (not called in Phase 1
  production code) (ADR-037, ADR-041)
- `QueryRouter` abstract base class defined in Python service (`query/`); pass-through
  implementation returns `vector` for all queries (ADR-040, ADR-041)

### Phase 2 -- Expand and Share

- Web UI for query; enhanced intake, curation, and vocabulary management UI
- User authentication; Family Member access
- DOCX and EML file format support
- Supplementary context for unflaggable documents
- Re-embedding on metadata correction
- Original documents returned alongside query answers
- Document browsing
- S3 storage migration -- tenant-namespaced paths introduced at this point using a fixed default
  tenant ID constant (ADR-034)
- Graph rebuild trigger endpoint -- reads accepted vocabulary, writes graph via `GraphStore`
  (ADR-039, ADR-041)
- LLM query classifier -- `QueryRouter` implementation that classifies queries as
  vector/graph/both; replaces the Phase 1 pass-through (ADR-040, ADR-041)
- Graph-aware retrieval in C3 -- `QueryRouter` selects retrieval strategy;
  `GraphStore.traverse()` called for graph and hybrid queries (ADR-037, ADR-040, ADR-041)
- Candidate: PostgreSQL LISTEN/NOTIFY for automated processing triggers (ADR-026)
- Candidate: try-all validation mode for grouped ingestion (UR-038)
- Candidate: merge pattern-based metadata extraction into the chunking LLM step; Phase 1 prompt
  is designed to return metadata fields to make this low-cost (ADR-036)
- Candidate: split Python service into separate pipeline and query deployments if concurrent
  load warrants it (ADR-042)

### Phase 3 -- Open to Others

- AWS hosting (S3, RDS -- configuration change only, ADR-001)
- User account management; Occasional Contributor access
- Multi-tenancy: `tenant_id` column added via additive migration; tenant routing middleware
  introduced; pattern (shared DB vs separate DB) resolved at Phase 3 planning (ADR-034)
- Document deletion and replacement
- Document visibility scoping
- Filter and facet search
- System Administrator role
- Candidate: Neo4j migration -- new `GraphStore` implementation backed by Neo4j; config key
  change; graph regeneration from vocabulary tables via rebuild trigger (ADR-037, ADR-041)

### Phase 4 and Beyond

- Enrichment reprocessing via pipeline version mechanism (ADR-027)
- Near-duplicate detection
- Cross-document contradiction detection
- Standalone photographs

---

## Cross-Cutting Decisions Summary

| Concern | Decision | ADR |
| --- | --- | --- |
| Provider abstraction | Config key + factory pattern per service | ADR-001, ADR-016 |
| Python placement | Separate Docker service at `services/processing/` | ADR-015 |
| Upload atomicity | Staging area + four-status lifecycle + startup sweep | ADR-007, ADR-017 |
| Bulk ingestion atomicity | Run-level staging + run ID + run-start sweep | ADR-018 |
| Report behaviour | Created at run start, empty by default; streaming append via `ingestion.partialAuditReport` flag | ADR-019 |
| Virtual document grouping | `--grouped` flag + subdirectories | ADR-020 |
| Group file naming | `NNN` or `NNN - annotation` sequence numbering | ADR-035 |
| Metadata completeness | Pluggable interface + weighted field presence | ADR-021 |
| Document identifiers | UUID v7, PostgreSQL native `uuid` type | ADR-022 |
| Archive reference | `YYYY-MM-DD — [description]` or `[undated] — [description]`, derived at display time | ADR-023 |
| Embedding interface | Config-driven dimensions, local-first model | ADR-024 |
| Semantic chunking | LLM-based, no heuristic fallback | ADR-025 |
| Processing trigger | Backend API, fire-and-forget, manual in Phase 1 | ADR-026 |
| Pipeline re-entrancy | Per-document step status table + pipeline version | ADR-027 |
| Vocabulary schema | Normalised relationships join table + Knex.js seeding; extended with `confidence`, `llm_extracted` source, `entity_document_occurrences` | ADR-028, ADR-038 |
| Migration policy | Additive-only via Knex.js | ADR-029 |
| Database backup | Docker volume snapshots + recommended pg_dump | ADR-030 |
| Data ownership | Express sole writer; Python stateless via RPC | ADR-031 |
| Python testing | Interface-driven mocking + fixture documents + pytest | ADR-032 |
| Vector store abstraction | `VectorStore` interface in Express; pgvector Phase 1 impl | ADR-033 |
| Multi-tenancy | No scaffolding in Phase 1; tenant paths at S3 migration; `tenant_id` at Phase 3 | ADR-034 |
| LLM metadata merge path | Chunking prompt returns metadata fields from Phase 1; merge deferred to Phase 2 | ADR-036 |
| Graph storage | `GraphStore` interface in Express; PostgreSQL Phase 1 impl (unified with vocabulary tables) | ADR-037, ADR-038 |
| Entity extraction | LLM combined pass in C2; entities stored in `vocabulary_terms` with `source: llm_extracted` | ADR-038 |
| Graph construction | Post-curation batch rebuild via Express API endpoint (Phase 2) | ADR-039 |
| Query routing | `QueryRouter` abstract base class in Python service; pass-through Phase 1, LLM classifier Phase 2 | ADR-040 |
| Graph-RAG phasing | Entity extraction Phase 1; graph querying Phase 2; Neo4j Phase 3+ | ADR-041 |
| C3 service placement | C3 shares Python processing service; separate `pipeline/` and `query/` modules; splittable in future phase | ADR-042 |
| C3 query orchestration | ~~Express thin proxy~~ (superseded); Next.js proxies web UI queries to Python; CLI calls Python directly (direct network access — no boundary layer needed); Python callbacks to Express for VectorStore/GraphStore | ADR-043 (superseded), ADR-045 |
| Next.js custom server | Next.js runs a custom server (not static export); sole internet-facing entry point; auth in Phase 2+ | ADR-044 |
| Internal service trust | Shared-key header auth on all internal boundaries: Next.js → Express, Next.js → Python, Express → Python, CLI → Python; per-pair keys for independent rotation | ADR-044 |

**Note**: ADR-006 (Human-in-the-Loop Development with Claude Agents) is a process decision and not included in this architecture summary; see [documentation/decisions/architecture-decisions.md](../decisions/architecture-decisions.md) for full ADR list.

---

## Diagram Reference

See [system-diagrams.md](system-diagrams.md) for visual representations of the system.
That file contains four Mermaid diagrams:

| Diagram | Content |
| --- | --- |
| 1. System Overview | Components as black boxes; data flow between services; phase boundaries; GraphStore and QueryRouter interfaces |
| 2. C1 -- Document Intake | Web UI four-status upload lifecycle; bulk ingestion run-level staging; cleanup sweep |
| 3. C2 -- Processing Pipeline | Express trigger; 6-step Python pipeline with LLM combined pass; entity extraction; transaction write-back |
| 4. C3 -- Query and Retrieval | QueryRouter classification; vector search; graph traversal (Phase 2); RAG assembly; citation format |
