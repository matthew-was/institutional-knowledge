Estate Intelligence Project - Conversation Extraction

1. Decisions Made
Phase 1 Scope Decisions

MCP integration deferred to Phase 2: "Mcp is phase 2 however it should be a thin client wrapping around the same functions being called by the HTTP client" - explicitly moved out of Phase 1 to focus on core upload pipeline first
Multi-file upload deferred to Phase 2: Sequential single-file upload acceptable for Phase 1; frontend-only parallelism as optional Phase 1.5 enhancement; complex batch semantics deferred until usage patterns understood
No authentication/authorization in Phase 1: Single-user scenario, API key authentication only between services, not user-facing auth
Aggressive cleanup strategy for Phase 1: "The system doesn't let partial state accumulate. Failed uploads are cleaned up immediately" - acceptable for single-user, will need refinement for multi-user Phase 2

Architecture Decisions

Three-step upload flow: (1) Initiate with metadata only, (2) Upload binary file, (3) Finalize with hash and metadata - separates concerns and enables proper validation at each stage
Next.js temporary disk storage: Files written to /tmp/ during upload to avoid memory pressure, then forwarded to backend - "Avoid memory pressure from large files"
Backend uses Multer with memory storage: Despite Next.js using disk, backend buffers in memory - acceptable for Phase 1 file sizes (≤50MB)
Storage abstraction via interface: StorageService interface with store(), retrieve(), delete(), exists() methods - "allows the application code to remain unchanged when switching storage providers"
URI-based storage references: Database stores "local:/uploads/2024/01/abc-123.pdf" format - makes provider identification easy and migration straightforward
Date-based directory structure: /storage/uploads/YYYY/MM/uuid.ext - balances filesystem performance with organization

Technology Stack Decisions

Vitest over Jest: "Vitest is used for all packages because it's faster than Jest, has better ESM support, and provides a learning opportunity"
Pino for logging: "lightweight and has excellent performance, even better than winston in benchmarks"
Knex.js for database: Chosen for migrations and queries with PostgreSQL 16
Zod for validation: Runtime type checking combined with TypeScript for end-to-end type safety
nconf for configuration: Hierarchical configuration loading with Zod validation
Express 5 over newer frameworks: Familiar, proven, meets needs
tRPC for type-safe procedures: Combines with REST endpoints for file uploads (Multer)

Configuration Decisions

Configuration hierarchy established: Command-line args > Environment variables > Docker-mounted runtime configs > Local runtime configs > Package default configs
API keys in runtime config only: "Never in committed code: Keys live in runtime config files only (gitignored)"
Plain text API keys acceptable for Phase 1: "Stored in plain text in backend configuration (acceptable for Phase 1 internal network)" - future enhancement to hash like passwords
Multiple API keys in array: Backend config contains array, supports multiple clients (frontend, MCP, future services) with individual revocation
Simple key rotation process: Add new key, update client, restart client, remove old key, restart backend - "No downtime required if backend supports multiple valid keys during transition"

Database Decisions

Separate test database: estate_archive_test completely isolated from development database
Real PostgreSQL for tests: "Real PostgreSQL is used for testing, not an in-memory database, to ensure tests accurately reflect production behavior"
Truncate-based test cleanup: "After each test, tables are truncated using Knex delete or truncate methods and sequences are reset" - chosen over transaction rollback to properly test database calling code
Migrations auto-run on startup: await db.migrate.latest() before Express starts listening, fail-fast if migrations fail
MD5 hash for duplicate detection: Unique constraint on md5_hash field, calculated client-side in 2MB chunks
Email thread handling deferred: Phase 3 will parse individual messages from threads, Phase 1 treats emails as single documents

Testing Decisions

Integration tests within package boundaries: No E2E tests crossing frontend/backend boundary in Phase 1
Test fixtures in repository: Small test files (~200KB total) stored in __tests__/fixtures/ - acceptable for git
Backend tests in separate directory: __tests__/ mirrors src/ structure
Frontend tests colocated: Tests live alongside source files
No coverage percentage targets: "Quality of tests matters more than coverage numbers. Focus is on critical paths and integration points"
Skip hard-to-simulate edge cases: "Hard-to-simulate error cases can be skipped if impractical for Phase 1, such as network failures, disk full scenarios, or race conditions"

Error Handling Decisions

Fail-fast approach: Invalid config exits immediately, migration failures exit immediately
No automatic retries in Phase 1: Next.js → Backend calls fail fast on timeout or network error
Pass-through error responses: Next.js passes backend errors with minimal transformation, preserving HTTP status codes
Timeout values deferred: "implementation decision: 30-60 seconds" - specific value chosen during development
Cleanup on any failure: Delete uploaded file, mark/delete database record, cleanup temp files - "No orphaned state accumulates"

Cleanup Strategy Decisions

Piggyback cleanup for Phase 1: Orphaned upload cleanup triggers on each new upload, not separate cron job - "acceptable for Phase 1 single user"
10-minute orphan threshold: Records with status='uploading' older than 10 minutes considered orphaned
Best-effort temp file cleanup: Log failures but don't block upload - "Cleanup is best-effort"
Orphan handling: Update status to 'failed' with error_message='Upload timeout', delete associated file

Security Decisions

Backend never exposed to internet: "Critical Rule: Backend is never internet-accessible. All external requests flow through Next.js validation layer"
Next.js as security gateway: Validates file size, type, metadata; sanitizes filenames (remove ../, special chars); sanitizes notes (strip HTML tags)
Network isolation in Docker: Frontend-network (frontend ↔ backend), backend-network (backend ↔ database) - database not accessible from frontend
API key authentication between services: Even on internal network, backend validates API keys on all requests
Client identification via key naming: Convention like frontend-*, mcp-* helps identify clients in logs, but keys functionally identical in Phase 1
CORS not needed: Backend is internal only, never called directly by browsers
HTTPS deferred to production: Let's Encrypt for custom domains or AWS ACM for AWS-hosted

Development Workflow Decisions

Simple pre-push git hook: Runs pnpm run validate (type-check + lint + format-check), no pre-commit hooks, plain git hooks not Husky
Hot reload via volume mounts: Source code changes trigger automatic rebuilds in Docker
Graceful shutdown: Handle SIGTERM/SIGINT, close DB connections, complete in-flight requests
Node.js 22 LTS: Version enforcement via engines field and .nvmrc file
Path aliases: @/ points to each package's src/ directory for cleaner imports
Unified versioning: All packages share same version number, bumped together
Workspace protocol: "workspace:*" in package.json for local package dependencies

Documentation Decisions

Hybrid documentation approach: "markdown overviews, JSDoc comments, and TypeScript types to make the codebase understandable"
Document as you build: "Documentation is created during development, not after"
No code examples in planning: "When answering questions, only give code examples when explicitly asked for them, otherwise try and give summaries"

1. Rationale (Implied but Not Written Down)
Architecture Rationale

Three-step upload flow exists because: Separates metadata validation (cheap, fast) from file transfer (expensive, slow) from finalization (requires hash calculation), allowing early rejection of invalid requests and proper cleanup at each stage
Next.js uses disk storage but backend uses memory because: Next.js handles potentially many concurrent connections and needs to avoid memory pressure; backend processes one request at a time after validation, so memory storage is simpler and Multer supports it well
Storage abstraction exists because: Migration from local filesystem to S3 is known requirement (Phase 2+), and abstraction prevents code rewrite - "only configuration and data migration"
URI format for storage references because: Makes provider type immediately visible in database queries, simplifies migration (just string replacement), and follows common URI pattern
Date-based directories because: Filesystems perform poorly with tens of thousands of files in single directory, but also need human-navigable structure for debugging

Testing Rationale

Truncate over transaction rollback because: "The developer's testing style requires this approach to properly test database interactions" - transactions hide certain database behaviors that need testing
Small fixtures in repo because: Fast test startup (no download), reliable (no network dependency), version controlled (changes tracked), acceptable size for git
No E2E in Phase 1 because: "That's E2E, saved for Phase 2" - adds complexity, Phase 1 focuses on component integration within boundaries
Real PostgreSQL over in-memory because: Tests should match production behavior, especially for Postgres-specific features like UUID types, constraints, and pgvector

Security Rationale

Backend internal only because: "protect the user from unauthorized transactions and data exposure" - reduces attack surface by removing direct internet exposure
Next.js validation layer because: "validates all inputs, sanitizes data, and enforces security policies before forwarding" - defense in depth, backend can trust inputs
API keys between services because: "ensure requests come from authorized clients even within the Docker network" - prevents lateral movement if one service compromised
Multiple keys because: "Individual keys can be revoked without affecting other clients" and "Keys can be used to identify which client made a request"

Technology Choices Rationale

Vitest because: Faster, better ESM support, learning opportunity (trying something new vs sticking with Jest)
Pino because: Performance matters for logging (won't slow down application), structured JSON logs easier to parse/aggregate
Knex because: Developer has PostgreSQL experience, needs migration management, wants control over queries vs full ORM
TypeScript strict mode from start because: Easier to start strict than retrofit later, catches more bugs early
No external UI libraries because: Phase 1 UI is minimal, learning opportunity, avoid dependency bloat for simple forms

Cleanup Strategy Rationale

Piggyback cleanup acceptable because: Single user means uploads happen regularly during active development, orphans won't accumulate for days, simplicity preferred over robustness in Phase 1
10-minute threshold because: "allows for slow networks while preventing buildup" - balance between supporting legitimate slow uploads and cleanup responsiveness
Aggressive cleanup because: "This simplicity is acceptable for Phase 1 single-user scenario" - partial state causes confusion in debugging, better to fail cleanly

Phase 1 Scope Rationale

MCP deferred because: "Get core upload pipeline solid first" - understand real usage patterns before adding automation, MCP integration straightforward once APIs stable
Batch upload deferred because: "Defer complexity until usage patterns are understood" - don't know if bottleneck is upload time or processing time, sequential acceptable for learning phase
No auth deferred because: Single user makes authentication unnecessary overhead, focus on core pipeline
Many features deferred because: "Start small and complete" - full simple system better than partial complex system for learning and iteration

1. Constraints and Requirements That Emerged
Technical Constraints

50MB file size limit: "maxFileSize (50MB = 50 *1024* 1024 bytes)" - keeps Phase 1 memory usage reasonable, prevents abuse
Allowed file types: PDF, JPG, PNG only in Phase 1 - scope control and validation simplicity
VARCHAR(500) for filenames: Database field length limit - reasonable for most filenames
VARCHAR(32) for MD5 hash: Fixed length for MD5 hexadecimal representation
Node.js 22 LTS required: Enforced via engines field and .nvmrc
PostgreSQL 16: Specific version chosen for pgvector compatibility and modern features
Pool size 2-10 connections: "min (2) and max (10) connections" - reasonable defaults for single-user Phase 1

Operational Constraints

Single user for Phase 1: Simplifies concurrency, cleanup, and authentication concerns
Local development only: No production deployment in Phase 1, AWS migration planned for Phase 2+
Manual setup process: Developer runs setup script, not automated CI/CD
Docker Compose required: All services must run in containers, no native execution
Original documents kept separately: "Backups: Original documents kept separately (this system is the archive copy)" - system is backup, not primary storage

Data Constraints

MD5 hash uniqueness: Database enforces unique constraint - prevents duplicate storage
Status field limited values: 'uploading', 'uploaded', 'failed' only - state machine is simple
Document types limited: 'deed', 'letter', 'survey', 'email', 'other', 'unknown' - predefined taxonomy
Notes field max 1000 characters: "free text up to 1000 characters" - prevents abuse, keeps database manageable
Request ID required: Every request must have unique ID for tracing across services

Security Constraints

No secrets in committed code: Runtime configs gitignored, only .example files committed
Backend must validate API key: "validates API key on all endpoints" - no exceptions
Filename sanitization required: Must remove path traversal (../), special characters - prevent directory traversal attacks
Notes must be sanitized: Strip HTML tags to prevent XSS - even though no rendering in Phase 1, establish pattern early
No sensitive data in logs: "Never log: API keys, passwords, document content" - security and privacy

Process Constraints

Tests required before push: Pre-push hook enforces validation - no bypassing quality checks
Migrations must succeed: Application exits if migrations fail - database schema correctness critical
Documentation during development: "not after" - prevents documentation drift
Fail-fast on invalid config: Application exits immediately - prevents running with wrong configuration

Success Criteria Constraints

No specific document counts: "no need to upload exactly 50 or 100 documents" - quality over arbitrary metrics
No coverage percentage targets: Focus on critical paths and quality of tests
No formal completion checklist: "Quality and learning are the primary measures of success"
Must satisfy developer: "you're personally satisfied it's a solid foundation for Phase 2" - subjective but important

1. Contradictions with Existing ADRs
No Direct Contradictions Found
The conversation reinforces and elaborates on existing ADRs without contradicting them:
Infrastructure as Configuration ✓

Storage abstraction with StorageService interface supports local/S3 swapping via config
Configuration hierarchy (nconf + Zod) enables environment-specific settings
API key authentication configurable per client
All services run in Docker containers (compute abstraction)
Database connection via config, not hardcoded

Monorepo with pnpm workspaces ✓

Explicit package structure: @estate-archive/shared, /frontend, /backend, future /mcp
Unified versioning across packages
Workspace protocol for local dependencies
Shared dev dependencies at root

Three-layer security ✓

Browser → Next.js → Express explicitly maintained
Backend "never exposed to internet" emphasized throughout
Next.js as validation/sanitization gateway confirmed
Network isolation in Docker Compose (separate frontend/backend networks)

PostgreSQL + pgvector ✓

PostgreSQL 16 chosen specifically
pgvector extension mentioned for "future vector search capabilities"
No consideration of dedicated vector databases
Knex.js for migrations and queries

4-component pipeline ✓

Component 1 (Intake) fully specified in this conversation
References to future components: "Phase 2: Text extraction from PDFs, OCR for scanned documents"
Clear boundaries between intake and processing stages
MCP as client of existing APIs, not new component

Human-maintained domain context (Not Contradicted)

No discussion of automatic domain context in this conversation
Focus is on document intake and storage, not knowledge extraction
Document type field has predefined values, not auto-generated taxonomy

Potential Tensions (Not Contradictions)
Tension 1: Infrastructure Abstraction vs Concrete Decisions

ADR says "all services behind interfaces" but spec makes concrete choices (Express, Next.js, Multer)
Resolution: These are implementation choices for Phase 1 that could be swapped if needed; abstractions exist at storage/LLM/OCR level where variation expected

Tension 2: Learning Goals vs Production Patterns

Spec emphasizes "learning-focused" approach but also "production-ready patterns from day one"
Resolution: Not contradictory - learning by building production-quality code, not taking shortcuts that require later rewrites

Tension 3: Aggressive Cleanup vs Maintainability

"Aggressive immediate cleanup" acceptable for Phase 1 but acknowledged as needing refinement for Phase 2
Resolution: Explicitly called out as Phase 1 simplification, not permanent design

Additional Notable Items
Deferred Decisions (Explicit)
The spec has a comprehensive "Implementation Discretion" section listing ~15 decisions explicitly deferred to implementation time, including:

TypeScript compiler options beyond strict mode
Exact ESLint rules beyond recommended
API key header name (Authorization vs X-API-Key vs custom)
Database field types (ENUM vs VARCHAR)
Database timestamp types (TIMESTAMP vs TIMESTAMPTZ)
Logger instance pattern (global vs per-module)
Zero-byte file handling
File type validation depth (magic bytes vs MIME only)

Rationale: "Architecture provides guardrails, not step-by-step instructions. Make good judgments within established constraints."
Phase 2 Preview Items
Several items explicitly flagged for Phase 2 consideration:

MCP wrapper as thin client using same backend APIs
Better handling for slower/larger uploads
Hash keys like passwords for defense-in-depth
Dedicated cron job for orphaned upload cleanup
True batch upload with atomic semantics
Production deployment to AWS
S3 storage migration
Entity extraction and knowledge graph (Graph-RAG foundations)

Open Questions (Not Yet Decided)

Multer memory limits under concurrent load: "What happens when pool is exhausted?"
S3 multipart upload strategy for larger files in Phase 2+
Rate limiting algorithms for multi-user Phase 2
