# Developer Context

This document records the developer background and environment setup for the Institutional Knowledge project. It is intended as context for anyone working on the system, not as a scope or requirements document.

---

## Developer Background

**Strong existing skills**:

- 9+ years full-stack JavaScript/TypeScript
- Docker and Linux environments
- PostgreSQL (extensive experience)
- AWS: EC2, ECS, S3, some OpenSearch

**Skills being developed through this project**:

- Python (OCR and AI/ML components)
- Document processing pipelines
- Vector embeddings and pgvector
- RAG (Retrieval Augmented Generation)
- AI/ML workflow tooling

This context shapes design decisions throughout the project. Components 2–4 are learning components — the developer implements them personally rather than delegating to an automated agent. See [process/development-principles.md](../process/development-principles.md) for how this influences the build approach.

---

## Development Environments

**Local development (Phase 1–2)**:

- Docker Compose orchestrates all local services (PostgreSQL + pgvector, application containers)
- Configuration points to local services by default
- No cloud dependencies required for development

**Production (Phase 3+)**:

- Same application code and Docker containers
- Configuration points to AWS RDS, S3, and API endpoints
- Docker runs on EC2 or migrates to ECS
- No code rewrites required — only configuration changes

This seamless transition is guaranteed by the Infrastructure as Configuration principle. See [project/architecture.md](architecture.md) for the full architecture and technology stack.
