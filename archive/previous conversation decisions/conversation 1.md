Decisions Made

PostgreSQL with pgvector over OpenSearch: "pgvector lets you start with familiar PostgreSQL, keeps everything simpler, and handles hundreds to low thousands of documents easily. You can always migrate to OpenSearch later if you need the scale or advanced features."
TypeScript for orchestration, Python for AI/ML: "Node.js/TypeScript for orchestration (your strength)" and "Python for OCR and AI/ML components (libraries like Tesseract, pdf-plumber, and the OpenAI/Anthropic SDKs are Python-first)"
AWS ecosystem: "Consider staying in the AWS ecosystem you know" (given experience with EC2, ECS, S3)
S3 for original document storage: Consistently referenced throughout as storage for raw scans and PDFs
Start with PDF-only for Phase 1: "Basic text extraction (PDF-only to start, simplest case)" and "Pick one document type to start (maybe typewritten correspondence - easier OCR than handwritten)"
Phase 1 will be command-line query tool: "Command-line query tool" specified for MVP
Six-component pipeline structure: Document Intake, Text Extraction, Document Processing, Embedding & Storage, Query & Retrieval, Continuous Ingestion

Rationale (Implied but Not Explicit)

Why pgvector over dedicated vector DB: Implied rationale is operational simplicity and leveraging existing PostgreSQL expertise, but could migrate later if scale demands it
Why Python for AI/ML: Library ecosystem is Python-first, forcing function to learn Python is acceptable trade-off
Why start with PDFs: Simplest case, avoids OCR complexity initially, gets end-to-end pipeline working faster
Why Docker containers: Already comfortable, enables component isolation (implied from "Docker containers for each pipeline component")
Why phase approach: Learn incrementally, validate each addition, avoid over-engineering before understanding requirements

Constraints and Requirements That Emerged

Scale constraint: "hundreds to low thousands of documents" initially, expanding to "tens of thousands of documents in the end"
Deduplication is critical: "ensuring there isn't duplication will be important later on" - particularly for email chains
Time constraint: "I want this to be quite small so I have a starting point as I don't know how much time I'm going to have"
Must handle heterogeneous document types: Handwritten letters, typewriter docs, emails, PDFs - varying quality and formats
Temporal reasoning required: Use cases like "What did we know in 1985 about the north field?" indicate need for date-aware querying
Entity tracking required: "Specific plots, people, infrastructure" must be trackable across documents
Email-specific requirements:

"Parse individual messages from threads"
"Extract by email headers/separators"
"Store each message separately with threading metadata"
"Content hashing to identify quoted/forwarded portions"
"Create embeddings only for new content, not quoted replies"

Metadata schema requirements: Must capture dates/date ranges, document types, entities mentioned, relationships between documents
Query types: Land ownership, infrastructure history (pipes), purchase/sale decisions - all require connecting information across multiple documents

Contradictions with Existing ADRs
MAJOR CONTRADICTION - Pipeline Component Count:

This conversation established a 6-component pipeline: (1) Document Intake, (2) Text Extraction, (3) Document Processing, (4) Embedding & Storage, (5) Query & Retrieval, (6) Continuous Ingestion
Existing ADR specifies 4-component pipeline: C1 Intake, C2 Extraction+Embedding, C3 Query, C4 Continuous Ingestion
The 6-component model separates concerns differently - particularly splitting "Text Extraction" from "Document Processing" and "Embedding & Storage"

POTENTIAL CONTRADICTION - Monorepo structure:

Discussion mentions "Python for OCR and AI/ML components" and "Node.js/TypeScript for orchestration"
Not clear how Python components fit into "pnpm workspaces" (which is npm/Node.js specific)
May need clarification on how Python services are managed within monorepo

POTENTIAL TENSION - Infrastructure as Configuration:

Heavy discussion of specific tools (Tesseract, pdf-plumber, OpenAI/Anthropic SDKs)
Not explicitly discussed how these would be abstracted behind interfaces
S3 storage is mentioned specifically rather than abstracted as "document storage service"

ALIGNED - PostgreSQL + pgvector: Confirmed, no contradiction
ALIGNED - Human-maintained domain context: Discussion of metadata extraction mentions dates, types, entities, but doesn't contradict the principle of human maintenance (though implementation details not discussed)
NOT ADDRESSED - Three-layer security: Browser → Next.js → Express architecture not discussed in this conversation (Phase 1 is CLI tool, web UI comes in Phase 2+)
