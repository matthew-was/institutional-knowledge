# System Architecture

## Pipeline Overview

The system is a 4-component document processing and retrieval pipeline. Documents enter at Component 1 and are progressively enriched until they are searchable and queryable via Component 3.

See [pipeline-diagram.mermaid](pipeline-diagram.mermaid) for a visual representation.

---

## Pipeline Components

### Component 1: Document Intake

**Responsibility**: Accept document uploads, validate files, detect exact duplicates, store originals, and record metadata.

**Inputs**: Files uploaded via web interface (PDF, JPG, PNG)

**Outputs**:

- Original files stored in configured backend (local filesystem Phase 1, S3 Phase 2+)
- Database record with file metadata, storage location, MD5 hash, user-provided date and category

**Key design**: Three-step upload flow (Initiate → Upload → Finalize); MD5-based deduplication; three-layer security (Browser → Next.js → Express)

**Status**: Phase 1 specification complete. See [components/component-1-document-intake/specification.md](../components/component-1-document-intake/specification.md)

---

### Component 2: Text Extraction, Processing & Embedding

**Responsibility**: Transform stored documents into searchable vector representations. This component has two internal stages:

**Internal Stage A — Text Extraction & Processing**:

- Detect document type (born-digital PDF vs scanned vs image)
- Extract text via PDF extraction or OCR (Docling primary, Tesseract fallback)
- Assess extraction quality (0–100 score)
- Enrich metadata (validate/refine category, extract dates and entities)
- Semantic chunking (document-type-specific strategies)
- Track domain context candidates for developer review

**Internal Stage B — Embedding & Storage**:

- Generate vector embeddings for each chunk (configurable provider)
- Store embeddings + metadata + parent references in PostgreSQL with pgvector
- Enable vector similarity search

**Inputs**: Documents from Component 1 (file location + metadata)

**Outputs**: Chunks with quality scores, enriched metadata, parent document references, and vector embeddings stored in PostgreSQL

**Key design**: Parent document reference pattern; human-maintained domain context; all documents proceed regardless of quality (Phase 1); infrastructure-as-configuration for OCR and embedding providers

**Status**: Phase 1 specification complete. See [components/component-2-processing-and-embedding/](../components/component-2-processing-and-embedding/)

---

### Component 3: Query & Retrieval

**Responsibility**: Accept natural language queries, find relevant document chunks, and generate answers via a configured LLM.

**Inputs**: Natural language query from user

**Outputs**: Answer with source citations

**Key design**: CLI interface (Phase 1), web UI (Phase 2); vector similarity search; RAG via configured LLM provider; parent document retrieval for extended context

**Status**: Design pending. See [components/component-3-query-retrieval/README.md](../components/component-3-query-retrieval/README.md) for the design brief.

---

### Component 4: Continuous Ingestion

**Responsibility**: Monitor for new documents and automatically trigger the processing pipeline without manual intervention.

**Inputs**: New files in watch folder or via API endpoint

**Outputs**: Documents queued and processed through Components 1–3

**Status**: Phase 2+ concern. Design pending. See [components/component-4-continuous-ingestion/README.md](../components/component-4-continuous-ingestion/README.md).

---

## Cross-Cutting Concerns

### Metadata Requirements

Every document must track:

| Category | Fields |
| --- | --- |
| Identity | id, originalFilename, md5Hash, storageLocation, storageProvider |
| Timing | uploadedAt, documentDate (user-provided), extractedDates |
| Classification | documentType (user-provided), refinedCategory, ocrConfidence |
| Entities | detectedEntities (people, plots, infrastructure references) |
| Processing | extractionMethod, qualityScore, processedAt, embeddingModel |
| Relationships | parentDocumentId (for chunks), chunkPosition, treatmentTags |

### Deduplication Strategy

- **Phase 1 (Component 1)**: MD5 hash unique constraint — exact duplicates rejected at upload
- **Phase 3+ (Component 2)**: Embedding similarity deduplication for near-duplicates
- **Email-specific**: Parse individual messages from threads; hash message content to detect quoted/forwarded portions

### Component Ownership & Database Access

Each component writes specific records; components do not directly access each other's data:

- Component 1 writes: intake document records (file metadata, storage location, hash)
- Component 2 writes: processing records, enriched metadata, chunks, embeddings
- Component 3 reads: chunks, embeddings, metadata (read-only)
- Component 4 reads/writes: processing queue records

See [decisions/unresolved-questions.md](../decisions/unresolved-questions.md) UQ-001 and UQ-005 for details still to be resolved.

---

## Phased Build Approach

### Phase 1 — Minimum Viable Pipeline

**Goal**: A complete end-to-end pipeline that processes real family documents and answers basic queries.

- Component 1: Manual upload, PDF/JPG/PNG, local storage, MD5 dedup
- Component 2: PDF type detection, Docling/Tesseract OCR, quality scoring, heuristic chunking, basic metadata, pgvector embedding
- Component 3: CLI query tool, vector similarity search, RAG via Claude
- Component 4: Not included (manual upload only)

**Success**: Can upload 20 documents across types, extract text, embed, and query in natural language.

### Phase 2 — Essential Intelligence

- Domain context flagging and reprocessing workflow
- LLM-assisted category validation and entity extraction
- ML-based semantic chunking
- Simple web UI for queries
- Automated document ingestion (Component 4 basics)

### Phase 3 — Production Features

- Email parsing and individual message extraction
- Advanced deduplication (embedding similarity)
- Entity relationship extraction and knowledge graph
- Graph-aware retrieval alongside vector search
- Better search filtering (date, entity, type)
- Quality gates and manual review queue

### Phase 4 — Scale & Polish

- Batch processing optimisation
- Performance tuning
- Advanced retrieval strategies
- Monitoring and quality metrics

---

## Technology Stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | Next.js 14+ App Router, TypeScript | Document upload UI |
| Backend | Express 5, TypeScript, tRPC | Upload API, validation layer |
| Shared types | Zod, TypeScript | Shared between frontend/backend |
| Processing | Python, pdfplumber, Docling, pytesseract, spaCy | Component 2 extraction |
| Embedding | sentence-transformers, OpenAI/Anthropic SDK | Configurable provider |
| Database | PostgreSQL 16 + pgvector | Relational + vector storage |
| Config management | nconf + Zod (TS), Pydantic BaseSettings (Python) | Hierarchical config |
| Logging | Pino (TS), standard logging (Python) | Structured JSON |
| Testing | Vitest (TS), pytest (Python) | Real PostgreSQL for integration |
| Containerisation | Docker Compose | Local dev; migrates to ECS |
| Storage | Local filesystem Phase 1, S3 Phase 2+ | Via StorageService abstraction |
| Deployment | Docker local → AWS EC2/ECS | No code changes on migration |

---

## Monorepo Structure

The repository is a **monorepo**, but not all components are tightly coupled Node.js/TypeScript packages. The components have substantially different technology stacks (TypeScript for C1, Python for C2, potentially different stacks for C3/C4). The monorepo is primarily a **coordination home** — it holds the `docker-compose.yml` that starts the full system, the documentation, and the TypeScript packages that are genuinely shared (types, schemas). Each service/component within it is independently runnable and could be extracted to its own repository if needed.

**What lives in the monorepo root**: Docker Compose orchestration, documentation, shared TypeScript types, setup scripts, and CI configuration. The root `package.json` is a pnpm workspace root for the TypeScript components only — the Python processing service (`services/processing/`) is not a pnpm workspace member and manages its own dependencies via `pyproject.toml`.

**Each component is standalone**: `apps/frontend`, `apps/backend`, and `services/processing` each have their own dependency management, their own test setup, and their own runtime. They are co-located for convenience, not because they share a build system.

**ADR-002 decision**: See [decisions/architecture-decisions.md](../decisions/architecture-decisions.md) ADR-002.

```text
estate-archive/
├── apps/
│   ├── frontend/          ← Next.js 14+ (TypeScript) — pnpm workspace member
│   └── backend/           ← Express 5 (TypeScript) — pnpm workspace member
├── packages/
│   └── shared/            ← Shared Zod schemas, TypeScript types — pnpm workspace member
├── services/
│   └── processing/        ← Python (Component 2 extraction pipeline) — standalone, pyproject.toml
├── documentation/         ← All project documentation
├── docker-compose.yml     ← Starts the full system (all components)
├── setup.sh               ← Local dev environment setup
└── package.json           ← pnpm workspace root (TypeScript components only)
```

---

## Data Flow

1. User uploads document via web interface → **Component 1 frontend** validates
2. Frontend calls backend API → **Component 1 backend** validates, stores file, records metadata
3. Component 2 picks up document from storage → **Component 2 extraction stage** extracts text, scores quality, enriches metadata, chunks document
4. Chunks pass to **Component 2 embedding stage** → generates vectors, stores in PostgreSQL + pgvector
5. User submits query → **Component 3** embeds query, searches pgvector for similar chunks
6. Top-N chunks assembled as context → **Component 3** sends context + query to configured LLM
7. LLM generates answer → **Component 3** returns answer with source citations to user
