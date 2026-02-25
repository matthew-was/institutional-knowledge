# Estate Intelligence

_Preserve the Past. Inform the Future_

<img src="./branding/logo.png" width="250" height="250" alt="A tree with data nodes and leaves growing out of a scroll" />

## What Is Estate Intelligence?

Estate Intelligence is a **searchable archive system** for family and estate documents spanning decades. It transforms scattered physical and digital documents into a queryable knowledge base, powered by AI and document processing.

### The Problem It Solves

For any long-established property or estate, critical knowledge lies buried in paper: land transactions, infrastructure records, legal agreements, correspondence, and family history. This knowledge is:

- **Scattered** across physical archives and digital storage
- **Unsearchable** — finding a specific fact means manually reviewing hundreds of pages
- **At risk** — knowledge passes between generations; original documents can be lost or damaged

### How It Works

1. **Intake** — Upload documents (PDFs, scans, images) via web UI or bulk import
2. **Processing** — AI extracts text, detects metadata (dates, people, locations), and generates embeddings
3. **Curation** — Review extracted content, correct metadata, maintain a domain vocabulary
4. **Query** — Ask natural language questions and get answers with citations

### Example Questions

> _"What is known about the drainage works in the east meadow?"_

The system searches the archive, extracts relevant passages, and returns synthesised answers with sources:

```text
Answer: The drainage works in the east meadow were completed in 1974
by Harrison & Sons Ltd. They included new French drains along the
western boundary and a sump pit installed in the southeast corner.

Sources:
  - 1974-03-15: East Meadow Drainage Works (Invoice, Estate Archive)
  - 1974-05-22: Letter from J. Harrison, Estate Manager (Correspondence)
```

### Key Features

✓ **End-to-end pipeline** — From document upload to searchable answers
✓ **AI-powered extraction** — Automatic text extraction and metadata detection
✓ **Domain vocabulary** — Learn estate-specific terms and relationships
✓ **Sourced answers** — Every answer includes citations to original documents
✓ **Human in the loop** — Review queue for quality control and vocabulary curation
✓ **Provider-agnostic design** — Swap OCR, embedding, and LLM providers via configuration
✓ **Multi-phase development** — Phase 1 proves the concept locally; Phase 2+ expand to multi-user and hosted access

### What It Does NOT Do

- Provide public or anonymous access (private system only)
- Give legal advice or interpret documents
- Process photos, audio, or video
- Answer questions outside the archive's scope — all answers are sourced from documents

---

## Project Status

**Phase 1** (current) — Local single-user pipeline with document intake, processing, curation, and CLI query.

- ✅ Architecture and requirements approved
- ✅ Component specifications complete
- ⏳ Implementation in progress

See [documentation/](documentation/) for detailed specifications, architecture decisions, and project roadmap.

---

## Documentation

- **[Overview](documentation/project/overview.md)** — Full feature and scope details
- **[Architecture](documentation/project/architecture.md)** — System design and technology choices
- **[System Diagrams](documentation/project/system-diagrams.md)** — Visual system architecture and component flows
- **[Architecture Decisions](documentation/decisions/architecture-decisions.md)** — Design rationale and decisions (all 41 ADRs)
- **[Setup & Development](documentation/SUMMARY.md)** — How to set up the project and .claude/ agents

---
