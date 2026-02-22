# Architecture Decisions

All significant architectural and design decisions. Before proposing a change to how the system
works, check here first. If a decision appears here, understand the rationale before revisiting it.

**Format**: Decision | Context | Rationale | Risk Accepted | Tradeoffs

---

## Pre-Approval ADRs (Reviewed 2026-02-21)

The following ADRs were carried forward from the pre-approval phase after review against
the approved `user-requirements.md` (2026-02-17) and the Infrastructure as Configuration
principle. ADRs marked "[Revised]" were modified to align with approved scope.

---

### ADR-001: Infrastructure as Configuration

**Decision**: Every external service (storage, database, OCR engine, LLM provider, embedding
service, vector DB, compute) must be accessed through an abstraction interface, not hardcoded.
The concrete implementation is selected at runtime via configuration.

**Context**: The project will run locally (Docker Compose) during development and on AWS in
production. Without abstraction, every environment change requires code changes.

**Rationale**: Enables local-to-AWS migration with zero code changes. Enables swapping OCR
engines, LLM providers, and embedding services as better options emerge. Prevents vendor
lock-in during the learning phase.

**Implementation**: TypeScript interfaces + factory/DI patterns (backend); Python abstract base
classes + factory functions (processing). Configuration hierarchy: CLI args, environment
variables, Docker runtime config, local runtime, package defaults.

**Risk accepted**: Slightly more upfront code per service. Mitigated by reusable pattern
(`configuration-patterns.md` skill).

**Source**: Carried forward from pre-approval ADR-001. Addresses UR-133.

---

### ADR-002: Monorepo with pnpm Workspaces

**Decision**: Project uses a single repository with pnpm workspaces. Directory layout confirmed
by ADR-015 (Python placement).

**Context**: Frontend (Next.js) and backend (Express) share Zod schemas and TypeScript types.

**Rationale**: Simplifies shared type management; single install; coordinated CI.

**Risk accepted**: Slightly more complex setup than separate repos.

**Source**: Carried forward from pre-approval ADR-002. See ADR-015 for confirmed layout.

---

### ADR-003: Structural Boundary — Next.js in Front of Express [Revised]

**Decision**: Express backend is not directly internet-accessible. All external requests flow
through Next.js, which validates input before forwarding to Express.

**Context**: Document pipeline accepts uploads from users. Files must be validated before
reaching the processing backend. Phase 1 has a single user with no authentication (UR-121),
so this is a structural boundary for input validation, not a security architecture.

**Rationale**: Defence in depth at the validation layer. Next.js validates file type, size, and
content at the boundary before Express processes the request. When authentication is introduced
in Phase 2 (UR-124), the structural boundary is already in place.

**Revision note**: Reframed from "Three-Layer Security Architecture" to structural validation
boundary. Phase 1 has no authentication; the security framing was premature.

**Risk accepted**: Two-hop latency. Acceptable for document upload workflow (not real-time).

**Source**: Carried forward from pre-approval ADR-003 (revised). Consistent with UR-121, UR-124.

---

### ADR-004: PostgreSQL + pgvector (Not a Dedicated Vector Database)

**Decision**: Use a single PostgreSQL 16 instance with the pgvector extension for both
relational metadata and vector embeddings. All vector store operations are accessed through
a `VectorStore` interface in Express (see ADR-033), making the backing store swappable.

**Context**: The project needs relational storage (documents, chunks, processing records) and
vector storage (embeddings for similarity search).

**Rationale**: Developer has extensive PostgreSQL experience. Avoids polyglot persistence
complexity. pgvector is production-proven for moderate document volumes (target: tens of
thousands). Unified database simplifies backup, migration, and querying.

**Risk accepted**: May hit pgvector performance limits at very high scale. Acceptable for
Phase 1 through Phase 3; can migrate to dedicated vector DB (e.g. OpenSearch) in Phase 4
if needed — the `VectorStore` abstraction (ADR-033) makes this swap possible without
changing C3 or C2.

**Source**: Carried forward from pre-approval ADR-004. Consistent with UR-133. Revised
2026-02-22 to reference ADR-033 (VectorStore interface).

---

### ADR-005: 4-Component Pipeline

**Decision**: System uses 4 pipeline components:

- Component 1: Document Intake
- Component 2: Text Extraction, Processing and Embedding
- Component 3: Query and Retrieval
- Component 4: Continuous Ingestion

**Context**: Original design had 5 components. Text extraction (old C2) and embedding/storage
(old C3) were merged into a single Component 2 with internal stages.

**Rationale**: Text extraction and embedding are tightly coupled. Merging simplifies the
architecture and makes the pipeline easier to reason about. No capability is lost.

**Source**: Carried forward from pre-approval ADR-005.

---

### ADR-006: Human-in-the-Loop Development with Claude Agents

**Decision**: Use a multi-agent Claude workflow with the developer as the final decision-maker.
Agents analyse, synthesise, and propose; developer decides.

**Rationale**: Project will be paused and resumed many times. Clear agent roles with documented
responsibilities ensure context can be re-established. Human decision-making prevents agents
from making confident wrong assumptions on novel domain problems.

**Source**: Carried forward from pre-approval ADR-006. Consistent with development-principles.md.

---

### ADR-007: Three-Step Upload Flow for Atomicity [Revised]

**Decision**: Document upload uses three separate API calls: Initiate (create database record
with status `initiated`, get upload ID), Upload (binary file transfer to a staging area — not
the permanent storage location), Finalize (move file from staging to permanent storage, validate
hash, confirm metadata, update status to `finalized`).

**Context**: UR-008 requires web UI upload to be atomic — if interrupted, nothing is stored.

**Rationale**: Enables resume on partial failure. Files in the staging area are isolated from
permanent storage until the Finalize step succeeds. Explicit hash check at finalize step.
Separates metadata creation from file storage. Each step can be validated independently at the
Next.js boundary. See ADR-017 for the full atomicity mechanism including startup sweep.

**Revision note**: Original pre-approval ADR-C1-001 revised twice. First revision removed tRPC
reference. Second revision (2026-02-21) made the staging area explicit in the Upload step and
added the status column lifecycle (`initiated` to `uploaded` to `finalized`). Cross-references
ADR-017 for the complete atomicity mechanism.

**Risk accepted**: More complex client-side logic. Mitigated by clear API contract and shared
types.

**Source**: Carried forward from pre-approval ADR-C1-001 (revised). Addresses UR-008.

---

### ADR-008: Local Filesystem Storage for Phase 1

**Decision**: Phase 1 stores files on the local filesystem behind a `StorageService` interface.

**Context**: Phase 1 runs locally. S3 storage is a Phase 2+ option.

**Rationale**: Simpler than S3 for Phase 1. The `StorageService` interface ensures S3 migration
requires zero application code changes (only configuration change).

**Source**: Carried forward from pre-approval ADR-C1-002. Consistent with UR-133.

---

### ADR-009: MD5 Hash via Database Unique Constraint for Deduplication

**Decision**: Exact duplicate detection uses MD5 hash stored with a database unique constraint.
Attempting to insert a duplicate is rejected.

**Context**: UR-033 requires hash-based duplicate detection against the full archive of
previously accepted files.

**Rationale**: Simple, reliable, database-enforced. No extra processing required.

**Limitation**: Cannot detect near-duplicates (rescanned copies). Content-based duplicate
detection deferred per UR-034.

**Source**: Carried forward from pre-approval ADR-C1-003. Addresses UR-033.

---

### ADR-010: Aggressive Immediate Cleanup on Failure [Revised]

**Decision**: On any error during upload or ingestion, immediately delete all partial state:
staging area files, database records not in `finalized` status, and any associated stored files.
No partial state persists. The staging area (see ADR-017) is part of the cleanup scope.

**Context**: UR-008 (upload atomicity) and UR-018 (bulk ingestion atomicity) require that
interrupted operations leave no trace.

**Rationale**: Prevents orphaned records and storage waste. Simplifies retry logic (retry from
scratch). Consistent with the atomicity requirements. The staging area provides a clean
separation between in-progress and completed uploads, making cleanup straightforward — wipe
staging plus delete non-finalized records.

**Revision note**: Revised 2026-02-21 to make the staging area explicit as part of the cleanup
scope and to reference the status column lifecycle from ADR-007/ADR-017.

**Risk accepted**: Upload must restart completely on failure. Acceptable for document sizes
within the configurable file size limit.

**Source**: Carried forward from pre-approval ADR-C1-005 (revised). Addresses UR-008, UR-018.

---

### ADR-011: Docling as Primary OCR Engine (Tesseract as Fallback)

**Decision**: Use Docling for OCR and PDF extraction (structure-preserving). Tesseract as
fallback where Docling is unavailable or fails.

**Context**: Estate documents are mostly typewritten. Document structure (headings, paragraphs,
signatures) matters for semantic chunking.

**Rationale**: Docling better preserves document structure than Tesseract alone. Structure is
important for deeds, letters, and operational logs where paragraph boundaries guide chunking.
Both engines are behind an OCR service interface per UR-133.

**Risk accepted**: Slower than Tesseract alone. Acceptable for moderate document volumes.

**Source**: Carried forward from pre-approval ADR-C2-001. Consistent with UR-133.

---

### ADR-012: Pattern-Based Category Detection for Phase 1

**Decision**: Phase 1 detects document category (letter, deed, invoice, operational log, etc.)
via rule-based pattern matching. LLM-assisted classification deferred to Phase 2.

**Context**: UR-052 requires automatic document type detection. The method is not prescribed.

**Rationale**: No LLM dependency in Phase 1 pipeline for category detection. Rules are fast,
deterministic, and explainable. Real-world failure modes will inform Phase 2 LLM prompting.

**Source**: Carried forward from pre-approval ADR-C2-006. Addresses UR-052 (partially).

---

### ADR-013: Parent Document References for All Chunks

**Decision**: Every chunk stores a reference to its parent document, including chunk position
and boundary information.

**Context**: Virtual document groups (UR-036) and query citations (UR-098) require the ability
to trace from a chunk back to its source document.

**Rationale**: Enables full-document context retrieval during RAG. When a relevant chunk is
found, the system can retrieve the full document for broader context.

**Source**: Carried forward from pre-approval ADR-C2-007. Addresses UR-036, UR-098.

---

### ADR-014: Human-in-the-Loop Vocabulary Management [Revised]

**Decision**: The system proposes vocabulary candidates automatically during document processing.
The curator accepts or rejects candidates via the curation web UI. The system does not
autonomously add terms to the vocabulary.

**Context**: UR-085 through UR-095 define vocabulary management. The vocabulary is stored
entirely in the database (UR-085), not in a file.

**Rationale**: Estate-specific terminology is highly domain-specific. Autonomous classification
risks confident wrong assumptions. Human-in-the-loop learning ensures accuracy.

**Revision note**: Revised from pre-approval ADR-C2-003. Original referenced a file-based
`domain-context.md` document. The approved requirements (UR-085) require vocabulary to be stored
entirely in the database. Revised to reflect database-stored vocabulary with a human review queue.

**Source**: Carried forward from pre-approval ADR-C2-003 (revised). Addresses UR-085 through
UR-095.

---

## Superseded Pre-Approval ADRs (Not Carried Forward)

The following pre-approval ADRs were evaluated and found to conflict with the approved
`user-requirements.md`. They are listed here for traceability only.

| Pre-Approval ADR | Reason Superseded |
| --- | --- |
| ADR-C1-004: API Key Authentication | UR-121 states Phase 1 has no authentication. API keys are premature. |
| ADR-C2-002: All Documents Process Regardless of Quality Score | UR-046, UR-054, UR-076 require quality thresholds that gate progression and flag documents in Phase 1. |
| ADR-C2-004: Maps and Plans Chunking | Maps and plans are Phase 2 document types. Implementation decisions for Phase 2 types should not be made now. |
| ADR-C2-005: Heuristic Semantic Chunking | UR-064 requires an AI agent for chunking, not rule-based heuristics. |
| ADR-C2-008: Email Chain Chunking | Email (EML) is a Phase 2 document type (UR-011). |
| ADR-C2-009: Domain Context as JSON File | UR-085 requires vocabulary stored entirely in the database. |
| ADR-C2-010: Flag Low-Text Diagrams | Phase 2 document types. General flagging already covered by UR-048, UR-049, UR-082. |
| ADR-FUTURE-001: Multi-Tenancy Scaffolding | UR-137 prohibits unused future fields. Multi-tenancy is not in approved scope. |

---

## New ADRs (Resolved in Head of Development Phase)

---

### ADR-015: Python as a Separate Docker Service in the Monorepo

**Decision**: Python processing code lives at `services/processing/` within the monorepo and runs as a separate Docker container. It communicates with the TypeScript backend via internal HTTP. Each language uses its own idiomatic configuration library to load a shared runtime configuration file. The Python config library choice is deliberately left open as a learning exercise.

**Context**: Component 2 (Text Extraction, Processing and Embedding) uses Python for OCR and AI/ML work. The rest of the system is TypeScript/Node.js with pnpm workspaces. The developer needs to decide how Python code coexists with TypeScript in the monorepo and how configuration reaches both languages.

**Rationale**: A separate Docker service provides clean process isolation while keeping all code co-located in a single repository. Internal HTTP gives a natural service boundary where the provider-agnostic interface pattern operates. This approach supports the learning goals (development-principles.md principle 5) by giving Python substantial scope rather than reducing it to thin CLI wrappers. The nconf-style runtime config injection pattern (config stored as a file, loaded at runtime, not baked in at build time) satisfies UR-134 (operational values read from config file, not hardcoded or env-vars-only). Each language uses its own idiomatic config reader against a shared config file format, keeping both sides aligned on a single source of truth.

**Options considered**:

- Python as thin CLI wrappers called from Node.js — rejected because it undermines the Python learning goals and creates coupling (TypeScript must know about Python provider options)
- Python in a separate repository — rejected because it adds coordination overhead with no benefit for a single developer; breaks co-located documentation and shared Docker Compose

**Risk accepted**: Internal HTTP boundary adds latency and failure modes (service unavailable, timeout) compared to in-process calls. Acceptable because document processing is not latency-sensitive and the failure modes are straightforward to handle with retries and health checks.

**Tradeoffs**: Two configuration readers to maintain (one per language); internal API contract required between TypeScript and Python services; two test runners (Vitest and pytest).

**Monorepo layout** (confirmed):

```text
apps/
  frontend/          # Next.js
  backend/           # Express
packages/
  shared/            # Shared TypeScript types and Zod schemas
services/
  processing/        # Python processing service (own virtualenv, Dockerfile)
```

**Source**: Resolved in Head of Development phase, 2026-02-21. Addresses Python placement question. Informs UR-133 implementation across language boundaries.

---

### ADR-016: Provider-Agnostic Interface via Config File Keys and Factory Pattern

**Decision**: Each external service has a provider key in the shared runtime configuration file (e.g., `storage.provider: "local"`, `ocr.provider: "docling"`). A factory function in each language reads the key and returns the concrete implementation. TypeScript uses interfaces + factory functions; Python uses abstract base classes + factory functions. The configuration file is the single control plane for provider selection.

**Context**: UR-133 requires every external service to be abstracted via an interface with concrete implementations selected at runtime. UR-134 requires operational values to come from a configuration file, not hardcoded or set only via environment variables. ADR-015 establishes that both TypeScript and Python read from a shared runtime config file. This decision defines the concrete runtime selection mechanism.

**Rationale**: Factory functions are simple, explicit, and debuggable. The config file is human-readable and serves as a single source of truth for what provider is active. Each factory is a self-contained mapping from config key to implementation, easy to test by passing a different config value. The ADR-001 configuration hierarchy (CLI args, env vars, Docker runtime config, local runtime, package defaults) remains valid as an override mechanism — env vars can override specific config values, but the config file is the base layer.

**Options considered**:

- Dependency injection container (tsyringe/dependency-injector) — rejected because it adds framework complexity and learning overhead not aligned with the AI/ML learning goals; obscures which implementation is active
- Environment-variable-driven with config file fallback — rejected because it carries drift risk toward the pattern UR-134 explicitly prohibits (env-vars-only)

**Risk accepted**: Factory functions must be updated when new providers are added. This is acceptable because adding a provider is a deliberate act requiring new adapter code regardless.

**Tradeoffs**: Slightly more boilerplate per service (one factory function + one config key) compared to a DI container. This is offset by clarity and debuggability.

**Source**: Resolved in Head of Development phase, 2026-02-21. Addresses UR-133, UR-134.

---

### ADR-017: Upload Atomicity via Staging Area and Database Status Tracking

**Decision**: Upload atomicity is implemented through a combination of a file staging area and a database status column. The mechanism works as follows:

1. **Initiate**: creates a database record with status `initiated`
2. **Upload**: file is written to a staging area (a temporary location separate from permanent storage); database status updated to `uploaded`
3. **Finalize**: file is moved from staging to permanent storage; hash is validated; database status updated to `finalized`
4. **Startup sweep**: on application startup, the backend queries for any records not in `finalized` status, deletes those records, and wipes the staging area

This ensures that if the server crashes or the client disappears at any point between Initiate and Finalize, the startup sweep removes all partial state. Only files that have completed the full three-step flow exist in permanent storage.

**Context**: UR-008 requires web UI upload to be atomic — if interrupted, nothing is stored. ADR-007 defines the three-step flow. ADR-010 defines the cleanup policy. This ADR specifies the concrete mechanism that ties them together: where files land during upload, how the database tracks progress, and what happens on recovery.

**Rationale**: The staging area provides file-level isolation — in-progress uploads never exist in the permanent storage location, so permanent storage always reflects only completed uploads. The database status column provides record-level tracking — the system can identify incomplete uploads at any time. The startup sweep handles the case where the server itself crashes between steps. Combined, these mechanisms give both database atomicity and file storage atomicity without requiring long-running database transactions (which would hold locks and cannot roll back file operations anyway).

**Options considered**:

- Database transaction wrapping the entire flow — rejected because file storage is outside the transaction boundary; files written to disk are not rolled back by a database rollback; also holds locks for the duration of the upload
- Database status column without staging area — rejected because files in permanent storage would need to be identified and removed individually during cleanup; the staging area makes cleanup a simple wipe operation

**Risk accepted**: The file move from staging to permanent storage (Finalize step) could fail (disk full, permissions). This is handled by the same cleanup mechanism — the record remains in `uploaded` status and is swept on next startup. The move operation is a single filesystem call and is unlikely to leave a half-state.

**Tradeoffs**: Slightly more complex storage logic (two locations instead of one). This is offset by the simplicity and reliability of the cleanup mechanism.

**Source**: Resolved in Head of Development phase, 2026-02-21. Addresses UR-008. Cross-references ADR-007 (three-step flow), ADR-010 (cleanup policy).

---

### ADR-018: Bulk Ingestion Atomicity via Run-Level Staging and Run ID Tracking

**Decision**: Bulk ingestion atomicity is implemented through a run-specific staging directory combined with a run ID in the database. The mechanism works as follows:

1. **Run start**: generate a unique run ID; create a run record in the database with status `in_progress`; create a run-specific staging directory
2. **Per-file processing**: each file accepted during the run is written to the run's staging directory; each database record created during the run is tagged with the run ID
3. **Run completion**: batch-move all files from the run's staging directory to permanent storage; run status transitions to `moving` during the move, then to `completed` once all files are in permanent storage and the summary report is written
4. **Run-start sweep** (per UR-019): at the start of every ingestion run, before any new work is accepted, the system checks for any prior run not in `completed` status; if found, it deletes all database records tagged with that run ID, removes any files in the run's staging directory, and removes any partially-moved files in permanent storage that are tagged with that run ID; then begins the new run

This ensures that if the process is killed or the system crashes at any point during a run, the next run's startup sweep removes all artifacts from the incomplete run. Permanent storage only contains files from completed runs.

**Context**: UR-018 requires bulk ingestion to be atomic — if interrupted, no files from the interrupted run are stored. UR-019 requires cleanup at the start of every run. UR-020 requires no summary report for an interrupted run (the report is only written as part of the `completed` transition). This ADR applies the same staging + status tracking pattern from ADR-017 at the run level rather than the individual upload level.

**Rationale**: The run-specific staging directory provides file-level isolation — files from an in-progress run never exist in permanent storage until the entire run completes. The run ID in the database provides record-level tracking — all artifacts of an incomplete run can be identified and removed in a single sweep. The three-phase status (`in_progress`, `moving`, `completed`) handles the case where the process is killed during the batch move: the `moving` status tells the next sweep that some files may be in permanent storage and must be cleaned up. This is architecturally consistent with ADR-017 (same pattern, different granularity).

**Options considered**:

- Database transaction wrapping the entire run — rejected for the same reason as in ADR-017: file storage is outside the transaction boundary; also, a long-running transaction for a large directory would hold locks for the entire run duration
- Run ID tracking without staging directory — rejected because files in permanent storage from an incomplete run would need to be identified and removed individually; a staging directory makes cleanup a simple directory deletion for the common case (interrupted before move)

**Risk accepted**: The batch move from staging to permanent storage could be interrupted (process killed mid-move). The `moving` status handles this — the next sweep identifies runs in `moving` status and cleans up both staging remnants and any partially-moved permanent files. This is a slightly more complex cleanup path than the common case but is handled by the same sweep mechanism.

**Tradeoffs**: Run-level staging adds storage overhead (files exist in staging for the duration of the run before being moved). For large ingestion batches this could temporarily double storage usage. Acceptable because the staging directory is cleaned up on completion and the system is designed for moderate document volumes.

**Source**: Resolved in Head of Development phase, 2026-02-21. Addresses UR-018, UR-019, UR-020. Cross-references ADR-017 (same pattern at upload level), ADR-010 (cleanup policy).

---

### ADR-019: Report Directory Created and Report File Opened at Run Start (Streaming Append)

**Decision**: The bulk ingestion summary report output directory is created and the report file is opened at the very start of the ingestion run, before any files are processed. If directory creation fails, the run aborts with an actionable error. Per-file outcomes are appended to the report file incrementally as each file is processed (streaming append). Summary totals are appended at the end of the run after all files have been processed.

**Context**: UR-025 requires automatic creation of the output directory. UR-026 asks whether directory creation failure causes the run to abort or only affects the file write. UR-024 requires the report to be written to both stdout and a timestamped file. The question is when directory creation and file opening are attempted, and what happens if they fail.

**Rationale**: Creating the directory and opening the report file before any ingestion work begins provides a fail-fast guarantee — the user learns immediately if the report path is misconfigured, before any processing time is spent. Streaming append (writing each file outcome as it is processed rather than batching at the end) means that even if the process is killed mid-run, the partial report file on disk contains all outcomes processed up to that point. This is a stronger audit guarantee than writing the entire report at the end. Note that the partial report from an interrupted run survives even though the ingestion itself is rolled back (ADR-018) — the report documents what was attempted, while the atomicity mechanism ensures nothing from the interrupted run is stored.

**Options considered**:

- Abort run on directory creation failure (create at start, batch write at end) — rejected because a batch write at the end loses the entire report if the process is killed after processing many files
- Proceed with run if directory creation fails, report to stdout only — rejected because it compromises audit integrity and the user may not notice the failure in long stdout output

**Risk accepted**: The report file from an interrupted run may contain per-file outcomes for files that were subsequently rolled back by ADR-018. This is acceptable because the report documents what was attempted, and the rollback is a separate concern. The user can see from the absence of a summary totals section that the run did not complete.

**Tradeoffs**: Streaming append means the report file is held open for the duration of the run. This is standard practice for log-style files and carries no meaningful risk for a single-user local system.

**Source**: Resolved in Head of Development phase, 2026-02-21. Addresses UR-025, UR-026, UR-024. Cross-references ADR-018 (bulk ingestion atomicity).

---

### ADR-020: CLI Virtual Document Grouping via Subdirectories with --grouped Flag

**Decision**: Virtual document grouping in bulk ingestion is expressed through filesystem subdirectories, activated by a `--grouped` CLI flag. The two modes are mutually exclusive:

- **Without `--grouped`**: all files in the source directory are treated as standalone documents. Subdirectories are an error per UR-016. This is the default behaviour.
- **With `--grouped`**: each immediate subdirectory in the source directory represents one virtual document group. All files within a subdirectory are grouped together. Root-level files in the source directory are a validation error when `--grouped` is set — no mixing of grouped and ungrouped files in the same run. Subdirectory nesting is not supported — a subdirectory within a group subdirectory is an error.

**Context**: UR-036 requires grouping multiple files into a single virtual document at submission time. In Phase 1, grouping is via bulk ingestion CLI only. UR-016 requires that subdirectories in the source directory are treated as an error. These two requirements create a tension: UR-016 prevents unexpected directory structures, but UR-036 requires a mechanism to express grouping. The `--grouped` flag resolves this: UR-016 applies when the flag is absent; when the flag is present, subdirectories are intentional groups.

**Rationale**: Subdirectory-based grouping is filesystem-native, visually inspectable, and requires no manifest files or complex naming conventions. The `--grouped` flag makes the grouping intent explicit — the user must opt in to the subdirectory interpretation. Prohibiting root-level files when `--grouped` is set enforces a clean separation: a run is either all standalone files or all groups, never a mix. This is a structural enforcement, not a soft convention.

**Options considered**:

- Manifest file (JSON/YAML listing groups) — rejected because it requires the user to create and maintain a separate file; error-prone for large directories; introduces a new file format
- Filename prefix convention (shared prefix = group) — rejected because it is fragile and ambiguous when standalone files happen to share a prefix; adds complexity to the naming convention

**Risk accepted**: The `--grouped` flag adds a second mode to the CLI that must be documented and tested separately. Acceptable because the two modes are cleanly separated and the flag makes the user's intent unambiguous.

**Tradeoffs**: No mixing of grouped and ungrouped files in a single run. If the user has both standalone files and multi-file groups, they must run two separate ingestion commands (one without `--grouped`, one with). This is a deliberate simplification for Phase 1.

**UR-016 resolution**: UR-016 ("source directory must contain only files; subdirectories are an error") applies unchanged when `--grouped` is absent. When `--grouped` is present, the source directory must contain only subdirectories (each representing a group); root-level files are the error in this mode. The spirit of UR-016 (reject unexpected directory structures) is preserved in both modes.

**Source**: Resolved in Head of Development phase, 2026-02-21. Addresses UR-036, UR-016. Cross-references UR-037 (group rejection on file failure), UR-038 (fail-fast within groups), UR-040 (single-file group valid), UR-041 (zero-file group error), UR-042 (duplicate filenames within group rejected).

---

### ADR-021: Metadata Completeness Scoring via Pluggable Weighted Field Presence

**Decision**: Metadata completeness scoring is implemented as a pluggable component behind an interface, consistent with the provider-agnostic pattern (ADR-016). The interface contract is:

- **Input**: set of metadata fields with detection status and detection confidence per field
- **Output**: completeness score in the range 0-100
- **Configuration**: completeness threshold is a separate configurable value (per UR-054); field weights are configurable values in the runtime config file

The recommended starting implementation is weighted field presence: the score is (sum of detected field weights / total possible weight) multiplied by 100. The fields assessed for completeness are: document type, dates, people, land references, and description (from UR-052). All weights are configurable. Initial weight values are an implementer decision, expected to be tuned as real documents are processed.

**Context**: UR-057 defers metadata fields and scoring method to the architecture phase. UR-054 requires metadata completeness to be assessed independently of text quality with a separate configurable threshold. UR-056 says partial detection is evaluated against the threshold (not all-or-nothing). The scoring method will be refined as real documents are processed (development-principles.md principle 3).

**Rationale**: Defining the interface architecturally while recommending a starting implementation gives the implementer both a clear contract and a concrete starting point. The weighted field presence approach is simple, explainable, and configurable — weights can be adjusted without code changes as the corpus grows and detection reliability is observed. Making the scoring function pluggable (behind an interface) means a more sophisticated scoring method (e.g., confidence-weighted, field-interaction-aware) can replace the simple weighted presence in a later phase without changing the rest of the pipeline.

**Options considered**:

- Simple field count ratio (all fields equal weight) — rejected as the starting recommendation because it cannot express that some fields are more reliably detectable than others; however, equal weights are a valid initial configuration if the implementer prefers to start there
- Defer entirely to implementation with no starting recommendation — rejected because it gives the implementer no starting point and may cause analysis paralysis

**Risk accepted**: Initial weights will be guesses. This is acceptable because weights are configurable and will be tuned through real-world testing. The weighted field presence approach is a starting point, not a permanent decision.

**Tradeoffs**: The pluggable interface adds a small amount of abstraction overhead compared to hardcoding a scoring formula. This is consistent with the project's Infrastructure as Configuration principle and pays off when the scoring method needs to evolve.

**Source**: Resolved in Head of Development phase, 2026-02-21. Addresses UR-057, UR-054, UR-056. Cross-references UR-052 (metadata detection fields), ADR-016 (factory pattern).

---

### ADR-022: UUID v7 for Document Identifiers

**Decision**: All system-generated document identifiers use UUID v7 (RFC 9562). Stored as the native PostgreSQL `uuid` type. Generated in both TypeScript and Python using UUID v7 libraries.

**Context**: UR-058 requires documents to be stored under a system-generated unique identifier that is never exposed to the user. The identifier is the stable internal key used throughout the system: database primary key, storage path component, chunk-to-document references (ADR-013), inter-service communication between TypeScript and Python (ADR-015). The human-readable archive reference (UR-059, UR-061) is a separate, mutable display construct.

**Rationale**: UUID v7 encodes a Unix timestamp in the most significant bits, making identifiers naturally sortable by creation time. This provides better B-tree index performance in PostgreSQL compared to random UUID v4 (monotonically increasing values avoid page splits). Time-ordering is also useful for debugging and operational queries. UUID v7 is a standard UUID format and uses the native PostgreSQL `uuid` type — no special column types or conversions required. Libraries are well-established in both TypeScript and Python.

**Options considered**:

- UUID v4 (random) — rejected because it leaves time-ordering and index performance benefits on the table with no compensating advantage
- ULID (Crockford Base32) — rejected because it is not a native PostgreSQL type (would require `text` or `char(26)` storage) and has less ecosystem support than UUID

**Risk accepted**: UUID v7 library required in both languages. This is a minor dependency; UUID v7 support is mature in both ecosystems.

**Tradeoffs**: None significant. UUID v7 is strictly superior to UUID v4 for this use case (same uniqueness guarantees plus time-ordering). The only cost is the library dependency.

**Source**: Resolved in Head of Development phase, 2026-02-21. Addresses UR-058. Cross-references ADR-013 (chunk-to-document references), ADR-015 (cross-language identifier passing).

---

### ADR-023: Archive Reference Derivation via Date and Description Concatenation

**Decision**: The human-readable archive reference is derived by concatenating date and description in the format `YYYY-MM-DD — [description]`. If no date is available, the format is `[undated] — [description]`. The derivation function is a pure utility function located in `packages/shared/` so it is available to both frontend and backend TypeScript code. The archive reference is computed at display time (not stored) and changes automatically when the underlying metadata is corrected.

**Context**: UR-061 defers the archive reference derivation rule to the architecture phase. UR-059 requires the archive reference to be derived from curated metadata at display time and to be mutable. UR-060 allows two documents to share the same archive reference (it is not a uniqueness constraint). UR-015 requires both intake routes to produce the same archive reference for the same metadata. ADR-022 establishes UUID v7 as the internal identifier; the archive reference is the human-facing complement.

**Rationale**: Date and description are the two metadata fields guaranteed to exist from Phase 1 intake (UR-002). The format mirrors the bulk ingestion naming convention (`YYYY-MM-DD - short description` per UR-014), making the archive reference immediately familiar to the archivist. The simplicity of the derivation rule means it is always producible — there is no case where the archive reference cannot be generated, since description is required (UR-010) and date is either present or falls back to `[undated]`. Placing the function in `packages/shared/` ensures a single implementation used by both the frontend (display) and backend (API responses, citations).

**Options considered**:

- Document type + date + description (structured prefix) — rejected because document type may be `Unknown` in early Phase 1 when pattern-based detection (ADR-012) is still being tuned; the `Unknown/` prefix would be visually noisy and uninformative
- Configurable template string in the runtime config file — explicitly deferred; the developer prefers to start simple and retrofit configurability only if a real need emerges; the pure function in `packages/shared/` can be replaced with a template-driven implementation later without changing any call sites

**Risk accepted**: Archive references may be generic (e.g., `1967-03-15 — Land transfer`) when multiple documents share a date and description. This is acceptable because UR-060 explicitly permits shared archive references and the internal UUID (ADR-022) is the uniqueness guarantee.

**Tradeoffs**: Does not incorporate document type, people, or land references into the reference. These fields are searchable metadata but not part of the display label. If the archivist later wants a richer reference format, the configurable template approach (deferred) can be introduced without changing the interface — only the implementation of the derivation function changes.

**Source**: Resolved in Head of Development phase, 2026-02-21. Addresses UR-061, UR-059, UR-060. Cross-references UR-002 (minimum intake fields), UR-010 (description required), UR-014 (naming convention), UR-015 (both intake routes same model), ADR-022 (UUID v7 as internal identifier).

---

### ADR-024: Embedding Interface Contract with Config-Driven Dimensions and Local-First Model

**Decision**: The embedding service is defined by an interface contract in the Python processing service: input is chunk text (string), output is a float vector of dimension N. The vector dimension N is read from the runtime configuration file and must match the selected model's output dimension. The pgvector column dimension is set from this same config value during database migration, not hardcoded in the schema. Phase 1 uses a locally-run embedding model; the specific model (current candidates include NV-Embed-v2, BGE-M3, and e5-small) is chosen by the implementer based on available hardware capability and chunk characteristics. Model selection is an implementation decision, not an architectural one.

**Context**: UR-063 requires the system to generate embeddings for each document chunk. The embedding provider must be behind an interface per UR-133 and ADR-016. The vector dimension varies by model (e.g., 384 for e5-small, 1024 for BGE-M3, 4096 for NV-Embed-v2) and is influenced by chunk size, document characteristics, and hardware constraints. Prescribing a specific model at the architecture level would be premature — the right choice depends on factors (local GPU/CPU capability, chunk quality from the chunking agent, retrieval quality on real estate documents) that are only known at implementation time.

**Rationale**: The architecture must establish the interface contract and the configuration mechanism, not the specific model. The interface contract (string in, float vector out, dimension from config) is stable regardless of which model is selected. Making the dimension config-driven rather than hardcoded in the pgvector schema means the model can be changed without a schema migration — only a re-embedding pass and config update are needed. The local-first constraint for Phase 1 reflects the project's learning goals and avoids API cost and internet dependency for a core pipeline step.

**Options considered**:

- Prescribe a specific model at the architecture level — rejected because the model choice depends on hardware capability, chunk characteristics, and retrieval quality on real documents; these are implementation-time concerns
- Hardcode the vector dimension in the pgvector schema — rejected because it couples the schema to a specific model; changing models would require a schema migration

**Risk accepted**: The implementer must ensure the config dimension matches the model's actual output dimension. A mismatch would cause runtime errors. This is acceptable because it is a single configuration value validated at startup.

**Tradeoffs**: Config-driven dimensions require the database migration to read from config rather than using a static value. This is a minor implementation complexity that pays off by decoupling the schema from the model choice.

**Source**: Resolved in Head of Development phase, 2026-02-22. Addresses UR-063. Cross-references ADR-016 (factory pattern), ADR-004 (pgvector), ADR-015 (Python service).

---

### ADR-025: LLM-Based Semantic Chunking Agent

**Decision**: Chunk boundaries are determined by an LLM that reads extracted document text and returns a list of chunks, each with boundary metadata (start position, end position, chunk type/label). The chunking service is behind a provider-agnostic interface in the Python processing service (ADR-016): input is extracted document text, output is a list of chunk objects. The LLM provider is selected via config key — the same factory pattern used for all other services. Config selects local LLM (e.g., Ollama) or API LLM (e.g., OpenAI, Anthropic). There is no fallback heuristic implementation — LLM-based chunking is the required approach.

**Context**: UR-064 requires chunk boundaries to be determined by an AI agent that reads document content and identifies semantically meaningful units, rather than by fixed-size splitting. The superseded ADR-C2-005 (heuristic chunking) was excluded precisely because it conflicted with this requirement. The chunking step sits between text extraction (ADR-011) and embedding (ADR-024) in the Component 2 pipeline. The quality of chunks directly affects retrieval quality — keeping related content (a clause, a paragraph, a named transaction) together in a single chunk produces more meaningful embeddings.

**Rationale**: An LLM can understand document structure semantically — it can identify deed clauses, letter salutations, operational log entries, signature blocks, and other estate-specific patterns that algorithmic approaches cannot reliably detect. The prompt can be refined as real documents reveal failure modes (development-principles.md principle 3). LLM output is non-deterministic, but this is acceptable because chunks are stored persistently (ADR-013) and are only regenerated on explicit re-processing, not on every query. No fallback heuristic is provided because UR-064 explicitly requires AI-driven chunking; a heuristic fallback would create a path where the requirement is silently not met.

**Options considered**:

- Embedding-based semantic chunking (split on cosine similarity drops between sliding windows) — rejected because it detects topic shifts rather than structural boundaries; cannot identify document-specific units like deed clauses or signature blocks; quality depends heavily on threshold tuning
- LLM-based with heuristic fallback — rejected because the fallback risks becoming the de facto implementation; UR-064 requires AI-driven chunking, and a heuristic fallback would silently undermine that requirement

**Risk accepted**: LLM chunking is slower and more expensive than algorithmic approaches. Acceptable because document processing is a batch operation, not real-time. The local LLM option (Ollama) eliminates API cost for Phase 1. Non-determinism between runs is acceptable because chunks are persisted and only regenerated explicitly.

**Tradeoffs**: Requires an LLM to be available during document processing. In Phase 1 with local-first operation, this means Ollama (or equivalent) must be running alongside the processing service. This adds an infrastructure dependency but is consistent with the project's AI/ML learning goals.

**Source**: Resolved in Head of Development phase, 2026-02-22. Addresses UR-064. Cross-references ADR-016 (factory pattern), ADR-013 (chunk parent references), ADR-024 (embedding interface), ADR-011 (text extraction).

---

### ADR-026: Processing Trigger via Backend API with Fire-and-Forget Semantics

**Decision**: Document processing is triggered via an Express backend API endpoint that accepts a processing request and immediately returns a processing run ID. Both the curation web UI (button) and the CLI (command) can call this endpoint — the API is the single entry point regardless of caller. The trigger is fire-and-forget in Phase 1: the caller initiates processing and moves on; there is no requirement to poll for completion or wait for results. The backend forwards the request to the Python processing service (ADR-015) via internal HTTP.

Processing scope: when triggered, the system processes all documents that have completed intake but have not yet been fully processed, plus any documents with incomplete pipeline steps that are eligible for retry (per UR-068, UR-069).

**Architectural principle — optimise for read, not write**: Query quality is the system's primary value. Processing (the write path) can take as long as it needs to produce high-quality output. This principle is what makes LLM-based chunking (ADR-025) and local embedding models (ADR-024) acceptable despite being slower than alternatives — processing is asynchronous and unattended. The archivist uploads documents, triggers processing, and returns later to curate and query. The system is not designed for real-time processing feedback.

**Phase 1 behaviour**:

- Manual trigger only (UR-070): the archivist clicks a button in the curation UI or runs a CLI command
- Fire-and-forget: the API returns the run ID immediately; the archivist does not wait
- Status polling (UI showing processing progress) is a Phase 1 enhancement candidate, not a requirement; the curation queue already shows which documents have been processed and which have not

**Phase 2 candidate — noted, not decided**: PostgreSQL LISTEN/NOTIFY triggered on document record creation is a candidate for automated processing triggers in Phase 2. This is noted as a future direction only — the decision will be made when Phase 2 scope is confirmed. The API endpoint design supports this: an automated trigger is just another caller of the same endpoint.

**Context**: UR-070 requires the processing trigger to be manual in Phase 1. UR-071 defers the trigger surface to the architecture phase. UR-067 requires each pipeline step to record its own completion status. UR-068 requires technical failures to be retried on the next processing run. UR-069 requires a configurable retry limit.

**Rationale**: A single API endpoint callable from both web UI and CLI provides maximum flexibility with minimal duplication. The fire-and-forget model matches the expected workflow: after bulk ingestion of many documents, processing may take hours (LLM chunking + local embedding for each document). The archivist should not be required to keep a browser tab open or a terminal session alive. The curation queue (which shows document status and flags) is the natural place for the archivist to observe processing outcomes, not a progress bar.

**Options considered**:

- Web UI button only — rejected because it requires the web UI to be running; no CLI-only processing path; the archivist must switch between CLI (bulk ingestion) and web UI (processing) with no scriptable option
- CLI command only — rejected because it forces the archivist to leave the web UI to trigger processing; disjointed workflow for web UI uploads

**Risk accepted**: Fire-and-forget means the archivist has no immediate feedback on processing progress in Phase 1. This is acceptable because the curation queue shows document status (processed, flagged, pending) and the system is designed for asynchronous operation. Status polling may be added as a Phase 1 enhancement if the lack of feedback proves problematic in practice.

**Tradeoffs**: Two callers (web UI button and CLI command) for one endpoint adds a small amount of implementation work. This is offset by the flexibility it provides and the fact that both callers are thin wrappers around the same HTTP call.

**Source**: Resolved in Head of Development phase, 2026-02-22. Addresses UR-070, UR-071. Cross-references ADR-015 (Python service boundary), ADR-024 (local embedding), ADR-025 (LLM chunking), UR-067 (step completion tracking), UR-068 (retry on failure), UR-069 (retry limit).

---

### ADR-027: Pipeline Re-entrancy via Per-Document Step Status Table and Pipeline Version

**Decision**: Pipeline state is tracked through two complementary mechanisms:

1. **Per-document step status table** (`pipeline_steps`): one row per document per pipeline step. Each row records: step name (enum), status (`pending`, `running`, `completed`, `failed`), attempt count, last error message, and timestamps (created, started, completed). Step names are defined as an enum in `packages/shared/` to keep the schema and application code in sync.

2. **Pipeline version marker**: each document record includes a `pipeline_version` integer that tracks which version of the step definitions was used to process the document. The current pipeline version is a configurable value. Documents at a version lower than the current version are eligible for enrichment reprocessing.

**Processing behaviour**:

- When processing is triggered (ADR-026), the system queries for documents with incomplete steps (any step not in `completed` status) and resumes from the first incomplete step per document
- Failed steps remain at `failed` status with an incremented attempt count. The next processing run retries them up to the configurable retry limit (UR-069). When the limit is exceeded, the document is flagged and surfaced in the curation queue
- A step that ran successfully is marked `completed` even if its output failed a quality threshold (UR-067) — the quality outcome is recorded separately; the step status tracks technical completion only
- Documents are absent from the search index until the embedding step completes successfully (UR-065) — this is enforced by checking the embedding step's status, not a separate visibility flag

**Enrichment reprocessing** (Phase 4+):

- When vocabulary or domain context changes warrant re-processing, a new pipeline version is published (the configurable version value is incremented)
- A "reprocess" command selects documents at the old version and resets specific steps to `pending` (e.g., reset chunking and embedding while keeping extraction)
- The next processing trigger picks up these documents and re-runs the reset steps
- This is the same processing path as first-run processing — no separate reprocessing pipeline is needed

**Context**: UR-075 requires the pipeline to be re-entrant by design to support enrichment reprocessing without a full rewrite. UR-067 requires independent step completion tracking. UR-068 requires retry on technical failure. UR-069 requires a configurable retry limit. UR-065 requires documents to be invisible to search until embedding completes.

**Rationale**: The step status table provides fine-grained visibility into each document's pipeline progress and enables precise retry from the correct step. The pipeline version marker future-proofs the enrichment reprocessing path: when the vocabulary grows or chunking prompts improve, documents can be batch-selected for reprocessing without a schema migration. This is more complex than a simple stage counter (Option B) but avoids the rigidity of sequential numbering and directly supports the re-entrancy requirement. The developer chose this approach deliberately — the version marker adds minimal schema cost now and avoids a disruptive migration when enrichment reprocessing is implemented in Phase 4+.

**Options considered**:

- Per-document step status without pipeline version (Option A) — rejected because it provides no mechanism to distinguish first-run processing from enrichment reprocessing; batch-selecting documents for reprocessing would require a separate tracking mechanism added later
- Single pipeline stage column with monotonic numbering (Option B) — rejected because it cannot represent partial step completion, parallel steps, or flexible step ordering; step numbering is fragile if the pipeline evolves

**Risk accepted**: The step status table adds schema complexity (one row per step per document rather than a single status column). For the expected document volume (tens of thousands), this is well within PostgreSQL's comfort zone. The pipeline version concept is unused in Phase 1 — it is scaffolding for Phase 4+. This is a deliberate exception to UR-137's prohibition on unused future fields: the version marker is a single integer column with a clear, documented purpose, not speculative multi-tenancy infrastructure.

**Tradeoffs**: More queries required to determine a document's full pipeline state compared to a single status column. Mitigated by indexing the step status table on (document_id, step_name) and by the fact that pipeline state queries are infrequent relative to query workload (ADR-026's "optimise for read, not write" principle).

**Source**: Resolved in Head of Development phase, 2026-02-22. Addresses UR-075, UR-067, UR-068, UR-069, UR-065. Cross-references ADR-026 (processing trigger), ADR-025 (LLM chunking), ADR-024 (embedding).

---

### ADR-028: Vocabulary Schema with Normalised Relationships and Knex.js for Migrations and Seeding

**Decision**: Vocabulary storage uses three tables with referential integrity, and Knex.js is the migration and seeding tool for the TypeScript backend.

**Schema**:

1. **`vocabulary_terms`**: `id` (UUID v7), `term` (text), `category` (text), `description` (text), `aliases` (text array), `normalised_term` (generated column — lowercase, punctuation stripped), `source` (enum: `seed`, `manual`, `candidate_accepted`), `created_at`, `updated_at`

2. **`vocabulary_relationships`** (join table): `source_term_id` (FK to vocabulary_terms), `target_term_id` (FK to vocabulary_terms), `relationship_type` (text). Foreign keys provide referential integrity — deleting a term cascades or raises an error on dangling relationships. Enables bidirectional relationship queries without JSONB traversal.

3. **`rejected_terms`**: `id` (UUID v7), `normalised_term` (text, unique), `original_term` (text), `rejected_at` (timestamp)

**Seeding**: Initial vocabulary content is delivered via Knex.js seed files (`knex seed:run`). Seeds are idempotent — Knex handles re-run safety. The seed file provides the initial estate-specific vocabulary (terms, categories, descriptions, aliases, relationships) so the system starts with a functional vocabulary rather than an empty one. Seed content is version-controlled alongside the migration files.

**Migration tool**: Knex.js is the database migration tool for all schema changes. Migrations are written in JavaScript/TypeScript, run via `knex migrate:latest`, and tracked in a `knex_migrations` table. This also resolves UR-138 (database migration strategy) — Knex.js migrations support additive schema changes at phase boundaries without destructive migrations. See ADR-029 for the full migration strategy.

**Context**: UR-086 requires the database to be initialised from a seed script with initial vocabulary content. UR-088 defines the minimum record structure (term, category, description, aliases, relationships). UR-093 requires normalised deduplication against both accepted vocabulary and rejected terms. ADR-014 establishes human-in-the-loop vocabulary management.

**Rationale**: The normalised relationships join table provides referential integrity from the start, avoiding the need to migrate from JSONB relationships later. For vocabulary data (hundreds to low thousands of terms), the join table adds negligible query overhead. Knex.js is a natural fit: it provides both migration and seeding capabilities in a single tool, uses the same language as the backend (TypeScript/JavaScript), and its migration tracking table prevents re-running completed migrations. The seed mechanism is separate from migrations — migrations handle schema, seeds handle initial data — which is a clean separation of concerns.

**Options considered**:

- JSONB relationships column instead of join table — rejected because it sacrifices referential integrity; a deleted term could leave dangling relationship references in JSONB; bidirectional queries require JSONB traversal rather than simple JOINs
- SQL migration files for seed content (INSERT statements in a numbered migration) — rejected because it conflates schema changes with data initialisation; seed data may need to be re-applied in development environments without re-running all migrations; Knex seed files provide idempotent data loading as a separate concern

**Risk accepted**: The relationships join table adds schema complexity for a feature that may see light use in Phase 1 (relationships between vocabulary terms are primarily useful for query enrichment in Phase 2+). This is acceptable because the join table is simple (three columns), the referential integrity it provides prevents data corruption from the start, and retrofitting it later would require a data migration from JSONB.

**Tradeoffs**: Knex.js is an additional dependency. However, raw SQL migrations would require building migration tracking and idempotent seeding from scratch — Knex provides both out of the box. The seed files must be maintained as the vocabulary evolves, but this is inherent to any seeding approach.

**Source**: Resolved in Head of Development phase, 2026-02-22. Addresses UR-086, UR-088, UR-093. Cross-references ADR-014 (human-in-the-loop vocabulary), ADR-022 (UUID v7), ADR-004 (PostgreSQL). Also partially addresses UR-138 (migration strategy); see ADR-029 for full treatment.

---

### ADR-029: Additive-Only Database Migration Policy via Knex.js

**Decision**: All schema changes across phase boundaries use Knex.js migrations (tool selected in ADR-028) and follow an additive-only policy:

1. **Add columns, tables, and indexes** — always permitted
2. **Rename columns** — permitted via migration; Knex tracks the rename
3. **Drop columns or tables** — prohibited unless the column/table has been confirmed unused for at least one full phase cycle; the migration must include a comment citing the phase where the column was deprecated
4. **Change column types** — permitted only via add-new-column + backfill + drop-old-column (three-step migration), never via in-place ALTER TYPE on a column with existing data
5. **pgvector dimension changes** — handled via config-driven dimension (ADR-024); changing the embedding model requires a re-embedding pass, not a schema migration

Migrations are numbered sequentially and run via `knex migrate:latest` at application startup or as a separate deployment step. Each migration is idempotent — Knex tracks which migrations have been applied in its `knex_migrations` table.

**Context**: UR-138 requires the data model to support adding fields at phase boundaries without destructive schema migrations. ADR-028 selected Knex.js as the migration tool. This ADR establishes the policy governing how migrations are written.

**Rationale**: An additive-only policy ensures that existing data is never at risk from a schema change. The three-step pattern for type changes (add, backfill, drop) keeps the database functional throughout the migration — there is no window where a column is in an intermediate state. Prohibiting column drops except after a full deprecation cycle prevents accidental data loss. This policy is simple to follow and does not require tooling beyond what Knex provides.

**Options considered**:

- No formal policy (rely on developer discipline) — rejected because the project spans multiple phases with long pauses between them; a documented policy prevents mistakes when context is re-established after a break
- Automated migration validation (CI lint for destructive operations) — deferred; may be added if the policy proves insufficient, but for a single-developer project the documented policy is adequate

**Risk accepted**: The additive-only policy means the schema accumulates deprecated columns until they are explicitly dropped. For this project's scale (tens of tables, not hundreds), this is not a maintenance burden.

**Tradeoffs**: Three-step type changes are more work than in-place ALTER TYPE. This is acceptable because type changes are rare and the three-step approach is safer.

**Source**: Resolved in Head of Development phase, 2026-02-22. Addresses UR-138. Cross-references ADR-028 (Knex.js tool selection), ADR-024 (config-driven vector dimensions).

---

### ADR-030: Database Backup via Docker Volume Snapshots with Recommended pg_dump Supplement

**Decision**: Database backup is an operational concern outside the application's responsibility. The architecture documents what must be backed up and recommends a backup approach but does not implement backup commands within the application.

**What must be backed up**:

1. **PostgreSQL Docker volume** — contains all relational data: document metadata, vocabulary terms and relationships, rejected terms, pipeline step status, processing run records, and vector embeddings (pgvector). This is the critical data store.
2. **File storage directory** — contains the original uploaded documents. In Phase 1 this is a local filesystem directory (ADR-008); in later phases it may be S3 (behind the StorageService interface).

**Recommended backup approach**:

- **Primary**: Docker volume snapshots covering both the PostgreSQL data volume and the file storage volume. This is operationally simple and consistent with the Docker Compose local development setup — a single snapshot operation captures both data stores.
- **Recommended supplement**: Periodic `pg_dump` for a transactionally consistent database backup. Docker volume snapshots taken while PostgreSQL is actively writing may capture the data directory in an inconsistent state. `pg_dump` produces a logically consistent snapshot regardless of concurrent writes. This is recommended as good practice alongside volume snapshots but is not mandated by the application.

**What the application does NOT do**:

- No application-level backup commands (no `estate backup` CLI)
- No backup scheduling — this is an external operational concern (cron, manual, etc.)
- No backup verification or restore tooling within the application

**Context**: UR-136 states that regular database backups are assumed to protect vocabulary data and that backup implementation is outside the application's direct responsibility. This ADR documents the architectural stance: the application is backup-friendly (single PostgreSQL instance, standard file storage) but does not implement or manage backups.

**Rationale**: The application's data stores (PostgreSQL + local filesystem) are both standard, well-understood targets for backup tooling. Building backup commands into the application would add complexity for something that `pg_dump` and `docker volume` commands already handle. The architecture's contribution is documenting what must be backed up and flagging the transactional consistency risk of volume-only snapshots.

**Risk accepted**: The developer must remember to set up backups outside the application. There is no in-app reminder or health check for backup recency. This is acceptable for a single-developer project where the developer is also the operator.

**Tradeoffs**: No single-command backup experience. The developer must run `pg_dump` and volume snapshot commands separately (or script them). This is offset by the simplicity of not maintaining backup code within the application.

**Source**: Resolved in Head of Development phase, 2026-02-22. Addresses UR-136. Cross-references ADR-004 (PostgreSQL), ADR-008 (local filesystem storage).

---

### ADR-031: Express as Sole Database Writer with RPC-Style Processing Contract

**Decision**: The Express backend is the sole component with database write access. All other components interact with data exclusively through the Express API. The Python processing service has no direct database connection.

**Component write ownership**:

| Component | DB Access | Writes To |
| --- | --- | --- |
| Express backend | Read + Write | `documents`, `ingestion_runs`, `pipeline_steps`, `chunks`, `embeddings`, `vocabulary_candidates`, `vocabulary_terms`, `vocabulary_relationships`, `rejected_terms` |
| Python processing service | None | Returns results to Express via HTTP/RPC |
| Next.js frontend | None | Read-only via Express API |
| C3 Query and Retrieval | None | Read-only via Express API |
| C4 Continuous Ingestion | None | Write access via Express API (same pattern as C1) |

**Express-to-Python processing contract**: The boundary between Express and the Python processing service is an RPC-style contract. Express sends a processing request (document ID, file location or file content); Python performs OCR, chunking, embedding, metadata extraction, vocabulary candidate identification, and quality scoring; Python returns the complete set of processing outputs to Express in a single structured response. Express then writes all outputs to the database within a transaction, ensuring that either all processing results for a document are persisted or none are.

**Contract technology**: The specific RPC technology is an implementation decision, not an architectural one. Candidates include tRPC with a generated Python client (tRPC is TypeScript-native; the Python side would use the HTTP adapter or a generated SDK), OpenAPI with code generation for both sides, or plain REST with shared type definitions. The architecture requires only that the contract is typed and that both sides can validate requests and responses against a shared schema. The implementer selects the technology based on developer experience and tooling maturity at implementation time.

**Schema enforcement**: All schema knowledge lives in the Express backend (Knex.js migrations, ADR-028/ADR-029). Python has no awareness of database tables, column names, or schema versions. This means schema changes never require coordinated changes in two services — only the Express backend needs to be updated. The Python processing service is a pure function: document in, processing results out.

**Transaction boundaries**: Because Express is the sole writer, it can wrap related writes in database transactions:

- **Intake transaction**: document record creation + file metadata + hash check (ADR-017 finalize step)
- **Processing results transaction**: chunks + embeddings + pipeline step status updates + vocabulary candidates + quality scores for a single document — all written atomically
- **Vocabulary curation transaction**: term acceptance/rejection + alias updates + rejected list updates

No cross-service transactions are needed because only one service writes.

**Context**: The system has two runtime services (Express and Python) that both need to interact with the database. ADR-015 establishes the service boundary. ADR-026 establishes fire-and-forget processing semantics. ADR-027 defines pipeline step status tracking. This ADR determines which service owns database writes and how the boundary between them works.

**Rationale**: Centralising all writes in Express eliminates an entire class of problems: schema drift between two writers, cross-service transaction coordination, duplicate connection pool management, and the need for Python to track Knex.js migration state. Python becomes a stateless processing engine — it receives input, produces output, and has no persistent state of its own. This is architecturally clean and operationally simple. The cost (larger HTTP payloads for embedding vectors) is acceptable because the Express-to-Python boundary is internal (same Docker network, not internet) and processing is not latency-sensitive (ADR-026's "optimise for read, not write" principle).

**Options considered**:

- Both services write to the database (Python writes processing outputs directly) — rejected because it creates two database writers with separate connection pools, requires Python to have schema awareness, and makes cross-service transaction boundaries impossible; schema drift risk increases with every migration
- Hybrid (Python writes pipeline status only, Express writes everything else) — rejected because even a single shared table between two writers introduces coordination requirements; the marginal benefit (real-time status updates from Python) does not justify the complexity; Python can report step status in its HTTP response and Express can write it

**Risk accepted**: Processing results for a document with many chunks and high-dimensional embeddings produce a large HTTP response payload. For a document with 100 chunks at 1024 dimensions, the embedding data alone is approximately 400 KB (100 x 1024 x 4 bytes). This is well within HTTP payload limits and acceptable for an internal service call on a local network.

**Tradeoffs**: Pipeline step status updates are not written until Python returns its response to Express. This means the `pipeline_steps` table does not reflect real-time progress during processing — it is updated after each document completes, not after each step within a document. For Phase 1 this is acceptable because the curation queue shows document-level status and the fire-and-forget model (ADR-026) does not require real-time progress visibility.

**Source**: Resolved in Head of Development phase, 2026-02-22. Addresses data ownership and transaction boundaries. Cross-references ADR-015 (Python service boundary), ADR-026 (fire-and-forget semantics), ADR-027 (pipeline step status), ADR-028 (Knex.js), ADR-029 (migration policy).

---

### ADR-032: Python Testing via Interface-Driven Mocking with Fixture Documents

**Decision**: The Python processing service (`services/processing/`) is tested using interface-driven mocking for unit tests and fixture documents for integration tests. pytest is the test runner.

**Unit tests**:

- Mock the provider interfaces (OCR, LLM chunking, embedding) using `unittest.mock` or pytest fixtures
- The factory pattern (ADR-016) makes mock injection straightforward — tests pass a mock config value that selects a mock implementation, or inject the mock directly via the abstract base class interface
- Unit tests are fast, deterministic, and run without external dependencies (no OCR engine, no LLM, no embedding model)
- Each pipeline step (extraction, chunking, embedding, metadata detection, vocabulary candidate identification, quality scoring) is tested independently with controlled inputs and expected outputs

**Fixture documents**:

- A `fixtures/` directory in `services/processing/` contains a small set of representative estate documents with known-good expected outputs per pipeline step
- Fixture documents cover the Phase 1 document types: scanned typewritten PDF, modern digital PDF, scanned TIFF, scanned JPEG/PNG
- Each fixture includes the expected output at each pipeline step (expected extracted text, expected chunk boundaries, expected embedding dimensions, expected metadata fields)
- Fixtures are version-controlled alongside the processing code

**Integration tests**:

- Use real provider implementations (Docling, Ollama, local embedding model) against fixture documents only
- Marked with `@pytest.mark.integration` for selective execution — not run on every commit
- Validate that real providers produce outputs matching the expected structure (not exact content, since LLM chunking is non-deterministic per ADR-025)
- No database fixtures needed — Python has no database connection (ADR-031)

**What is not adopted**:

- Contract tests at the Express-Python boundary (Option B) — noted as a Phase 1 enhancement candidate if the lack of boundary validation proves problematic; the typed RPC contract (ADR-031) provides some structural safety
- Snapshot testing for LLM outputs (Option C) — not adopted because LLM output is non-deterministic (ADR-025); snapshot tests would produce false failures without a tolerance mechanism that adds complexity disproportionate to its value

**Context**: The Python processing service depends on external services (OCR engines, LLMs, embedding models) that are slow, non-deterministic, or require specific hardware. ADR-016 establishes provider-agnostic interfaces. ADR-031 establishes that Python has no database connection. ADR-025 acknowledges LLM non-determinism. The testing strategy must enable fast, reliable unit tests while still validating real provider behaviour selectively.

**Rationale**: Interface-driven mocking is the natural testing approach given the factory pattern architecture — every external dependency is already behind an abstract base class, so swapping in a mock is a single-line change. Fixture documents provide realistic inputs without requiring the full estate archive. The `@pytest.mark.integration` marker gives the developer control over when slow tests run. Not adopting contract tests or snapshot tests keeps the testing infrastructure simple for Phase 1 — both can be added later if the need emerges from real integration failures.

**Risk accepted**: Fixture documents may not represent the full diversity of the estate archive. Real-world failure modes (unusual document layouts, degraded scans, unexpected formatting) are discovered during real-document processing, not in tests. This is acceptable because development-principles.md principle 3 requires real-world testing from day one — the fixture-based tests complement, not replace, real-document testing.

**Tradeoffs**: No automated validation of the Express-Python contract boundary. If the RPC schema changes on one side without the other, the mismatch is caught at runtime, not in tests. This is acceptable for a single-developer project where both sides are changed by the same person.

**Source**: Resolved in Head of Development phase, 2026-02-22. Addresses testing strategy for Python components. Cross-references ADR-016 (factory pattern), ADR-031 (no DB connection), ADR-025 (LLM non-determinism), ADR-015 (pytest as test runner).

---

### ADR-033: VectorStore Interface in Express

**Decision**: All vector store operations (write embeddings, similarity search) are accessed
through a `VectorStore` interface in the Express backend. The pgvector implementation is the
Phase 1 concrete implementation. No component calls pgvector SQL directly — all calls go
through the interface.

**Context**: ADR-004 selects pgvector as the Phase 1 vector store, but the developer has
identified that migrating to a dedicated vector database (e.g. OpenSearch) must be possible
without rewriting C2 or C3. ADR-001 requires all external services to be behind an
abstraction, and the original ADR-004 did not define what that abstraction looks like or
where it lives. This ADR closes that gap.

**Rationale**: Placing the interface in Express is consistent with ADR-031 (Express is the
sole database writer and reader) and keeps the network topology simple — no additional
service hop is introduced. C2 sends embeddings to Express via the existing HTTP/RPC channel;
Express writes them through the `VectorStore` interface. C3 calls `vectorStore.search()`
through the same interface. Swapping pgvector for OpenSearch means replacing one
implementation class and updating the config key — C2 and C3 are unchanged.

**Interface contract**:

- `write(documentId, chunkId, embedding: float[]): Promise<void>`
- `search(queryEmbedding: float[], topK: number, filters?: object): Promise<SearchResult[]>`

The implementation is selected by config key, following the factory pattern (ADR-016).

**Options considered**:

- Dedicated Python vector service — rejected because it adds a network hop on every query,
  complicates the data ownership boundary (ADR-031), and prevents efficient joins between
  relational metadata and vector results when using pgvector
- No interface (direct pgvector SQL everywhere) — rejected because it violates ADR-001 and
  makes the pgvector → OpenSearch migration a global find-and-replace

**Risk accepted**: The interface must remain stable as new backends are added. If a future
vector DB requires a fundamentally different search API (e.g. ANN index hints), the interface
may need extending. This is acceptable — interface evolution is lower-cost than a global
rewrite.

**Tradeoffs**: Cross-store joins (relational metadata + vector results in one SQL query) are
only possible with the pgvector implementation. If a dedicated vector DB is adopted in Phase
4, similarity search results must be fetched from the vector store first, then joined to
relational data in application code. This is a known tradeoff accepted at migration time,
not now.

**Source**: Resolved in Head of Development phase, 2026-02-22. Addresses UR-133 (provider-
agnostic interfaces). Cross-references ADR-001 (Infrastructure as Configuration), ADR-004
(pgvector selection), ADR-016 (factory pattern), ADR-031 (Express as sole DB writer).
