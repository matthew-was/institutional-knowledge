Estate Intelligence Project - Conversation Extraction

1. Decisions Made
Architecture & Structure

Monorepo package structure: Explicitly list packages in pnpm-workspace.yaml rather than using glob patterns

Source: "explicit listing of packages"

Package naming: Use scoped names @estate-archive/shared, @estate-archive/frontend, @estate-archive/backend

Source: "naming should be scoped"

Versioning strategy: All packages versioned together (unified versioning)

Source: "packages should be versioned together"

Shared dependencies: TypeScript, ESLint, Prettier at root level (Option A)

Source: "in the root package.json go with option a"

Technology Choices

Node.js version: Node.js 22 LTS with engines field in package.json and .nvmrc file

Source: "preference is node 22, and we should add engines field and .nvmrc"

Learning opportunities: Use tRPC (learning goal) and Vitest (want to learn, have Jest experience)

Source: "I want to learn Vitest so I'll use that"

Express version: Express 5 specifically (learning the upgrade from Express 4)

Source: "the backend should be express 5, as I've worked with express 4 before and want to learn the upgrade"

Database tool: Knex.js for PostgreSQL (familiar with it, includes migrations)

Source: "I will probably use Knexjs for Postgres as I'm familiar with it. It also includes the migrations"

Configuration: nconf for hierarchical config + Zod for validation

Source: "I like using nconf for configuration management"

File hashing: MD5 for deduplication (faster, acceptable for use case)

Source: "MD5 vs SHA256? MD5 is faster but less secure - for deduplication, it's fine?"

Document Upload Flow

Three-step upload process: (1) Initiate with metadata, (2) Upload file binary, (3) Finalize with hash + metadata

Rationale: "Early validation: Check file size/type BEFORE uploading bytes"
Rationale: "Deduplication: Calculate hash client-side, check BEFORE storing"
Source: Multiple sections discussing the flow

File handling in Next.js: Option D - write to temporary disk (/tmp/) then forward to backend

Rationale: "I'm not worried about speed performance but large files in memory could be an issue"
Source: "I think option d"

Temp file cleanup: Clean on each new upload (files older than 10 minutes)

Note: "this will need to be changed in a future setup"
Source: "for phase 1 clean on upload but this will need to be changed in a future setup"

Error Handling & Cleanup

Cleanup strategy: Aggressive immediate cleanup - any step fails, delete everything

Rationale: "Most files should be small so I don't worry about failed uploads"
Source: "auto delete, be very aggressive, if any step fails then all should be cleaned up"

Error response format: Option C - HTTP status codes + simple JSON messages

Source: "agreed with option c"

Testing Strategy

Test from Phase 1: Write tests from the beginning, don't defer

Rationale: "it is too easy to keep pushing it back"
Source: "I want to start writing tests from the beginning"

Test structure: Backend uses __tests__/ mirror structure, frontend colocates tests

Source: "For the backend a separate __tests__/ directory is best that mirrors the folder structure. For the nextjs app I think put tests close to code"

Testing framework: Vitest (learning goal)

Source: "While I have experience with jest I want to learn Vitest so I'll use that"

Test database cleanup: Truncate + reset sequences (Option D)

Rationale: "the way I test, wanting to use the db calling code I can't use transactions easily"
Source: User specified Option D

Test fixtures: Store small test files in repo (~200KB total), note Option D (hybrid) for future

Source: "option a, although make a note of option d for future"

Configuration Details

Config structure: Each package owns its config.json in package directory, not root

Source: "in a monorepo I would have the backend config in the backend directory and frontend in frontend"

Config validation: Parse each section with Zod for validation and type inference

Example: "const DBConnectionConfig = DBConnectionConfigModel.parse(config.get('database:connection'))"
Source: User's explicit preference for Zod parsing pattern

No client-side env vars: All config stays server-side, use nconf exclusively

Source: "I don't think I'll need client side vars and like nconf so will use that"

Database & Storage

Database pooling: Use Knex defaults (min: 2, max: 10) initially, modify if needed

Source: "use knex defaults to start with and I'll modify if I need to"

Graceful shutdown: Add database connection cleanup on SIGTERM/SIGINT from Phase 1

Source: "Lets add graceful shutdown from the start"

Storage in development: Host mount ./storage/ and Docker named volume for PostgreSQL

Rationale: "this system will effectively be the backup" of originals stored separately
Source: Data safety discussion

Development Workflow

Validation approach: No Husky, but manual validation command + simple pre-push hook

Source: "I don't like husky directly but I would like typescript, eslint/prettier checking with a single command"

TypeScript compilation: Use ts-node for dev (simpler approach), separate build for production

*Source: "Let's go with the simpler approach" (nodemon + ts-node)

Pre-push hook: Simple git hook (not Husky) that runs validation

Source: "simple pre-push hook"

IDE settings: Ignore, don't commit

Source: "ide settings should be ignored"

TypeScript Configuration

Structure: Root base config + packages extend with specific overrides

Source: "the preferences you suggest are correct" (confirming Option A)

Path aliases: Use @/ pointing to each package's src/ directory

Source: Same confirmation

Strict mode: strict: true from the start

Source: Same confirmation

Module settings: Modern ESNext modules, ES2020+ target

Source: Same confirmation

Security & API

API versioning: No versioning in Phase 1

Rationale: "For a learning project where you control both client and server, and it's not a public API, versioning might be unnecessary overhead"
Source: "versioning is not needed"

CORS: Not needed (backend is internal only)

Source: "cors could be added later, the express api should never be hit by the outside internet"

API authentication: Shared API key array (multiple keys for frontend, MCP, etc.)

Rationale: "This will also allow an mcp wrapper on the express backend in the future"
Source: "a shared api key should be checked for by the express api"

API key structure: Array of strings (not JWT or rotating keys)

Rationale: "For Phase 1, a simple shared secret is probably sufficient"
Source: "simple shared secret, although the api should understand keys from an array of strings"

Security headers: Skip for Phase 1

Source: "skip security headers for phase 1"

Logging

Logging library: Pino or winston (likely Pino for performance)

Source: "I want to use either pino or winston or something similar for structured logging (preferably lightweight if possible)"

Request tracking: Generate request ID in Next.js, pass to Express via header

Source: "Adding request tracking would be nice as it should be simple enough with a logging library"

Log output: stdout only for Phase 1

Source: "For now just write out to stdout"

Deployment Planning

CI/CD: Structure repo for GitHub Actions

Source: "we should structure the repo to support github actions"

Deployment target: EC2 primary, keep ECS-compatible where simple

Rationale: "I'm expecting an EC2 deployment in production but I would like to have the option for ECS if it isn't too hard to strive for"
Source: Same quote

Database in production: Local PostgreSQL on EBS initially, easy migration to RDS later

Source: "In an EC2 environment I would run a local postgres storing the data on a backup using EBS, but it should be easy enough to switch over to RDS"

MCP Wrapper

MCP location: Same monorepo as new package when built

Source: "mcp should live in the same monorepo"

MCP details: Deferred to later phase

Source: "I want to leave any other details to later"

Docker & Startup

Docker startup coordination: Backend waits for PostgreSQL healthcheck

Source: "backend should wait for the pg healthcheck"

Migrations: Auto-run on backend startup

Rationale: "A startup script should ensure all latest migrations are run before the code is started"
Source: User's statement about migration strategy

Phase Planning

Phase 1 exit criteria: Subjective - done when satisfied, no formal metrics

Source: "Phase 1 will end when I'm happy, the criteria isn't important to me"

Test coverage: Cover almost everything, no percentage targets

Source: "Test coverage should be covering almost everything, but maybe not error cases that are hard to simulate. There should be no coverage percentage target"

Documentation: Determine during development

Source: "Document completeness will be determined as I work through the code"

1. Implied Rationale Not Explicitly Written
Why Three Steps Instead of One

Separation of concerns: Metadata validation happens before file bytes are sent (bandwidth savings)
Early duplicate detection: Hash calculated client-side allows checking before storage
Clearer error states: Know exactly which step failed
Future extensibility: Can add features like resumable uploads between steps

Why Next.js as Security Layer

Defense in depth: Even though backend is internal, having validation at the edge prevents malformed requests
Rate limiting capability: Future rate limiting at Next.js layer protects backend
Authentication point: Natural place to add auth later without changing backend

Why Aggressive Cleanup

Simplicity over resilience: For single-user Phase 1, simple immediate cleanup is better than complex retry/recovery
Storage management: Small files mean storage pressure is low, aggressive cleanup prevents accumulation
Clear state: No orphaned records or files makes debugging easier

Why Local Filesystem First

YAGNI principle: Don't add S3 complexity until needed
Learning focus: Understand the full upload flow before adding cloud services
Easy migration path: Storage abstraction makes S3 a config change later

Why No Progress Bars in Phase 1

Scope management: Focus on core functionality, not UX polish
Small files: Most uploads will be fast enough that progress bars aren't critical
Phase 2 feature: Better upload handling comes with larger file support

Why Vitest Over Jest

Learning goal: Explicit desire to learn new tooling
Performance: Vitest is faster than Jest (though not stated, likely a factor)
Modern tooling: Better ESM support aligns with modern TypeScript setup

Why Knex Over Prisma/TypeORM

Familiarity: Developer knows Knex already
Control: More control over SQL than higher-level ORMs
Migration tooling: Built-in migration system meets needs

Why Temp Disk Over Memory in Next.js

Memory safety: Large files in memory could cause issues
Not worried about disk I/O: Speed isn't a concern for Phase 1
Simpler than streaming: Easier to implement than proper streaming multipart

1. Constraints & Requirements That Emerged
Technical Constraints

Max file size: 50MB (configurable, acceptable for most documents)

Source: "I expect most files will be in the low MB so a 50MB limit is fine to start"

Supported file types: PDF, JPG, PNG initially

Source: "PDF and JPG/PNG are good starting points and I can revisit that when something else comes up"

Single file upload only: No batch/multiple uploads in Phase 1
No authentication: Phase 1 is single-user, trusted environment
Docker required: All services run in containers for consistency

Development Environment Constraints

No Husky: Explicit rejection of automated git hooks
Manual validation: Developer runs validation before committing (pre-push hook enforces)
Real family documents: Testing must work with actual valuable data, not just synthetic tests

Future Migration Requirements

Storage must be swappable: Local → S3 without code changes (only config)
Config must support runtime overrides: Docker mounts, env vars override defaults
Database must support RDS migration: pg_dump/restore must work

Security Requirements

Backend never public: Express must not be directly accessible from internet
API key validation: All backend requests must include valid key
Input sanitization: Filenames, notes must be cleaned before storage
No sensitive data in logs: API keys, passwords, document content excluded

Testing Requirements

Real database: No in-memory DB, must use actual PostgreSQL
Test from day one: Cannot defer testing to Phase 2
Integration over unit: Focus on integration tests within package boundaries
Fixtures in repo: Small test files acceptable, large files need different approach later

Phase 1 Scope Constraints

No document listing/viewing: Upload only, no browsing UI
No search: Query capability is Phase 2+
No OCR/text extraction: Phase 2 feature
No embeddings/vector search: Phase 3+ feature
No multi-user: Single developer, local development only

1. Contradictions or Tensions with Existing ADRs
No Direct Contradictions Found
The conversation focused on Component 1 (Intake) of the 4-component pipeline. All decisions align with existing ADRs:

✅ Infrastructure as Configuration: Storage abstraction interface allows swapping implementations
✅ Monorepo with pnpm: Explicitly chosen and configured
✅ Three-layer security: Browser → Next.js (validation) → Express (business logic)
✅ PostgreSQL + pgvector: PostgreSQL chosen, pgvector deferred to Phase 3+
✅ 4-component pipeline: This conversation covers C1 (Intake) only
✅ Human-maintained context: Not discussed (C3 Query component concern)

Potential Future Tensions to Watch

Aggressive Cleanup vs Production Reliability

Phase 1: Delete everything immediately on failure
Production: May need partial state recovery or retry logic
Resolution path: Acknowledged that Phase 2 needs "better handling"

Temp Disk Cleanup on Upload vs Concurrent Users

Phase 1: Clean temp files when new upload starts
Multi-user: Race conditions possible, needs background job
Resolution path: Explicitly noted "will need to be changed in a future setup"

Single API Key Array vs Fine-Grained Auth

Phase 1: Simple array of keys (frontend-key, mcp-key)
Production: May need per-user keys, permissions, rotation
Resolution path: Current design allows multiple keys, can extend later

No Rate Limiting vs Public Deployment

Phase 1: No rate limiting (single user, trusted)
Production: Will need rate limiting at Next.js layer
Resolution path: Architecture supports adding it later

Hardcoded 50MB Limit vs Large Documents

Phase 1: 50MB max, configurable but not expected to change much
Future: Historical documents might be large scanned PDFs
Resolution path: Config allows changing, Phase 2 handles larger files better

1. Additional Notable Items
Philosophical Approach

"Done when satisfied" over formal criteria: Quality and learning trump checklists
"Start small, complete" over "partial complex": Full simple pipeline before adding complexity
"Real documents from day one": No toy datasets, test with actual valuable data
"Document as you build": Documentation is part of development, not after

Explicit Non-Goals for Phase 1
Listed in conversation as things explicitly deferred:

User authentication/authorization
Multi-user support
Document listing/browsing
Search interface
Document preview
Batch upload
Progress bars
Drag & drop
Resume uploads
Rate limiting
Document versioning
Audit logs
Email notifications
Webhooks
GraphQL API
Mobile app
Public API

Learning Goals Identified

tRPC: Type-safe API layer (new to developer)
Vitest: Testing framework (has Jest experience, wants to learn)
Express 5: Upgrade from Express 4 (familiar with 4)
AI fundamentals: Broader goal of the project

Data Safety Concerns

Original documents kept separate from system
System acts as backup/archive, not primary storage
Development uses copies, not originals
Production will use S3 (redundancy) + RDS/EBS (backups)

Summary of Key Architectural Decisions

Upload Flow: Three-step process (initiate → upload → finalize) with temp disk storage and aggressive cleanup
Tech Stack: Node 22, Express 5, Next.js 14+, tRPC, Vitest, Knex, Pino, nconf+Zod
Monorepo: pnpm workspaces, scoped packages, unified versioning, explicit listing
Security: Next.js validation layer, API key array, no CORS, backend never public
Testing: From Phase 1, Vitest, integration focus, real PostgreSQL, truncate cleanup
Config: Package-level config.json (committed) + runtime overrides (gitignored), Zod validation
Storage: Local filesystem with abstraction interface, S3 migration via config change
Error Handling: Aggressive immediate cleanup, HTTP status codes + simple JSON
Development: Docker Compose, hot reload, auto-migrations, pre-push validation
Deployment: EC2 primary (ECS-compatible), GitHub Actions structure, RDS/S3 migration path

All decisions align with existing ADRs and focus on Phase 1 (Component 1: Intake) of the larger Estate Intelligence system.
