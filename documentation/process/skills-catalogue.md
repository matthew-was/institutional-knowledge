# Skills Catalogue

## What Is a Skill?

Skills are reusable workflow definitions and domain knowledge patterns referenced by multiple agents. They encode patterns used across components rather than being specific to one component.

**Decision rule**: Ask "Will multiple agents or components need to reference this pattern?" If yes → skill. If it's specific to one component → it belongs in that component's detailed plan, not here.

**Where skills live**: Once written, skill files go in `.claude/skills/`. They are referenced by agent files in `.claude/agents/`.

---

## Identified Skills

### 0. Agent File Conventions

**File**: `.claude/skills/agent-file-conventions.md`

**Status**: Written

**Purpose**: Defines what a well-formed `.claude/agents/*.md` file looks like for this project. Without this, each agent file risks being inconsistent — missing scope constraints, ignoring context loading, or producing an agent that drifts off-role.

**Covers**:

- The Claude Code agent file format: required sections, frontmatter (if any), system prompt structure
- How to write a system prompt that produces consistent, in-scope agent behaviour (vs a description of the role)
- Scope constraints written as instructions (`"Do NOT..."`, `"ONLY produce..."`) rather than narrative descriptions
- How to specify which context files the agent reads at session start (and the instruction to read them, not just list them)
- Output format specification: how to tell the agent exactly what structure to produce
- Escalation and handoff rules: when and how to signal that a phase is complete
- Tool restrictions: which Claude Code tools are appropriate per agent type
- Example: the Product Owner agent as a worked example of a well-formed file
- Anti-patterns: what makes an agent file fail in practice (too broad, no constraints, no output structure)

**Used by**: Every agent file creation task; Code Reviewer when auditing agent quality

**Why this is a skill and not an agent**: It is a one-time reference document consulted during agent file authoring, not an ongoing role. Once all agent files are created, it remains useful for adding new agents or revising existing ones.

---

### 0b. Overview Review Workflow

**File**: `.claude/skills/overview-review-workflow.md`

**Status**: Written

**Purpose**: Defines the repeatable process for working through a Product Owner overview review with the developer — discussing each point, resolving decisions, applying changes to `overview.md`, archiving the review file, and updating project memory.

**Covers**:

- Trigger prompt and how to confirm the developer's preferred approach
- Discussion protocol: present each point with current text and line reference, state obvious resolutions for confirmation, do not edit mid-discussion
- Plan writing: group changes by review category, include line references and any emergent changes
- Applying changes section by section (markdownlint hook handles linting automatically)
- Archive step: naming convention (`overview-review-YYYY-MM-DD-HHMM.md`), move command
- Memory update: increment review count, update archived review path, replace key decisions list with cumulative record

**Used by**: Developer-facing workflow; invoked directly in a Claude Code session when an `overview-review.md` exists

**Why this is a skill and not an agent**: It is a human-in-the-loop interactive process. The developer makes every decision; the skill defines the structure of the conversation and the steps that follow.

---

### 0a. Approval Workflow

**File**: `.claude/skills/approval-workflow.md`

**Status**: Written

**Purpose**: Defines how agents record, check, and revoke document approvals. Ensures consistent approval behaviour across all agents — no agent may interpret these rules differently.

**Covers**:

- The purpose of approvals: documents are not acted on until explicitly approved; approvals create an auditable record
- The `approvals.md` format: status table (Document | Current Status | Last Updated) + append-only audit log
- Audit log entry format: `YYYY/MM/DD HH:MM - [document] [action] - [requestor] - [reason]`
- How to record an approval and an unapproval (update status table + append audit log entry; never delete rows)
- Document dependency order: `overview.md` → `user-requirements.md` → `phase-1-user-stories.md`
- Re-approval trigger rules: any agent that challenges an approved document notifies the Product Owner; the Product Owner owns the cascade
- Downstream impact rule: unapproving a document also unapprovals all documents downstream of it
- What agents must NOT do: proceed past unapproved dependencies; self-approve; silently bypass the workflow

**Used by**: Product Owner agent; any future agent that gates on document approval status (e.g. Head of Development before consuming requirements, Senior Developer before consuming architecture decisions)

**Why this is a skill and not an agent**: It is a workflow protocol, not a role. Multiple agents follow it; no agent owns it.

---

### 1. Configuration Patterns

**File**: `.claude/skills/configuration-patterns.md`

**Status**: ✓ Written

**Purpose**: Encodes the "Infrastructure as Configuration" principle in implementation terms. This is the highest-leverage skill because every component must follow it and every Senior Developer agent needs it.

**Covers**:

- The principle stated in code terms: every external service gets an interface
- How to define a TypeScript service interface
- How to define a Python abstract base class for the same service
- How to create concrete implementations (e.g., `LocalFilesystemAdapter`, `S3Adapter`)
- How to use factory pattern or dependency injection to select implementation at runtime
- How configuration is loaded and how it maps to implementation selection
- Each specific abstraction point: storage, DB connections, OCR engines, LLM providers, embedding services, vector DB
- Config singleton pattern (validation at startup, fail-fast)
- Docker runtime configuration (base config + volume-mounted overrides)
- Code examples for both TypeScript (nconf + Zod) and Python (Dynaconf + Pydantic)

**Used by**: Every Senior Developer agent, Implementer agent, Code Reviewer agent

---

### 1b. Dependency Composition Pattern

**File**: `.claude/skills/dependency-composition-pattern.md`

**Status**: ✓ Written

**Purpose**: Structured approach to dependency injection where services are instantiated at startup and passed to route handlers as parameters. Enables straightforward testing, MCP wrapping, and composition across multiple deployment contexts.

**Covers**:

- Why this pattern matters (three deployment targets: HTTP, MCP, CLI tools)
- TypeScript pattern: Services created in main.ts, route handlers receive services as parameters, routes composed at top level
- Python pattern: Same structure using FastAPI async lifecycle management
- Testing with mocks: Injecting mock services for straightforward unit testing
- MCP server wrapping: Same services in both HTTP and MCP contexts without code duplication
- Key principles: Single responsibility, explicit dependencies, testability, composability, configuration-driven
- Common patterns: Nested compositions, partial dependency injection, lazy loading
- Troubleshooting: Multiple service instances, untestable handlers, tight coupling

**Used by**: Implementer agent (wiring routes), Senior Developer agents (service architecture), Code Reviewer agent (validating dependency injection)

**Related to**: [configuration-patterns.md](configuration-patterns.md) — services are configured at runtime, composed at application startup

---

### 2. Metadata Schema

**File**: `.claude/skills/metadata-schema.md`

**Status**: Not yet written — write second (Integration Lead needs this before validating any component)

**Purpose**: Canonical metadata field definitions used across all components. Prevents components from independently inventing field names and types that conflict.

**Covers**:

- Canonical field list for document metadata (from project context + Component 2 spec)
- Required vs optional fields per document type (deed, letter, map, email, invoice, operational log)
- Chunk metadata fields (chunkId, parentDocumentId, chunkPosition, chunkType, treatmentTags, semanticTopic)
- Processing metadata fields (extractionMethod, ocrConfidence, qualityScore, processedAt, embeddingModel)
- How components can add extended metadata without breaking the base schema
- Naming conventions (snake_case, field length limits, enum values)
- Schema evolution strategy (how to add new fields safely)

**Used by**: Integration Lead agent, all Senior Developer agents

---

### 3. Pipeline Testing Strategy

**File**: `.claude/skills/pipeline-testing-strategy.md`

**Status**: Not yet written — write third (must exist before any code is written)

**Purpose**: Testing patterns specific to document processing pipelines. Pipeline components test differently than query components or web applications.

**Covers**:

- Vitest setup for TypeScript packages (backend, frontend)
- pytest setup for Python packages (processing pipeline)
- Pipeline stage isolation: how to test one stage without triggering others
- Fixture document strategy: sample files for testing (PDFs, scanned images, typed letters)
- Test database management: separate `estate_archive_test` database, truncation/reset pattern
- Integration testing within package boundaries (not cross-package E2E)
- What NOT to test (browser E2E, cross-package boundary, performance in Phase 1)
- Coverage philosophy: critical paths + integration points, not percentage targets
- How to test OCR extraction in isolation (fixture documents with known expected output)

**Used by**: All Senior Developer agents, Implementer agent, Code Reviewer agent

---

### 4. OCR & Text Extraction Workflow

**File**: `.claude/skills/ocr-extraction-workflow.md`

**Status**: Not yet written — write before Component 2 implementation

**Purpose**: Standard workflow for extracting text from different document types. Encodes the Docling/Tesseract decision tree and quality assessment approach.

**Covers**:

- File type detection algorithm (born-digital PDF vs scanned PDF, image formats)
- When to use pdfplumber vs Docling vs Tesseract (decision tree with examples)
- Docling invocation pattern (local vs API mode, timeout handling)
- Tesseract invocation via pytesseract (for fallback)
- How to compute OCR confidence score from Docling/Tesseract output
- Text coherence scoring (character distribution, word frequency, sentence structure checks)
- Graceful degradation ladder: Docling → Tesseract → PDF text extraction → metadata-only
- Output format: raw text + extraction method + confidence values

**Used by**: Component 2 Senior Developer agent, Code Reviewer agent

---

### 5. Embedding & Chunking Strategy

**File**: `.claude/skills/embedding-chunking-strategy.md`

**Status**: Not yet written — write after Component 2 Phase 1 (informed by real implementation)

**Purpose**: Reference patterns for semantic chunking and vector embedding generation + storage. Shared between Component 2 (embedding stage) and Component 3 (query embedding uses same abstraction).

**Covers**:

- What an embedding is and why chunk size matters (concise reference)
- Target chunk sizes and how to choose (500–1000 tokens guidance; adapt per document type)
- Heuristic chunking algorithm for Phase 1 (paragraph break detection, sentence boundary respect, minimum chunk size guard)
- Parent document reference pattern (how to structure the parent-child relationship in the database)
- Map/plan single-chunk + metadata-chunk pattern (from Component 2 spec)
- pgvector storage pattern (table structure, index type, similarity metric selection)
- Embedding provider abstraction (interface for OpenAI, Anthropic, local models; must match between document and query embedding)
- How quality score affects storage/retrieval weighting

**Used by**: Component 2 Senior Developer agent, Component 3 Senior Developer agent, Integration Lead agent

---

### 6. RAG Implementation

**File**: `.claude/skills/rag-implementation.md`

**Status**: Not yet written — write before Component 3 design

**Purpose**: Standard patterns for retrieval-augmented generation — the core of Component 3's value.

**Covers**:

- Query embedding (same abstraction layer as document embedding — provider must match)
- Similarity search query patterns for pgvector (cosine similarity, L2 distance; when to use each)
- Context assembly: how many chunks to retrieve (top-N), how to rank them
- Parent document retrieval pattern (when and how to fetch full parent for extended context)
- Prompt construction for RAG (system prompt, context injection, user query formatting)
- LLM provider abstraction (Claude, GPT, local model — same interface)
- Response format: answer with source citations (document name, date, chunk reference)
- Uncertainty signalling: how to express low confidence in the answer

**Used by**: Component 3 Senior Developer agent, Code Reviewer agent

---

## Skills Not Yet Identified

If during implementation a pattern is identified that will be needed by multiple agents or components, document it here before writing the skill file.

| Pattern | Why it might be a skill | Priority |
| --- | --- | --- |
| *(add as discovered)* | | |

---

## Creation Order

Write skills in this order — each is a dependency for work that comes after it:

1. **agent-file-conventions.md** — ✓ written; prerequisite for all agent files
2. **approval-workflow.md** — ✓ written; used by Product Owner and any agent that gates on approvals
3. **configuration-patterns.md** — ✓ written; blocks all Senior Developer agents
4. **dependency-composition-pattern.md** — ✓ written; needed before Implementer begins wiring routes
5. **metadata-schema.md** — blocks Integration Lead validation of any component
6. **pipeline-testing-strategy.md** — must exist before code is written
7. **ocr-extraction-workflow.md** — needed before Component 2 implementation
8. **embedding-chunking-strategy.md** — needed before Component 2 embedding stage + Component 3
9. **rag-implementation.md** — needed before Component 3 design
