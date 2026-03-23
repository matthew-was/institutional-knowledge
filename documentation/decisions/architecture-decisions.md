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

**Revision note [Extended by ADR-044 and ADR-045, 2026-02-28]**: Next.js routes to two
backend services, not one. Data operations (C1 intake, C2 trigger, curation, reads) are
forwarded to Express. C3 query requests (web UI path) are forwarded directly to the Python
processing service, bypassing Express. The original principle is unchanged — neither Express
nor Python is internet-accessible; all external requests enter through Next.js. ADR-044
records the custom server requirement and shared-key internal trust model. ADR-045 records
the C3 query routing decision.

**Risk accepted**: Two-hop latency. Acceptable for document upload workflow (not real-time).

**Source**: Carried forward from pre-approval ADR-003 (revised). Consistent with UR-121, UR-124. Extended by ADR-044, ADR-045.

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
if needed — C2 requires no changes; the `VectorStore` interface implementation in Express
may require changes to handle application-level joins when pgvector is replaced by a
dedicated vector DB; C3 query logic in the Python service is unaffected (it calls the
`VectorStore` interface and is agnostic to the underlying implementation — see ADR-033
Tradeoffs).

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

**Clarification**: These components are functional groupings of related features, not service
or structural boundaries. In practice, both the Next.js frontend and Express backend are
cross-cutting systems that serve multiple components (intake, curation, query). The Python
processing service maps to a single dedicated service, hosting both Component 2 (processing
pipeline) and Component 3 (query module) as separate internal modules (`pipeline/` and
`query/`) — see ADR-042. Curation — the document queue, vocabulary queue, flag management,
and metadata correction — is a cross-cutting concern within the frontend and backend that does
not belong to any single component. See ADR-015 for the actual service architecture.

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

### ADR-007: Upload Flow with Four-Status Lifecycle for Atomicity [Revised]

**Decision**: Document upload uses four statuses tracking a file through three API calls:

1. **Initiate**: create database record with status `initiated`, get upload ID
2. **Upload**: binary file transfer to a staging area (not the permanent storage location);
   status updated to `uploaded`
3. **Finalize**: move file from staging to permanent storage, validate hash, update status to
   `stored`; once all files in the submission are `stored` and metadata is confirmed, status
   updated to `finalized`

Statuses: `initiated` (record created, no file), `uploaded` (file in staging), `stored` (file
in permanent storage), `finalized` (submission complete). For a single-file web UI upload,
`stored` and `finalized` occur in quick succession but are distinct steps. For bulk ingestion,
`finalized` applies only once all files in the run reach `stored` (see ADR-018).

**Context**: UR-008 requires web UI upload to be atomic — if interrupted, nothing is stored.

**Rationale**: Ensures rollback is available at every stage of the upload. Files in the staging
area are isolated from permanent storage until the Finalize step succeeds — if any step fails
or the upload is interrupted, the incomplete upload can be cleaned up without affecting permanent
storage. Explicit hash check at finalize step. Separates metadata creation from file storage.
Each step can be validated independently at the Next.js boundary. See ADR-017 for the full
atomicity mechanism including startup sweep.

**Revision note**: Original pre-approval ADR-C1-001 revised three times. First revision removed
tRPC reference. Second revision (2026-02-21) made the staging area explicit in the Upload step
and added the status column lifecycle (`initiated` to `uploaded` to `finalized`) (superseded by the four-status model introduced in the third revision). Third revision
(2026-02-23) introduced a `stored` status between `uploaded` and `finalized` to distinguish
files that have reached permanent storage from those still in staging, enabling precise cleanup
after a crash mid-move. Cross-references ADR-017 for the complete atomicity mechanism.

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
staging area files, database records not in `finalized` status, and any associated stored files
(including files that reached permanent storage with status `stored` — these must be deleted
from permanent storage before their DB records are removed; see ADR-017 for the status-specific
cleanup mechanism).
No partial state persists. The staging area (see ADR-017) is part of the cleanup scope.

**Context**: UR-008 (upload atomicity) and UR-018 (bulk ingestion atomicity) require that
interrupted operations leave no trace.

**Rationale**: Prevents orphaned records and storage waste. Simplifies retry logic (retry from
scratch). Consistent with the atomicity requirements. The staging area provides a clean
separation between in-progress and completed uploads, making cleanup straightforward — wipe
staging plus delete non-finalized records.

**Revision note**: Revised 2026-02-21 to make the staging area explicit as part of the cleanup
scope and to reference the status column lifecycle from ADR-007/ADR-017.

For bulk ingestion, immediate cleanup applies when the system halts gracefully on a known
error. If the process is killed or crashes before cleanup can occur, the run-start sweep at
the beginning of the next run handles the deferred cleanup (ADR-018). The run-start sweep is
a fallback for ungraceful termination, not a replacement for immediate cleanup.

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
via rule-based pattern matching. LLM-assisted classification deferred to Phase 2. See ADR-036
for the planned merge of pattern-based metadata extraction into the chunking LLM step.

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

**Revision note [Revised by ADR-038, 2026-02-23]**: The separate vocabulary candidate
identification step has been removed from the C2 pipeline. Vocabulary candidates are now
extracted by the LLM combined pass (ADR-038) and land directly in the `vocabulary_terms` table
with `source: llm_extracted`. The human-in-the-loop review queue and rejection workflow are
unchanged — LLM-extracted entities appear in the same review queue as any other candidate.
The `vocabulary_candidates` table concept is replaced by the `llm_extracted` source enum value
on `vocabulary_terms`.

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

**Decision**: Python processing code lives at `services/processing/` within the monorepo and runs as a separate Docker container. It communicates with the TypeScript backend via internal HTTP. Each service has its own runtime configuration file containing only the values it requires. The files share the same format (nconf-style) but are scoped per service — Express receives database credentials, storage config, and backend settings; the Python processing service receives only processing-related config (OCR, LLM, embedding providers and thresholds). This follows the principle of least privilege: a compromised processing service has no access to database connection parameters. The Python config library choice is deliberately left open as a learning exercise.

**Context**: Component 2 (Text Extraction, Processing and Embedding) uses Python for OCR and AI/ML work. The rest of the system is TypeScript/Node.js with pnpm workspaces. The developer needs to decide how Python code coexists with TypeScript in the monorepo and how configuration reaches both languages.

**Rationale**: A separate Docker service provides clean process isolation while keeping all code co-located in a single repository. Internal HTTP gives a natural service boundary where the provider-agnostic interface pattern operates. This approach supports the learning goals (development-principles.md principle 5) by giving Python substantial scope rather than reducing it to thin CLI wrappers. The nconf-style runtime config injection pattern (config stored as a file, loaded at runtime, not baked in at build time) satisfies UR-134 (operational values read from config file, not hardcoded or env-vars-only). Each language uses its own idiomatic config reader against a shared config file format, keeping both sides aligned on a single source of truth.

**Options considered**:

- Python as thin CLI wrappers called from Node.js — rejected because it undermines the Python learning goals and creates coupling (TypeScript must know about Python provider options)
- Python in a separate repository — rejected because it adds coordination overhead with no benefit for a single developer; breaks co-located documentation and shared Docker Compose

**Risk accepted**: Internal HTTP boundary adds latency and failure modes (service unavailable, timeout) compared to in-process calls. Acceptable because document processing is not latency-sensitive and the failure modes are straightforward to handle with retries and health checks.

**Tradeoffs**: Two configuration readers to maintain (one per language); two scoped config files to maintain; internal API contract required between TypeScript and Python services; two test runners (Vitest and pytest).

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

**Rationale**: Factory functions are simple, explicit, and debuggable. Each service's config file is its control plane for provider selection — config files are scoped per service and no service receives configuration it does not need (see ADR-015). Each factory is a self-contained mapping from config key to implementation, easy to test by passing a different config value. The ADR-001 configuration hierarchy (CLI args, env vars, Docker runtime config, local runtime, package defaults) remains valid as an override mechanism — env vars can override specific config values, but the config file is the base layer.

**Options considered**:

- Dependency injection container (tsyringe/dependency-injector) — rejected because it adds framework complexity and learning overhead not aligned with the AI/ML learning goals; obscures which implementation is active
- Environment-variable-driven with config file fallback — rejected because it carries drift risk toward the pattern UR-134 explicitly prohibits (env-vars-only)

**Risk accepted**: Factory functions must be updated when new providers are added. This is acceptable because adding a provider is a deliberate act requiring new adapter code regardless.

**Tradeoffs**: Slightly more boilerplate per service (one factory function + one config key) compared to a DI container. This is offset by clarity and debuggability.

**Source**: Resolved in Head of Development phase, 2026-02-21. Addresses UR-133, UR-134.

---

### ADR-017: Upload Atomicity via Staging Area and Database Status Tracking

**Decision**: Upload atomicity is implemented through a combination of a file staging area and a database status column with four states. The mechanism works as follows:

1. **Initiate**: creates a database record with status `initiated`
2. **Upload**: file is written to a staging area (a temporary location separate from permanent storage); database status updated to `uploaded`
3. **Store**: file is moved from staging to permanent storage; hash is validated; database status updated to `stored`
4. **Finalize**: once all files in the submission are `stored` and metadata is confirmed, status updated to `finalized`
5. **Startup sweep**: on application startup, the backend performs status-based cleanup:
   - `initiated` or `uploaded` — delete DB record; remove file from staging if present
   - `stored` but not `finalized` — delete file from permanent storage and delete DB record (interrupted mid-finalize)
   - `finalized` — complete, no cleanup needed

The `stored` status distinguishes files that have reached permanent storage from those still in staging. This is critical for cleanup: without it, a crash during the move step leaves files in permanent storage with no way to identify them as incomplete. See ADR-007 for the status definitions.

**Context**: UR-008 requires web UI upload to be atomic — if interrupted, nothing is stored. ADR-007 defines the upload flow and four-status lifecycle. ADR-010 defines the cleanup policy. This ADR specifies the concrete mechanism that ties them together: where files land during upload, how the database tracks progress, and what happens on recovery.

**Rationale**: The staging area provides file-level isolation — in-progress uploads never exist in the permanent storage location, so permanent storage always reflects only completed uploads. The database status column provides record-level tracking — the system can identify incomplete uploads at any time. The startup sweep handles the case where the server itself crashes between steps. Combined, these mechanisms give both database atomicity and file storage atomicity without requiring long-running database transactions (which would hold locks and cannot roll back file operations anyway).

**Options considered**:

- Database transaction wrapping the entire flow — rejected because file storage is outside the transaction boundary; files written to disk are not rolled back by a database rollback; also holds locks for the duration of the upload
- Database status column without staging area — rejected because files in permanent storage would need to be identified and removed individually during cleanup; the staging area makes cleanup a simple wipe operation

**Risk accepted**: The file move from staging to permanent storage (Store step) could fail (disk full, permissions). If the move succeeds but the status update to `stored` fails, the file exists in permanent storage but the record still reads `uploaded` — the startup sweep will delete the DB record and wipe staging, but the orphaned file in permanent storage must be identified and removed. This is a narrow edge case (crash between filesystem move and DB write) and is accepted as low-probability. The move operation is a single filesystem call and is unlikely to leave a half-state.

**Tradeoffs**: Slightly more complex storage logic (two locations instead of one). This is offset by the simplicity and reliability of the cleanup mechanism.

**Source**: Resolved in Head of Development phase, 2026-02-21. Addresses UR-008. Cross-references ADR-007 (three-step flow), ADR-010 (cleanup policy).

---

### ADR-018: Bulk Ingestion Atomicity via Run-Level Staging and Run ID Tracking

**Decision**: Bulk ingestion atomicity is implemented through a run-specific staging directory combined with a run ID in the database. The mechanism works as follows:

1. **Run start**: generate a unique run ID; create a run record in the database with status `in_progress`; create a run-specific staging directory
2. **Per-file processing**: each file accepted during the run is written to the run's staging directory; each per-file database record is tagged with the run ID and has status `uploaded` (per ADR-007/ADR-017 status model)
3. **Run completion**: move files individually from the run's staging directory to permanent storage, updating each file's status to `stored` as it is moved; run status transitions to `moving` during this phase; once all files are `stored` and the summary report is written, each file's status is updated to `finalized` and the run status transitions to `completed`
4. **Run-start sweep** (per UR-019): at the start of every ingestion run, before any new work is accepted, the system checks for any prior run not in `completed` status; cleanup is status-aware:
   - Files with status `initiated` or `uploaded` — delete DB record; remove from staging if present
   - Files with status `stored` (run interrupted before `finalized`) — delete from permanent storage and delete DB record
   - Run staging directory is removed
   - Run record is deleted

The per-file `stored` status is critical for bulk cleanup: it identifies exactly which files reached permanent storage during an interrupted move, avoiding the need to scan permanent storage by convention. This uses the same four-status model defined in ADR-007 and ADR-017.

**Context**: UR-018 requires bulk ingestion to be atomic — if interrupted, no files from the interrupted run are stored. UR-019 requires cleanup at the start of every run. UR-020 requires no summary report for an interrupted run. The report file is created at run start but remains empty until the run completes — an empty file signals an interrupted run. A config flag (`ingestion.partialAuditReport`) enables per-file streaming output during development; in default mode the file is only written at the `completed` transition. The run-start sweep is the fallback for ungraceful termination (process killed or crashed). When the system halts gracefully on a known error, immediate cleanup occurs before the process exits, consistent with ADR-010. This ADR applies the same staging + status tracking pattern from ADR-017 at the run level rather than the individual upload level.

**Rationale**: The run-specific staging directory provides file-level isolation — files from an in-progress run never exist in permanent storage until the move phase begins. The run ID in the database provides record-level tracking — all artifacts of an incomplete run can be identified and removed in a single sweep. The per-file status (`uploaded`, `stored`, `finalized`) combined with the run-level status (`in_progress`, `moving`, `completed`) provides precise cleanup: the sweep knows exactly which files are in staging, which reached permanent storage, and which are fully complete. This is architecturally consistent with ADR-017 (same four-status model at both file and run level).

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

**Rationale**: Creating the directory and opening the report file before any ingestion work begins provides a fail-fast guarantee — the user learns immediately if the report path is misconfigured, before any processing time is spent. In default mode, the file is opened at run start but written only when the run completes, consistent with the atomicity guarantee. The `ingestion.partialAuditReport` config flag enables streaming-append mode for development, where per-file outcomes are written incrementally — useful for diagnosing failures without waiting for a full run.

**Options considered**:

- Abort run on directory creation failure (create at start, batch write at end) — rejected because a batch write at the end loses the entire report if the process is killed after processing many files
- Proceed with run if directory creation fails, report to stdout only — rejected because it compromises audit integrity and the user may not notice the failure in long stdout output

**Risk accepted**: In default mode, the report file from an interrupted run is empty — it is created at run start but written only at completion. When `ingestion.partialAuditReport` is enabled, the file contains per-file outcomes for files that were subsequently rolled back; this mode is intended for development use only.

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

**Source**: Resolved in Head of Development phase, 2026-02-21. Addresses UR-036, UR-016. Cross-references UR-037 (group rejection on file failure), UR-038 (fail-fast within groups), UR-040 (single-file group valid), UR-041 (zero-file group error), UR-042 (duplicate filenames within group rejected). See ADR-035 for the file naming convention within grouped subdirectories.

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

**Text quality scoring** (addendum):

Text quality scoring is assessed independently of metadata completeness (UR-054). The
interface contract mirrors the completeness scoring pattern:

- **Input**: extracted text + per-page OCR confidence scores from the OCR engine
- **Output**: quality score in the range 0-100
- **Configuration**: quality threshold is a separate configurable value (per UR-054);
  scoring method is pluggable behind the same interface pattern (ADR-016)

The recommended starting implementation is a weighted combination of mean OCR confidence
score and text density (characters per page). All weights and the threshold are configurable.
Initial values are an implementer decision, expected to be tuned as real documents are
processed.

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

**Rationale**: Date and description are the two metadata fields guaranteed to exist from Phase 1 intake (UR-002). The format is inspired by the bulk ingestion naming convention (`YYYY-MM-DD - short description` per UR-014), making the archive reference immediately familiar to the archivist. The separator deliberately differs: the naming convention uses a hyphen-minus (suitable for filenames), while the archive reference uses an em dash (a display label, not a filename). The simplicity of the derivation rule means it is always producible — there is no case where the archive reference cannot be generated, since description is required (UR-010) and date is either present or falls back to `[undated]`. Placing the function in `packages/shared/` ensures a single implementation used by both the frontend (display) and backend (API responses, citations).

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

**Source**: Resolved in Head of Development phase, 2026-02-22. Addresses UR-064. Cross-references ADR-016 (factory pattern), ADR-013 (chunk parent references), ADR-024 (embedding interface), ADR-011 (text extraction), ADR-036 (future metadata extraction merge into this LLM step).

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
- Before forwarding a document to the Python processing service, Express marks each of that document's pending steps as `running` and records `started_at`. On receiving Python's response, Express updates each step to `completed` or `failed` and writes all processing results within a transaction (ADR-031). At the start of each processing trigger, before new work is accepted, the system checks for steps in `running` status where `started_at` is older than a configurable timeout (`pipeline.runningStepTimeoutMinutes`). Stale `running` steps are reset to `failed` with an incremented attempt count and an error message indicating a presumed Python service crash. The normal retry mechanism (UR-068, UR-069) handles them in the same run.
- Failed steps remain at `failed` status with an incremented attempt count. The next processing run retries them up to the configurable retry limit (UR-069). When the limit is exceeded, the document is flagged and surfaced in the curation queue
- A step that ran successfully is marked `completed` even if its output failed a quality threshold (UR-067) — the quality outcome is recorded separately; the step status tracks technical completion only
- Documents are absent from the search index until the embedding step completes successfully (UR-065) — this is enforced by checking the embedding step's status, not a separate visibility flag

**Enrichment reprocessing** (Phase 4+):

- When vocabulary or domain context changes warrant re-processing, a new pipeline version is published (the configurable version value is incremented)
- A "reprocess" command selects documents at the old version and resets specific steps to `pending` (e.g., reset chunking and embedding while keeping extraction)
- The next processing trigger picks up these documents and re-runs the reset steps
- This is the same processing path as first-run processing — no separate reprocessing pipeline is needed
- The reprocess command follows the same interface pattern as the processing trigger (ADR-026): an Express API endpoint callable from both the curation web UI and the CLI. This is the single entry point for reprocessing regardless of caller, consistent with ADR-026's design.

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

**Revision note [Revised by ADR-038, 2026-02-23]**: The `vocabulary_terms` table is extended
with two nullable columns: `source_document_id` (UUID, FK to documents) and `confidence`
(float, 0.0-1.0). The `source` enum is extended with a new value: `llm_extracted`. The
`vocabulary_relationships` table is reused for graph edges — no separate graph relationship
table is needed. These extensions unify the vocabulary and knowledge graph schemas. See ADR-038
for the full rationale. No existing columns or constraints are changed; this is an additive
extension consistent with ADR-029.

**Revision note [Revised 2026-02-24 — entity_document_occurrences table]**: A new join table
`entity_document_occurrences` is added to the schema:

- `entity_id` (UUID, FK to `vocabulary_terms`)
- `document_id` (UUID, FK to `documents`)
- `created_at` (timestamp)

This table records every document in which a given entity appears. It is the universal source
of truth for all entity-document links, regardless of how the entity entered the system
(`seed`, `manual`, or `llm_extracted`). Written by Express as part of the processing results
transaction (ADR-031) — every entity returned by the LLM combined pass generates one or more
`entity_document_occurrences` rows. Without this table, entity-document provenance is lost
after normalised deduplication merges multiple extractions into a single `vocabulary_terms`
row. The join table keeps `vocabulary_terms` clean (one row per entity, no duplication) while
maintaining full provenance across the corpus. See also the `GraphStore` interface extension
in ADR-037. This is an additive schema change consistent with ADR-029.

**Revision note [Revised 2026-02-24 — source_document_id removed]**: The `source_document_id`
column added in the previous revision note is removed. It was introduced to record the first
document an LLM-extracted entity was seen in, but this information is fully covered by
`entity_document_occurrences` (the row with the earliest `created_at` for a given `entity_id`
is the first occurrence). Keeping a separate `source_document_id` column would create a
redundant second source of truth. `entity_document_occurrences` is the sole and universal
source of truth for all entity-document links. The `vocabulary_terms` schema extensions from
the ADR-038 revision are therefore: `confidence` (float, 0.0-1.0, nullable) only; no
`source_document_id` column.

**Revision note [Revised 2026-02-24 — seeded entity document linking]**: Seeded entities
start with no document links. No `entity_document_occurrences` rows exist at seed time. Document links for seeded entities
accumulate naturally as documents are processed — the LLM combined pass extracts the same
entity name from documents, hits the same deduplicated row in `vocabulary_terms` via
`normalised_term`, and writes `entity_document_occurrences` rows linking the seeded entity to
each document. Optionally, the archivist can manually associate a seeded entity with a known
founding document via the curation UI — this inserts a row into
`entity_document_occurrences` directly. Keeping the seed file simple and human-readable is
more important than pre-populating document links. The seed provides the controlled vocabulary
starting point; document provenance builds up through normal processing. This is consistent
with the human-in-the-loop curation model (ADR-014).

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
| Express backend | Read + Write | `documents`, `ingestion_runs`, `pipeline_steps`, `chunks`, `embeddings`, `vocabulary_terms`, `vocabulary_relationships`, `rejected_terms` |
| Python processing service (C2 pipeline + C3 query module — ADR-042) | None | C2: returns processing results to Express via HTTP/RPC; C3: calls back to Express for VectorStore/GraphStore data retrieval (ADR-033, ADR-037, ADR-045) |
| Next.js frontend | None | Read-only via Express API; proxies C3 queries to Python (ADR-045) |
| C4 Continuous Ingestion | None | Write access via Express API (same pattern as C1) |

**Express-to-Python processing contract**: The boundary between Express and the Python processing service is an RPC-style contract. Express sends a processing request (document ID, file reference) — where file reference is a storage-provider-specific locator: a filesystem path in Phase 1 (local storage, ADR-008), or a pre-signed URL / storage URI in later phases (e.g. S3). In Phase 1, Python accesses the file via a shared Docker Compose volume mount. Python never receives raw file content over HTTP — it always fetches from the storage layer using the provided reference. Python performs OCR, chunking, embedding, metadata extraction, entity and relationship extraction, and quality scoring; Python returns the complete set of processing outputs to Express in a single structured response. Express then writes all outputs to the database within a transaction, ensuring that either all processing results for a document are persisted or none are.

**Contract technology**: The specific RPC technology is an implementation decision, not an architectural one. Candidates include tRPC with a generated Python client (tRPC is TypeScript-native; the Python side would use the HTTP adapter or a generated SDK), OpenAPI with code generation for both sides, or plain REST with shared type definitions. The architecture requires only that the contract is typed and that both sides can validate requests and responses against a shared schema. The implementer selects the technology based on developer experience and tooling maturity at implementation time.

**Schema enforcement**: All schema knowledge lives in the Express backend (Knex.js migrations, ADR-028/ADR-029). Python has no awareness of database tables, column names, or schema versions. This means schema changes never require coordinated changes in two services — only the Express backend needs to be updated. The Python processing service is a pure function: document in, processing results out.

**Transaction boundaries**: Because Express is the sole writer, it can wrap related writes in database transactions:

- **Intake transaction**: document record creation + file metadata + hash check (ADR-017 finalize step)
- **Processing results transaction**: chunks + embeddings + pipeline step status updates + vocabulary terms (source: `llm_extracted`) + vocabulary relationships + `entity_document_occurrences` rows + quality scores for a single document — all written atomically
- **Vocabulary curation transaction**: term acceptance/rejection + alias updates + rejected list updates

No cross-service transactions are needed because only one service writes.

**Context**: The system has two runtime services (Express and Python) that both need to interact with the database. ADR-015 establishes the service boundary. ADR-026 establishes fire-and-forget processing semantics. ADR-027 defines pipeline step status tracking. This ADR determines which service owns database writes and how the boundary between them works.

**Rationale**: Centralising all writes in Express eliminates an entire class of problems: schema drift between two writers, cross-service transaction coordination, duplicate connection pool management, and the need for Python to track Knex.js migration state. Python becomes a stateless processing engine — it receives input, produces output, and has no persistent state of its own. This is architecturally clean and operationally simple. The cost (larger HTTP payloads for embedding vectors) is acceptable because the Express-to-Python boundary is internal (same Docker network, not internet) and processing is not latency-sensitive (ADR-026's "optimise for read, not write" principle).

**Options considered**:

- Both services write to the database (Python writes processing outputs directly) — rejected because it creates two database writers with separate connection pools, requires Python to have schema awareness, and makes cross-service transaction boundaries impossible; schema drift risk increases with every migration
- Hybrid (Python writes pipeline status only, Express writes everything else) — rejected because even a single shared table between two writers introduces coordination requirements; the marginal benefit (real-time status updates from Python) does not justify the complexity; Python can report step status in its HTTP response and Express can write it
- Sending raw file content over HTTP — rejected because it produces large HTTP payloads for binary files and is inconsistent with the storage abstraction model; the file reference approach scales from local filesystem to S3 without changing the RPC contract

**Risk accepted**: Processing results for a document with many chunks and high-dimensional embeddings produce a large HTTP response payload. For a document with 100 chunks at 1024 dimensions, the embedding data alone is approximately 400 KB (100 x 1024 x 4 bytes). This is well within HTTP payload limits and acceptable for an internal service call on a local network.

**Tradeoffs**: Pipeline step status is written twice per document: steps are marked `running` before the request is sent to Python, then updated to `completed` or `failed` when Python responds. The `pipeline_steps` table reflects which document is currently in-flight, but not progress within a document's individual steps — Python processes all steps for a document before returning.

**Source**: Resolved in Head of Development phase, 2026-02-22. Addresses data ownership and transaction boundaries. Cross-references ADR-015 (Python service boundary), ADR-026 (fire-and-forget semantics), ADR-027 (pipeline step status), ADR-028 (Knex.js), ADR-029 (migration policy). Revised 2026-02-23 to reflect ADR-038 changes: `vocabulary_candidates` table removed; vocabulary terms with `source: llm_extracted` replace candidates; entity and relationship extraction added to Python processing contract.

---

### ADR-032: Python Testing via Interface-Driven Mocking with Fixture Documents

**Decision**: The Python processing service (`services/processing/`) is tested using interface-driven mocking for unit tests and fixture documents for integration tests. pytest is the test runner.

**Unit tests**:

- Mock the provider interfaces (OCR, LLM chunking, embedding) using `unittest.mock` or pytest fixtures
- The factory pattern (ADR-016) makes mock injection straightforward — tests pass a mock config value that selects a mock implementation, or inject the mock directly via the abstract base class interface
- Unit tests are fast, deterministic, and run without external dependencies (no OCR engine, no LLM, no embedding model)
- Each pipeline step (extraction, chunking, embedding, metadata detection, entity and relationship extraction, quality scoring) is tested independently with controlled inputs and expected outputs

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

**Source**: Resolved in Head of Development phase, 2026-02-22. Addresses testing strategy for Python components. Cross-references ADR-016 (factory pattern), ADR-031 (no DB connection), ADR-025 (LLM non-determinism), ADR-015 (Python service structure, which establishes Vitest and pytest as the two test runners).

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
Express writes them through the `VectorStore` interface. C3 (running in the Python service —
ADR-042) calls back to Express via HTTP to perform vector search; Express executes
`vectorStore.search()` and returns results to Python. Swapping pgvector for OpenSearch means
replacing one implementation class in Express and updating the config key — C2 and C3 are
unchanged.

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

---

### ADR-034: Multi-Tenancy Scaffolding Deferred — Staged Introduction at Natural Migration Points

**Decision**: No multi-tenancy scaffolding is introduced in Phase 1. Storage paths use a flat
structure with no tenant namespace. No `tenant_id` column is added to any table. Multi-tenancy
preparation is introduced in two deliberate stages at natural transition points:

1. **S3 migration** (expected Phase 2-3): when storage moves from local Docker volumes to S3,
   introduce tenant-namespaced storage paths (`{tenant-id}/archives/YYYY/MM/uuid.ext`) using a
   fixed default tenant ID constant. No multi-tenant logic is introduced at this point — the
   namespace is structural only.
2. **Phase 3** (external user access): add `tenant_id` column to relevant tables via additive
   Knex migration (per ADR-029), introduce tenant routing middleware, and resolve the
   multi-tenancy pattern (shared DB vs separate DB per tenant) at Phase 3 planning.

**Context**: The pre-approval ADR-FUTURE-001 proposed adding a nullable `tenant_id` column and
tenant-namespaced storage paths in Phase 1 to avoid a future retrofit. This ADR supersedes
that decision. UR-137 explicitly requires the Phase 1 schema to be minimal — unused fields are
not permitted except where a concrete, known reason exists. No such reason applies to
`tenant_id` in Phase 1 or Phase 2. The storage path question is the harder problem: unlike a
DB column, migrating storage paths after documents are archived is expensive (files must move,
all DB path references must update). However, the S3 migration is itself a point where storage
is restructured — absorbing tenant namespacing into that work costs near zero.

**Rationale**: Phase 1 path namespacing buys nothing if the S3 migration precedes multi-tenancy
(which it will — S3 is a Phase 2-3 concern, external tenants are Phase 3+). Introducing it at
the S3 migration point absorbs the cost into work already happening. The `tenant_id` DB column
is explicitly prohibited by UR-137 until Phase 3 introduces the feature, at which point a
non-destructive additive migration is the correct mechanism per ADR-029. Staging the
introduction at two natural seams means neither step is a rewrite — each is incremental work
within an already-scheduled transition.

**Risk accepted**: If multi-tenancy is required before the S3 migration occurs, storage path
migration must be done at that point instead. This is accepted as low-probability given the
project roadmap. The risk is documented here so it is not forgotten.

**Tradeoffs**: Flat Phase 1 storage paths are simpler to reason about and consistent with the
minimal-schema principle. The cost is that the S3 migration must carry the additional task of
introducing path namespacing — this must be noted in the S3 migration planning work.

**Source**: 2026-02-23. Supersedes pre-approval ADR-FUTURE-001. Cross-references UR-137
(minimal Phase 1 schema), ADR-029 (additive-only migrations), ADR-001 (Infrastructure as
Configuration).

---

### ADR-035: File Naming Convention Within Virtual Document Groups

**Decision**: Individual files within a virtual document group (bulk ingestion, `--grouped` mode
per ADR-020) must follow the convention `NNN` or `NNN - optional-annotation`, where `NNN` is a
zero-padded three-digit sequence number (e.g. `001`, `002`, `003`). The file extension is
unchanged. Examples:

- `001.tiff`
- `002.tiff`
- `001 - front cover.tiff`
- `002 - inside front.tiff`

The sequence number is the first element. The group subdirectory name carries the date and
description (per UR-014 and ADR-020) — individual files within the group do not repeat this
information. Page order within the virtual document is determined by lexicographic sort of the
filename stem, which is equivalent to numeric sort when sequence numbers are zero-padded to
the same width.

Files not conforming to this convention within a `--grouped` run are rejected at intake; the
entire group is rejected per UR-037.

**Context**: ADR-020 establishes that `--grouped` mode uses subdirectories to express virtual
document groups, with the subdirectory name following the `YYYY-MM-DD - description` convention.
Individual files within a group have no naming constraint in the current decisions, creating an
ambiguity: filesystem ordering is unreliable across platforms and operating systems, so without
a naming convention the system cannot determine page order within a multi-file virtual document.

**Rationale**: Page order is semantically meaningful — a multi-page deed scanned as separate
images must be processed and presented in the correct sequence. Relying on filesystem ordering
is fragile. The sequence number must come first so that lexicographic and numeric sort produce
identical results — if the sequence number were a suffix (`description - 001`), a file with
a description containing digits could sort incorrectly. Three-digit zero-padding supports up to
999 pages per group, which is sufficient for all foreseeable document types in this archive.
The optional annotation after the sequence number (`001 - front cover`) allows the archivist
to label pages without affecting sort order. The group subdirectory already carries date and
description, so repeating them on every file within the group is redundant and error-prone —
a mismatch between directory and file metadata would introduce ambiguity.

**Options considered**:

- `YYYY-MM-DD - description - NNN` (full naming convention repeated with page suffix) —
  rejected because date and description are already on the subdirectory; repeating them
  on every file is redundant, increases the chance of inconsistency, and makes filenames
  unnecessarily long
- `YYYY-MM-DD - description - NNN` with page number first inside the name — rejected for
  the same reasons as above
- No convention enforced; rely on filesystem ordering — rejected because filesystem ordering
  is platform-dependent and not a reliable proxy for page order
- Manifest file listing page order — rejected for the same reasons as in ADR-020 (requires
  a separate file, error-prone, introduces a new format)

**Risk accepted**: The archivist must ensure files are named with correct sequence numbers
before ingestion. A mislabelled sequence (e.g. two files named `001`) is caught by UR-042
(duplicate filenames within a group are rejected at intake). A file named with the wrong
sequence number (e.g. pages in the wrong order) is not detectable by the system — the archivist
is responsible for correct ordering at submission time.

**Tradeoffs**: Adds a naming constraint to files within grouped submissions that does not apply
to standalone submissions. This is a deliberate asymmetry: standalone files carry full metadata
in their filename (per UR-014); grouped files delegate metadata to the subdirectory and carry
only their sequence position.

**Source**: 2026-02-23. Cross-references ADR-020 (grouped CLI mode), UR-014 (naming convention),
UR-036 (virtual document groups), UR-037 (group rejection on file failure), UR-042 (duplicate
filenames within group rejected).

---

### ADR-036: Metadata Extraction Merge Path into Chunking LLM (Phase 2+)

**Decision**: Phase 1 runs pattern-based metadata extraction (ADR-012) and LLM-based semantic
chunking (ADR-025) as separate pipeline steps. The chunking LLM prompt must be designed from
the start to return both chunk boundaries and structured metadata fields (document type, dates,
people, land references, description), even though in Phase 1 the metadata fields returned by
the LLM are discarded in favour of the pattern-based results. This prompt design constraint
keeps the merge path open: in a later phase, the pattern-based step can be removed and the LLM
output used directly, with no changes to the LLM interface or the write-back transaction.

**Context**: In Phase 1, pattern-based extraction is deterministic and testable without an LLM
dependency, and ADR-012 records the deliberate decision to defer LLM-assisted metadata
extraction to Phase 2. However, the chunking LLM already reads the full document text. If the
prompt is designed to return metadata alongside chunks from the beginning, Phase 2 can merge
the steps at low cost. If the prompt is designed for chunks only, the merge requires prompt
renegotiation and interface changes in addition to the step removal.

**Rationale**: The cost of including metadata fields in the LLM prompt and output schema is low
(a few additional output fields, returned but unused in Phase 1 logic). The cost of retrofitting
the prompt and interface later is higher. This follows the principle of minimal future retrofit
cost without adding unused complexity to Phase 1 logic — the fields appear in the LLM output
contract, but the metadata pipeline step still runs independently and the LLM values are ignored
until the merge is enacted.

**Phase 1 behaviour**: The chunking LLM returns a structured response containing both chunk
objects and metadata fields. The Python processing service discards the metadata fields from the
LLM response and uses pattern-based extraction results instead. The `pipeline_steps` table
continues to track metadata extraction and chunking as separate steps.

**Phase 2 merge path**: Remove the pattern-based metadata extraction step. Update the Python
processing service to read metadata fields from the LLM response. Remove the corresponding
`pipeline_steps` entry for pattern-based extraction. No changes to the LLM interface, the
write-back transaction structure, or the Express-side code are required.

**Risk accepted**: The LLM metadata fields returned in Phase 1 are never validated against
ground truth — their quality is unknown until the Phase 2 merge. Real documents must be tested
against the Phase 1 LLM output before the merge is enacted, to confirm the LLM produces
acceptable metadata quality. This is expected work at the Phase 2 boundary.

**Source**: 2026-02-23. Cross-references ADR-012 (pattern-based extraction, Phase 1),
ADR-025 (chunking LLM, merge target), ADR-027 (pipeline step tracking).

---

## Graph-RAG ADRs (Resolved in Head of Development Phase — Extension Session)

---

### ADR-037: Knowledge Graph in PostgreSQL Behind a GraphStore Interface

**Decision**: The knowledge graph is stored in PostgreSQL using the unified vocabulary schema (see ADR-038). All graph operations (write entities, write relationships, traverse relationships, query entities) are accessed through a `GraphStore` interface in the Express backend, mirroring the `VectorStore` pattern (ADR-033). The Phase 1 concrete implementation uses PostgreSQL tables with SQL JOINs and recursive CTEs for traversal. The implementation is selected by config key (`graph.provider: "postgresql"`), following the factory pattern (ADR-016). A future phase can swap to a dedicated graph database (e.g. Neo4j) by implementing the `GraphStore` interface and updating the config key — no application code changes required.

**Context**: The pre-approval architecture document described "entity relationship extraction and knowledge graph" and "graph-aware retrieval alongside vector search" as planned capabilities. The approved `overview.md` lists "knowledge graph" in Phase 4+. The developer has identified that graph-RAG (hybrid retrieval using both vector similarity and knowledge graph traversal) was always intended but was not captured in any ADR. This decision establishes where the graph lives and how it is accessed, before the pending architecture documents are approved.

**Rationale**: PostgreSQL is the right choice for this project's scale (thousands of entities, not millions). The estate archive produces a relatively small, dense knowledge graph — entities are people, places, organisations, land parcels, and legal references mentioned across documents. Recursive CTEs handle multi-hop traversals (e.g. "who is connected to the Smith family through property transactions?") adequately for this graph size. Using PostgreSQL avoids introducing a new infrastructure dependency (Neo4j Docker service), a new backup target, and a data synchronisation problem between two databases. The `GraphStore` interface ensures that if graph queries become complex enough to justify a dedicated graph database, the migration is a config change plus a graph regeneration step — not an application rewrite.

**Interface contract** (indicative — exact methods refined at implementation):

- `writeEntity(entity: GraphEntity): Promise<void>`
- `writeRelationship(relationship: GraphRelationship): Promise<void>`
- `getEntity(entityId: string): Promise<GraphEntity | null>`
- `getRelationships(entityId: string, direction?: 'outgoing' | 'incoming' | 'both'): Promise<GraphRelationship[]>`
- `traverse(startEntityId: string, maxDepth: number, relationshipTypes?: string[]): Promise<TraversalResult>`
- `findEntitiesByType(entityType: string): Promise<GraphEntity[]>`

The implementation is selected by config key, following the factory pattern (ADR-016).

**Options considered**:

- Dedicated graph database (Neo4j) — rejected for Phase 1 because it introduces polyglot persistence complexity (two databases to back up, synchronise, and maintain), adds a Docker service, and is overkill for the expected graph size; the `GraphStore` interface keeps this option open for a future phase if graph query complexity warrants it
- Entity embeddings in pgvector alongside the graph — rejected as overkill for Phase 1; entity similarity search is a future enhancement that can be added behind the same interface without changing the graph storage decision

**Migration path to Neo4j** (acknowledged tradeoff): If a future phase adopts Neo4j, all stored entity and relationship data must be exported from PostgreSQL and imported into Neo4j. This is a "regenerate graph" step — the entity extraction data (stored per-document in PostgreSQL) serves as the source of truth, and the graph is rebuilt in the new backing store. The `GraphStore` interface ensures that application code (C3 query routing, C2 entity writes) requires no changes — only the implementation class and config key change. This regeneration cost is accepted as a one-time migration activity, not an ongoing burden.

**Relationship to vocabulary tables [Revised by ADR-038, 2026-02-23; revised 2026-02-24]**: Graph entities and vocabulary terms are unified in the same `vocabulary_terms` table (see ADR-038). LLM-extracted entities are stored with `source: llm_extracted` and `confidence`. Graph relationships use the `vocabulary_relationships` table. No separate graph entity or graph relationship tables exist. The `GraphStore` interface operates on `vocabulary_terms` rows that have at least one corresponding row in `entity_document_occurrences` — entities with evidential grounding in the archive. Seeded and manually added entities without document links are excluded from the graph until they are encountered during document processing. This ensures the graph contains only entities with document evidence behind them. The `GraphStore` PostgreSQL implementation queries the same tables as vocabulary management, but through a different interface with different query patterns (traversal vs. curation). A future Neo4j migration would export from these unified tables.

**Risk accepted**: PostgreSQL recursive CTEs become expensive for deep traversals (beyond 4-5 hops). For the estate archive's graph (primarily 1-3 hop queries like "who is connected to this land parcel?"), this is well within acceptable performance. If traversal depth requirements grow, the `GraphStore` interface enables migration to Neo4j without application changes.

**Tradeoffs**: No native graph query language (Cypher, Gremlin) in Phase 1. Graph queries are expressed as SQL, which is less expressive for complex graph patterns (shortest path, community detection). This is acceptable because Phase 1 graph queries are simple traversals, not graph analytics. The `GraphStore` interface abstracts this — the application code calls `traverse()`, not SQL.

**Revision note [Revised 2026-02-24 — findDocumentsByEntity method]**: A new method
`findDocumentsByEntity(entityId: string): Promise<Document[]>` is added to the `GraphStore`
interface contract. This method queries the `entity_document_occurrences` table (see ADR-028
revision, 2026-02-24) and enables "which documents mention this entity?" as a first-class
graph query. The PostgreSQL implementation is a simple JOIN between
`entity_document_occurrences` and `documents`.

**Source**: Resolved in Head of Development phase, 2026-02-23. Addresses graph store placement for knowledge graph / graph-RAG. Cross-references ADR-001 (Infrastructure as Configuration), ADR-004 (PostgreSQL), ADR-016 (factory pattern), ADR-028 (vocabulary schema — unified with graph entities per ADR-038), ADR-031 (Express as sole DB writer), ADR-033 (VectorStore interface — parallel pattern), ADR-038 (unified vocabulary/graph schema).

---

### ADR-038: Entity Extraction in C2 via Unified Vocabulary/Graph Schema

**Decision**: Entity and relationship extraction is performed by the LLM combined pass in the C2 pipeline. Graph entities are stored in the existing `vocabulary_terms` table (ADR-028) with one new nullable column (`confidence`) and a new `source` enum value (`llm_extracted`). Graph relationships are stored in the existing `vocabulary_relationships` table. Entity-document provenance is tracked in a new `entity_document_occurrences` join table. No separate graph entity or relationship tables are created. The separate vocabulary candidate identification step is removed from the C2 pipeline.

**Entity types** (starting set — refined at implementation against real documents):

- People (individuals named in documents)
- Organisation (solicitors, companies, councils, estate agents)
- Land Parcel / Field (named fields, plots, parcels with boundaries)
- Date / Event (significant dated events: transfers, deaths, boundary changes)
- Legal Reference (deed numbers, conveyance references, planning references)

**Relationship types** (indicative — refined at implementation):

- `owned_by` (land parcel to person/organisation)
- `transferred_to` (land parcel from person to person, with date)
- `witnessed_by` (document to person)
- `adjacent_to` (land parcel to land parcel)
- `employed_by` (person to organisation)
- `referenced_in` (entity to document)

**Extraction method**: LLM-based extraction via the existing chunking LLM (ADR-025). The LLM combined pass prompt returns a single structured response containing:

1. Chunk boundaries and labels
2. Metadata fields (document type, dates, people, land references, description) — discarded in Phase 1 per ADR-036
3. Graph entities (type, name, confidence)
4. Graph relationships (source entity, target entity, relationship type, confidence)

This extends the combined prompt pattern from ADR-036. No separate NER model is used. One LLM call returns all extraction outputs.

**Unified vocabulary/graph schema**: The `vocabulary_terms` table (ADR-028) is extended with:

- `confidence` (float, 0.0-1.0, nullable) — LLM's confidence in the extraction; `NULL` for seed/manual terms

A new `entity_document_occurrences` join table records every document in which an entity appears (see ADR-028 revision, 2026-02-24). This is the universal source of truth for entity-document provenance.

The `source` enum on `vocabulary_terms` is extended with `llm_extracted` (joining existing values: `seed`, `manual`, `candidate_accepted`).

The `vocabulary_relationships` table is reused for graph edges without schema changes — its existing columns (`source_term_id`, `target_term_id`, `relationship_type`) serve graph relationships directly.

The `rejected_terms` table is unchanged and continues to prevent re-proposal of rejected entities.

**How LLM-extracted entities enter the system**: Python returns entities and relationships in its processing response. Express writes them to `vocabulary_terms` with `source: llm_extracted` and to `vocabulary_relationships`, within the same processing results transaction (ADR-031). LLM-extracted entities appear in the existing vocabulary review queue alongside any other candidates. The curator can accept (changing `source` to `candidate_accepted`), reject (moving to `rejected_terms`), or leave them as `llm_extracted`. Normalised deduplication (ADR-028, UR-093) prevents duplicate entities from accumulating across documents.

**Updated C2 pipeline steps** (6 steps, tracked in `pipeline_steps` per ADR-027):

1. Text extraction (OCR via ADR-011)
2. Text quality scoring (ADR-021)
3. Pattern-based metadata extraction (ADR-012)
4. Metadata completeness scoring (ADR-021)
5. LLM combined pass — returns: chunks + metadata fields (discarded Phase 1) + graph entities + graph relationships
6. Embedding generation (ADR-024)

The previous separate "vocabulary candidate identification" step is removed. Vocabulary candidates are now a subset of the LLM combined pass output (entities with category mappings to vocabulary terms).

**Context**: The graph-RAG architecture (ADR-037) requires entities and relationships to be extracted from documents and stored in PostgreSQL. The existing vocabulary schema (ADR-028) already provides a normalised term/relationship structure with referential integrity, human-in-the-loop review (ADR-014), and rejection tracking. Creating separate graph tables would duplicate this infrastructure. The developer identified that vocabulary terms and graph entities serve overlapping purposes — a person mentioned in a deed is both a graph entity (for traversal) and a vocabulary candidate (for controlled vocabulary).

**Rationale**: Unifying vocabulary and graph storage eliminates table duplication, reuses the existing review queue and rejection workflow, and ensures that entity names are normalised and deduplicated from the start. The `GraphStore` interface (ADR-037) operates on the same tables but through different query patterns — traversal queries filter on entities with `entity_document_occurrences` rows (document-evidenced entities) and follow relationships, while vocabulary curation queries filter on `source` values and present terms for review. The LLM combined pass avoids multiple LLM calls per document — one call extracts chunks, metadata, and entities together, which is both more efficient and produces more contextually coherent results.

**Revision note [Revised 2026-02-24 — source_document_id removed from schema]**: The
`source_document_id` column originally described in this ADR has been removed (see ADR-028
revision, 2026-02-24). It was redundant given `entity_document_occurrences`. All
references to `source_document_id` as a graph-entity discriminator in this ADR are
superseded by the `entity_document_occurrences` join table.

**Options considered**:

- Separate `graph_entities` and `graph_relationships` tables — rejected because it duplicates the normalised term structure, requires a separate deduplication mechanism, and creates two sources of truth for entity names (a "John Smith" in the vocabulary and a "John Smith" in the graph would diverge over time)
- NER model (spaCy/Hugging Face) for entity extraction — rejected because the LLM already reads the full document text for chunking; a separate NER model adds an infrastructure dependency and cannot leverage document-level context the way the LLM prompt can; the LLM can be prompted with estate-specific entity types that a general NER model would miss
- Separate vocabulary candidate identification step retained alongside entity extraction — rejected because it creates two paths for the same output; the LLM combined pass produces both vocabulary candidates and graph entities in a single call

**Risk accepted**: The `vocabulary_terms` table now serves dual purposes (controlled vocabulary and graph entities), which increases its row count. For the expected scale (thousands of entities across thousands of documents), this is well within PostgreSQL's comfort zone. If the table grows to a point where vocabulary curation queries are slowed by graph entity volume, a filtered index on `source` can be added without schema changes.

**Tradeoffs**: The unified schema means vocabulary curation UI must filter appropriately — curators reviewing vocabulary terms should not be overwhelmed by thousands of `llm_extracted` entities from every processed document. The curation UI should default to showing terms awaiting review, not the full entity set. This is a UI concern, not a schema concern, and is noted for the frontend implementer. The `confidence` column provides a natural filtering mechanism — low-confidence entities can be deprioritised or hidden by default.

**Revision note [Revised 2026-02-24 — Organisation Role entity type]**: A new entity type
`Organisation Role` is added to the entity types list. This represents a higher-level concept
for a function or role that organisations perform for the estate (e.g. Estate Management,
Legal Services, Land Agency). Individual organisations are attached to an Organisation Role
via the `performed_by` relationship. Rationale: estate management companies change over
decades (e.g. Cluttons to Smiths-Gore to Savills via acquisition). Rather than encoding
temporal succession with date fields on relationships (which would be fragile given the fuzzy
dates in historical documents), a stable Organisation Role entity acts as the anchor. A query
for "who managed the estate?" traverses to the Estate Management role and finds all
organisations connected to it. Temporal context comes from the source documents attached to
each relationship, not from the graph schema.

**Revision note [Revised 2026-02-24 — performed_by and succeeded_by relationship types]**:
Two relationship types are added to the indicative list:

- `performed_by` (Organisation Role to Organisation) — records which organisations have held
  a given role
- `succeeded_by` (Organisation to Organisation) — records corporate lineage (e.g. Cluttons
  `succeeded_by` Smiths-Gore `succeeded_by` Savills)

`succeeded_by` captures corporate succession for queries that specifically ask about it,
without the graph needing to encode dates. Date fields on `vocabulary_relationships` were
considered and rejected — historical estate documents have fuzzy dates that make date-bounded
relationships unreliable.

**Revision note [Revised 2026-02-24 — source_document_id removed; entity_document_occurrences is sole provenance source]**: The `source_document_id` column described in the original ADR-038 text has been removed (see ADR-028 revision, 2026-02-24). It was redundant: the first document an entity was extracted from is recoverable from `entity_document_occurrences` as the row with the earliest `created_at` for a given `entity_id`. Keeping a separate column would create a second source of truth. `entity_document_occurrences` is the universal source of truth for all entity-document links, regardless of how the entity entered the system. Express writes `entity_document_occurrences` rows as part of the processing results transaction (ADR-031) for every entity returned by the LLM combined pass. Seeded entities start with no document links; links accumulate naturally as documents are processed and the LLM extracts matching entity names that hit existing deduplicated rows via `normalised_term`. The archivist can also manually associate a seeded entity with a document via the curation UI. The `vocabulary_terms` schema extensions from ADR-038 are therefore: `confidence` (float, 0.0-1.0, nullable) and `llm_extracted` source enum value only; no `source_document_id` column.

**Source**: Resolved in Head of Development phase, 2026-02-23. Addresses entity extraction in C2 for graph-RAG. Cross-references ADR-014 (human-in-the-loop vocabulary — revised), ADR-025 (LLM chunking — extended to combined pass), ADR-027 (pipeline step tracking — step list updated), ADR-028 (vocabulary schema — extended with confidence and llm_extracted; source_document_id removed per 2026-02-24 revision), ADR-031 (Express as sole DB writer — processing contract updated), ADR-036 (metadata merge path — extended to include entities), ADR-037 (GraphStore interface — operates on unified tables).

---

### ADR-039: Graph Construction via Post-Curation Rebuild Trigger

**Decision**: The knowledge graph is constructed as a batch rebuild step triggered after vocabulary curation, not incrementally per document during C2 processing. The rebuild reads all accepted vocabulary terms and relationships and writes the graph structure via the `GraphStore` interface (ADR-037). The rebuild trigger is a new Express API endpoint, consistent with the fire-and-forget pattern (ADR-026). It is available from both the curation web UI (button) and the CLI.

**How it works**:

1. The curator reviews LLM-extracted entities in the vocabulary review queue (ADR-014). Entities are accepted (source changes from `llm_extracted` to `candidate_accepted`), rejected (moved to `rejected_terms`), or left as `llm_extracted` for later review.
2. When the curator is satisfied with the current review session, they trigger a graph rebuild via the curation UI button or CLI command.
3. The rebuild reads all `vocabulary_terms` with `source IN ('seed', 'manual', 'candidate_accepted')` and all corresponding `vocabulary_relationships`, and writes the graph structure via the `GraphStore` interface.
4. The rebuild is idempotent — running it multiple times produces the same result. It replaces the current graph state with the state derived from the accepted vocabulary.

**Relationship to the Neo4j migration path**: The same rebuild trigger serves the Neo4j migration use case described in ADR-037. When a future phase introduces Neo4j, the rebuild trigger populates Neo4j from the vocabulary tables via the `GraphStore` interface — the config key changes from `graph.provider: "postgresql"` to `graph.provider: "neo4j"`, and the same trigger writes to the new backing store. No new trigger mechanism is needed.

**Phase placement [Revised by ADR-041, 2026-02-24]**: The rebuild trigger endpoint and its `GraphStore` integration are implemented in Phase 2 alongside graph-aware query routing (ADR-040). The `GraphStore` interface is defined in Phase 1 (ADR-037), but the rebuild trigger that populates the graph is deferred to Phase 2 because there is no consumer of the graph data until graph-aware retrieval is introduced. See ADR-041 for the canonical phase placement of all graph-RAG capabilities.

**Context**: ADR-038 establishes that entities extracted by the LLM combined pass land in `vocabulary_terms` with `source: llm_extracted`. These entities sit in the vocabulary review queue until the curator accepts or rejects them. The question is when the accepted entities are assembled into a queryable knowledge graph. Three timing options were evaluated.

**Rationale**: The batch rebuild after curation ensures the graph contains only human-reviewed, accepted entities. This is consistent with the human-in-the-loop principle (ADR-014) — the curator is the gatekeeper for what enters the controlled vocabulary, and by extension, the knowledge graph. Incremental construction (Option A) would put unreviewed entities into the graph immediately, undermining the curation workflow. Query-time construction (Option C) would be too slow for a growing corpus with complex traversals. The batch rebuild is simple, predictable, and idempotent — there is no risk of graph state diverging from vocabulary state because the graph is always derived from the current vocabulary snapshot.

**Options considered**:

- Incremental per document (Option A) — rejected because LLM-extracted entities would enter the graph before human review; the graph would contain unreviewed, potentially incorrect entities; inconsistent with the human-in-the-loop curation principle (ADR-014)
- At query time (Option C) — rejected because constructing traversal paths on the fly from entity tables is too slow for complex multi-hop queries as the corpus grows; graph queries should operate on a pre-built structure

**Risk accepted**: The graph is stale between rebuild triggers — newly accepted entities do not appear in graph traversals until the next rebuild. This is acceptable because the curation workflow is session-based (the curator reviews a batch of entities, then triggers a rebuild) and graph-aware querying is not a real-time requirement. The curator controls when the graph is refreshed.

**Tradeoffs**: An additional manual step (triggering the rebuild) is required after curation. This is a deliberate design choice — the curator explicitly decides when the graph should reflect their latest curation decisions, rather than the graph silently updating with each individual accept/reject action. The rebuild cost grows linearly with the vocabulary size, but for the expected scale (thousands of accepted terms) this is a sub-second operation on PostgreSQL.

**Source**: Resolved in Head of Development phase, 2026-02-24. Addresses graph construction timing for graph-RAG. Cross-references ADR-014 (human-in-the-loop vocabulary), ADR-026 (fire-and-forget trigger pattern), ADR-037 (GraphStore interface), ADR-038 (entity extraction and unified schema). Phase placement revised by ADR-041.

---

### ADR-040: Query Routing via LLM Classifier Behind QueryRouter Interface

**Decision**: Query routing in C3 uses an LLM classifier to determine the retrieval strategy for each query. The classifier analyses the user's natural language query and returns a routing decision: vector search only, graph traversal only, or both (hybrid). All query routing is accessed through a `QueryRouter` abstract base class in the Python processing service (`services/processing/query/`), following the same factory pattern (ADR-016) used for other provider interfaces. The implementation is selected by config key (`query.router: "llm_classifier"`). Note: `QueryRouter` is a Python interface, not a TypeScript interface in Express — it belongs in the Python service because it drives the Python query pipeline. `VectorStore` (ADR-033) and `GraphStore` (ADR-037) remain TypeScript interfaces in Express because they wrap database operations that Express owns.

**How it works**:

1. The user submits a natural language query via the web UI (proxied by Next.js) or CLI (direct).
2. Python's `QueryRouter` analyses the query and returns a routing decision:
   - `vector` — the query is about content similarity (e.g. "find documents about boundary disputes"); use vector similarity search via `VectorStore` callback to Express
   - `graph` — the query is about entity relationships (e.g. "who owned the land adjacent to Field 42?"); use graph traversal via `GraphStore` callback to Express
   - `both` — the query has both content and relationship aspects (e.g. "what did John Smith say about the boundary change in 1967?"); run both retrievers and merge results
3. Python executes the retrieval strategy by calling back to Express for `VectorStore` and/or `GraphStore` data as appropriate.
4. Results are merged (for `both` routes) and passed to the response generation step.

**QueryRouter interface contract** (indicative — exact methods refined at implementation):

- `route(query_text: str) -> RouteDecision` where `RouteDecision` includes `strategy: Literal['vector', 'graph', 'both']` and optional context (e.g. extracted entity names for graph queries)

**Phase 1 behaviour**: The `QueryRouter` abstract base class is defined in Phase 1 code, but the LLM classifier implementation is Phase 2 (see ADR-041). In Phase 1, a simple default implementation returns `vector` for all queries — this is the pass-through behaviour that makes C3 function with vector-only retrieval. The interface exists so that Phase 2 can introduce the LLM classifier without changing any call sites.

**Context**: The graph-RAG architecture introduces two retrieval paths: vector similarity search (existing, ADR-033) and knowledge graph traversal (ADR-037). The question is how the system decides which retrieval path to use for a given query. Three routing strategies were evaluated.

**Rationale**: The LLM classifier produces the highest quality routing decisions because it can understand query intent semantically. "Who owned Field 42?" is clearly a graph query; "find documents similar to this deed" is clearly a vector query; "what did the solicitor write about the boundary change?" benefits from both. The LLM can make these distinctions; a threshold-based heuristic cannot. The quality advantage outweighs the latency cost (one additional LLM call per query) because query quality is the system's primary value (ADR-026's "optimise for read, not write" principle applies to the read path too — better to take slightly longer and return the right results).

**Options considered**:

- Always parallel (Option B) — rejected because running both retrievers on every query wastes resources when the query clearly suits only one path; more importantly, merging irrelevant graph results with relevant vector results (or vice versa) can degrade response quality by introducing noise into the context window
- Vector RAG primary with graph fallback (Option C) — rejected because threshold tuning for the fallback trigger is intractable without extensive real-world testing; a low threshold means graph is never used, a high threshold means graph is used on poor vector results that may not benefit from graph retrieval either; the LLM classifier avoids the threshold problem entirely

**Risk accepted**: The LLM classifier adds one LLM call per query, increasing query latency. This is acceptable because query quality is prioritised over query speed, and the routing call is a short-context classification task (not a full document read) — expected latency is sub-second for both local and API LLMs. If latency proves problematic, the `QueryRouter` interface allows swapping to a simpler implementation (e.g. always-vector or keyword-based heuristic) via config change.

**Tradeoffs**: The LLM classifier requires an LLM to be available during query time, not just during document processing. In Phase 2 with local-first operation, this means Ollama must be running for both processing and querying. This is the same infrastructure dependency as ADR-025 (LLM chunking) and does not introduce a new requirement.

**Source**: Resolved in Head of Development phase, 2026-02-24. Addresses query routing for graph-RAG hybrid retrieval. Cross-references ADR-001 (Infrastructure as Configuration), ADR-016 (factory pattern), ADR-033 (VectorStore interface), ADR-037 (GraphStore interface), ADR-041 (phase placement — QueryRouter interface Phase 1, LLM classifier implementation Phase 2).

---

### ADR-041: Phase Placement for Graph-RAG Capabilities

**Decision**: Graph-RAG capabilities are introduced across three phases. This ADR is the canonical reference for what is built when. Individual ADRs (ADR-037 through ADR-040) describe the mechanisms; this ADR assigns them to phases.

**Phase 1 — Entity extraction and interface scaffolding**:

| Capability | ADR | What is built |
| --- | --- | --- |
| Entity extraction in C2 | ADR-038 | LLM combined pass extracts entities and relationships; results written to `vocabulary_terms` and `vocabulary_relationships` |
| Extended vocabulary schema | ADR-028 (revised), ADR-038 | `confidence` column; `llm_extracted` source enum value (entity provenance tracked via `entity_document_occurrences`, not `source_document_id`) |
| Entity review queue | ADR-014 (revised) | LLM-extracted entities appear in the existing vocabulary review queue; curator accepts/rejects |
| `GraphStore` interface definition | ADR-037 | Interface defined in Express; PostgreSQL implementation written but not called by any production code path in Phase 1 |
| `QueryRouter` interface definition | ADR-040 | Abstract base class defined in Python service (`query/`); default implementation returns `vector` for all queries (pass-through) |

**Phase 2 — Graph construction and graph-aware querying**:

| Capability | ADR | What is built |
| --- | --- | --- |
| Graph rebuild trigger | ADR-039 | Express API endpoint; reads accepted vocabulary, writes graph via `GraphStore`; available from curation UI and CLI |
| LLM query classifier | ADR-040 | `QueryRouter` implementation that classifies queries as vector/graph/both; replaces the Phase 1 pass-through |
| Graph-aware retrieval in C3 | ADR-037, ADR-040 | C3 uses `QueryRouter` to select retrieval strategy; `GraphStore.traverse()` called for graph and hybrid queries |

**Phase 3+ — Dedicated graph database**:

| Capability | ADR | What is built |
| --- | --- | --- |
| Neo4j migration | ADR-037 | New `GraphStore` implementation backed by Neo4j; config key change; graph regeneration from vocabulary tables via rebuild trigger (ADR-039) |

**Context**: The graph-RAG architecture spans multiple ADRs (ADR-037 through ADR-040) and the developer has confirmed that not all capabilities are needed in Phase 1. Entity extraction produces value immediately (entities populate the vocabulary review queue and support curation), but graph construction and graph-aware querying require each other — there is no point building the graph if it cannot be queried, and no point building the query router if there is no graph to traverse. This natural dependency determines the phase boundaries.

**Rationale**: Phase 1 extracts entities because the LLM combined pass already runs for chunking (ADR-025/ADR-038) — adding entity extraction is incremental cost for immediate curation value. The `GraphStore` and `QueryRouter` interfaces are defined in Phase 1 so that Phase 2 can introduce their implementations without changing call sites. The rebuild trigger is deferred to Phase 2 because it has no consumer until graph-aware retrieval exists. Neo4j is Phase 3+ because PostgreSQL handles the expected graph size adequately (ADR-037) and the `GraphStore` interface ensures the migration is a config change plus graph regeneration, not an application rewrite.

**Risk accepted**: The `GraphStore` and `QueryRouter` interfaces defined in Phase 1 may need revision when their Phase 2 implementations reveal requirements not anticipated at interface design time. This is acceptable because the interfaces are internal (not a public API) and both sides of each interface are maintained by the same developer. Interface evolution is lower-cost than deferring interface definition to Phase 2 and retrofitting call sites.

**Tradeoffs**: Phase 1 includes interface code and a PostgreSQL `GraphStore` implementation that are not called by any production code path. This is interface scaffolding — it adds a small amount of code to Phase 1 in exchange for a clean Phase 2 integration path. The `QueryRouter` pass-through implementation is trivially simple (return `vector` for all queries) and adds no meaningful complexity.

**Source**: Resolved in Head of Development phase, 2026-02-24. Addresses phase placement for all graph-RAG capabilities. Cross-references ADR-037 (GraphStore), ADR-038 (entity extraction), ADR-039 (rebuild trigger), ADR-040 (query routing).

---

### ADR-042: C3 Query and Retrieval Shares the Python Processing Service

**Decision**: C3 (Query and Retrieval) is implemented as a module within the existing Python processing service (`services/processing/`), not as a separate service. The C2 pipeline code and C3 RAG code must be kept in separate internal modules (`processing/pipeline/` and `processing/query/`) so that the service can be split into two separate deployments in a future phase without requiring code restructuring.

**Context**: The `rag-implementation.md` skill noted the service placement of C3 as an open architectural question requiring an ADR before implementation begins. Two options were evaluated: sharing the existing Python service (simpler Phase 1 deployment) versus a dedicated query service (better isolation, independent scaling).

**Rationale**: Phase 1 document volume is small (family estate archive) and OCR jobs are triggered manually rather than continuously. The risk of query latency being blocked by a processing job is low in Phase 1. Sharing the service eliminates the need for a second Dockerfile, virtualenv, and Docker Compose service entry, and avoids an inter-service HTTP call for query embedding (the `EmbeddingService` is directly available in-process). The internal module boundary (`processing/pipeline/` vs `processing/query/`) provides the same logical separation as a service split at zero additional infrastructure cost.

**Options considered**:

- Separate `services/query/` service — better isolation and independent scaling; rejected for Phase 1 because the operational cost (two services, inter-service embedding call) outweighs the benefit at current load
- Shared service with no module boundary — rejected because it would couple C2 and C3 code, making a future service split a refactoring task rather than a deployment configuration change

**Risk accepted**: Long-running OCR or LLM processing jobs could delay query responses if both run in the same process under concurrent load. This is accepted for Phase 1 because document ingestion is manually triggered and query load is negligible. If concurrent processing and querying become a real bottleneck, the service split is deferred to Phase 2.

**Tradeoffs**: The internal module boundary (`processing/pipeline/` vs `processing/query/`) must be maintained as a discipline — shared utilities (configuration loading, `EmbeddingService`, HTTP client) belong in a `processing/shared/` or `processing/common/` module, not in either the pipeline or query module. Any code that couples the two modules makes the future split harder and should be flagged as a Code Reviewer finding.

**Source**: Resolved 2026-02-28, agent creation phase. Addresses C3 service placement. Cross-references ADR-015 (Python placement), ADR-024 (EmbeddingService interface), ADR-033 (VectorStore interface), ADR-040 (QueryRouter).

---

### ADR-043: C3 Query Routing — Express as Thin Proxy, Python Owns Full Pipeline

> **Superseded by ADR-045.** Written and superseded on the same day (2026-02-28) before approval, when the 12-factor custom server pattern (ADR-044) revealed that Next.js is the correct proxy layer. The decision text is preserved for audit purposes.

**Decision**: Express acts as a thin proxy for C3 query requests. When a query arrives at the Express API, Express authenticates the request and forwards it to the Python service unchanged. The Python service owns the complete query pipeline: it runs the `QueryRouter`, generates the query embedding, calls back to Express to retrieve vector search results via the `VectorStore` interface, assembles context, runs RAG synthesis, and returns the complete response to Express. Express returns that response to the caller unchanged.

**Context**: ADR-042 placed C3 within the Python processing service. A subsequent review of the system-diagrams.md Diagram 4 revealed that the original data-flow design fragmented the C3 pipeline across Express and Python — Express called `QueryRouter`, then forwarded the routing decision to Python for embedding, then received the embedding back, then forwarded it to `VectorStore`, then forwarded context to Python for RAG synthesis. This produced multiple sequential cross-process HTTP calls per query and placed orchestration responsibility in Express despite Express having no domain knowledge of the query pipeline. ADR-043 settles where the orchestration boundary sits.

**Rationale**: The query pipeline is a single coherent unit of work (routing → embedding → retrieval → assembly → synthesis). Fragmenting it across two services forces Express to orchestrate a process it does not understand, increases per-query latency (multiple HTTP round-trips), and makes the pipeline harder to reason about. Python already owns the domain knowledge (RAG, embedding, routing logic). Concentrating the pipeline in Python produces a simpler Express role (authenticate + proxy), clearer service boundaries, and lower per-query HTTP overhead (one round-trip to Python, one callback to Express for VectorStore data).

Express retains its role as the sole database writer (ADR-031) and the owner of the `VectorStore` and `GraphStore` interfaces (ADR-033, ADR-037). Python calls back to Express to retrieve vector search results; Express does not push data to Python. This preserves the data ownership boundary while giving Python full pipeline control.

**Options considered**:

- Express orchestrates C3 — Express calls `QueryRouter`, receives routing decision, forwards embedding request to Python, receives embedding, calls `VectorStore`, receives chunks, forwards context to Python for RAG, receives response. Rejected: multiple sequential HTTP calls per query; Express orchestrates a domain it does not own; pipeline logic split across two services increases complexity without benefit.
- Python has read-only database access — Python queries pgvector directly, bypassing the `VectorStore` interface in Express. Rejected: violates ADR-031 (Express sole DB writer) and ADR-033 (VectorStore interface encapsulates all vector operations); destroys the abstraction layer that makes the vector store swappable.

**Risk accepted**: Express cannot inspect or modify the query pipeline — it only sees the raw query and the final response. If query pipeline behaviour needs to change (e.g. adding request logging, rate limiting, or query transformation), those changes must be made in the Python service. This is accepted because Express has no legitimate reason to inspect the internals of the query pipeline; cross-cutting concerns (authentication, rate limiting) belong at the Express boundary anyway.

**Tradeoffs**: Python must make an outbound HTTP call to Express to retrieve `VectorStore` results. This adds one HTTP round-trip to the query path that would not exist if Python had direct database access. This is the cost of maintaining the ADR-031/ADR-033 boundary. At Phase 1 load (single user, occasional queries), this cost is negligible. If query latency becomes a concern at higher load, the service split (ADR-042, deferred to Phase 2) would eliminate this call by co-locating VectorStore access in a query-dedicated Express instance or by extending the `VectorStore` interface to support a Python implementation.

**Source**: Resolved 2026-02-28, agent creation phase. Addresses C3 query orchestration boundary. Cross-references ADR-015 (Python placement), ADR-031 (Express sole DB writer), ADR-033 (VectorStore interface), ADR-037 (GraphStore interface), ADR-040 (QueryRouter), ADR-042 (C3 service placement). **Superseded by ADR-045 on the same day.**

---

### ADR-044: Next.js Custom Server and Internal Shared-Key Authentication

**Decision**: Next.js runs a custom server (not a static export and not the edge runtime). It is the sole internet-facing entry point for all external requests. All internal service-to-service calls are authenticated using a shared-key header — a pre-shared secret supplied via configuration. Each receiving service validates the key and rejects requests that do not carry it. Separate keys are used per service pair to allow individual rotation without affecting other service boundaries.

The shared-key pattern applies to all internal service boundaries:

| Caller | Receiver | Purpose |
| --- | --- | --- |
| Next.js custom server | Express backend | All data operations (C1 intake, C2 trigger, curation, reads) |
| Next.js custom server | Python processing service | C3 query forwarding — web UI path (ADR-045) |
| Express backend | Python processing service | C2 processing trigger |
| CLI | Python processing service | C3 query forwarding — CLI path (ADR-045) |

**CLI trust model**: The CLI is a local-access tool operated by the developer or administrator with direct network access to all internal services. It does not pass through the Next.js boundary layer — that boundary exists to protect services from external (internet) callers, and the CLI is not an external caller. The CLI uses the same shared-key header auth as other internal callers; it is trusted at the same level as an internal service, not as an anonymous internet client.

**Context**: The 12-factor app methodology requires a server-to-server hop between the internet and any service that accesses the database. Next.js cannot be statically exported because it runs a custom server that handles auth and routes requests. This was the developer's intent from the start but was not recorded in the ADRs. ADR-003 records the structural boundary (Next.js in front of Express) but does not record the custom server, authentication placement, or internal trust model.

**Rationale**: The custom server requirement follows from the 12-factor principle: the boundary layer (Next.js) faces the internet; backend services (Express, Python) are not internet-accessible. Authentication (Phase 2+) lives in the Next.js server because it is the entry point for all user requests — it is the correct place to validate identity before forwarding. Shared-key header auth between internal services provides a lightweight trust boundary: it prevents accidental direct access to Express or Python if a port is exposed, and provides a hook for future request signing or rotation without changing application code. Per-pair keys allow one boundary to be rotated without affecting others.

**Phase 1 behaviour**: Phase 1 has a single user with no authentication (UR-121). The Next.js custom server is present as a structural requirement but performs no authentication in Phase 1. The shared-key headers between services are configured and validated in Phase 1 to establish the pattern before authentication is added in Phase 2.

**Phase 2**: Authentication (user login, session management, token validation) is introduced in the Next.js server. The structural boundary already exists; Phase 2 adds the authentication logic.

**Options considered**:

- Static Next.js export — rejected; incompatible with the custom server required by the 12-factor boundary principle and Phase 2 authentication
- Authentication in Express — rejected; Express is a backend service not directly accessible from the internet; authentication must live at the internet-facing boundary (Next.js)
- Single global shared key — rejected; a single key across all service pairs means any rotation requires coordinated changes to all services simultaneously; per-pair keys allow isolated rotation

**Risk accepted**: The Next.js custom server adds one HTTP hop and a running Node.js process compared to a static export. This is accepted because the boundary layer must run server-side code (shared-key validation, Phase 2 auth). The operational cost (one additional process in Docker Compose) is negligible.

**Tradeoffs**: The shared-key pattern is a lightweight trust boundary, not a cryptographic request-signing scheme. It prevents accidental access but not a determined attacker who has read access to the config. This is acceptable for Phase 1 (local Docker Compose, single user) and Phase 2 (private network). If the system is ever exposed to a hostile network (Phase 3+ AWS deployment), request signing (HMAC) should replace the shared-key pattern — the interface is the same; only the validation implementation changes.

**Source**: Resolved 2026-02-28, agent creation phase. Addresses Next.js custom server requirement and internal service trust model. Extends ADR-003 (structural boundary). Cross-references ADR-015 (Python service placement), ADR-016 (config patterns), ADR-031 (Express data ownership), ADR-045 (C3 query proxy).

---

### ADR-045: Next.js Proxies C3 Queries Directly to Python

**Decision**: The Next.js custom server proxies C3 query requests directly to the Python processing service, bypassing Express in the query path. Python owns the complete query pipeline (unchanged: QueryRouter, query embedding, VectorStore callback to Express, context assembly, RAG synthesis, response). Python calls back to Express to retrieve vector search results and (Phase 2+) graph traversal results; Express remains the sole database accessor for these operations. Express does not have a C3 proxy endpoint; it only serves the VectorStore and GraphStore callback endpoints called by Python.

**Principle**: Next.js proxies read paths; Express orchestrates write paths. C3 is a synchronous read path (query in, response out, no persistent state changes). C1 and C2 are write paths with multiple database state transitions and fire-and-forget asynchronous coordination — Express must orchestrate these because it is the data owner (ADR-031).

**Context**: ADR-043 placed the C3 proxy in Express, making the query path Next.js → Express → Python → Express (VectorStore callback). Once the 12-factor custom server pattern (ADR-044) was recorded, it became clear that Next.js already performs the proxy role at the boundary: it authenticates requests, routes them to the appropriate backend service, and returns responses. Express's C3 proxy role was redundant — it added a network hop without adding any logic. ADR-045 removes that hop by having Next.js call Python directly.

**Rationale**: Removing Express from the primary C3 query path reduces per-query latency by one HTTP round-trip. More importantly, it clarifies the role boundaries: Next.js routes to services; Express owns data. A query does not need to pass through the data layer to reach the compute layer. The Python callbacks to Express for VectorStore and GraphStore data preserve the ADR-031 boundary — Express is still the sole database accessor; Python still cannot query the database directly.

**Options considered**:

- Express proxies C3 (ADR-043) — superseded; Express adds a redundant hop with no logic; the Next.js custom server already provides the correct proxy layer
- Python has read-only database access — rejected; violates ADR-031 (Express sole database writer/reader) and ADR-033 (VectorStore interface); destroys the abstraction layer

**Risk accepted**: Next.js must know the Python service address and must use the shared-key header for Next.js → Python calls (ADR-044). This is a small additional configuration item. Service addresses are config-driven (ADR-001, ADR-016) and Docker Compose service names are stable within an environment.

**Tradeoffs**: The CLI query path calls Python directly — the CLI operates with direct network access to all services and does not need to pass through the Next.js boundary layer. The CLI must know the Python service address and use the shared-key header directly. This is consistent with the CLI's local-access context: the internet-facing boundary (Next.js) exists to protect services from external callers; the CLI is not an external caller. Express is not in any C3 query path.

**Source**: Resolved 2026-02-28, agent creation phase. Supersedes ADR-043 (Express as thin C3 proxy). Cross-references ADR-003 (structural boundary), ADR-031 (Express data ownership), ADR-033 (VectorStore interface), ADR-037 (GraphStore interface), ADR-040 (QueryRouter), ADR-042 (C3 service placement), ADR-044 (Next.js custom server and shared-key auth).

---

### ADR-046: Biome for Linting and Formatting (TypeScript Services)

**Decision**: Use [Biome](https://biomejs.dev/) as the single tool for linting and formatting across the TypeScript services (`apps/frontend/` and `apps/backend/`). Biome replaces the ESLint + Prettier combination. A single `biome.json` at the monorepo root configures both services.

**Rationale**: Biome provides lint and format in a single tool with a single config file, eliminating the integration friction between ESLint and Prettier (conflicting rules, separate ignore files, ordering in pre-commit hooks). It is significantly faster than ESLint + Prettier at the scale of this project. TypeScript strict-mode support is solid. The learning value is meaningful — Biome is a substantively different approach to the ESLint/Prettier toolchain.

**Known trade-off**: Biome does not yet have equivalents for all ESLint plugins. Notably, `eslint-plugin-react-hooks` rules (exhaustive-deps, rules-of-hooks) are not fully covered. This is an accepted gap for Phase 1; React hooks discipline is enforced by Code Review. If plugin coverage gaps cause recurring issues, revisiting ESLint for hooks-specific rules is an option in a later phase.

**Python service**: Biome does not apply to `services/processing/`. The Python service uses Ruff for linting and formatting, consistent with the Python ecosystem.

**Options considered**:

- ESLint + Prettier — standard combination; well-understood; large plugin ecosystem; slower than Biome; config friction between the two tools
- OXC (`oxlint`) — faster than Biome; formatter still early-stage; not a complete ESLint + Prettier replacement at this time
- Biome — selected; single tool, single config, production-ready TypeScript support, genuine learning value

**Source**: Resolved 2026-03-02, agent finalisation phase. Cross-references ADR-003 (Next.js structural boundary), ADR-015 (monorepo layout).

---

### ADR-047: ESM Module Format for TypeScript Services

**Decision**: Both `apps/frontend/` and `apps/backend/` use ECMAScript Modules (ESM). Each `package.json` sets `"type": "module"`. All imports use explicit `.js` extensions (required by the Node.js ESM resolver, even for TypeScript source files).

**Context**: The project uses modern TypeScript tooling throughout — Biome (ADR-046), Vitest, tsx, pnpm workspaces (ADR-002). A module format decision is required before scaffolding begins; deferring it creates ambiguity about import syntax, `__dirname` availability, and tooling flags.

**Rationale**: ESM is the current standard for Node.js. The chosen toolchain supports it natively: Vitest and tsx handle ESM without flags; Biome is format-agnostic. Adopting ESM now avoids a future migration and aligns with the direction of the Node.js ecosystem.

**Implementation notes**:

- `import.meta.url` replaces `__dirname` and `__filename`, which are not available in ESM
- `nconf` ships CommonJS only; it is loaded via a dynamic `import()` call or a thin CommonJS-compatible wrapper at the config module boundary — this is an implementer decision
- Knex is initialised programmatically using values from the nconf config singleton (`knex({ client: 'pg', connection: { ... } })`); no `knexfile.js` is used in production or test operation
- A `knexfile.ts` may be provided as optional developer tooling for running `knex migrate:rollback` and similar CLI commands manually; it is not required for normal operation because migrations run via `knex.migrate.latest()` at Express startup
- `packages/shared/` follows the same ESM convention so cross-package imports work without transformation

**Risk accepted**: A small number of dependencies may ship CommonJS only. Dynamic `import()` or thin wrapper shims resolve these cases without requiring a project-wide format change.

**Options considered**:

- CommonJS — established; universally compatible; `require()` and `__dirname` available; not the direction of the ecosystem for new projects
- ESM — selected; native Node.js standard; supported by all chosen tooling; no CJS-only blockers identified that cannot be shimmed

**Source**: Resolved 2026-03-04, implementation planning phase. Cross-references ADR-002 (pnpm workspaces), ADR-015 (monorepo layout), ADR-046 (Biome).

---

### ADR-048: Zod-to-OpenAPI Contract Pipeline for Express-Python API Boundary

**Decision**: Zod schemas in `packages/shared/src/schemas/` are the single source of truth for all API request and response contracts. The Express backend auto-generates an OpenAPI 3.x specification from these schemas via `@asteasolutions/zod-to-openapi` and serves it at `/openapi.json` (unauthenticated, same pattern as `/api/health`). The Python processing service generates Pydantic v2 models and an httpx client from this specification via `datamodel-codegen`; generated output is committed to `services/processing/shared/generated/`. Route handlers in Express import request and response types from `packages/shared/src/schemas/` and use Zod `safeParse` for validation. The handler shape, middleware stack, error handler, auth middleware, and multer file upload are all unchanged.

**Context**: ADR-031 established HTTP as the Express-Python transport. ADR-032 noted (in its "What is not adopted" and Tradeoffs sections) that the lack of automated contract validation at the Express-Python boundary is an accepted risk for a single-developer project. As the implementation phase reaches route handler tasks (Task 8 onwards), establishing a machine-readable contract now — before any route handlers are written — eliminates the need for a retrofit later and closes the ADR-032 risk. `packages/shared/` is already the home for shared TypeScript types and Zod schemas (ADR-002, ADR-015).

**Rationale**: The Zod-first approach preserves the existing Express stack entirely — no routing framework change, no middleware changes, no error handler changes. Python's realistic type safety ceiling is Pydantic runtime validation; the generated Pydantic models reach this ceiling directly from the same source schema. The timing is optimal: the Express router is currently a stub with no route handlers; adding schemas before Task 8 means every handler is written against generated types from the start, with no retrofit required.

**Options considered**:

- oRPC — stronger TypeScript client ergonomics via end-to-end type inference, but replaces the Express routing layer with a pre-1.0 framework dependency; active rough edge with multer multipart file upload; error handling diverges from the existing error handler conventions; Python outcome is identical (both approaches generate Pydantic from OpenAPI). Rejected: the pre-1.0 routing layer risk and multer friction outweigh the TypeScript client ergonomic advantage.
- gRPC / Protocol Buffers — strongest possible contract with code generation in both languages, but requires a major transport change from HTTP REST to gRPC; overkill for the project scale and single-developer context. Rejected.
- Hand-maintained types (status quo) — no single source of truth; runtime mismatch risk at the Express-Python boundary noted in ADR-032 as an accepted risk. Rejected: this risk can now be closed at low cost before handlers are written.
- OpenAPI-first (hand-maintained YAML) — framework-agnostic but requires manual schema maintenance separate from Zod; weaker TypeScript-side typing than a schema-first approach where Zod schemas are the source. Rejected.

**Risk accepted**: Generated Python models must be re-generated when schemas change. This is managed by documenting the generation step as part of the build process and committing generated output to `services/processing/shared/generated/` so that the Python service does not depend on the Express backend being available at build time. `@asteasolutions/zod-to-openapi` is a third-party library; the risk is low because it is a build-time tool on the shared package, not a runtime dependency on the routing layer — if the library is abandoned, the OpenAPI spec can be produced by any alternative Zod-to-OpenAPI tool or maintained manually.

**Tradeoffs**: The schema definitions in `packages/shared/src/schemas/` must be maintained alongside any route handler changes — adding or changing a route requires updating the corresponding schema first. This is a deliberate inversion of the current (nonexistent) contract workflow: the schema is the source of truth, not the handler. For a single-developer project this is low overhead; for a team it would be a coordination requirement.

**Source**: Resolved 2026-03-13, implementation phase. Closes the Express-Python contract validation risk noted in ADR-032 Tradeoffs. Cross-references ADR-002 (packages/shared placement), ADR-015 (Python service boundary), ADR-031 (Express sole DB writer, RPC-style contract), ADR-032 (Python testing — contract gap closed), ADR-044 (shared-key auth — `/openapi.json` unauthenticated like `/api/health`), ADR-047 (ESM module format).

---

### ADR-049: Config-Driven Graph Traversal Depth Limit

**Decision**: The maximum allowed `maxDepth` for graph traversal (QUERY-002) is not hardcoded in the Zod schema. The Zod schema enforces only a minimum of 1; the service enforces the upper bound by reading `config.graph.maxTraversalDepth`. Requests exceeding the configured limit return 400 (`depth_exceeded`).

**Context**: The QUERY-002 contract accepts a `maxDepth` parameter controlling how many hops a recursive CTE traversal follows in PostgreSQL. Recursive CTEs have exponential cost growth with depth — each hop can multiply the row set being walked. The safe upper bound is backend-specific: PostgreSQL with a recursive CTE has a different performance profile than a dedicated graph database (Phase 2+). Hardcoding an upper bound in the shared Zod schema would embed a PostgreSQL-specific performance constraint into the API contract, preventing future backends from allowing deeper traversal without a breaking schema change.

**Options considered**:

1. Hardcode `max(10)` in the Zod schema — simple, but embeds a backend-specific limit in the contract; no documented basis for the value of 10.
2. Hardcode `max(5)` in the Zod schema — the conservative value the Implementer chose; same problem: arbitrary, undocumented, backend-specific.
3. Config-driven ceiling, schema enforces only `min(1)` — the upper bound lives in `config.graph.maxTraversalDepth`; the service rejects requests that exceed it. The schema is backend-agnostic; the limit is explicit, documented, and swappable per environment.

**Decision rationale**: Option 3 aligns with the Infrastructure as Configuration principle (ADR-001). The performance ceiling is a property of the concrete backend implementation, not the API contract. Phase 1 default: `maxTraversalDepth: 3` (safe for PostgreSQL recursive CTEs on a moderately connected vocabulary graph; deep enough for typical 1–2 hop relationship queries).

**Consequences**:

- `config.graph` gains a `maxTraversalDepth` field (integer, default 3)
- `GraphSearchRequest` Zod schema: `maxDepth: z.number().int().min(1)` (no upper bound)
- `SearchService.graphSearch` checks `input.maxDepth > config.graph.maxTraversalDepth` and returns `ServiceResult` error `depth_exceeded` (mapped to 400)
- `SearchErrorType` gains `'depth_exceeded'`

**Source**: Resolved 2026-03-19, implementation phase (Task 13). Cross-references ADR-001 (Infrastructure as Configuration), ADR-037 (GraphStore interface), ADR-048 (Zod-to-OpenAPI pipeline).

---

### ADR-050: Temporal API for Frontend Date Logic

**Decision**: The frontend (`apps/frontend/`) uses the TC39 `Temporal` API for all calendar
date logic. The `@js-temporal/polyfill` package is installed as a runtime dependency and
bootstrapped once in `apps/frontend/src/lib/temporal.ts`. All frontend code imports
`Temporal` from this module rather than from the global. The backend (`apps/backend/`)
continues to use `Date` for timestamp generation and Knex row mapping; backend migration to
`Temporal` is deferred to Phase 2.

**Context**: `Temporal` reached TC39 Stage 4 (ES2026) in early 2026. Chrome 144+ (January
2026) and Firefox 139+ (May 2025) ship it natively; Safari full support is expected late
2026. Node.js 24 (the project's current target) has `Temporal` behind `--harmony-temporal`
only — it is not available unflagged. Node.js 26 is expected to ship it unflagged.

The frontend has clear calendar date use cases: `parseFilename` validates `YYYY-MM-DD`
strings from filenames (requires detecting invalid calendar dates such as 2026-02-30);
display components must format `string | null` date fields from API responses.
`Temporal.PlainDate` handles both cleanly. The backend use cases are different — all `Date`
usage there is timestamp generation (`new Date()`) and Knex row mapping (`.toISOString()`),
which do not benefit from `Temporal.PlainDate` and involve the Knex boundary that returns
JS `Date` objects for `timestamp` columns.

**Polyfill approach**: `@js-temporal/polyfill` is the TC39 reference implementation — its
API is identical to the native. The bootstrap module (`src/lib/temporal.ts`) exports
`Temporal` from the polyfill; once Node 26 is adopted and Safari support lands, this file
is updated to re-export from the global and the polyfill dependency is removed. No other
files change.

**Backend deferral**: The backend uses `new Date()` / `.toISOString()` in services and
repositories for DB timestamp columns. Migrating requires a decision on how to handle the
Knex boundary (Knex returns `Date` objects for `timestamp` columns). Non-trivial with no
Phase 1 benefit. Deferred to Phase 2; tracked in `project_pending_principles.md`.

**Options considered**:

1. Use `@js-temporal/polyfill` now, remove when native support lands — chosen. Clean
   migration path; API identical to native; polyfill removed when no longer needed.
2. Use `Date` for Phase 1, migrate in Phase 2 — `parseFilename` calendar date validation
   is awkward with `Date` (invalid dates like `2026-02-30` parse silently); would require
   rewriting date logic twice.
3. Adopt `Temporal` across frontend and backend now — impractical given the Knex boundary
   complexity; no Phase 1 backend benefit.

**Consequences**:

- `@js-temporal/polyfill` added to `apps/frontend/` dependencies
- `apps/frontend/src/lib/temporal.ts` created; all frontend code imports `Temporal` from
  here — not from the global
- `parseFilename` uses `Temporal.PlainDate.from()` with try/catch for calendar date
  validation
- Display components use `Temporal.PlainDate` for formatting; `null` dates display as
  "Undated"
- `development-principles.md` documents the rule: frontend uses `Temporal.PlainDate` for
  all calendar date logic; backend continues to use `Date`

**Source**: Resolved 2026-03-23, frontend implementation planning. Cross-references
ADR-001 (Infrastructure as Configuration), ADR-015 (monorepo layout).

---

### ADR-051: Base UI and Tailwind CSS for Frontend Components

**Decision**: The frontend uses **Base UI** (`@base-ui-components/react`) for interactive
component primitives and **Tailwind CSS** for all styling. No CSS modules are used. Both are
introduced at scaffold time (Task 1) so that every component task builds on them from the
start. Phase 1 uses the primitives functionally with minimal styling — the application is
deliberately unpolished (UR-119). Phase 2 adds a cohesive visual design on top of the
existing Tailwind utility classes without structural changes to components.

**Context**: The project needs interactive components (dialogs, selects, popovers, menus)
with correct keyboard navigation and ARIA semantics. Building these from scratch is
significant work and error-prone for accessibility. A headless primitive library handles
the behaviour layer; Tailwind handles the styling layer. Both choices must be consistent
with the framework agnosticism principle — Base UI is a React library with no framework
coupling; Tailwind is pure CSS utility classes with no runtime JavaScript.

**Base UI**: reached v1.0 (stable) in February 2026, backed by MUI with a dedicated
engineering team. It is the intended successor to Radix UI, built by the same original
authors with improved component APIs. Headless and unstyled — the styling layer is entirely
owned by the project. 35 accessible components covering all interactive patterns needed in
Phase 1 (dialog, select, menu, popover, checkbox, radio, tabs, tooltip).

**Tailwind CSS**: Tailwind v4 is compatible with Next.js App Router and React Server
Components. Utility-first — no stylesheet authoring, no class name conflicts. Adding
Tailwind at scaffold time costs nothing; retrofitting it in Phase 2 would require touching
every component to replace CSS module class names.

**Why not HeroUI**: HeroUI v3 (the React Aria-powered version) is in beta as of March 2026
(v3.0.0-beta.8); v3 is not yet production-stable. The stable v1.0 release was for the
React Native variant. Revisit in Phase 2 when v3 stabilises — React Aria is a strong
accessibility foundation and HeroUI v3 would be worth evaluating for the Phase 2 polish
pass.

**Why not shadcn/ui**: shadcn/ui copies components into the codebase (good for ownership)
but depends on Radix UI primitives. The original Radix team has shifted focus to Base UI,
raising long-term maintenance questions for shadcn/ui. Base UI is the direct successor and
the cleaner dependency.

**Phase 2 intent**: Phase 2 adds visual polish — a consistent colour palette, typography
scale, spacing system, and component-level design tokens — all expressed as Tailwind
configuration and utility classes. No component restructuring required; only styling changes.

**Consequences**:

- `@base-ui-components/react` and `tailwindcss` added to `apps/frontend/` dependencies
- `apps/frontend/tailwind.config.ts` created at scaffold; `src/styles/global.css` imports
  Tailwind base, components, and utilities
- No CSS module files created anywhere in the frontend
- Interactive components (dialogs, selects, menus, popovers) use Base UI primitives;
  simple HTML elements (`<button>`, `<input>`, `<ul>`) used directly where no primitive
  is needed
- All styling via Tailwind utility classes
- Phase 2 polish work is confined to Tailwind config and class updates — no component
  restructuring

**Source**: Resolved 2026-03-23, frontend implementation planning. Cross-references
ADR-001 (Infrastructure as Configuration), ADR-015 (monorepo layout), ADR-050 (Temporal
API).
