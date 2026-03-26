# Development Principles — Python Service

This file covers Python-specific implementation patterns for `services/processing/`.
Read it alongside `development-principles.md` (universal principles), which defines the
principles that apply across all services.

> **Status**: stub — to be populated before Python Task 1 begins. The pair-programmer agent
> is responsible for surfacing gaps during implementation and prompting the developer to record
> decisions here before closing each session.

---

## Module Boundary (ADR-042)

The Python service enforces a strict internal module boundary:

```text
services/processing/
├── pipeline/   # C2 — OCR, quality scoring, LLM combined pass, embedding generation
├── query/      # C3 — query understanding, vector search, context assembly, response synthesis
└── shared/     # Shared utilities only — EmbeddingService, HTTP client, config loading
```

- `pipeline/` and `query/` must not import from each other
- Both may import from `shared/`
- `shared/` must not import from `pipeline/` or `query/`

---

## Technology Constraints

These are confirmed decisions — do not propose alternatives:

- Language: Python with type annotations; no untyped functions
- Configuration: Dynaconf + Pydantic (see configuration-patterns skill); no hardcoded values
- Framework: FastAPI for the HTTP server
- HTTP client (calls to Express): httpx; authenticated with shared-key header per ADR-044
- Testing: pytest; fixture documents with real OCR and LLM services during development (see
  pipeline-testing-strategy skill)

---

## Dependency Composition Pattern

*To be documented during Task 1. Analogue of the backend Dependency Composition Pattern —
adapted for Python and FastAPI. Key questions to resolve: factory function vs class, lifespan
injection, how `shared/` services are wired at startup.*

---

## Testing Strategy

*To be documented before Task 1. Analogue of the backend two-tier model — adapted for Python
and pytest. Key questions to resolve: unit test scope, integration test scope, fixture document
strategy, whether a test DB connection is used.*

---

## Logging Standard

*To be documented during Task 1. Analogue of the backend Pino logging standard — adapted for
Python. Key questions to resolve: library choice (structlog, logging), log levels, field naming
conventions.*

---

## What These Principles Rule Out (Python Service)

*To be populated as anti-patterns are identified during implementation.*
