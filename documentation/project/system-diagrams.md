# System Diagrams

Four diagrams describing the Institutional Knowledge system architecture. Each diagram is
self-contained and can be read independently. Reflects ADR-001 through ADR-046.

---

## 1. System Overview

High-level view of components and services. No internal detail.

```mermaid
graph LR
    Archivist([Primary Archivist])
    CLI[CLI]

    subgraph Frontend["Next.js Frontend"]
        WebUI[Web UI]
    end

    subgraph Backend["Express Backend"]
        API[API]
        DB[("PostgreSQL<br />+ pgvector")]
        FileStore[("File Storage")]
    end

    subgraph Processing["Python Service - ADR-042"]
        Processor["C2: Processing<br />Pipeline"]
        QueryModule["C3: Query<br />Module"]
    end

    Archivist -->|"Upload / curate"| WebUI
    Archivist --> CLI
    CLI -->|"Query - Phase 1"| QueryModule
    CLI -->|"Bulk ingest"| API
    WebUI -->|"Data operations"| API
    WebUI -->|"Query - Phase 2"| QueryModule
    API --> DB
    API --> FileStore
    API -->|"Trigger"| Processor
    Processor -->|"Results"| API
    QueryModule -->|"VectorStore callback"| API
    FileStore -.->|"File ref"| Processor

    style DB fill:#0066cc,color:#fff
    style FileStore fill:#0066cc,color:#fff
    style Archivist fill:#cc6600,color:#fff
    style CLI fill:#cc6600,color:#fff
```

---

## 2. C1 - Document Intake Detail

Two intake routes, validation, staging, and file lifecycle.

```mermaid
graph TD
    Archivist([Primary Archivist])
    WebUI["Web UI<br />Next.js"]
    CLI[CLI]

    subgraph WebRoute["Web UI Upload - ADR-007, ADR-017"]
        Initiate["1. Initiate<br />Create DB record<br />status: initiated"]
        Upload["2. Upload<br />Write to staging area<br />status: uploaded"]
        Store["3a. Store<br />Move to permanent storage<br />Hash validated<br />status: stored"]
        Finalize["3b. Finalize<br />All files confirmed<br />status: finalized"]
    end

    subgraph BulkRoute["Bulk Ingestion CLI - ADR-018, ADR-020, ADR-035"]
        RunStart["Run Start<br />Generate run ID<br />Create staging directory<br />Open report file"]
        FileVal["Per-File Validation<br />Naming convention<br />Format - Size - Hash<br />ADR-009, ADR-035"]
        BatchMove["Batch Move<br />Run status: moving<br />staging to permanent storage<br />Per-file: uploaded to stored"]
        RunComplete["Run Complete<br />All files: stored to finalized<br />Write summary report<br />Delete staging directory"]
    end

    subgraph Cleanup["Startup / Run-Start Sweep - ADR-010, ADR-017, ADR-018"]
        Sweep["Status-aware cleanup<br />initiated / uploaded = delete record + wipe staging<br />stored (not finalized) = delete from storage + delete record"]
    end

    DB[(PostgreSQL)]
    Storage[("File Storage")]

    Archivist --> WebUI
    Archivist --> CLI
    WebUI --> Initiate
    Initiate --> Upload
    Upload --> Store
    Store --> Finalize
    Initiate -->|"DB record"| DB
    Store -->|"File"| Storage
    Finalize -->|"Update status"| DB

    Sweep -.->|"Cleanup"| Storage
    Sweep -.->|"On startup / run start"| DB

    CLI --> RunStart
    RunStart --> FileVal
    FileVal --> BatchMove
    BatchMove --> RunComplete
    RunStart -->|"Run record"| DB
    BatchMove -->|"Files"| Storage
    RunComplete -->|"Update statuses"| DB

    style DB fill:#0066cc,color:#fff
    style Storage fill:#0066cc,color:#fff
    style Archivist fill:#cc6600,color:#fff
    style Sweep fill:#cc9900,color:#fff
```

---

## 3. C2 - Processing Pipeline Detail

Express trigger, Python steps, result write-back.

```mermaid
graph TD
    API["Express API<br />(processing trigger)"]
    FileStore[("File Storage")]
    DB[("PostgreSQL<br />+ pgvector")]

    subgraph ExpressBackend["Express Backend"]
        subgraph Tracking["Pipeline Step Tracker - ADR-027"]
            MarkRunning["Mark steps running<br />Record started_at"]
            StaleCheck["Stale-running sweep<br />> pipeline.runningStepTimeoutMinutes<br />reset to failed"]
            MarkDone["Update steps<br />completed / failed<br />increment attempt count"]
        end

        subgraph TxWrite["Transaction Write - ADR-031"]
            TxWriter["Single transaction:<br />Chunks + embeddings<br />Entities + relationships<br />Entity-document occurrences<br />Pipeline step status<br />Quality scores"]
            VectorStore["VectorStore Interface<br />ADR-033"]
        end
    end

    subgraph Python["Python Processing Service - pipeline/ module - ADR-015, ADR-038, ADR-042"]
        OCR["1. Text Extraction<br />Docling (primary)<br />Tesseract (fallback)<br />ADR-011"]
        Quality["2. Quality Scoring<br />Per-page OCR confidence<br />+ text density<br />ADR-021"]
        MetaDetect["3. Metadata Extraction<br />Type - Dates - People<br />Land refs - Description<br />Pattern-based - ADR-012"]
        Completeness["4. Completeness Scoring<br />Weighted field presence<br />Pluggable interface<br />ADR-021"]
        LLMCombined["5. LLM Combined Pass<br />ADR-025, ADR-036, ADR-038<br />Returns: chunks + entities<br />+ relationships + metadata<br />(metadata discarded Phase 1)"]
        Embedding["6. Embedding Generation<br />Local model<br />Config-driven dimensions<br />ADR-024"]
    end

    API -->|"Fire-and-forget<br />returns run ID<br />ADR-026"| StaleCheck
    StaleCheck --> MarkRunning
    MarkRunning -->|"Document ID<br />+ file reference<br />ADR-031"| OCR
    FileStore -.->|"File path / URI"| OCR

    OCR --> Quality
    Quality --> MetaDetect
    MetaDetect --> Completeness
    Completeness --> LLMCombined
    LLMCombined --> Embedding

    Embedding -->|"Structured response<br />HTTP/RPC"| TxWriter
    TxWriter --> DB
    TxWriter --> VectorStore
    VectorStore -->|"pgvector Phase 1<br />swappable via config"| DB
    TxWriter --> MarkDone

    style DB fill:#0066cc,color:#fff
    style FileStore fill:#0066cc,color:#fff
    style VectorStore fill:#663399,color:#fff
    style StaleCheck fill:#cc9900,color:#fff
```

---

## 4. C3 - Query and Retrieval Detail

Next.js proxies web UI queries to Python; CLI calls Python directly (direct network access — no boundary layer needed). Python owns the full pipeline. **Phase 1 focus**: vector retrieval. Graph-aware retrieval via GraphStore (ADR-037) is deferred to Phase 2, where QueryRouter becomes an LLM classifier (ADR-040). C3 query code runs as a separate module (`query/`) within the Python processing service, sharing `EmbeddingService` in-process (ADR-042, ADR-044, ADR-045).

```mermaid
graph TD
    Archivist([Primary Archivist])
    CLI["CLI<br />(Phase 1)"]
    DB[("PostgreSQL<br />+ pgvector")]

    subgraph Frontend["Next.js Custom Server - ADR-044, ADR-045"]
        WebUI["Web UI<br />(Phase 2)"]
        NextProxy["Next.js Proxy<br />Auth + forward - ADR-045"]
    end

    subgraph ExpressData["Express API - data callbacks only - ADR-031, ADR-045"]
        VectorStore["VectorStore Interface<br />ADR-033"]
        VectorSearch["Similarity Search<br />pgvector Phase 1"]
        GraphStore["GraphStore Interface<br />ADR-037<br />(Phase 2)"]
    end

    subgraph PythonPipeline["Python Service - query/ module - ADR-042, ADR-045"]
        QueryRouter["QueryRouter Interface<br />Phase 1: vector only<br />Phase 2: LLM classifier<br />ADR-040"]
        QueryEmbed["Query Embedding<br />Same EmbeddingService as C2<br />In-process - ADR-024"]
        Rerank["Chunk + Document<br />Context Assembly"]
        RAG["RAG<br />LLM synthesis"]
        Response["Response<br />With citations<br />YYYY-MM-DD — description<br />or undated — description<br />ADR-023"]
    end

    Archivist -->|"Query via"| CLI
    Archivist -->|"Query via<br />(Phase 2)"| WebUI
    CLI -->|"Direct + shared-key<br />ADR-044, ADR-045"| QueryRouter
    WebUI --> NextProxy
    NextProxy -->|"Forward query<br />ADR-045"| QueryRouter
    QueryRouter --> QueryEmbed
    QueryEmbed -->|"Callback: vector search"| VectorStore
    VectorStore -->|"similarity search"| VectorSearch
    DB -->|"Embeddings + metadata"| VectorSearch
    VectorSearch -->|"Search results"| VectorStore
    VectorStore -->|"Chunks + metadata"| QueryEmbed
    QueryEmbed -.->|"Callback: graph traversal<br />(Phase 2)"| GraphStore
    GraphStore -.->|"Graph results<br />(Phase 2)"| QueryEmbed
    QueryEmbed --> Rerank
    Rerank --> RAG
    RAG --> Response
    Response -->|"Complete response"| CLI
    Response -->|"Complete response"| NextProxy
    NextProxy -->|"Response"| WebUI

    style DB fill:#0066cc,color:#fff
    style VectorStore fill:#663399,color:#fff
    style QueryRouter fill:#663399,color:#fff
    style GraphStore fill:#663399,color:#fff
    style Response fill:#228822,color:#fff
    style Archivist fill:#cc6600,color:#fff
```
